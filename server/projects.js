const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const accounts = require('./accounts')
const { getLoadedLiveDoc } = require('./yjsDoc')
const { logActivity } = require('./activityLog')
const { TEMPLATES } = require('./templates')
const customTemplates = require('./customTemplates')

const PROJECTS_PATH = path.join(__dirname, 'projects.json')
const INVITES_PATH = path.join(__dirname, 'invites.json')
const ROLE_RANK = { viewer: 0, editor: 1, admin: 2, owner: 3 }
const ASSIGNABLE_ROLES = ['viewer', 'editor', 'admin']

function loadProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveProjects(store) {
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(store, null, 2))
}

function loadInvites() {
  try {
    return JSON.parse(fs.readFileSync(INVITES_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveInvites(store) {
  fs.writeFileSync(INVITES_PATH, JSON.stringify(store, null, 2))
}

function requireUser(token) {
  const username = accounts.getSessionUser(token)
  if (!username) throw new Error('You must be signed in')
  return username
}

// A member's explicit role always wins; otherwise a public project grants
// anonymous/non-member visitors read-only access, and a private one grants
// nothing at all. This is the single access-decision point used both by
// the WebSocket connection handler and the REST endpoints below.
function roleFor(project, username) {
  if (!project) return null
  if (username && project.members[username]) return project.members[username]
  return project.visibility === 'public' ? 'viewer' : null
}

function requireRole(project, username, minRole) {
  const role = project.members[username]
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Error('You do not have permission to do that')
  }
  return role
}

// Used by routes outside projects.js itself (git operations) that need to
// both authenticate the caller against a project's role and learn who they
// are, in one call -- previously those endpoints trusted whatever
// "author" name the client claimed in the request body, and didn't check
// role at all, so a Viewer (or anyone unauthenticated) could call them
// directly to mutate the project's git history regardless of what the UI
// showed them.
function requireMinRole(token, projectId, minRole) {
  const { project, role } = getProjectForRequester(token, projectId)
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Error('You do not have permission to do that')
  }
  return { project, role, username: accounts.getSessionUser(token) }
}

// Seeds the new project's starting file(s) directly in its Y.Doc, as a
// single atomic server-side action at creation time -- rather than having
// each connecting client reactively check "is the file list empty?" and
// create one if so, which is exactly the kind of check-then-act race a CRDT
// can't resolve for you: two clients connecting to a brand-new project at
// close to the same time could both see zero files and both create their
// own "main.js", ending up with two separate files (and two people editing
// content neither of them can see the other's edits on).
//
// A known templateId seeds that template's file set (e.g. a FizzBuzz
// implementation plus its test file for the JavaScript template); a
// "custom:<id>" templateId looks up a user-saved template instead. Anything
// else (including no templateId at all, i.e. "Blank") falls back to the
// single empty main.js this app has always started new projects with.
async function seedDefaultFile(projectId, templateId) {
  const ydoc = await getLoadedLiveDoc(projectId)
  const filesMap = ydoc.getMap('files')
  const order = ydoc.getArray('fileOrder')
  if (order.length > 0) return
  let files = null
  if (templateId?.startsWith('custom:')) {
    const custom = customTemplates.getCustomTemplate(templateId.slice('custom:'.length))
    if (custom) files = custom.files
  } else if (templateId && TEMPLATES[templateId]) {
    files = TEMPLATES[templateId].files
  }
  if (!files) files = [{ name: 'main.js', languageId: 'javascript', content: '' }]
  ydoc.transact(() => {
    for (const file of files) {
      const id = crypto.randomUUID().slice(0, 8)
      filesMap.set(id, { name: file.name, languageId: file.languageId })
      order.push([id])
      if (file.content) {
        ydoc.getText(`content:${id}`).insert(0, file.content)
      }
    }
  })
}

async function createProject(token, name, visibility, templateId) {
  const username = requireUser(token)
  if (!name || !name.trim()) throw new Error('Project name is required')
  if (visibility !== 'public' && visibility !== 'private') {
    throw new Error('Visibility must be "public" or "private"')
  }
  const projects = loadProjects()
  const id = crypto.randomUUID().slice(0, 8)
  const project = {
    id,
    name: name.trim(),
    ownerUsername: username,
    visibility,
    members: { [username]: 'owner' },
    createdAt: Date.now(),
  }
  projects[id] = project
  saveProjects(projects)
  await seedDefaultFile(id, templateId)
  return project
}

function getProject(projectId) {
  const projects = loadProjects()
  return projects[projectId] ?? null
}

function getProjectForRequester(token, projectId) {
  const project = getProject(projectId)
  if (!project) throw new Error('Project not found')
  const username = token ? accounts.getSessionUser(token) : null
  const role = roleFor(project, username)
  if (!role) throw new Error('You do not have access to this project')
  return { project, role }
}

function myProjects(token) {
  const username = requireUser(token)
  return Object.values(loadProjects())
    .filter((p) => p.members[username])
    .sort((a, b) => a.createdAt - b.createdAt)
}

// Deliberately unauthenticated (matches a public project already being
// viewable by anonymous visitors) and deliberately trimmed -- an anonymous
// browser has no business seeing a public project's full member/role map,
// just enough to decide whether to open it.
function listPublicProjects() {
  return Object.values(loadProjects())
    .filter((p) => p.visibility === 'public')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({
      id: p.id,
      name: p.name,
      ownerUsername: p.ownerUsername,
      createdAt: p.createdAt,
      memberCount: Object.keys(p.members).length,
    }))
}

function createInviteLink(token, projectId, role) {
  const username = requireUser(token)
  const project = getProject(projectId)
  if (!project) throw new Error('Project not found')
  requireRole(project, username, 'admin')
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error('Invalid role')
  const invites = loadInvites()
  const inviteToken = crypto.randomBytes(16).toString('hex')
  invites[inviteToken] = { projectId, role, createdBy: username, createdAt: Date.now() }
  saveInvites(invites)
  return inviteToken
}

async function joinViaInvite(token, inviteToken) {
  const username = requireUser(token)
  const invite = loadInvites()[inviteToken]
  if (!invite) throw new Error('Invalid or expired invite link')
  const projects = loadProjects()
  const project = projects[invite.projectId]
  if (!project) throw new Error('Project no longer exists')
  if (!project.members[username]) {
    project.members[username] = invite.role
    saveProjects(projects)
    await logActivity(project.id, 'member-added', username, { role: invite.role })
  }
  return project
}

function listMembers(token, projectId) {
  const { project } = getProjectForRequester(token, projectId)
  return project.members
}

async function changeRole(token, projectId, targetUsername, role) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  requireRole(project, username, 'admin')
  if (targetUsername === project.ownerUsername) throw new Error("Cannot change the owner's role")
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error('Invalid role')
  if (!project.members[targetUsername]) throw new Error('That user is not a member')
  project.members[targetUsername] = role
  saveProjects(projects)
  await logActivity(projectId, 'role-changed', username, { targetUsername, role })
  return project
}

async function removeMember(token, projectId, targetUsername) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  requireRole(project, username, 'admin')
  if (targetUsername === project.ownerUsername) throw new Error('Cannot remove the owner')
  delete project.members[targetUsername]
  saveProjects(projects)
  await logActivity(projectId, 'member-removed', username, { targetUsername })
  return project
}

async function setVisibility(token, projectId, visibility) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  requireRole(project, username, 'admin')
  if (visibility !== 'public' && visibility !== 'private') throw new Error('Invalid visibility')
  project.visibility = visibility
  saveProjects(projects)
  await logActivity(projectId, 'visibility-changed', username, { visibility })
  return project
}

function deleteProject(token, projectId) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  if (project.ownerUsername !== username) throw new Error('Only the owner can delete the project')
  delete projects[projectId]
  saveProjects(projects)
}

async function transferOwnership(token, projectId, newOwnerUsername) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  if (project.ownerUsername !== username) throw new Error('Only the owner can transfer ownership')
  if (!project.members[newOwnerUsername]) throw new Error('The new owner must already be a member')
  project.ownerUsername = newOwnerUsername
  project.members[newOwnerUsername] = 'owner'
  project.members[username] = 'admin'
  saveProjects(projects)
  await logActivity(projectId, 'ownership-transferred', username, { newOwnerUsername })
  return project
}

module.exports = {
  createProject,
  getProject,
  getProjectForRequester,
  requireMinRole,
  roleFor,
  myProjects,
  listPublicProjects,
  createInviteLink,
  joinViaInvite,
  listMembers,
  changeRole,
  removeMember,
  setVisibility,
  deleteProject,
  transferOwnership,
}
