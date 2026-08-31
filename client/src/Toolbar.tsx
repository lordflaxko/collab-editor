import { useEditorState, type Editor } from '@tiptap/react'

interface ToolbarButton {
  label: string
  title: string
  isActive?: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const BUTTON_GROUPS: ToolbarButton[][] = [
  [
    {
      label: 'B',
      title: 'Bold',
      isActive: (editor) => editor.isActive('bold'),
      run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'I',
      title: 'Italic',
      isActive: (editor) => editor.isActive('italic'),
      run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'S',
      title: 'Strikethrough',
      isActive: (editor) => editor.isActive('strike'),
      run: (editor) => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: '</>',
      title: 'Inline code',
      isActive: (editor) => editor.isActive('code'),
      run: (editor) => editor.chain().focus().toggleCode().run(),
    },
  ],
  [
    {
      label: 'H1',
      title: 'Heading 1',
      isActive: (editor) => editor.isActive('heading', { level: 1 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'H2',
      title: 'Heading 2',
      isActive: (editor) => editor.isActive('heading', { level: 2 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'H3',
      title: 'Heading 3',
      isActive: (editor) => editor.isActive('heading', { level: 3 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      label: '• List',
      title: 'Bullet list',
      isActive: (editor) => editor.isActive('bulletList'),
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: '1. List',
      title: 'Ordered list',
      isActive: (editor) => editor.isActive('orderedList'),
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: '❝',
      title: 'Blockquote',
      isActive: (editor) => editor.isActive('blockquote'),
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: '{ }',
      title: 'Code block',
      isActive: (editor) => editor.isActive('codeBlock'),
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: '―',
      title: 'Horizontal rule',
      run: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
  ],
  [
    {
      label: '↺',
      title: 'Undo',
      run: (editor) => editor.chain().focus().undo().run(),
    },
    {
      label: '↻',
      title: 'Redo',
      run: (editor) => editor.chain().focus().redo().run(),
    },
  ],
]

function Toolbar({ editor }: { editor: Editor }) {
  const activeStates = useEditorState({
    editor,
    selector: ({ editor }) =>
      BUTTON_GROUPS.flat().map((button) => button.isActive?.(editor) ?? false),
  })

  return (
    <div className="toolbar">
      {BUTTON_GROUPS.map((group, groupIndex) => (
        <div className="toolbar-group" key={groupIndex}>
          {group.map((button) => {
            const flatIndex = BUTTON_GROUPS.flat().indexOf(button)
            return (
              <button
                key={button.title}
                type="button"
                title={button.title}
                className={activeStates[flatIndex] ? 'is-active' : ''}
                onClick={() => button.run(editor)}
              >
                {button.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default Toolbar
