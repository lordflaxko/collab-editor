interface CommandItem {
  title: string
  description: string
  run: (editor: import('@tiptap/core').Editor, range: import('@tiptap/core').Range) => void
}

export const SLASH_COMMAND_ITEMS: CommandItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Big section heading',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Blockquote',
    description: 'Quoted text block',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code Block',
    description: 'Preformatted code',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Table',
    description: '3x3 table with a header row',
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Image',
    description: 'Embed an image by URL',
    run: (editor, range) => {
      const url = window.prompt('Image URL')
      const chain = editor.chain().focus().deleteRange(range)
      if (url) {
        chain.setImage({ src: url }).run()
      } else {
        chain.run()
      }
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

export function getSlashCommandItems(query: string): CommandItem[] {
  const q = query.toLowerCase()
  return SLASH_COMMAND_ITEMS.filter((item) => item.title.toLowerCase().includes(q))
}

export function createSlashMenu() {
  const element = document.createElement('div')
  element.className = 'slash-menu'

  let items: CommandItem[] = []
  let selectedIndex = 0
  let onSelect: (item: CommandItem) => void = () => {}

  function render() {
    element.innerHTML = ''
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'slash-menu-empty'
      empty.textContent = 'No matching blocks'
      element.appendChild(empty)
      return
    }
    items.forEach((item, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'slash-menu-item' + (index === selectedIndex ? ' is-selected' : '')

      const title = document.createElement('span')
      title.className = 'slash-menu-title'
      title.textContent = item.title

      const description = document.createElement('span')
      description.className = 'slash-menu-desc'
      description.textContent = item.description

      button.append(title, description)
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        onSelect(item)
      })
      element.appendChild(button)
    })
  }

  return {
    element,
    setItems(next: CommandItem[]) {
      items = next
      selectedIndex = 0
      render()
    },
    setOnSelect(fn: (item: CommandItem) => void) {
      onSelect = fn
    },
    moveSelection(delta: number) {
      if (items.length === 0) return
      selectedIndex = (selectedIndex + delta + items.length) % items.length
      render()
    },
    selectCurrent() {
      const item = items[selectedIndex]
      if (item) onSelect(item)
    },
  }
}

export type { CommandItem }
