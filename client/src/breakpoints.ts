import { useCallback, useState } from 'react'

export interface Breakpoint {
  id: string
  // A Y.RelativePosition (as JSON), the same anchoring mechanism inline
  // comments already use -- it tracks the breakpoint's line through edits
  // from anyone in the room, without needing to write anything into the
  // shared Y.Doc itself.
  anchor: unknown
  expressions: string[]
}

// Breakpoints are local-only, keyed by file id, and never written to the
// shared Y.Doc: like the Run panel's own output, debugging is a personal
// activity here, so nobody else in the room sees or is affected by the
// breakpoints you set.
export function useBreakpoints() {
  const [byFile, setByFile] = useState<Record<string, Breakpoint[]>>({})

  const getForFile = useCallback((fileId: string): Breakpoint[] => byFile[fileId] ?? [], [byFile])

  const setBreakpoint = useCallback(
    (fileId: string, id: string, anchor: unknown, expressions: string[]) => {
      setByFile((current) => {
        const list = current[fileId] ?? []
        const idx = list.findIndex((b) => b.id === id)
        const entry: Breakpoint = { id, anchor, expressions }
        const next = idx === -1 ? [...list, entry] : list.map((b, i) => (i === idx ? entry : b))
        return { ...current, [fileId]: next }
      })
    },
    [],
  )

  const removeBreakpoint = useCallback((fileId: string, id: string) => {
    setByFile((current) => ({
      ...current,
      [fileId]: (current[fileId] ?? []).filter((b) => b.id !== id),
    }))
  }, [])

  return { getForFile, setBreakpoint, removeBreakpoint }
}
