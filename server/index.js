const path = require('path')
const http = require('http')
const { WebSocketServer } = require('ws')

// y-websocket/bin/utils reads YPERSISTENCE at require-time, so it must be
// set before the require() call below.
process.env.YPERSISTENCE = process.env.YPERSISTENCE || path.join(__dirname, 'data')

const { setupWSConnection } = require('y-websocket/bin/utils')
const { restrictToReadOnly } = require('./readOnlyGuard')
const { handleRunConnection } = require('./runWs')
const { formatCode } = require('./format')
const accounts = require('./accounts')
const notifications = require('./notifications')
const projects = require('./projects')
const git = require('./git')
const githubApi = require('./githubApi')

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

  if (req.method === 'POST' && req.url === '/auth/signup') {
    try {
      const { username, password } = await readJsonBody(req)
      const session = accounts.signup(username, password)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(session))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/auth/login') {
    try {
      const { username, password } = await readJsonBody(req)
      const session = accounts.login(username, password)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(session))
    } catch (err) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/auth/me') {
    const { token } = await readJsonBody(req)
    const username = accounts.getSessionUser(token)
    if (!username) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid or expired session' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ username }))
    return
  }

  if (req.method === 'POST' && req.url === '/auth/logout') {
    const { token } = await readJsonBody(req)
    accounts.destroySession(token)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'POST' && req.url === '/notifications/mention') {
    const { targetUsername, fromName, room, text } = await readJsonBody(req)
    notifications.addMention({ targetUsername, fromName, room, text })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'POST' && req.url === '/notifications/mine') {
    const { token } = await readJsonBody(req)
    const username = accounts.getSessionUser(token)
    if (!username) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid or expired session' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ notifications: notifications.getNotifications(username) }))
    return
  }

  if (req.method === 'POST' && req.url === '/notifications/read') {
    const { token } = await readJsonBody(req)
    const username = accounts.getSessionUser(token)
    if (!username) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid or expired session' }))
      return
    }
    notifications.markAllRead(username)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'POST' && req.url === '/projects/create') {
    try {
      const { token, name, visibility } = await readJsonBody(req)
      const project = projects.createProject(token, name, visibility)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/mine') {
    try {
      const { token } = await readJsonBody(req)
      const list = projects.myProjects(token)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ projects: list }))
    } catch (err) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/get') {
    try {
      const { token, projectId } = await readJsonBody(req)
      const { project, role } = projects.getProjectForRequester(token, projectId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project, role }))
    } catch (err) {
      res.writeHead(err.message === 'Project not found' ? 404 : 403, {
        'Content-Type': 'application/json',
      })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/invite-link') {
    try {
      const { token, projectId, role } = await readJsonBody(req)
      const inviteToken = projects.createInviteLink(token, projectId, role)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ inviteToken }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/join') {
    try {
      const { token, inviteToken } = await readJsonBody(req)
      const project = projects.joinViaInvite(token, inviteToken)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/members') {
    try {
      const { token, projectId } = await readJsonBody(req)
      const members = projects.listMembers(token, projectId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ members }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/member/role') {
    try {
      const { token, projectId, targetUsername, role } = await readJsonBody(req)
      const project = projects.changeRole(token, projectId, targetUsername, role)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/member/remove') {
    try {
      const { token, projectId, targetUsername } = await readJsonBody(req)
      const project = projects.removeMember(token, projectId, targetUsername)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/visibility') {
    try {
      const { token, projectId, visibility } = await readJsonBody(req)
      const project = projects.setVisibility(token, projectId, visibility)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/delete') {
    try {
      const { token, projectId } = await readJsonBody(req)
      projects.deleteProject(token, projectId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/projects/transfer') {
    try {
      const { token, projectId, newOwnerUsername } = await readJsonBody(req)
      const project = projects.transferOwnership(token, projectId, newOwnerUsername)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/status') {
    try {
      const { room } = await readJsonBody(req)
      const status = await git.getStatus(room)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(status))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/log') {
    try {
      const { room } = await readJsonBody(req)
      const commits = await git.getLog(room)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ commits }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/diff') {
    try {
      const { room, path: filePath } = await readJsonBody(req)
      const result = await git.getDiff(room, filePath)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/commit') {
    try {
      const { room, message, author } = await readJsonBody(req)
      const commits = await git.commitAll(room, message, author)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ commits }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/branches') {
    try {
      const { room } = await readJsonBody(req)
      const branches = await git.listBranches(room)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(branches))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/branch/create') {
    try {
      const { room, name } = await readJsonBody(req)
      const branches = await git.createBranch(room, name)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(branches))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/branch/switch') {
    try {
      const { room, name } = await readJsonBody(req)
      const branches = await git.switchBranch(room, name)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(branches))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/push') {
    try {
      const { room, remoteUrl, token, branch } = await readJsonBody(req)
      await git.push(room, remoteUrl, token, branch)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/pull') {
    try {
      const { room, remoteUrl, token, branch } = await readJsonBody(req)
      const result = await git.pull(room, remoteUrl, token, branch)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/pr/list') {
    try {
      const { remoteUrl, token } = await readJsonBody(req)
      const pullRequests = await githubApi.listPullRequests(remoteUrl, token)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ pullRequests }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/pr/create') {
    try {
      const { remoteUrl, token, title, head, base, body } = await readJsonBody(req)
      const pr = await githubApi.createPullRequest(remoteUrl, token, { title, head, base, body })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(pr))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
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

  if (url.pathname === '/__run') {
    handleRunConnection(ws)
    return
  }

  const docName = url.pathname.slice(1)
  const token = url.searchParams.get('token') ?? ''
  const username = accounts.getSessionUser(token)

  const project = projects.getProject(docName)
  if (!project) {
    ws.close(4004, 'project-not-found')
    return
  }

  const role = projects.roleFor(project, username)
  if (!role) {
    ws.close(4003, 'forbidden')
    return
  }

  if (role === 'viewer') {
    restrictToReadOnly(ws)
  }

  setupWSConnection(ws, req, { docName })
})

server.listen(port, () => {
  console.log(`Yjs websocket server listening on ws://localhost:${port}`)
})
