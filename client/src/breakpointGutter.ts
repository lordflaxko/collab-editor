import { gutter, GutterMarker, type EditorView } from '@codemirror/view'
import { StateEffect, StateField, RangeSet } from '@codemirror/state'
import type * as Y from 'yjs'
import { resolveAnchor } from './comments'
import type { Breakpoint } from './breakpoints'
import type { Coords } from './CodeEditor'

export const setBreakpoints = StateEffect.define<Breakpoint[]>()

export const breakpointsField = StateField.define<Breakpoint[]>({
  create: () => [],
  update(breakpoints, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBreakpoints)) return effect.value
    }
    return breakpoints
  },
})

class BreakpointMarker extends GutterMarker {
  breakpointId: string
  hasExpressions: boolean

  constructor(breakpointId: string, hasExpressions: boolean) {
    super()
    this.breakpointId = breakpointId
    this.hasExpressions = hasExpressions
  }
  eq(other: BreakpointMarker) {
    return other.breakpointId === this.breakpointId && other.hasExpressions === this.hasExpressions
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-breakpoint-marker'
    el.title = this.hasExpressions ? 'Breakpoint (click to edit)' : 'Breakpoint (click to add watches)'
    return el
  }
}

export interface LineBreakpoint {
  line: number
  breakpointId: string
  expressions: string[]
}

function breakpointsByLine(view: EditorView, ytext: Y.Text): LineBreakpoint[] {
  const breakpoints = view.state.field(breakpointsField)
  const result: LineBreakpoint[] = []
  for (const bp of breakpoints) {
    const index = resolveAnchor(ytext, bp.anchor)
    if (index == null) continue
    const line = view.state.doc.lineAt(Math.min(index, view.state.doc.length)).from
    result.push({ line, breakpointId: bp.id, expressions: bp.expressions })
  }
  return result
}

// Every click on this gutter -- whether or not that line already has a
// breakpoint -- opens the popover that lets you set/edit its watch
// expressions, since a bare on/off toggle wouldn't be very useful for a
// logpoint (you almost always want to say what to watch).
export function breakpointGutter(
  ytext: Y.Text,
  onClick: (lineFrom: number, existing: LineBreakpoint | undefined, coords: Coords) => void,
) {
  return gutter({
    class: 'cm-breakpoint-gutter',
    // Without this, CodeMirror only renders a gutter cell for lines that
    // already have a marker -- which would make every line except an
    // existing breakpoint's un-clickable, defeating the point of a gutter
    // you click on to set a new one.
    renderEmptyElements: true,
    markers(view) {
      const markers = breakpointsByLine(view, ytext).map(({ line, breakpointId, expressions }) =>
        new BreakpointMarker(breakpointId, expressions.length > 0).range(line),
      )
      return RangeSet.of(markers, true)
    },
    domEventHandlers: {
      mousedown(view, block) {
        const existing = breakpointsByLine(view, ytext).find((b) => b.line === block.from)
        const coords = view.coordsAtPos(block.from)
        if (coords) onClick(block.from, existing, coords)
        return true
      },
    },
  })
}
