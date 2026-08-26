import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { useMemo } from 'react'

function Editor() {
  // One Yjs document living in memory in this browser tab.
  // No network yet — this just proves the editor <-> CRDT wiring works.
  const ydoc = useMemo(() => new Y.Doc(), [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false, // Yjs's UndoManager replaces StarterKit's own history
      }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
  })

  return (
    <div className="editor-wrapper">
      <EditorContent editor={editor} />
    </div>
  )
}

export default Editor
