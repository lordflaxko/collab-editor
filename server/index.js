const path = require('path')
const http = require('http')
const { WebSocketServer } = require('ws')

// y-websocket/bin/utils reads YPERSISTENCE at require-time, so it must be
// set before the require() call below.
process.env.YPERSISTENCE = process.env.YPERSISTENCE || path.join(__dirname, 'data')

const { setupWSConnection } = require('y-websocket/bin/utils')
const { authorize } = require('./auth')
const { runCode } = require('./run')
const { formatCode } = require('./format')

const port = process.env.PORT || 1234

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/run') {
    try {
      const { languageId, code, stdin } = await readJsonBody(req)
      const result = await runCode(languageId, code, stdin)
      res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/format') {
    try {
      const { languageId, code } = await readJsonBody(req)
      const formatted = await formatCode(languageId, code)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ formatted }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

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
