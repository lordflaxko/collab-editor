import { useEditorState, type Editor } from '@tiptap/react'
import type { CSSProperties } from 'react'

interface AwarenessUser {
  clientId: number
  name?: string
  color?: string
}

function Presence({ editor }: { editor: Editor }) {
  const users = useEditorState({
    editor,
    selector: ({ editor }) =>
      (editor.storage.collaborationCaret?.users ?? []) as AwarenessUser[],
  })

  if (users.length === 0) return null

  return (
    <div className="presence">
      {users.map((user) => (
        <span
          key={user.clientId}
          className="presence-chip"
          style={{ '--chip-color': user.color ?? '#9ca3af' } as CSSProperties}
        >
          <span className="presence-dot" />
          {user.name ?? 'Anonymous'}
        </span>
      ))}
    </div>
  )
}

export default Presence
