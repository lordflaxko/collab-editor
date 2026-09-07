import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState, EditorSelection } from '@codemirror/state'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, syntaxTree } from '@codemirror/language'
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
  type CompletionSource,
} from '@codemirror/autocomplete'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next'
import type * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'
import type { LanguageConfig } from './languages'
import type { CommentThreadData } from './comments'
import { commentGutter, commentThreadsField, setCommentThreads } from './commentGutter'
import { breakpointGutter, breakpointsField, setBreakpoints, type LineBreakpoint } from './breakpointGutter'
import type { Breakpoint } from './breakpoints'
import { completionTypeFor, type ProjectSymbol } from './symbolIndex'

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
  jumpToPos: (pos: number) => void
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
  readOnly: boolean
  threads: CommentThreadData[]
  onOpenThread: (threadId: string, coords: Coords) => void
  breakpoints: Breakpoint[]
  onBreakpointGutterClick: (lineFrom: number, existing: LineBreakpoint | undefined, coords: Coords) => void
  onGoToDefinition?: (word: string) => void
  projectSymbols: ProjectSymbol[]
  onReady?: (handle: EditorHandle) => void
}

function CodeEditor({
  ytext,
  provider,
  language,
  isDark,
  readOnly,
  threads,
  onOpenThread,
  breakpoints,
  onBreakpointGutterClick,
  onGoToDefinition,
  projectSymbols,
  onReady,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onGoToDefinitionRef = useRef(onGoToDefinition)
  const projectSymbolsRef = useRef(projectSymbols)

  useEffect(() => {
    onGoToDefinitionRef.current = onGoToDefinition
  }, [onGoToDefinition])

  useEffect(() => {
    projectSymbolsRef.current = projectSymbols
  }, [projectSymbols])

  useEffect(() => {
    if (!containerRef.current) return

    // Ctrl/Cmd+Click rather than a keyboard shortcut like F12 -- this runs
    // in a regular browser tab, and F12 (along with most other function
    // keys) is reserved by the browser itself to toggle DevTools, so it
    // never reaches the page's own key handlers at all.
    const goToDefinitionOnClick = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if (!(event.ctrlKey || event.metaKey) || !onGoToDefinitionRef.current) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) return false
        const word = view.state.wordAt(pos)
        if (!word) return false
        event.preventDefault()
        onGoToDefinitionRef.current(view.state.sliceDoc(word.from, word.to))
        return true
      },
    })

    // Registered on the active language's own data facet (alongside its
    // built-in keyword/snippet completions, not replacing them) so
    // autocompletion() picks it up automatically -- it reads the index
    // through a ref for the same reason onGoToDefinitionRef exists: the
    // index's identity changes on every debounced re-parse, and this way a
    // fresh index doesn't require rebuilding the editor to take effect.
    const projectSymbolCompletions: CompletionSource = (context) => {
      const word = context.matchBefore(/[\w$]+/)
      if (!word || (word.from === word.to && !context.explicit)) return null
      const typed = word.text.toLowerCase()
      const seen = new Set<string>()
      const options = []
      for (const symbol of projectSymbolsRef.current) {
        if (seen.has(symbol.name) || !symbol.name.toLowerCase().startsWith(typed)) continue
        seen.add(symbol.name)
        options.push({ label: symbol.name, type: completionTypeFor(symbol.kind), detail: symbol.fileName })
      }
      return { from: word.from, options }
    }
    const languageSupport = language.cm()

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
      breakpointsField.init(() => breakpoints),
      breakpointGutter(ytext, onBreakpointGutterClick),
      EditorState.readOnly.of(readOnly),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      goToDefinitionOnClick,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      languageSupport,
      languageSupport.language.data.of({ autocomplete: projectSymbolCompletions }),
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
      jumpToPos: (pos) => {
        view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true })
        view.focus()
      },
    })

    return () => {
      viewRef.current = null
      view.destroy()
    }
    // onGoToDefinition and projectSymbols are intentionally not dependencies
    // here -- they're read through refs instead, since Workspace recreates
    // both whenever the project's symbol index re-parses (every few hundred
    // ms while typing), and including them here would tear down and rebuild
    // the whole editor on that same cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytext, provider, language, isDark, readOnly, onOpenThread, onBreakpointGutterClick, onReady])

  // Thread/breakpoint data changes far more often than the editor's identity
  // (file, language, theme) should force a full teardown/rebuild, so it's
  // pushed into the already-running view via a dispatch instead of being an
  // effect dependency above.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCommentThreads.of(threads) })
  }, [threads])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setBreakpoints.of(breakpoints) })
  }, [breakpoints])

  return <div className="code-editor" ref={containerRef} />
}

export default CodeEditor
