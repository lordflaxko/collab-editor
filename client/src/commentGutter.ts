import { gutter, GutterMarker, type EditorView } from '@codemirror/view'
import { StateEffect, StateField, RangeSet } from '@codemirror/state'
import type * as Y from 'yjs'
import { resolveAnchor, type CommentThreadData } from './comments'

export const setCommentThreads = StateEffect.define<CommentThreadData[]>()

export const commentThreadsField = StateField.define<CommentThreadData[]>({
  create: () => [],
  update(threads, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCommentThreads)) return effect.value
    }
    return threads
  },
})

class CommentMarker extends GutterMarker {
  threadId: string
  count: number

  constructor(threadId: string, count: number) {
    super()
    this.threadId = threadId
    this.count = count
  }
  eq(other: CommentMarker) {
    return other.threadId === this.threadId && other.count === this.count
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-comment-marker'
    el.textContent = '\u{1F4AC}'
    el.title = this.count > 1 ? `${this.count} comments` : '1 comment'
    return el
  }
}

interface LineThread {
  line: number
  threadId: string
  count: number
}

function unresolvedThreadsByLine(view: EditorView, ytext: Y.Text): LineThread[] {
  const threads = view.state.field(commentThreadsField)
  const byLine = new Map<number, { threadId: string; count: number }>()
  for (const thread of threads) {
    if (thread.resolved) continue
    const index = resolveAnchor(ytext, thread.anchorFrom)
    if (index == null) continue
    const line = view.state.doc.lineAt(Math.min(index, view.state.doc.length)).from
    const existing = byLine.get(line)
    if (existing) existing.count += 1
    else byLine.set(line, { threadId: thread.id, count: 1 })
  }
  return Array.from(byLine.entries()).map(([line, v]) => ({ line, ...v }))
}

export function commentGutter(
  ytext: Y.Text,
  onOpenThread: (threadId: string, coords: { top: number; left: number; bottom: number }) => void,
) {
  return gutter({
    class: 'cm-comment-gutter',
    markers(view) {
      const markers = unresolvedThreadsByLine(view, ytext).map(({ line, threadId, count }) =>
        new CommentMarker(threadId, count).range(line),
      )
      return RangeSet.of(markers, true)
    },
    domEventHandlers: {
      mousedown(view, block) {
        const match = unresolvedThreadsByLine(view, ytext).find((t) => t.line === block.from)
        if (!match) return false
        const coords = view.coordsAtPos(block.from)
        if (coords) onOpenThread(match.threadId, coords)
        return true
      },
    },
  })
}
