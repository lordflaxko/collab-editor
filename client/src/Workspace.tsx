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
import SourceControlPanel from './SourceControlPanel'
import ActivityPanel from './ActivityPanel'
import TestPanel from './TestPanel'
import AIChatPanel from './AIChatPanel'
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
import { atLeast, type Role } from './projects'

interface WorkspaceUser {
  name: string
  color: string
}

interface WorkspaceProps {
  room: string
  token: string | null
  user: WorkspaceUser
  role: Role
  isDark: boolean
  onAccessRevoked: () => void
}

const FORBIDDEN_CODE = 4003
const PROJECT_NOT_FOUND_CODE = 4004

type OpenThread =
  | { mode: 'new'; from: number; to: number; coords: Coords }
  | { mode: 'view'; threadId: string; coords: Coords }

function Workspace({ room, token, user, role, isDark, onAccessRevoked }: WorkspaceProps) {
  const canEdit = atLeast(role, 'editor')
  const ydoc = useMemo(() => new Y.Doc(), [])
  const provider = useMemo(
    () => new WebsocketProvider('ws://localhost:1234', room, ydoc, { params: { token: token ?? '' } }),
    [room, ydoc, token],
  )
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [synced, setSynced] = useState(false)
  const { files, createFile, renameFile, deleteFile, setFileLanguage, ensureDefaultFile } =
    useFileTree(ydoc, user.name)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [formatting, setFormatting] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [sourceControlOpen, setSourceControlOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [testsOpen, setTestsOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [openThread, setOpenThread] = useState<OpenThread | null>(null)
  const threads = useComments(ydoc, activeId ?? '')
  const participants = usePresence(provider.awareness).map((p) => p.name)

  useEffect(() => {
    provider.awareness.setLocalStateField('user', user)
  }, [provider, user])

  useEffect(() => {
    const onStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setStatus(status)
      if (status !== 'connected') setSynced(false)
    }
    // 'connected' only means the WebSocket handshake succeeded -- the
    // document's actual content hasn't necessarily arrived yet. Gating the
    // "seed a default file" logic below on this instead avoids briefly
    // seeing an empty file list and creating a duplicate main.js before the
    // real (possibly already-seeded) content has synced in.
    const onSynced = (isSynced: boolean) => setSynced(isSynced)
    const onClose = (event: CloseEvent) => {
      if (event.code === FORBIDDEN_CODE || event.code === PROJECT_NOT_FOUND_CODE) {
        provider.disconnect()
        onAccessRevoked()
      }
    }
    provider.on('status', onStatus)
    provider.on('synced', onSynced)
    provider.on('connection-close', onClose)
    provider.connect()
    return () => {
      provider.off('status', onStatus)
      provider.off('synced', onSynced)
      provider.off('connection-close', onClose)
      // Explicitly broadcasts "I'm gone" over the still-open connection
      // before closing the transport, rather than relying solely on the
      // server noticing the socket close.
      provider.awareness.setLocalState(null)
      provider.disconnect()
    }
  }, [provider, onAccessRevoked])

  // Once the document has actually synced (not just "the socket is open"),
  // make sure there's a file to show: seed a default the first time anyone
  // opens a fresh document, or fall back to another file if the active one
  // got deleted (by us or someone else). New projects already come with a
  // seeded main.js from the server, so in practice this is a fallback for
  // edge cases (e.g. every file having been deleted) rather than the
  // primary way a project gets its first file.
  useEffect(() => {
    if (status !== 'connected' || !synced) return
    if (activeId && files.some((f) => f.id === activeId)) return
    setActiveId(files[0]?.id ?? ensureDefaultFile())
  }, [status, synced, files, activeId, ensureDefaultFile])

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
        readOnly={!canEdit}
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
              disabled={!activeId || !canEdit}
              onChange={(e) => activeId && setFileLanguage(activeId, e.target.value)}
              aria-label="Language"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
            {canFormat(activeLanguage) && canEdit && (
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
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setSourceControlOpen((v) => !v)}
            >
              Source Control
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setActivityOpen((v) => !v)}
            >
              Activity
            </button>
            <button type="button" className="btn btn-small" onClick={() => setTestsOpen((v) => !v)}>
              Tests
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setAiChatOpen((v) => !v)}
            >
              AI Assistant
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
            readOnly={!canEdit}
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
      {sourceControlOpen && (
        <SourceControlPanel
          room={room}
          canEdit={canEdit}
          sessionToken={token}
          onClose={() => setSourceControlOpen(false)}
        />
      )}
      {activityOpen && <ActivityPanel ydoc={ydoc} onClose={() => setActivityOpen(false)} />}
      {testsOpen && <TestPanel room={room} onClose={() => setTestsOpen(false)} />}
      {aiChatOpen && (
        <AIChatPanel
          ydoc={ydoc}
          room={room}
          sessionToken={token}
          activeFileId={activeId}
          onClose={() => setAiChatOpen(false)}
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
