const WebSocket = require('ws')
const { startInstallAndRun } = require('./packageRunner')

// Access control (private project, editor role) is checked by the caller
// before this is ever invoked, the same way debugWs.js works -- this module
// only drives the sandboxed process once that's already been decided.
function handlePackageRunConnection(clientWs) {
  let child = null

  function send(payload) {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(payload))
  }

  clientWs.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'init') {
      if (child) return // one run per connection; reconnect to run again
      try {
        child = await startInstallAndRun(
          msg.files ?? [],
          msg.entryFile,
          (stream, data) => send({ type: stream, data }),
          (code, signal, errorMessage) => {
            if (errorMessage) send({ type: 'error', message: errorMessage })
            else send({ type: 'exit', code, signal })
          },
        )
      } catch (err) {
        send({ type: 'error', message: err.message })
      }
    } else if (msg.type === 'stdin' && child) {
      child.stdin.write(msg.data)
    } else if (msg.type === 'stop' && child) {
      child.kill('SIGKILL')
    }
  })

  clientWs.on('close', () => {
    child?.kill('SIGKILL')
  })
}

module.exports = { handlePackageRunConnection }
