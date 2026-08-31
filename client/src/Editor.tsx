import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useEffect, useMemo, useState } from 'react'
import Toolbar from './Toolbar'
import Presence from './Presence'
import SlashCommand from './SlashCommand'
import { handleImageDrop, handleImagePaste } from './imagePaste'

interface EditorUser {
  name: string
  color: string
}

interface EditorProps {
  room: string
  passphrase: string
  user: EditorUser
  onAuthError: () => void
  onConnected: () => void
}

const INVALID_PASSPHRASE_CODE = 4001

function Editor({ room, passphrase, user, onAuthError, onConnected }: EditorProps) {
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
        user,
      }),
      TableKit.configure({
        table: { resizable: true },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      SlashCommand,
    ],
    editorProps: {
      handlePaste: handleImagePaste,
      handleDrop: handleImageDrop,
    },
  })

  // Keep the awareness state in sync when the user edits their name/color
  // without tearing down and reconnecting the provider.
  useEffect(() => {
    editor?.commands.updateUser(user)
  }, [editor, user])

  return (
    <div className="editor-wrapper">
      <div className="editor-header">
        <span className={`status status-${status}`}>
          <span className="status-dot" />
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </span>
        {editor && <Presence editor={editor} />}
        {editor && <Toolbar editor={editor} />}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default Editor
