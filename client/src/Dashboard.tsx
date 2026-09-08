import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createProject, joinViaInvite, myProjects, type Project } from './projects'
import { PROJECT_TEMPLATES } from './templates'
import {
  listCustomTemplates,
  deleteCustomTemplate,
  type CustomTemplateSummary,
} from './customTemplates'

interface DashboardProps {
  token: string
  username: string
  onOpenProject: (id: string) => void
}

function extractInviteToken(input: string): string {
  const trimmed = input.trim()
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

function Dashboard({ token, username, onOpenProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [templateId, setTemplateId] = useState('blank')
  const [creating, setCreating] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateSummary[]>([])

  const refresh = useCallback(() => {
    setLoading(true)
    myProjects(token)
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load projects'))
      .finally(() => setLoading(false))
  }, [token])

  const refreshTemplates = useCallback(() => {
    listCustomTemplates()
      .then((data) => setCustomTemplates(data.templates))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    refreshTemplates()
  }, [refresh, refreshTemplates])

  function handleDeleteTemplate(templateIdToDelete: string) {
    deleteCustomTemplate(token, templateIdToDelete)
      .then(() => {
        refreshTemplates()
        setTemplateId((current) => (current === `custom:${templateIdToDelete}` ? 'blank' : current))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not delete template'))
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    createProject(token, name.trim(), visibility, templateId)
      .then(({ project }) => onOpenProject(project.id))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not create project'))
      .finally(() => setCreating(false))
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault()
    const inviteToken = extractInviteToken(inviteInput)
    if (!inviteToken) return
    setJoining(true)
    setError(null)
    joinViaInvite(token, inviteToken)
      .then(({ project }) => onOpenProject(project.id))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not join that project'))
      .finally(() => setJoining(false))
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Welcome back, {username}</h1>
        <p>Here's what you're working on.</p>
      </div>
      <div className="dashboard">
        <div className="dashboard-column">
          <h2>My Projects</h2>
          {error && <div className="format-error">{error}</div>}
          {loading ? (
            <div className="sc-loading">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon">◆</span>
              <p>No projects yet</p>
              <span>Create one, or join with an invite link.</span>
            </div>
          ) : (
            <ul className="project-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="project-list-item"
                    onClick={() => onOpenProject(p.id)}
                  >
                    <span className="project-name">{p.name}</span>
                    <span className="role-badge">{p.members[username]}</span>
                    <span className="comment-time">{p.visibility}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dashboard-column">
          <form onSubmit={handleCreate} className="dashboard-form">
            <h3>Create a project</h3>
            <input
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
            />
            <select
              className="visibility-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <select
              className="template-select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {PROJECT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              {customTemplates.length > 0 && (
                <optgroup label="Custom templates">
                  {customTemplates.map((t) => (
                    <option key={t.id} value={`custom:${t.id}`}>
                      {t.name} (by {t.savedBy})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="submit" className="btn btn-primary" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>

          {customTemplates.length > 0 && (
            <div className="dashboard-form">
              <h3>Custom templates</h3>
              <ul className="template-list">
                {customTemplates.map((t) => (
                  <li key={t.id} className="template-list-item">
                    <span className="project-name">{t.name}</span>
                    <span className="comment-time">
                      by {t.savedBy} · {t.fileCount} file
                      {t.fileCount === 1 ? '' : 's'}
                    </span>
                    {t.savedBy === username && (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => handleDeleteTemplate(t.id)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleJoin} className="dashboard-form">
            <h3>Join via invite link</h3>
            <input
              className="text-input"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Paste an invite link or token"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={joining || !inviteInput.trim()}
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
