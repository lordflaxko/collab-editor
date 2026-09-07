import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { contentKeyFor, type FileMeta } from './useFileTree'
import { buildProjectSymbolIndex, type ProjectSymbol } from './symbolIndex'

const DEBOUNCE_MS = 600

// files only changes reference when file metadata (add/rename/delete/
// language) changes -- content lives in separate Y.Text instances, so a
// plain edit doesn't re-run this effect. Content changes are instead caught
// by the per-file .observe() subscriptions below and debounced, since
// re-parsing every file on every keystroke across a whole project would be
// wasteful.
export function useProjectSymbolIndex(ydoc: Y.Doc, files: FileMeta[]): ProjectSymbol[] {
  const [symbols, setSymbols] = useState<ProjectSymbol[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function recompute() {
      const fileData = files.map((f) => ({
        id: f.id,
        name: f.name,
        languageId: f.languageId,
        content: ydoc.getText(contentKeyFor(f.id)).toString(),
      }))
      setSymbols(buildProjectSymbolIndex(fileData))
    }

    function scheduleRecompute() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(recompute, DEBOUNCE_MS)
    }

    recompute()
    const ytexts = files.map((f) => ydoc.getText(contentKeyFor(f.id)))
    ytexts.forEach((yt) => yt.observe(scheduleRecompute))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ytexts.forEach((yt) => yt.unobserve(scheduleRecompute))
    }
  }, [ydoc, files])

  return symbols
}
