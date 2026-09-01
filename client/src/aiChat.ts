import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { postJson } from './api'

export interface AiChatEntry {
  id: string
  role: 'user' | 'assistant'
  author: string
  text: string
  timestamp: number
  error?: boolean
}

export function aiChatArrayFor(ydoc: Y.Doc): Y.Array<AiChatEntry> {
  return ydoc.getArray('aiChat')
}

export function askAssistant(
  room: string,
  question: string,
  sessionToken: string | null,
  activeFileId: string | null,
): Promise<{ reply: string }> {
  return postJson('/ai/ask', { room, question, sessionToken, activeFileId })
}

export function useAiChat(ydoc: Y.Doc): AiChatEntry[] {
  const array = aiChatArrayFor(ydoc)
  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; items: AiChatEntry[] }>({ version: -1, items: [] })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = () => {
        versionRef.current += 1
        onStoreChange()
      }
      array.observe(handler)
      return () => array.unobserve(handler)
    },
    [array],
  )

  const getSnapshot = useCallback((): AiChatEntry[] => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.items
    }
    const items = array.toJSON() as AiChatEntry[]
    cacheRef.current = { version: versionRef.current, items }
    return items
  }, [array])

  return useSyncExternalStore(subscribe, getSnapshot)
}
