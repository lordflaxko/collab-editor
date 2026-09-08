import type { CSSProperties } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import { usePresence } from './usePresence'
import ChatPanel from './ChatPanel'
import type { Author } from './threadHelpers'

interface CollabSidebarProps {
  awareness: Awareness
  ydoc: Y.Doc
  user: Author
  room: string
  participants: string[]
}

// Always-visible, unlike the other side panels -- who's here and the room
// chat are the two things worth seeing at a glance the whole time you're
// working, not something to dig for behind a toggle.
function CollabSidebar({ awareness, ydoc, user, room, participants }: CollabSidebarProps) {
  const users = usePresence(awareness)

  return (
    <div className="collab-sidebar">
      <div className="collab-sidebar-collaborators">
        <div className="collab-sidebar-header">Collaborators</div>
        <ul className="collab-sidebar-list">
          {users.map((u) => (
            <li key={u.clientId} className="collab-sidebar-user">
              <span
                className="collab-sidebar-avatar"
                style={{ '--chip-color': u.color } as CSSProperties}
              >
                {u.name.slice(0, 1).toUpperCase()}
              </span>
              {u.name}
            </li>
          ))}
        </ul>
      </div>
      <ChatPanel ydoc={ydoc} user={user} room={room} participants={participants} />
    </div>
  )
}

export default CollabSidebar
