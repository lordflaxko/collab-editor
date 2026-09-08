const path = require('path')
const http = require('http')
const { WebSocketServer } = require('ws')

require('dotenv').config({ path: path.join(__dirname, '.env') })

// y-websocket/bin/utils reads YPERSISTENCE at require-time, so it must be
// set before the require() call below.
process.env.YPERSISTENCE = process.env.YPERSISTENCE || path.join(__dirname, 'data')

const { setupWSConnection } = require('y-websocket/bin/utils')
const { restrictToReadOnly } = require('./readOnlyGuard')
const { handleRunConnection } = require('./runWs')
const { handleDebugConnection } = require('./debugWs')
const { handlePackageRunConnection } = require('./packageRunWs')
const { formatCode } = require('./format')
const accounts = require('./accounts')
const mailer = require('./email')
const notifications = require('./notifications')
const projects = require('./projects')
const git = require('./git')
const githubApi = require('./githubApi')
const testRunner = require('./testRunner')
const aiAssistant = require('./aiAssistant')
const customTemplates = require('./customTemplates')
const database = require('./database')
const deploy = require('./deploy')
const { readRoomFiles } = require('./gitSync')
const { logActivity } = require('./activityLog')

const port = process.env.PORT || 1234
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

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

  // Public, unauthenticated, and not an exact-URL match like every other
  // route below -- a deploy preview is meant to work as a live link anyone
  // can open, and it serves whatever paths the deployed app itself defines.
  if (req.url.startsWith('/preview/')) {
    const rest = req.url.slice('/preview/'.length)
    const slash = rest.indexOf('/')
    const token = slash === -1 ? rest : rest.slice(0, slash)
    const subPath = slash === -1 ? '' : rest.slice(slash)
    deploy.serveDeployment(token, subPath, req, res)
    return
  }

  if (req.method === 'POST' && req.url === '/auth/signup') {
    try {
      const { username, password, email } = await readJsonBody(req)
      const session = accounts.signup(username, password, email)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(session))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/auth/request-reset') {
    try {
      const { email } = await readJsonBody(req)
      const result = accounts.requestPasswordReset(email)
      if (result) {
        const resetLink = `${CLIENT_URL}/reset-password?token=${result.token}`
        await mailer.sendEmail(
          result.email,
          'Reset your Collab Editor password',
          `<p>Someone requested a password reset for your Collab Editor account.</p>` +
            `<p><a href="${resetLink}">${resetLink}</a></p>` +
            `<p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`,
        )
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      // Deliberately the same response whether or not the email matched an
      // account -- see accounts.requestPasswordReset for why.
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/auth/reset-password') {
    try {
      const { token, password } = await readJsonBody(req)
      const session = accounts.resetPassword(token, password)
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
      const { token, name, visibility, templateId } = await readJsonBody(req)
      const project = await projects.createProject(token, name, visibility, templateId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ project }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/templates/list') {
    try {
      const templates = customTemplates.listCustomTemplates()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ templates }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/templates/save') {
    try {
      const { sessionToken, projectId, name } = await readJsonBody(req)
      const { username } = projects.requireMinRole(sessionToken, projectId, 'editor')
      const files = await readRoomFiles(projectId)
      const template = customTemplates.saveCustomTemplate(username, files, name)
      await logActivity(projectId, 'template-saved', username, { name: template.name })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ template }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/templates/delete') {
    try {
      const { sessionToken, templateId } = await readJsonBody(req)
      const username = accounts.getSessionUser(sessionToken)
      if (!username) throw new Error('You must be signed in')
      customTemplates.removeCustomTemplate(username, templateId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
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
      const project = await projects.joinViaInvite(token, inviteToken)
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
      const project = await projects.changeRole(token, projectId, targetUsername, role)
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
      const project = await projects.removeMember(token, projectId, targetUsername)
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
      const project = await projects.setVisibility(token, projectId, visibility)
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
      const project = await projects.transferOwnership(token, projectId, newOwnerUsername)
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
      const { room, message, sessionToken } = await readJsonBody(req)
      const commits = await git.commitAll(room, message, sessionToken)
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
      const { room, name, sessionToken } = await readJsonBody(req)
      const branches = await git.createBranch(room, name, sessionToken)
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
      const { room, name, sessionToken } = await readJsonBody(req)
      const branches = await git.switchBranch(room, name, sessionToken)
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
      const { room, remoteUrl, token, branch, sessionToken } = await readJsonBody(req)
      await git.push(room, remoteUrl, token, branch, sessionToken)
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
      const { room, remoteUrl, token, branch, sessionToken } = await readJsonBody(req)
      const result = await git.pull(room, remoteUrl, token, branch, sessionToken)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/restore') {
    try {
      const { room, hash, sessionToken } = await readJsonBody(req)
      const commits = await git.restoreVersion(room, hash, sessionToken)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ commits }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/review-diff') {
    try {
      const { room, baseBranch } = await readJsonBody(req)
      const files = await git.reviewChangedFiles(room, baseBranch)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ files }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/git/review-file-diff') {
    try {
      const { room, baseBranch, path: filePath } = await readJsonBody(req)
      const diff = await git.reviewFileDiff(room, baseBranch, filePath)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ diff }))
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

  if (req.method === 'POST' && req.url === '/tests/run') {
    try {
      const { room } = await readJsonBody(req)
      const results = await testRunner.runTests(room)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/ai/ask') {
    try {
      const { room, question, sessionToken, activeFileId } = await readJsonBody(req)
      const { project, role } = projects.getProjectForRequester(sessionToken, room)
      const actor = accounts.getSessionUser(sessionToken) ?? 'Anonymous'
      const reply = await aiAssistant.askAssistant(project.id, question, actor, activeFileId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ reply, role }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/db/query') {
    try {
      const { room, sessionToken, connectionString, query } = await readJsonBody(req)
      const { project } = projects.requireMinRole(sessionToken, room, 'editor')
      // Same reasoning as the real-debugging WS gate: this makes the server
      // itself connect outbound on the caller's behalf, so it's restricted
      // to private projects on top of requiring editor+.
      if (project.visibility !== 'private') {
        throw new Error('Database connections are only available for private projects')
      }
      const result = await database.runReadOnlyQuery(connectionString, query)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/deploy/start') {
    try {
      const { room, sessionToken, files } = await readJsonBody(req)
      const { project } = projects.requireMinRole(sessionToken, room, 'editor')
      // Runs npm install with real internet access for a Node deploy (same
      // supply-chain exposure as Install & Run), and for either kind the
      // result is a live, unauthenticated URL anyone with the link can hit
      // -- both reasons to keep this restricted to private projects.
      if (project.visibility !== 'private') {
        throw new Error('Deploying is only available for private projects')
      }
      const result = await deploy.startDeployment(room, files)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/deploy/stop') {
    try {
      const { room, sessionToken, deployToken } = await readJsonBody(req)
      projects.requireMinRole(sessionToken, room, 'editor')
      const dep = deploy.getDeployment(deployToken)
      // Only the project the deployment actually belongs to may stop it --
      // otherwise knowing any live token (they're unguessable, but a
      // teammate could paste one into chat) would let an editor on an
      // unrelated project tear it down.
      if (dep && dep.projectId === room) {
        await deploy.stopDeployment(deployToken)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
    return
  }

  if (req.method === 'POST' && req.url === '/ai/explain') {
    try {
      const { room, sessionToken, code, languageId } = await readJsonBody(req)
      projects.getProjectForRequester(sessionToken, room)
      const explanation = await aiAssistant.explainCode(code, languageId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ explanation }))
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

  if (url.pathname === '/__debug') {
    const room = url.searchParams.get('room') ?? ''
    const sessionToken = url.searchParams.get('token') ?? ''
    try {
      const { project } = projects.requireMinRole(sessionToken, room, 'editor')
      // Real step-through debugging runs the submitted code as a real
      // process (in its own sandboxed container, but still with normal
      // outbound network access -- see debugSandbox.js) rather than inside
      // Piston. That's a meaningfully bigger exposure than the read-only
      // Run panel, so it's restricted to private projects only, on top of
      // requiring editor+ -- an anonymous viewer of a public project can
      // already use Run, but never this.
      if (project.visibility !== 'private') {
        throw new Error('real debugging is only available for private projects')
      }
    } catch {
      ws.close(4003, 'forbidden')
      return
    }
    handleDebugConnection(ws)
    return
  }

  if (url.pathname === '/__runpkg') {
    const room = url.searchParams.get('room') ?? ''
    const sessionToken = url.searchParams.get('token') ?? ''
    try {
      const { project } = projects.requireMinRole(sessionToken, room, 'editor')
      // npm install runs arbitrary postinstall scripts with real internet
      // access inside a writable sandbox -- a bigger exposure than plain
      // Run's package-less Piston sandbox, so it gets the same restriction
      // as real debugging and database connectivity.
      if (project.visibility !== 'private') {
        throw new Error('Install & Run is only available for private projects')
      }
    } catch {
      ws.close(4003, 'forbidden')
      return
    }
    handlePackageRunConnection(ws)
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
