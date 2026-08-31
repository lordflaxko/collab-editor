import { useCallback, useEffect, useState } from 'react'
import {
  createInviteLink,
  changeRole,
  removeMember,
  setVisibility,
  deleteProject,
  transferOwnership,
  listMembers,
  atLeast,
  type Project,
  type Role,
} from './projects'

interface MembersPanelProps {
  token: string
  project: Project
  role: Role
  onClose: () => void
  onProjectDeleted: () => void
  onProjectUpdated: (project: Project) => void
}

function MembersPanel({ token, project, role, onClose, onProjectDeleted, onProjectUpdated }: MembersPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  // The project prop reflects whatever this client last fetched, which can
  // be stale the moment someone else joins via an invite link on a
  // different session -- refetching on open (and after mutations) keeps the
  // member list honest rather than showing a snapshot from page load.
  const [members, setMembers] = useState(project.members)
  const isAdmin = atLeast(role, 'admin')
  const isOwner = role === 'owner'

  const refreshMembers = useCallback(() => {
    listMembers(token, project.id)
      .then((data) => setMembers(data.members))
      .catch(() => {})
  }, [token, project.id])

  useEffect(() => {
    refreshMembers()
  }, [refreshMembers])

  function handle<T>(promise: Promise<{ project: Project } & T>) {
    promise
      .then(({ project: p }) => {
        setMembers(p.members)
        onProjectUpdated(p)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Action failed'))
  }

  function handleGenerateInvite() {
    createInviteLink(token, project.id, inviteRole)
      .then(({ inviteToken }) => setInviteLink(`${window.location.origin}/join/${inviteToken}`))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not create invite link'))
  }

  function handleRoleChange(target: string, newRole: Role) {
    handle(changeRole(token, project.id, target, newRole))
  }

  function handleRemove(target: string) {
    if (!window.confirm(`Remove ${target} from this project?`)) return
    handle(removeMember(token, project.id, target))
  }

  function handleVisibility(v: 'public' | 'private') {
    handle(setVisibility(token, project.id, v))
  }

  function handleTransfer(target: string) {
    if (!window.confirm(`Transfer ownership to ${target}? You will become an admin.`)) return
    handle(transferOwnership(token, project.id, target))
  }

  function handleDelete() {
    if (!window.confirm('Delete this project permanently? This cannot be undone.')) return
    deleteProject(token, project.id)
      .then(onProjectDeleted)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not delete project'))
  }

  return (
    <div className="members-panel">
      <div className="chat-panel-header">
        <span>Members</span>
        <div>
          <button type="button" className="btn btn-small" onClick={refreshMembers}>
            Refresh
          </button>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {error && <div className="format-error">{error}</div>}
      <ul className="members-list">
        {Object.entries(members).map(([name, r]) => (
          <li key={name} className="member-item">
            <span>{name}</span>
            {isAdmin && name !== project.ownerUsername ? (
              <select value={r} onChange={(e) => handleRoleChange(name, e.target.value as Role)}>
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            ) : (
              <span className="role-badge">{r}</span>
            )}
            {isAdmin && name !== project.ownerUsername && (
              <button type="button" className="btn btn-small" onClick={() => handleRemove(name)}>
                Remove
              </button>
            )}
            {isOwner && name !== project.ownerUsername && (
              <button type="button" className="btn btn-small" onClick={() => handleTransfer(name)}>
                Make owner
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <div className="invite-section">
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button type="button" className="btn btn-small" onClick={handleGenerateInvite}>
            Generate invite link
          </button>
          {inviteLink && (
            <input
              className="text-input"
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      )}

      {isAdmin && (
        <div className="visibility-section">
          <span className="comment-time">Visibility:</span>
          <button
            type="button"
            className={`btn btn-small${project.visibility === 'private' ? ' sc-tab-active' : ''}`}
            onClick={() => handleVisibility('private')}
          >
            Private
          </button>
          <button
            type="button"
            className={`btn btn-small${project.visibility === 'public' ? ' sc-tab-active' : ''}`}
            onClick={() => handleVisibility('public')}
          >
            Public
          </button>
        </div>
      )}

      {isOwner && (
        <button type="button" className="btn btn-small btn-danger" onClick={handleDelete}>
          Delete project
        </button>
      )}
    </div>
  )
}

export default MembersPanel
