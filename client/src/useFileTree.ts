import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { languageFromFilename } from './languages'

export interface FileMeta {
  id: string
  name: string
  languageId: string
}

interface RawFileMeta {
  name: string
  languageId: string
}

const DEFAULT_FILE_NAME = 'main.js'

export function contentKeyFor(fileId: string) {
  return `content:${fileId}`
}

export function useFileTree(ydoc: Y.Doc) {
  const filesMap = useMemo(() => ydoc.getMap<RawFileMeta>('files'), [ydoc])
  const order = useMemo(() => ydoc.getArray<string>('fileOrder'), [ydoc])

  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; files: FileMeta[] }>({ version: -1, files: [] })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = () => {
        versionRef.current += 1
        onStoreChange()
      }
      filesMap.observeDeep(handler)
      order.observe(handler)
      return () => {
        filesMap.unobserveDeep(handler)
        order.unobserve(handler)
      }
    },
    [filesMap, order],
  )

  const getSnapshot = useCallback((): FileMeta[] => {
    if (cacheRef.current.version === versionRef.current) {
      return cacheRef.current.files
    }
    const files = order.toArray().flatMap((id) => {
      const meta = filesMap.get(id)
      return meta ? [{ id, name: meta.name, languageId: meta.languageId }] : []
    })
    cacheRef.current = { version: versionRef.current, files }
    return files
  }, [filesMap, order])

  const files = useSyncExternalStore(subscribe, getSnapshot)

  const createFile = useCallback(
    (name: string) => {
      const id = crypto.randomUUID().slice(0, 8)
      const languageId = languageFromFilename(name).id
      ydoc.transact(() => {
        filesMap.set(id, { name, languageId })
        order.push([id])
      })
      return id
    },
    [ydoc, filesMap, order],
  )

  const renameFile = useCallback(
    (id: string, name: string) => {
      const meta = filesMap.get(id)
      if (!meta) return
      filesMap.set(id, { name, languageId: languageFromFilename(name).id })
    },
    [filesMap],
  )

  const setFileLanguage = useCallback(
    (id: string, languageId: string) => {
      const meta = filesMap.get(id)
      if (!meta) return
      filesMap.set(id, { ...meta, languageId })
    },
    [filesMap],
  )

  const deleteFile = useCallback(
    (id: string) => {
      ydoc.transact(() => {
        filesMap.delete(id)
        const idx = order.toArray().indexOf(id)
        if (idx !== -1) order.delete(idx, 1)
        const text = ydoc.getText(contentKeyFor(id))
        text.delete(0, text.length)
      })
    },
    [ydoc, filesMap, order],
  )

  // Seed a default file the first time anyone opens a fresh, empty document.
  const ensureDefaultFile = useCallback((): string => {
    if (order.length > 0) return order.get(0)
    return createFile(DEFAULT_FILE_NAME)
  }, [order, createFile])

  return { files, createFile, renameFile, deleteFile, setFileLanguage, ensureDefaultFile }
}
