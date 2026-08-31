const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const accounts = require('./accounts')

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

function createProject(token, name, visibility) {
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
  return Object.values(loadProjects()).filter((p) => p.members[username])
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

function joinViaInvite(token, inviteToken) {
  const username = requireUser(token)
  const invite = loadInvites()[inviteToken]
  if (!invite) throw new Error('Invalid or expired invite link')
  const projects = loadProjects()
  const project = projects[invite.projectId]
  if (!project) throw new Error('Project no longer exists')
  if (!project.members[username]) {
    project.members[username] = invite.role
    saveProjects(projects)
  }
  return project
}

function listMembers(token, projectId) {
  const { project } = getProjectForRequester(token, projectId)
  return project.members
}

function changeRole(token, projectId, targetUsername, role) {
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
  return project
}

function removeMember(token, projectId, targetUsername) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  requireRole(project, username, 'admin')
  if (targetUsername === project.ownerUsername) throw new Error('Cannot remove the owner')
  delete project.members[targetUsername]
  saveProjects(projects)
  return project
}

function setVisibility(token, projectId, visibility) {
  const username = requireUser(token)
  const projects = loadProjects()
  const project = projects[projectId]
  if (!project) throw new Error('Project not found')
  requireRole(project, username, 'admin')
  if (visibility !== 'public' && visibility !== 'private') throw new Error('Invalid visibility')
  project.visibility = visibility
  saveProjects(projects)
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

function transferOwnership(token, projectId, newOwnerUsername) {
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
  return project
}

module.exports = {
  createProject,
  getProject,
  getProjectForRequester,
  roleFor,
  myProjects,
  createInviteLink,
  joinViaInvite,
  listMembers,
  changeRole,
  removeMember,
  setVisibility,
  deleteProject,
  transferOwnership,
}
