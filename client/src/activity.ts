import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'

// Structural events only -- file/branch/commit/membership/visibility
// changes, not chat messages, comments, or keystrokes. Entries are plain
// objects (not Y.Maps), matching the shape the server's activityLog.js
// pushes into this same array for server-originated events (commits,
// branch changes, membership/role/visibility changes), so client- and
// server-logged entries render identically in the activity feed.
export interface ActivityEntry {
  id: string
  type: string
  actor: string
  timestamp: number
  details: Record<string, unknown>
}

export function activityArrayFor(ydoc: Y.Doc): Y.Array<ActivityEntry> {
  return ydoc.getArray('activity')
}

// For events that originate purely on the client (file created/renamed/
// deleted) and never touch the server's REST API -- everything else
// (commits, branch changes, membership/role/visibility changes) is logged
// server-side in server/activityLog.js instead, since those already go
// through a REST call the server can attribute and verify.
export function logClientActivity(
  ydoc: Y.Doc,
  type: string,
  actor: string,
  details: Record<string, unknown> = {},
) {
  activityArrayFor(ydoc).push([
    { id: crypto.randomUUID(), type, actor, timestamp: Date.now(), details },
  ])
}

export function useActivity(ydoc: Y.Doc): ActivityEntry[] {
  const array = activityArrayFor(ydoc)
  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; items: ActivityEntry[] }>({ version: -1, items: [] })

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

  const getSnapshot = useCallback((): ActivityEntry[] => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.items
    }
    // Concurrent pushes from different peers can interleave slightly
    // differently in each peer's array order; sorting by timestamp keeps
    // the feed showing the same chronological order everywhere.
    const items = [...(array.toJSON() as ActivityEntry[])].sort((a, b) => a.timestamp - b.timestamp)
    cacheRef.current = { version: versionRef.current, items }
    return items
  }, [array])

  return useSyncExternalStore(subscribe, getSnapshot)
}
