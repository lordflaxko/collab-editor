const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const TEMPLATES_PATH = path.join(__dirname, 'customTemplates.json')

// Deliberately takes an already-verified username and file list rather than
// a session token and project id -- projects.js needs to look custom
// templates up by id when seeding a new project, and this module needs
// projects.js's role check to authorize a save, so keeping the actual role
// check in the route handler (which already has both) avoids a circular
// require between the two modules.
function load() {
  try {
    return JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function save(store) {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(store, null, 2))
}

// File content isn't included here -- this is what populates the dashboard's
// template list, which only needs enough to label the option and let the
// saver find their own to delete. The full file set is only ever read back
// by id, at project-creation time.
function listCustomTemplates() {
  return Object.values(load())
    .map(({ id, name, savedBy, createdAt, files }) => ({
      id,
      name,
      savedBy,
      createdAt,
      fileCount: files.length,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function getCustomTemplate(id) {
  return load()[id] ?? null
}

function saveCustomTemplate(username, files, name) {
  if (!name || !name.trim()) throw new Error('A template name is required')
  if (!files || files.length === 0) throw new Error('This project has no files to save as a template')
  const store = load()
  const id = crypto.randomUUID().slice(0, 8)
  const template = { id, name: name.trim(), savedBy: username, createdAt: Date.now(), files }
  store[id] = template
  save(store)
  return template
}

function removeCustomTemplate(username, templateId) {
  const store = load()
  const template = store[templateId]
  if (!template) throw new Error('Template not found')
  if (template.savedBy !== username) {
    throw new Error('Only the person who saved this template can delete it')
  }
  delete store[templateId]
  save(store)
}

module.exports = { listCustomTemplates, getCustomTemplate, saveCustomTemplate, removeCustomTemplate }
