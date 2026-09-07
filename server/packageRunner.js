const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile, spawn } = require('child_process')

const RUN_IMAGE = 'node:20-alpine'
// A separate network from the debugger's collab-debug-net, kept distinct so
// each sandbox's purpose (and lifecycle) stays independently obvious in
// `docker network ls` even though the underlying isolation is identical.
const RUN_NETWORK = 'collab-run-net'
const SESSION_TIMEOUT_MS = 2 * 60 * 1000

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
    await run('docker', ['network', 'inspect', RUN_NETWORK])
  } catch {
    await run('docker', ['network', 'create', '--driver', 'bridge', RUN_NETWORK])
  }
}

// Writes every project file into a fresh temp directory and runs
// `npm install && node <entryFile>` inside a throwaway container. Unlike
// Piston (no package manager at all) or the debug sandbox (read-only
// mount), this genuinely needs a writable filesystem and real internet
// access, since npm has to fetch and write packages -- including running
// arbitrary postinstall scripts, a well-known supply-chain attack vector,
// which is why the route calling this applies the same private-project +
// editor-role gate as real debugging and database connectivity.
//
// Deliberately ephemeral: the container and its node_modules are thrown
// away the moment the process exits, so there's no persistent cache,
// quota, or cleanup job to design -- every run reinstalls from scratch.
async function startInstallAndRun(files, entryFile, onData, onExit) {
  await ensureNetwork()
  if (!files.some((f) => f.name === 'package.json')) {
    throw new Error('Add a package.json to use Install & Run')
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-run-'))
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file.name), file.content)
  }

  // entryFile is passed through as an environment variable rather than
  // interpolated into the shell command string, so a filename containing
  // shell metacharacters can't do anything except fail to open as a file --
  // the quoted $ENTRY_FILE expansion in the script below is data, not code.
  const child = spawn('docker', [
    'run',
    '--rm',
    '-i',
    '--network',
    RUN_NETWORK,
    '--memory',
    '256m',
    '--cpus',
    '1',
    '--pids-limit',
    '128',
    '-e',
    `ENTRY_FILE=${entryFile}`,
    '-v',
    `${dir}:/app`,
    '-w',
    '/app',
    RUN_IMAGE,
    'sh',
    '-c',
    'npm install --no-audit --no-fund && node "$ENTRY_FILE"',
  ])

  const timeoutHandle = setTimeout(() => child.kill('SIGKILL'), SESSION_TIMEOUT_MS)
  const cleanup = () => {
    clearTimeout(timeoutHandle)
    fs.rmSync(dir, { recursive: true, force: true })
  }

  child.stdout.on('data', (d) => onData('stdout', d.toString()))
  child.stderr.on('data', (d) => onData('stderr', d.toString()))
  child.on('error', (err) => {
    cleanup()
    onExit(null, null, err.message)
  })
  child.on('exit', (code, signal) => {
    cleanup()
    onExit(code, signal, null)
  })

  return child
}

module.exports = { startInstallAndRun }
