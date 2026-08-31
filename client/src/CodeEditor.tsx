import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintGutter } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next'
import type * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'
import type { LanguageConfig } from './languages'

export interface EditorHandle {
  getContent: () => string
  setContent: (value: string) => void
}

interface CodeEditorProps {
  ytext: Y.Text
  provider: WebsocketProvider
  language: LanguageConfig
  isDark: boolean
  onReady?: (handle: EditorHandle) => void
}

function CodeEditor({ ytext, provider, language, isDark, onReady }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)

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
      lintGutter(),
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

    onReady?.({
      getContent: () => view.state.doc.toString(),
      setContent: (value) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
        })
      },
    })

    return () => {
      view.destroy()
    }
  }, [ytext, provider, language, isDark, onReady])

  return <div className="code-editor" ref={containerRef} />
}

export default CodeEditor
