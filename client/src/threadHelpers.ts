import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'

export interface Author {
  name: string
  color: string
}

export interface ReplyData {
  id: string
  author: string
  color: string
  text: string
  createdAt: number
  reactions: Record<string, string[]>
}

type ItemMap = Y.Map<unknown>

// A root item (a chat message or a comment thread) and a reply share the
// same shape -- author/text/timestamp/reactions -- except a root item
// additionally carries a nested Y.Array of replies. Building both through
// this one factory keeps that shape consistent.
export function makeItemMap(author: Author, text: string): ItemMap {
  const map: ItemMap = new Y.Map()
  map.set('id', crypto.randomUUID())
  map.set('author', author.name)
  map.set('color', author.color)
  map.set('text', text)
  map.set('createdAt', Date.now())
  map.set('reactions', new Y.Map())
  return map
}

// Searches root items and one level of nested replies -- reactions and
// replies can target either, but replies don't themselves nest further.
export function findItemById(array: Y.Array<ItemMap>, id: string): ItemMap | undefined {
  for (const item of array.toArray()) {
    if (item.get('id') === id) return item
    const replies = item.get('replies') as Y.Array<ItemMap> | undefined
    const found = replies?.toArray().find((reply) => reply.get('id') === id)
    if (found) return found
  }
  return undefined
}

export function toggleReaction(
  array: Y.Array<ItemMap>,
  itemId: string,
  emoji: string,
  username: string,
) {
  const item = findItemById(array, itemId)
  if (!item) return
  const reactions = item.get('reactions') as Y.Map<Y.Array<string>>
  let users = reactions.get(emoji)
  if (!users) {
    users = new Y.Array<string>()
    reactions.set(emoji, users)
  }
  const index = users.toArray().indexOf(username)
  if (index === -1) users.push([username])
  else users.delete(index, 1)
}

export function addReply(array: Y.Array<ItemMap>, itemId: string, author: Author, text: string) {
  const item = findItemById(array, itemId)
  if (!item) return
  const replies = item.get('replies') as Y.Array<ItemMap>
  replies.push([makeItemMap(author, text)])
}

// Generic reactive read of a Y.Array of root items (each with a nested
// replies Y.Array), following the version/cache-ref pattern used elsewhere
// in this codebase for useSyncExternalStore -- returning a fresh array
// reference on every call here caused real infinite-render bugs before.
export function useThreadedArray<T>(array: Y.Array<ItemMap>): T[] {
  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; items: T[] }>({ version: -1, items: [] })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = () => {
        versionRef.current += 1
        onStoreChange()
      }
      array.observeDeep(handler)
      return () => array.unobserveDeep(handler)
    },
    [array],
  )

  const getSnapshot = useCallback((): T[] => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.items
    }
    const items = array.toJSON() as T[]
    cacheRef.current = { version: versionRef.current, items }
    return items
  }, [array])

  return useSyncExternalStore(subscribe, getSnapshot)
}
