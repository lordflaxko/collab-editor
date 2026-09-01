const WebSocket = require('ws')

// A minimal Chrome DevTools Protocol client, hand-rolled rather than pulling
// in a dependency like chrome-remote-interface: CDP is just JSON-RPC over a
// plain WebSocket -- a command is {id, method, params} and its reply comes
// back tagged with the same id, while unsolicited notifications (like
// "Debugger.paused") arrive as {method, params} with no id. `ws` is already
// a dependency for the collab server itself, so this needs nothing new.
function connectCdp(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl)
    let nextId = 1
    const pending = new Map()
    const listeners = new Map()

    ws.on('open', () => resolve(client))
    ws.on('error', reject)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id !== undefined) {
        const entry = pending.get(msg.id)
        if (!entry) return
        pending.delete(msg.id)
        if (msg.error) entry.reject(new Error(msg.error.message))
        else entry.resolve(msg.result)
      } else if (msg.method) {
        for (const handler of listeners.get(msg.method) ?? []) handler(msg.params)
      }
    })

    const client = {
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = nextId++
          pending.set(id, { resolve: res, reject: rej })
          ws.send(JSON.stringify({ id, method, params }))
        })
      },
      on(method, handler) {
        if (!listeners.has(method)) listeners.set(method, [])
        listeners.get(method).push(handler)
      },
      close() {
        ws.close()
      },
    }
  })
}

module.exports = { connectCdp }
