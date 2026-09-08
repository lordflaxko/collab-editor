import { useEffect, useState } from 'react'
import { listPublicProjects, type PublicProjectSummary } from './projects'

interface PublicGalleryProps {
  onOpenProject: (id: string) => void
}

function PublicGallery({ onOpenProject }: PublicGalleryProps) {
  const [projects, setProjects] = useState<PublicProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPublicProjects()
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load public projects'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Explore public projects</h1>
        <p>Browse projects other people have made public.</p>
      </div>
      {error && <div className="format-error">{error}</div>}
      {loading ? (
        <div className="sc-loading">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="dashboard-empty">
          <span className="dashboard-empty-icon">◆</span>
          <p>No public projects yet</p>
          <span>Projects marked "Public" will show up here for anyone to browse.</span>
        </div>
      ) : (
        <ul className="gallery-grid">
          {projects.map((p) => (
            <li key={p.id}>
              <button type="button" className="gallery-card" onClick={() => onOpenProject(p.id)}>
                <span className="project-name">{p.name}</span>
                <span className="gallery-card-meta">by {p.ownerUsername}</span>
                <span className="role-badge">
                  {p.memberCount} member{p.memberCount === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PublicGallery
