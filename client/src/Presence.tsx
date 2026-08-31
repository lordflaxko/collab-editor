import type { CSSProperties } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import { usePresence } from './usePresence'

function Presence({ awareness }: { awareness: Awareness }) {
  const users = usePresence(awareness)

  if (users.length === 0) return null

  return (
    <div className="presence">
      {users.map((user) => (
        <span
          key={user.clientId}
          className="presence-chip"
          style={{ '--chip-color': user.color } as CSSProperties}
        >
          <span className="presence-dot" />
          {user.name}
        </span>
      ))}
    </div>
  )
}

export default Presence
