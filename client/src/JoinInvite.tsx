import { useEffect, useState } from 'react'
import { joinViaInvite } from './projects'

interface JoinInviteProps {
  inviteToken: string
  token: string | null
  onJoined: (projectId: string) => void
}

function JoinInvite({ inviteToken, token, onJoined }: JoinInviteProps) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    joinViaInvite(token, inviteToken)
      .then(({ project }) => onJoined(project.id))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not join that project'))
  }, [token, inviteToken, onJoined])

  if (!token) {
    return (
      <div className="unlock-gate">
        <p>Sign in above to accept this invite.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="unlock-gate">
        <p>{error}</p>
      </div>
    )
  }

  return <div className="sc-loading">Joining…</div>
}

export default JoinInvite
