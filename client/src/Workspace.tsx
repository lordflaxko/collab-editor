import { useEffect, useMemo, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import CodeEditor, { type EditorHandle } from './CodeEditor'
import FileTree from './FileTree'
import Presence from './Presence'
import RunPanel from './RunPanel'
import { useFileTree, contentKeyFor } from './useFileTree'
import { languageById } from './languages'
import { canFormat, formatCode } from './formatting'

interface WorkspaceUser {
  name: string
  color: string
}

interface WorkspaceProps {
  room: string
  passphrase: string
  user: WorkspaceUser
  onAuthError: () => void
  onConnected: () => void
}

const INVALID_PASSPHRASE_CODE = 4001

function usePrefersDark() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])
  return isDark
}

function Workspace({ room, passphrase, user, onAuthError, onConnected }: WorkspaceProps) {
  const ydoc = useMemo(() => new Y.Doc(), [])
  const provider = useMemo(
    () => new WebsocketProvider('ws://localhost:1234', room, ydoc, { params: { passphrase } }),
    [room, ydoc, passphrase],
  )
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const isDark = usePrefersDark()
  const { files, createFile, renameFile, deleteFile, ensureDefaultFile } = useFileTree(ydoc)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [formatting, setFormatting] = useState(false)

  useEffect(() => {
    provider.awareness.setLocalStateField('user', user)
  }, [provider, user])

  useEffect(() => {
    const onStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setStatus(status)
      if (status === 'connected') onConnected()
    }
    const onClose = (event: CloseEvent) => {
      if (event.code === INVALID_PASSPHRASE_CODE) {
        provider.disconnect()
        onAuthError()
      }
    }
    provider.on('status', onStatus)
    provider.on('connection-close', onClose)
    provider.connect()
    return () => {
      provider.off('status', onStatus)
      provider.off('connection-close', onClose)
      provider.disconnect()
    }
  }, [provider, onAuthError, onConnected])

  // Once connected, make sure there's a file to show: seed a default the first
  // time anyone opens a fresh document, or fall back to another file if the
  // active one got deleted (by us or someone else).
  useEffect(() => {
    if (status !== 'connected') return
    if (activeId && files.some((f) => f.id === activeId)) return
    setActiveId(files[0]?.id ?? ensureDefaultFile())
  }, [status, files, activeId, ensureDefaultFile])

  const activeFile = files.find((f) => f.id === activeId) ?? null
  const activeLanguage = languageById(activeFile?.languageId ?? 'javascript')
  const ytext = useMemo(
    () => (activeId ? ydoc.getText(contentKeyFor(activeId)) : null),
    [ydoc, activeId],
  )

  const getCode = useCallback(() => ytext?.toString() ?? '', [ytext])

  async function handleFormat() {
    if (!ytext || !editorHandle) return
    setFormatting(true)
    setFormatError(null)
    try {
      const formatted = await formatCode(activeLanguage, ytext.toString())
      editorHandle.setContent(formatted)
    } catch (err) {
      setFormatError(err instanceof Error ? err.message : 'Formatting failed')
    } finally {
      setFormatting(false)
    }
  }

  function handleDelete(id: string) {
    deleteFile(id)
  }

  return (
    <div className="workspace">
      <FileTree
        files={files}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={(name) => setActiveId(createFile(name))}
        onRename={renameFile}
        onDelete={handleDelete}
      />
      <div className="editor-wrapper">
        <div className="editor-header">
          <span className={`status status-${status}`}>
            <span className="status-dot" />
            {status === 'connected'
              ? 'Connected'
              : status === 'connecting'
                ? 'Connecting…'
                : 'Disconnected'}
          </span>
          <Presence awareness={provider.awareness} />
          <div className="editor-actions">
            <span className="language-badge">{activeLanguage.label}</span>
            {canFormat(activeLanguage) && (
              <button
                type="button"
                className="btn btn-small"
                onClick={handleFormat}
                disabled={formatting || !ytext}
              >
                {formatting ? 'Formatting…' : 'Format'}
              </button>
            )}
          </div>
        </div>
        {formatError && <div className="format-error">{formatError}</div>}
        {ytext ? (
          <CodeEditor
            key={activeId}
            ytext={ytext}
            provider={provider}
            language={activeLanguage}
            isDark={isDark}
            onReady={setEditorHandle}
          />
        ) : (
          <div className="code-editor-empty">No file open</div>
        )}
        <RunPanel language={activeLanguage} getCode={getCode} />
      </div>
    </div>
  )
}

export default Workspace
