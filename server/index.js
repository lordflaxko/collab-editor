const http = require('http')
const { WebSocketServer } = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const port = process.env.PORT || 1234

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Yjs websocket server is running')
})

const wss = new WebSocketServer({ server })

wss.on('connection', setupWSConnection)

server.listen(port, () => {
  console.log(`Yjs websocket server listening on ws://localhost:${port}`)
})
