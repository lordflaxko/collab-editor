import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, syntaxTree } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next'
import type * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'
import type { LanguageConfig } from './languages'
import type { CommentThreadData } from './comments'
import { commentGutter, commentThreadsField, setCommentThreads } from './commentGutter'

export interface Coords {
  top: number
  left: number
  bottom: number
}

export interface EditorHandle {
  getContent: () => string
  setContent: (value: string) => void
  getSelection: () => { from: number; to: number }
  getCoordsForPos: (pos: number) => Coords | null
}

// All supported languages are backed by Lezer grammars, which mark
// unparseable spans as error nodes in the syntax tree. Surfacing those is
// enough for syntax-only error detection without a per-language linter.
const syntaxErrorLinter = linter((view) => {
  const diagnostics: Diagnostic[] = []
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (node.type.isError) {
        diagnostics.push({
          from: node.from,
          to: Math.max(node.to, node.from + 1),
          severity: 'error',
          message: 'Syntax error',
        })
      }
    },
  })
  return diagnostics
})

interface CodeEditorProps {
  ytext: Y.Text
  provider: WebsocketProvider
  language: LanguageConfig
  isDark: boolean
  threads: CommentThreadData[]
  onOpenThread: (threadId: string, coords: Coords) => void
  onReady?: (handle: EditorHandle) => void
}

function CodeEditor({
  ytext,
  provider,
  language,
  isDark,
  threads,
  onOpenThread,
  onReady,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      autocompletion(),
      highlightSelectionMatches(),
      search(),
      syntaxErrorLinter,
      lintGutter(),
      commentThreadsField.init(() => threads),
      commentGutter(ytext, onOpenThread),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      language.cm(),
      yCollab(ytext, provider.awareness),
      yRemoteSelectionsTheme,
      EditorView.theme({
        '&': { height: '100%', fontSize: '14px' },
        '.cm-scroller': { fontFamily: 'ui-monospace, Consolas, monospace' },
      }),
      ...(isDark ? [oneDark] : []),
    ]

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions,
    })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    onReady?.({
      getContent: () => view.state.doc.toString(),
      setContent: (value) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
        })
      },
      getSelection: () => {
        const sel = view.state.selection.main
        if (sel.from === sel.to) {
          const line = view.state.doc.lineAt(sel.from)
          return { from: line.from, to: line.to }
        }
        return { from: sel.from, to: sel.to }
      },
      getCoordsForPos: (pos) => view.coordsAtPos(pos),
    })

    return () => {
      viewRef.current = null
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytext, provider, language, isDark, onOpenThread, onReady])

  // Thread data changes far more often than the editor's identity (file,
  // language, theme) should force a full teardown/rebuild, so it's pushed
  // into the already-running view via a dispatch instead of being an effect
  // dependency above.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCommentThreads.of(threads) })
  }, [threads])

  return <div className="code-editor" ref={containerRef} />
}

export default CodeEditor
