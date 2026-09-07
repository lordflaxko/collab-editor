const fs = require('fs')
const os = require('os')
const net = require('net')
const http = require('http')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')

const DEPLOY_IMAGE = 'node:20-alpine'
// Kept distinct from collab-run-net (Install & Run) and collab-debug-net
// even though the isolation is identical, so each sandbox's purpose and
// lifecycle stays independently obvious in `docker network ls`.
const DEPLOY_NETWORK = 'collab-deploy-net'
const TTL_MS = 15 * 60 * 1000
const MAX_CONCURRENT = 5
const CONTAINER_PORT = 3000

// token -> { projectId, kind, expiresAt, timer, containerId?, port?, fileMap? }
const deployments = new Map()
// projectId -> token, so redeploying a project tears down its previous
// preview instead of leaving it running until its own TTL expires.
const deploymentsByProject = new Map()

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15000, ...options }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.toString().trim() || err.message))
      else resolve(stdout.toString().trim())
    })
  })
}

async function ensureNetwork() {
  try {
    await run('docker', ['network', 'inspect', DEPLOY_NETWORK])
  } catch {
    await run('docker', ['network', 'create', '--driver', 'bridge', DEPLOY_NETWORK])
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function detectKind(files) {
  return files.some((f) => f.name === 'package.json') ? 'node' : 'static'
}

async function stopDeployment(token) {
  const dep = deployments.get(token)
  if (!dep) return
  clearTimeout(dep.timer)
  deployments.delete(token)
  if (deploymentsByProject.get(dep.projectId) === token) {
    deploymentsByProject.delete(dep.projectId)
  }
  if (dep.kind === 'node' && dep.containerId) {
    try {
      await run('docker', ['rm', '-f', dep.containerId])
    } catch {
      // Already gone (crashed, or its own --rm cleanup already fired) --
      // nothing left to tear down.
    }
    // Only safe to remove now that the container (which had it bind-mounted
    // as /app for its entire run) is actually gone -- deleting it right
    // after the detached `docker run -d` call returns, before npm install
    // and node are done reading from it, was a real bug caught while
    // testing this: the directory disappeared out from under the still-
    // running container within about a second of every deploy.
    fs.rmSync(dep.dir, { recursive: true, force: true })
  }
}

// Deploys a snapshot of the project's current files, not a live link to
// them -- editing the project afterward has no effect on an already-running
// preview, matching how a real deploy is a point-in-time build rather than
// a live mirror.
async function startDeployment(projectId, files) {
  if (deployments.size >= MAX_CONCURRENT) {
    throw new Error('Too many active deploy previews right now -- try again in a few minutes')
  }
  const existingToken = deploymentsByProject.get(projectId)
  if (existingToken) await stopDeployment(existingToken)

  const token = crypto.randomBytes(16).toString('hex')
  const kind = detectKind(files)
  const expiresAt = Date.now() + TTL_MS

  if (kind === 'static') {
    if (!files.some((f) => f.name === 'index.html')) {
      throw new Error('A static deploy needs an index.html file')
    }
    const fileMap = new Map(files.map((f) => [f.name, f.content]))
    const dep = { projectId, kind, fileMap, expiresAt }
    dep.timer = setTimeout(() => stopDeployment(token), TTL_MS)
    deployments.set(token, dep)
    deploymentsByProject.set(projectId, token)
    return { token, kind, expiresAt }
  }

  await ensureNetwork()
  const pkgFile = files.find((f) => f.name === 'package.json')
  let entryFile = 'index.js'
  try {
    entryFile = JSON.parse(pkgFile.content).main || 'index.js'
  } catch {
    // Malformed package.json -- fall back to the conventional entry name
    // rather than failing the deploy outright.
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-deploy-'))
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file.name), file.content)
  }

  const port = await findFreePort()
  let containerId
  try {
    // entryFile travels as an environment variable rather than being
    // interpolated into the shell command string, so a filename containing
    // shell metacharacters can't do anything except fail to open as a file.
    containerId = await run('docker', [
      'run',
      '-d',
      '--rm',
      '--network',
      DEPLOY_NETWORK,
      '--memory',
      '256m',
      '--cpus',
      '1',
      '--pids-limit',
      '128',
      '-p',
      `127.0.0.1:${port}:${CONTAINER_PORT}`,
      '-e',
      `PORT=${CONTAINER_PORT}`,
      '-e',
      `ENTRY_FILE=${entryFile}`,
      '-v',
      `${dir}:/app`,
      '-w',
      '/app',
      DEPLOY_IMAGE,
      'sh',
      '-c',
      'npm install --no-audit --no-fund && node "$ENTRY_FILE"',
    ])
  } catch (err) {
    // Unlike a successful launch (cleaned up later, once the container that
    // has it mounted is actually gone), a failed `docker run` never started
    // anything that could still be reading from dir.
    fs.rmSync(dir, { recursive: true, force: true })
    throw err
  }

  // dir stays on disk, bind-mounted as this (detached, long-running)
  // container's /app, until stopDeployment removes both together.
  const dep = { projectId, kind, containerId, port, dir, expiresAt }
  dep.timer = setTimeout(() => stopDeployment(token), TTL_MS)
  deployments.set(token, dep)
  deploymentsByProject.set(projectId, token)
  return { token, kind, expiresAt }
}

function getDeployment(token) {
  return deployments.get(token) ?? null
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStaticFile(dep, subPath, res) {
  const name = subPath === '' || subPath === '/' ? 'index.html' : subPath.replace(/^\//, '')
  const content = dep.fileMap.get(name)
  if (content == null) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found in this preview')
    return
  }
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(name)] || 'text/plain; charset=utf-8' })
  res.end(content)
}

function proxyToContainer(dep, subPath, req, res) {
  const proxyReq = http.request(
    {
      host: '127.0.0.1',
      port: dep.port,
      method: req.method,
      path: subPath || '/',
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('Preview app is not responding -- it may still be starting up, try again in a few seconds')
  })
  req.pipe(proxyReq)
}

// Public and unauthenticated by design -- a deploy preview is meant to be
// shared as a live link, gated only by the token's own unguessability
// (128 bits of randomness), the same trust model as an invite link.
function serveDeployment(token, subPath, req, res) {
  const dep = getDeployment(token)
  if (!dep) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('This preview has expired or does not exist')
    return
  }
  if (dep.kind === 'static') {
    serveStaticFile(dep, subPath, res)
  } else {
    proxyToContainer(dep, subPath, req, res)
  }
}

module.exports = { startDeployment, stopDeployment, getDeployment, serveDeployment }
