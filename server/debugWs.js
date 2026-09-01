const WebSocket = require('ws')
const debugSandbox = require('./debugSandbox')

// Bridges a browser's simple {type, ...} debug protocol to a real CDP
// session running inside a sandboxed container (see debugSandbox.js).
// Access control (private project, editor role) is checked by the caller
// before this is ever invoked -- this module only drives the session once
// that's already been decided.
function handleDebugConnection(clientWs) {
  let session = null
  let sawInitialBreak = false

  function send(payload) {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(payload))
  }

  async function handlePaused(params) {
    // --inspect-brk's own built-in "break on start" fires as an ordinary
    // Debugger.paused event at the entry file's first line, indistinguishable
    // from a real breakpoint except that it's always the first pause of the
    // session -- resume straight past it rather than showing the user a
    // breakpoint hit they never asked for.
    if (!sawInitialBreak) {
      sawInitialBreak = true
      try {
        await debugSandbox.resume(session)
      } catch (err) {
        send({ type: 'error', message: err.message })
      }
      return
    }
    try {
      const callFrame = params.callFrames[0]
      const variables = await debugSandbox.getTopFrameVariables(session, callFrame)
      send({ type: 'paused', line: callFrame.location.lineNumber + 1, variables })
    } catch (err) {
      send({ type: 'error', message: err.message })
    }
  }

  clientWs.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'init') {
      if (session) return // one debug session per connection; reconnect to debug again
      try {
        session = await debugSandbox.startSession(msg.code)
        session.cdp.on('Debugger.paused', handlePaused)
        session.logs.stdout.on('data', (data) => send({ type: 'stdout', data: data.toString() }))
        session.logs.stderr.on('data', (data) => send({ type: 'stderr', data: data.toString() }))
        session.logs.on('close', () => send({ type: 'exited' }))
        await debugSandbox.setBreakpoints(session, msg.breakpoints ?? [])
        await debugSandbox.releaseAndRun(session)
      } catch (err) {
        send({ type: 'error', message: err.message })
      }
    } else if (msg.type === 'resume' && session) {
      debugSandbox.resume(session).catch((err) => send({ type: 'error', message: err.message }))
    } else if (msg.type === 'stepOver' && session) {
      debugSandbox.stepOver(session).catch((err) => send({ type: 'error', message: err.message }))
    } else if (msg.type === 'stop' && session) {
      debugSandbox.stopSession(session).catch(() => {})
      session = null
    }
  })

  clientWs.on('close', () => {
    if (session) debugSandbox.stopSession(session).catch(() => {})
  })
}

module.exports = { handleDebugConnection }
