import { useEffect, useState } from 'react'
import Workspace from './Workspace'
import MembersPanel from './MembersPanel'
import { getProject, type Project, type Role } from './projects'
import { SERVER_URL } from './api'

interface ProjectViewProps {
  projectId: string
  token: string | null
  user: { name: string; color: string }
  isDark: boolean
  onGoToDashboard: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: Project; role: Role }

function ProjectView({ projectId, token, user, isDark, onGoToDashboard }: ProjectViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [membersOpen, setMembersOpen] = useState(false)

  useEffect(() => {
    setState({ status: 'loading' })
    getProject(token, projectId)
      .then(({ project, role }) => setState({ status: 'ready', project, role }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load project' }),
      )
  }, [projectId, token])

  if (state.status === 'loading') {
    return <div className="sc-loading">Loading project…</div>
  }

  if (state.status === 'error') {
    return (
      <div className="unlock-gate">
        <p>{state.message}</p>
        <button type="button" className="btn" onClick={onGoToDashboard}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  const { project, role } = state

  return (
    <>
      <div className="doc-bar">
        <span className="doc-id">
          Project: <code>{project.name}</code> <span className="role-badge">{role}</span>
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => navigator.clipboard.writeText(window.location.href)}
        >
          Copy link
        </button>
        <a
          className="btn"
          href={`${SERVER_URL}/export/${encodeURIComponent(project.id)}?token=${encodeURIComponent(token ?? '')}`}
        >
          Download .zip
        </a>
        <button type="button" className="btn" onClick={() => setMembersOpen((v) => !v)}>
          Members
        </button>
        <button type="button" className="btn" onClick={onGoToDashboard}>
          Dashboard
        </button>
      </div>
      {membersOpen && token && (
        <MembersPanel
          token={token}
          project={project}
          role={role}
          onClose={() => setMembersOpen(false)}
          onProjectDeleted={onGoToDashboard}
          onProjectUpdated={(p) => setState({ status: 'ready', project: p, role })}
        />
      )}
      <Workspace
        key={project.id}
        room={project.id}
        token={token}
        user={user}
        role={role}
        isDark={isDark}
        onAccessRevoked={onGoToDashboard}
      />
    </>
  )
}

export default ProjectView
