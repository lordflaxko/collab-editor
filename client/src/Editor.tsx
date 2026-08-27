import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useEffect, useMemo, useState } from 'react'

const USER_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#a78bfa', '#f472b6']

function randomUser() {
  return {
    name: `User ${Math.floor(Math.random() * 1000)}`,
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
  }
}

function Editor({ room }: { room: string }) {
  const ydoc = useMemo(() => new Y.Doc(), [])
  const provider = useMemo(
    () => new WebsocketProvider('ws://localhost:1234', room, ydoc),
    [room, ydoc],
  )
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    const onStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) =>
      setStatus(status)
    provider.on('status', onStatus)
    provider.connect()
    return () => {
      provider.off('status', onStatus)
      provider.disconnect()
    }
  }, [provider])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false, // Yjs's UndoManager replaces StarterKit's own history
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCaret.configure({
        provider,
        user: randomUser(),
      }),
    ],
  })

  return (
    <div className="editor-wrapper">
      <p className="status">Sync: {status}</p>
      <EditorContent editor={editor} />
    </div>
  )
}

export default Editor
