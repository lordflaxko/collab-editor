import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { getSlashCommandItems, createSlashMenu, type CommandItem } from './slashMenu'

const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<CommandItem, CommandItem>({
        editor: this.editor,
        char: '/',
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
        items: ({ query }) => getSlashCommandItems(query),
        command: ({ editor, range, props }) => {
          props.run(editor, range)
        },
        render: () => {
          let menu: ReturnType<typeof createSlashMenu> | null = null
          let unmount: (() => void) | null = null

          return {
            onStart: (props) => {
              menu = createSlashMenu()
              menu.setItems(props.items)
              menu.setOnSelect((item) => props.command(item))
              unmount = props.mount(menu.element)
            },
            onUpdate: (props) => {
              menu?.setItems(props.items)
              menu?.setOnSelect((item) => props.command(item))
            },
            onKeyDown: (props) => {
              if (!menu) return false
              if (props.event.key === 'Escape') {
                unmount?.()
                menu = null
                return true
              }
              if (props.event.key === 'ArrowDown') {
                menu.moveSelection(1)
                return true
              }
              if (props.event.key === 'ArrowUp') {
                menu.moveSelection(-1)
                return true
              }
              if (props.event.key === 'Enter') {
                menu.selectCurrent()
                return true
              }
              return false
            },
            onExit: () => {
              unmount?.()
              menu = null
            },
          }
        },
      }),
    ]
  },
})

export default SlashCommand
