import { useEffect, useMemo, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import CodeEditor, { type EditorHandle, type Coords } from './CodeEditor'
import FileTree from './FileTree'
import Presence from './Presence'
import JoinLeaveToasts from './JoinLeaveToasts'
import RunPanel from './RunPanel'
import ChatPanel from './ChatPanel'
import CommentPopover from './CommentPopover'
import { useFileTree, contentKeyFor } from './useFileTree'
import { LANGUAGES, languageById } from './languages'
import { canFormat, formatCode } from './formatting'
import {
  useComments,
  createThread,
  replyToThread,
  setThreadResolved,
  toggleCommentReaction,
} from './comments'
import { usePresence } from './usePresence'
import { extractMentions } from './mentions'
import { notifyMention } from './notifications'

interface WorkspaceUser {
  name: string
  color: string
}

interface WorkspaceProps {
  room: string
  passphrase: string
  user: WorkspaceUser
  isDark: boolean
  onAuthError: () => void
  onConnected: () => void
}

const INVALID_PASSPHRASE_CODE = 4001

type OpenThread =
  | { mode: 'new'; from: number; to: number; coords: Coords }
  | { mode: 'view'; threadId: string; coords: Coords }

function Workspace({ room, passphrase, user, isDark, onAuthError, onConnected }: WorkspaceProps) {
  const ydoc = useMemo(() => new Y.Doc(), [])
  const provider = useMemo(
    () => new WebsocketProvider('ws://localhost:1234', room, ydoc, { params: { passphrase } }),
    [room, ydoc, passphrase],
  )
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const { files, createFile, renameFile, deleteFile, setFileLanguage, ensureDefaultFile } =
    useFileTree(ydoc)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [formatting, setFormatting] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [openThread, setOpenThread] = useState<OpenThread | null>(null)
  const threads = useComments(ydoc, activeId ?? '')
  const participants = usePresence(provider.awareness).map((p) => p.name)

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

  // Stale coordinates/thread ids from the previous file would otherwise
  // dangle once the active file changes.
  useEffect(() => {
    setOpenThread(null)
  }, [activeId])

  const handleOpenThread = useCallback((threadId: string, coords: Coords) => {
    setOpenThread({ mode: 'view', threadId, coords })
  }, [])

  function handleAddComment() {
    if (!editorHandle) return
    const { from, to } = editorHandle.getSelection()
    const coords = editorHandle.getCoordsForPos(from)
    if (!coords) return
    setOpenThread({ mode: 'new', from, to, coords })
  }

  function notifyMentionsIn(text: string) {
    for (const name of extractMentions(text)) {
      notifyMention(name, user.name, room, text)
    }
  }

  function handleSubmitNewThread(text: string) {
    if (!activeId || !ytext || openThread?.mode !== 'new') return
    createThread(ydoc, activeId, ytext, openThread.from, openThread.to, user, text)
    notifyMentionsIn(text)
    setOpenThread(null)
  }

  function handleReply(text: string) {
    if (!activeId || openThread?.mode !== 'view') return
    replyToThread(ydoc, activeId, openThread.threadId, user, text)
    notifyMentionsIn(text)
  }

  function handleToggleReaction(itemId: string, emoji: string) {
    if (!activeId) return
    toggleCommentReaction(ydoc, activeId, itemId, emoji, user.name)
  }

  function handleToggleResolved() {
    if (!activeId || openThread?.mode !== 'view') return
    const thread = threads.find((t) => t.id === openThread.threadId)
    if (!thread) return
    setThreadResolved(ydoc, activeId, openThread.threadId, !thread.resolved)
  }

  const viewedThread =
    openThread?.mode === 'view' ? threads.find((t) => t.id === openThread.threadId) : undefined

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
      <JoinLeaveToasts awareness={provider.awareness} />
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
            <select
              className="language-badge language-picker"
              value={activeLanguage.id}
              disabled={!activeId}
              onChange={(e) => activeId && setFileLanguage(activeId, e.target.value)}
              aria-label="Language"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
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
            <button
              type="button"
              className="btn btn-small"
              onClick={handleAddComment}
              disabled={!ytext}
            >
              Comment
            </button>
            <button type="button" className="btn btn-small" onClick={() => setChatOpen((v) => !v)}>
              Chat
            </button>
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
            threads={threads}
            onOpenThread={handleOpenThread}
            onReady={setEditorHandle}
          />
        ) : (
          <div className="code-editor-empty">No file open</div>
        )}
        <RunPanel language={activeLanguage} getCode={getCode} />
      </div>
      {chatOpen && (
        <ChatPanel
          ydoc={ydoc}
          user={user}
          room={room}
          participants={participants}
          onClose={() => setChatOpen(false)}
        />
      )}
      {openThread?.mode === 'new' && (
        <CommentPopover
          mode="new"
          coords={openThread.coords}
          participants={participants}
          onSubmit={handleSubmitNewThread}
          onClose={() => setOpenThread(null)}
        />
      )}
      {openThread?.mode === 'view' && viewedThread && (
        <CommentPopover
          mode="view"
          coords={openThread.coords}
          thread={viewedThread}
          participants={participants}
          currentUser={user.name}
          onReply={handleReply}
          onToggleResolved={handleToggleResolved}
          onToggleReaction={handleToggleReaction}
          onClose={() => setOpenThread(null)}
        />
      )}
    </div>
  )
}

export default Workspace
