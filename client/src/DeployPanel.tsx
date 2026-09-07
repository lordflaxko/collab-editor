import { useEffect, useState } from 'react'
import { startDeployment, stopDeployment, previewUrl, type DeployResult } from './deploy'

interface DeployPanelProps {
  room: string
  sessionToken: string | null
  getAllFiles: () => { name: string; content: string }[]
  onClose: () => void
}

function formatRemaining(ms: number) {
  if (ms <= 0) return 'expired'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

// Deploys a snapshot of the project's files (not a live link to them --
// editing afterward doesn't affect an already-running preview) either as a
// Node server (package.json present, must listen on process.env.PORT) in a
// sandboxed container, or as static files otherwise. Ephemeral by design:
// it auto-stops after 15 minutes, capping the abuse/resource risk of a
// preview that's reachable by anyone with its (unguessable) link, unlike
// Run/Install & Run which never expose a network port to the outside world.
function DeployPanel({ room, sessionToken, getAllFiles, onClose }: DeployPanelProps) {
  const [deploying, setDeploying] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deployment, setDeployment] = useState<DeployResult | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!deployment) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [deployment])

  function handleDeploy() {
    if (deploying) return
    setDeploying(true)
    setError(null)
    startDeployment(room, sessionToken, getAllFiles())
      .then(setDeployment)
      .catch((err) => setError(err instanceof Error ? err.message : 'Deploy failed'))
      .finally(() => setDeploying(false))
  }

  function handleStop() {
    if (!deployment || stopping) return
    setStopping(true)
    stopDeployment(room, sessionToken, deployment.token)
      .then(() => setDeployment(null))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not stop the deploy'))
      .finally(() => setStopping(false))
  }

  const expired = deployment != null && deployment.expiresAt <= now

  return (
    <div className="deploy-panel">
      <div className="chat-panel-header">
        <span>Deploy</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="deploy-panel-body">
        <div className="sc-remote-note">
          Deploys a snapshot of the current files as a live preview for 15 minutes. With a
          package.json it runs as a Node server (must listen on process.env.PORT); otherwise it's
          served as a static site (needs an index.html).
        </div>
        {!deployment || expired ? (
          <button type="button" className="btn btn-small" onClick={handleDeploy} disabled={deploying}>
            {deploying ? 'Deploying…' : 'Deploy'}
          </button>
        ) : (
          <>
            <div className="deploy-status">
              <a className="deploy-link" href={previewUrl(deployment.token)} target="_blank" rel="noreferrer">
                {previewUrl(deployment.token)}
              </a>
              <span className="comment-time">expires in {formatRemaining(deployment.expiresAt - now)}</span>
            </div>
            <button type="button" className="btn btn-small btn-danger" onClick={handleStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          </>
        )}
        {error && <div className="format-error">{error}</div>}
      </div>
    </div>
  )
}

export default DeployPanel
