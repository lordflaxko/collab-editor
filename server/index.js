const path = require('path')
const http = require('http')
const { WebSocketServer } = require('ws')

// y-websocket/bin/utils reads YPERSISTENCE at require-time, so it must be
// set before the require() call below.
process.env.YPERSISTENCE = process.env.YPERSISTENCE || path.join(__dirname, 'data')

const { setupWSConnection } = require('y-websocket/bin/utils')
const { authorize } = require('./auth')

const port = process.env.PORT || 1234

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Yjs websocket server is running')
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const docName = url.pathname.slice(1)
  const passphrase = url.searchParams.get('passphrase') ?? ''

  if (!authorize(docName, passphrase)) {
    ws.close(4001, 'invalid-passphrase')
    return
  }

  setupWSConnection(ws, req, { docName })
})

server.listen(port, () => {
  console.log(`Yjs websocket server listening on ws://localhost:${port}`)
})
