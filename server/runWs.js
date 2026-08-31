const WebSocket = require('ws')
const { PISTON_RUNTIMES } = require('./languages')

const PISTON_WS_URL = process.env.PISTON_WS_URL || 'ws://localhost:2000/api/v2/connect'

// Proxies a client's interactive run session to Piston's WebSocket execute
// API (distinct from its batch HTTP /execute endpoint), so stdin can be sent
// while the program is running rather than only supplied upfront. Piston's
// own protocol is kept internal to this module -- the client only ever sees
// the smaller {type: stdout/stderr/exit/error/closed} protocol below.
function handleRunConnection(clientWs) {
  let pistonWs = null
  let startedAt = null

  function send(payload) {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(payload))
  }

  clientWs.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'init') {
      if (pistonWs) return // one run per connection; client reconnects to run again
      const runtime = PISTON_RUNTIMES[msg.languageId]
      if (!runtime) {
        send({ type: 'error', message: `Unsupported language: ${msg.languageId}` })
        return
      }

      startedAt = Date.now()
      pistonWs = new WebSocket(PISTON_WS_URL)

      pistonWs.on('open', () => {
        pistonWs.send(
          JSON.stringify({
            type: 'init',
            language: runtime.language,
            version: runtime.version,
            files: [{ name: runtime.filename, content: msg.code ?? '' }],
          }),
        )
      })

      pistonWs.on('message', (data) => {
        let event
        try {
          event = JSON.parse(data.toString())
        } catch {
          return
        }
        if (event.type === 'data' && event.stream === 'stdout') {
          send({ type: 'stdout', data: event.data })
        } else if (event.type === 'data' && event.stream === 'stderr') {
          send({ type: 'stderr', data: event.data })
        } else if (event.type === 'exit') {
          send({ type: 'exit', code: event.code, signal: event.signal, wallTimeMs: Date.now() - startedAt })
        } else if (event.type === 'error') {
          send({ type: 'error', message: event.message })
        }
      })

      pistonWs.on('close', (code, reason) => {
        send({ type: 'closed', code, reason: reason.toString() })
      })

      pistonWs.on('error', (err) => {
        send({ type: 'error', message: `Execution service error: ${err.message}` })
      })
    } else if (msg.type === 'stdin' && pistonWs) {
      pistonWs.send(JSON.stringify({ type: 'data', stream: 'stdin', data: msg.data }))
    } else if (msg.type === 'stop' && pistonWs) {
      // Best-effort: this self-hosted Piston's signal handling does not
      // reliably interrupt a running process early in testing (it kept
      // running past a sent SIGKILL until Piston's own run timeout), so
      // this also closes the upstream connection immediately rather than
      // waiting on the signal actually taking effect.
      pistonWs.send(JSON.stringify({ type: 'signal', signal: 'SIGKILL' }))
      pistonWs.close()
    }
  })

  clientWs.on('close', () => {
    pistonWs?.close()
  })
}

module.exports = { handleRunConnection }
