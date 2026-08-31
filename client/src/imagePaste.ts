import type { EditorView } from '@tiptap/pm/view'

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function insertImageAt(view: EditorView, pos: number, src: string) {
  const node = view.state.schema.nodes.image?.create({ src })
  if (!node) return
  view.dispatch(view.state.tr.insert(pos, node))
}

export function handleImagePaste(view: EditorView, event: ClipboardEvent): boolean {
  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find((item) => item.type.startsWith('image/'))
  if (!imageItem) return false
  const file = imageItem.getAsFile()
  if (!file) return false

  event.preventDefault()
  const pos = view.state.selection.from
  readImageFile(file).then((src) => insertImageAt(view, pos, src))
  return true
}

export function handleImageDrop(view: EditorView, event: DragEvent): boolean {
  const files = Array.from(event.dataTransfer?.files ?? [])
  const imageFile = files.find((file) => file.type.startsWith('image/'))
  if (!imageFile) return false

  event.preventDefault()
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  const pos = coords ? coords.pos : view.state.selection.from
  readImageFile(imageFile).then((src) => insertImageAt(view, pos, src))
  return true
}
