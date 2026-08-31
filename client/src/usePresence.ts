import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { Awareness } from 'y-protocols/awareness'

export interface PresenceUser {
  clientId: number
  name: string
  color: string
}

export function usePresence(awareness: Awareness): PresenceUser[] {
  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; users: PresenceUser[] }>({ version: -1, users: [] })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = () => {
        versionRef.current += 1
        onStoreChange()
      }
      awareness.on('update', handler)
      return () => awareness.off('update', handler)
    },
    [awareness],
  )

  const getSnapshot = useCallback((): PresenceUser[] => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.users
    }
    const users: PresenceUser[] = []
    awareness.getStates().forEach((state, clientId) => {
      if (state.user) {
        users.push({
          clientId,
          name: state.user.name ?? 'Anonymous',
          color: state.user.color ?? '#9ca3af',
        })
      }
    })
    cacheRef.current = { version: versionRef.current, users }
    return users
  }, [awareness])

  return useSyncExternalStore(subscribe, getSnapshot)
}
