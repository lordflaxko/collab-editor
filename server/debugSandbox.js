const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { spawn } = require('child_process')
const { connectCdp } = require('./cdpClient')

const DEBUG_IMAGE = 'node:20-alpine'
// A dedicated (but NOT --internal) Docker network, kept separate from
// whatever else runs on this host's default bridge. Docker's --internal
// flag would additionally block the container's own outbound internet
// access, which sounds strictly better -- but --internal also disables
// port publishing entirely (verified directly: `docker port` reports
// nothing for a container on an --internal network), and this feature
// fundamentally needs the host to reach the container's inspector port.
// So the debuggee does have normal outbound network access; what still
// bounds the blast radius is the resource limits below, the read-only code
// mount (nothing of the server's own to exfiltrate), the hard session
// timeout, and gating this feature to signed-in editors of private
// projects only (done by the caller).
const DEBUG_NETWORK = 'collab-debug-net'
const SESSION_TIMEOUT_MS = 3 * 60 * 1000

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
    await run('docker', ['network', 'inspect', DEBUG_NETWORK])
  } catch {
    await run('docker', ['network', 'create', '--driver', 'bridge', DEBUG_NETWORK])
  }
}

async function waitForInspector(port, deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const list = await response.json()
        if (list[0]?.webSocketDebuggerUrl) return list[0].webSocketDebuggerUrl
      }
    } catch {
      // Container/inspector isn't listening yet -- keep polling.
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('The debug sandbox did not become ready in time')
}

// Docker Desktop's Windows bind-mount sync has a startup race: a container
// can start (and the inspector can be reachable) slightly before a
// just-created host file is actually visible inside it, which otherwise
// surfaces as a MODULE_NOT_FOUND crash the instant execution is released.
// Confirming the file directly via `docker exec` before releasing the
// initial pause avoids depending on that timing at all.
async function waitForMountedFile(containerId, deadline) {
  while (Date.now() < deadline) {
    try {
      await run('docker', ['exec', containerId, 'test', '-f', '/app/index.js'])
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error('The sandboxed file never became visible inside the container')
}

// Starts a throwaway, network-isolated container running the given code
// under Node's --inspect-brk (paused before the first line executes, so
// breakpoints can be set before anything runs), and attaches a CDP client to
// it. This is real code execution outside Piston's sandbox -- gated
// separately (private projects, editor role) by the caller -- so every
// resource limit here matters: no network egress, capped memory/CPU/PIDs,
// a read-only mount for the code, and a hard session timeout that force-
// kills the container regardless of what the debug session is doing.
async function startSession(code) {
  await ensureNetwork()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-debug-'))
  fs.writeFileSync(path.join(dir, 'index.js'), code)

  const containerId = await run('docker', [
    'run',
    '-d',
    '--network',
    DEBUG_NETWORK,
    '--memory',
    '128m',
    '--cpus',
    '0.5',
    '--pids-limit',
    '64',
    '-p',
    '127.0.0.1::9229',
    '-v',
    `${dir}:/app:ro`,
    '-w',
    '/app',
    DEBUG_IMAGE,
    'node',
    '--inspect-brk=0.0.0.0:9229',
    'index.js',
  ])

  const cleanupTempDir = () => fs.rmSync(dir, { recursive: true, force: true })
  const abortStartup = async (err) => {
    await run('docker', ['kill', containerId]).catch(() => {})
    cleanupTempDir()
    throw err
  }

  let webSocketDebuggerUrl
  try {
    const portMapping = await run('docker', ['port', containerId, '9229'])
    const port = portMapping.split(':').pop()
    webSocketDebuggerUrl = await waitForInspector(port, Date.now() + 10000)
    await waitForMountedFile(containerId, Date.now() + 5000)
  } catch (err) {
    return abortStartup(err)
  }

  const cdp = await connectCdp(webSocketDebuggerUrl)
  const logs = spawn('docker', ['logs', '-f', containerId])

  const session = {
    containerId,
    cdp,
    logs,
    stopped: false,
    timeoutHandle: null,
    _cleanupTempDir: cleanupTempDir,
  }
  session.timeoutHandle = setTimeout(() => stopSession(session).catch(() => {}), SESSION_TIMEOUT_MS)

  // Runtime/Debugger domains must be enabled, and breakpoints set, before
  // releaseAndRun() below -- once that's sent, the entry file loads and
  // starts executing immediately, so anything registered after is too late
  // to catch the first line.
  await cdp.send('Runtime.enable')
  await cdp.send('Debugger.enable')

  return session
}

// Node's --inspect-brk holds the process in a special "waiting for
// debugger" state before the entry file even loads -- distinct from a
// normal breakpoint pause, and released by this specific command rather
// than Debugger.resume (which only applies once real execution is
// underway; calling it here fails with "Can only perform operation while
// paused" since, from the Debugger domain's point of view, nothing has
// paused yet).
function releaseAndRun(session) {
  return session.cdp.send('Runtime.runIfWaitingForDebugger')
}

async function setBreakpoints(session, lineNumbers) {
  const ids = []
  for (const lineNumber of lineNumbers) {
    try {
      // locations coming back empty here is normal, not a failure: the
      // entry script hasn't been parsed yet at this point (see above), so
      // CDP registers this as a pending breakpoint that applies automatically
      // once a matching script actually loads.
      const result = await session.cdp.send('Debugger.setBreakpointByUrl', {
        lineNumber: lineNumber - 1, // CDP lines are 0-indexed
        urlRegex: 'index\\.js$',
      })
      ids.push(result.breakpointId)
    } catch {
      // A line with no executable statement on it (e.g. a closing brace)
      // simply can't take a breakpoint -- skip it rather than failing the
      // whole session over one bad line.
    }
  }
  return ids
}

function resume(session) {
  return session.cdp.send('Debugger.resume')
}

function stepOver(session) {
  return session.cdp.send('Debugger.stepOver')
}

// Every CommonJS file is secretly run inside a function wrapper of the form
// function (exports, require, module, __filename, __dirname) { ... } --
// these five names always show up in a top-level scope's properties, but
// they're not variables the user wrote and would just be noise here.
const MODULE_WRAPPER_PARAMS = new Set(['exports', 'require', 'module', '__filename', '__dirname'])

// Only the top frame's local/closure scopes -- matches the "minimal"
// debugger scope (no call-stack switching), and skips the global scope
// entirely since dumping it would be enormous and useless here.
async function getTopFrameVariables(session, callFrame) {
  const variables = []
  for (const scope of callFrame.scopeChain) {
    if (scope.type === 'global') continue
    const { result } = await session.cdp.send('Runtime.getProperties', {
      objectId: scope.object.objectId,
      ownProperties: true,
    })
    for (const prop of result) {
      if (!prop.enumerable || MODULE_WRAPPER_PARAMS.has(prop.name)) continue
      const value = prop.value
      const display = value?.value !== undefined ? JSON.stringify(value.value) : (value?.description ?? 'undefined')
      variables.push({ name: prop.name, value: display })
    }
  }
  return variables
}

async function stopSession(session) {
  if (session.stopped) return
  session.stopped = true
  clearTimeout(session.timeoutHandle)
  session.logs.kill()
  session.cdp.close()
  await run('docker', ['kill', session.containerId]).catch(() => {})
  await run('docker', ['rm', '-f', session.containerId]).catch(() => {})
  session._cleanupTempDir?.()
}

module.exports = {
  startSession,
  setBreakpoints,
  releaseAndRun,
  resume,
  stepOver,
  getTopFrameVariables,
  stopSession,
}
