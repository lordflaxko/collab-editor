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

interface EditorProps {
  room: string
  passphrase: string
  onAuthError: () => void
  onConnected: () => void
}

const INVALID_PASSPHRASE_CODE = 4001

function Editor({ room, passphrase, onAuthError, onConnected }: EditorProps) {
  const ydoc = useMemo(() => new Y.Doc(), [])
  const provider = useMemo(
    () => new WebsocketProvider('ws://localhost:1234', room, ydoc, { params: { passphrase } }),
    [room, ydoc, passphrase],
  )
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    const onStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setStatus(status)
      if (status === 'connected') onConnected()
    }
    const onClose = (event: CloseEvent) => {
      if (event.code === INVALID_PASSPHRASE_CODE) {
        provider.disconnect()
        onAuthError()
      }
    }
    provider.on('status', onStatus)
    provider.on('connection-close', onClose)
    provider.connect()
    return () => {
      provider.off('status', onStatus)
      provider.off('connection-close', onClose)
      provider.disconnect()
    }
  }, [provider, onAuthError, onConnected])

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
