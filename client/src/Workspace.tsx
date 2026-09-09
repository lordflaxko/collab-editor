import { useEffect, useMemo, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import {
  Wand2,
  MessageSquare,
  Lightbulb,
  Target,
  Search,
  GitBranch,
  Eye,
  Activity as ActivityIcon,
  CheckCircle2,
  Bot,
  Plug,
  Database as DatabaseIcon,
  Rocket,
  Bug,
  BookmarkPlus,
} from 'lucide-react'
import { WS_SERVER_URL } from './api'
import CodeEditor, { type EditorHandle, type Coords } from './CodeEditor'
import FileTree from './FileTree'
import Presence from './Presence'
import JoinLeaveToasts from './JoinLeaveToasts'
import RunPanel from './RunPanel'
import CollabSidebar from './CollabSidebar'
import CommentPopover from './CommentPopover'
import SourceControlPanel from './SourceControlPanel'
import ActivityPanel from './ActivityPanel'
import TestPanel from './TestPanel'
import AIChatPanel from './AIChatPanel'
import ReviewPanel from './ReviewPanel'
import ExplainPopover from './ExplainPopover'
import APITestPanel from './APITestPanel'
import DatabasePanel from './DatabasePanel'
import DeployPanel from './DeployPanel'
import BreakpointPopover from './BreakpointPopover'
import SaveTemplatePopover from './SaveTemplatePopover'
import DebugPanel from './DebugPanel'
import SymbolSearchModal from './SymbolSearchModal'
import TextSearchModal from './TextSearchModal'
import CommandPalette, { type Command } from './CommandPalette'
import { useProjectSymbolIndex } from './useSymbolIndex'
import { useFileTree, contentKeyFor } from './useFileTree'
import { LANGUAGES, languageById } from './languages'
import { canFormat, formatCode } from './formatting'
import {
  useComments,
  createThread,
  replyToThread,
  setThreadResolved,
  toggleCommentReaction,
  resolveAnchor,
} from './comments'
import { useBreakpoints } from './breakpoints'
import type { LineBreakpoint } from './breakpointGutter'
import type { ResolvedBreakpoint } from './logpoints'
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
    () => new WebsocketProvider(WS_SERVER_URL, room, ydoc, { params: { token: token ?? '' } }),
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
  const [sourceControlOpen, setSourceControlOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [testsOpen, setTestsOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [aiPrefill, setAiPrefill] = useState('')
  const [aiPrefillKey, setAiPrefillKey] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [apiTestOpen, setApiTestOpen] = useState(false)
  const [databaseOpen, setDatabaseOpen] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)
  const [openThread, setOpenThread] = useState<OpenThread | null>(null)
  const [explainRequest, setExplainRequest] = useState<{ coords: Coords; code: string } | null>(null)
  const { getForFile: getBreakpointsForFile, setBreakpoint, removeBreakpoint } = useBreakpoints()
  const [breakpointPopover, setBreakpointPopover] = useState<{
    coords: Coords
    lineFrom: number
    existing: LineBreakpoint | undefined
  } | null>(null)
  const [saveTemplateCoords, setSaveTemplateCoords] = useState<Coords | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false)
  const [textSearchOpen, setTextSearchOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [pendingJump, setPendingJump] = useState<{ fileId: string; pos: number } | null>(null)
  const projectSymbols = useProjectSymbolIndex(ydoc, files)
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

  const getAllFiles = useCallback(
    () => files.map((f) => ({ name: f.name, content: ydoc.getText(contentKeyFor(f.id)).toString() })),
    [ydoc, files],
  )

  const getAllFilesForSearch = useCallback(
    () =>
      files.map((f) => ({ id: f.id, name: f.name, content: ydoc.getText(contentKeyFor(f.id)).toString() })),
    [ydoc, files],
  )

  const jumpToSymbol = useCallback(
    (target: { fileId: string; from: number }) => {
      if (target.fileId === activeId) {
        editorHandle?.jumpToPos(target.from)
      } else {
        setActiveId(target.fileId)
        setPendingJump({ fileId: target.fileId, pos: target.from })
      }
    },
    [activeId, editorHandle],
  )

  // Switching files remounts CodeEditor (it's keyed by activeId), so a
  // cross-file jump has to wait for the new file's handle to come back
  // through onReady before it has anywhere to dispatch the selection to.
  useEffect(() => {
    if (!pendingJump || !editorHandle || pendingJump.fileId !== activeId) return
    editorHandle.jumpToPos(pendingJump.pos)
    setPendingJump(null)
  }, [pendingJump, editorHandle, activeId])

  const handleGoToDefinition = useCallback(
    (word: string) => {
      const inSameFile = projectSymbols.find((s) => s.name === word && s.fileId === activeId)
      const match = inSameFile ?? projectSymbols.find((s) => s.name === word)
      if (match) jumpToSymbol(match)
    },
    [projectSymbols, activeId, jumpToSymbol],
  )

  // Stale coordinates/thread ids from the previous file would otherwise
  // dangle once the active file changes.
  useEffect(() => {
    setOpenThread(null)
    setExplainRequest(null)
    setBreakpointPopover(null)
    setFormatError(null)
  }, [activeId])

  // A stale Format error would otherwise sit there describing code that no
  // longer exists -- Format only re-checks when explicitly clicked again, so
  // without this an error from five edits ago (or someone else's edit,
  // since this is collaborative) keeps being shown as if it still applied.
  useEffect(() => {
    if (!ytext) return
    const clearError = () => setFormatError(null)
    ytext.observe(clearError)
    return () => ytext.unobserve(clearError)
  }, [ytext])

  const fileBreakpoints = activeId ? getBreakpointsForFile(activeId) : []

  // Recomputed on every render rather than memoized: it's just counting
  // newlines up to each breakpoint's resolved position, cheap for the
  // handful of breakpoints a file will realistically have, and guarantees
  // the line numbers Run injects logpoints at are always current -- not
  // stale from before someone's last edit.
  const resolvedBreakpoints: ResolvedBreakpoint[] = (() => {
    if (!ytext) return []
    const text = ytext.toString()
    const resolved = fileBreakpoints
      .map((bp) => {
        const index = resolveAnchor(ytext, bp.anchor)
        if (index == null) return null
        let lineNumber = 1
        for (let i = 0; i < index && i < text.length; i++) {
          if (text[i] === '\n') lineNumber++
        }
        return { id: bp.id, lineNumber, expressions: bp.expressions }
      })
      .filter((b): b is ResolvedBreakpoint => b !== null)
    resolved.sort((a, b) => a.lineNumber - b.lineNumber)
    return resolved
  })()

  const handleBreakpointGutterClick = useCallback(
    (lineFrom: number, existing: LineBreakpoint | undefined, coords: Coords) => {
      setBreakpointPopover({ coords, lineFrom, existing })
    },
    [],
  )

  function handleSaveBreakpoint(expressions: string[]) {
    if (!activeId || !ytext || !breakpointPopover) return
    const id = breakpointPopover.existing?.breakpointId ?? crypto.randomUUID()
    const anchor = breakpointPopover.existing
      ? (fileBreakpoints.find((b) => b.id === id)?.anchor ?? null)
      : Y.relativePositionToJSON(
          Y.createRelativePositionFromTypeIndex(ytext, breakpointPopover.lineFrom),
        )
    if (anchor === null) return
    setBreakpoint(activeId, id, anchor, expressions)
  }

  function handleRemoveBreakpoint() {
    if (!activeId || !breakpointPopover?.existing) return
    removeBreakpoint(activeId, breakpointPopover.existing.breakpointId)
  }

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

  function handleExplain() {
    if (!editorHandle || !ytext) return
    const { from, to } = editorHandle.getSelection()
    const coords = editorHandle.getCoordsForPos(from)
    if (!coords) return
    const full = ytext.toString()
    const code = from === to ? full : full.slice(from, to)
    setExplainRequest({ coords, code })
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

  function debugWithAI(question: string) {
    setAiPrefill(question)
    setAiPrefillKey((k) => k + 1)
    setAiChatOpen(true)
  }

  function handleSaveAsTemplate() {
    // Same popover the toolbar button opens, anchored to that button's own
    // position -- invoked from the palette instead, there's no button to
    // anchor to, so it's centered near the top of the editor instead.
    setSaveTemplateCoords({ top: 140, left: 260, bottom: 146 })
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'format',
        label: formatting ? 'Formatting…' : 'Format',
        group: 'Editor',
        disabled: !canFormat(activeLanguage) || !canEdit || !ytext || formatting,
        run: handleFormat,
      },
      { id: 'comment', label: 'Comment', group: 'Editor', disabled: !ytext, run: handleAddComment },
      { id: 'explain', label: 'Explain', group: 'Editor', disabled: !ytext, run: handleExplain },
      {
        id: 'go-to-symbol',
        label: 'Go to Symbol',
        group: 'Editor',
        run: () => setSymbolSearchOpen(true),
      },
      {
        id: 'find-in-files',
        label: 'Find in Files',
        group: 'Editor',
        run: () => setTextSearchOpen(true),
      },
      {
        id: 'source-control',
        label: 'Source Control',
        group: 'Collaborate',
        run: () => setSourceControlOpen((v) => !v),
      },
      { id: 'review', label: 'Review', group: 'Collaborate', run: () => setReviewOpen((v) => !v) },
      {
        id: 'activity',
        label: 'Activity',
        group: 'Collaborate',
        run: () => setActivityOpen((v) => !v),
      },
      { id: 'tests', label: 'Tests', group: 'Tools', run: () => setTestsOpen((v) => !v) },
      {
        id: 'ai-assistant',
        label: 'AI Assistant',
        group: 'Tools',
        run: () => setAiChatOpen((v) => !v),
      },
      {
        id: 'api-test',
        label: 'API Test',
        group: 'Tools',
        run: () => setApiTestOpen((v) => !v),
      },
      {
        id: 'database',
        label: 'Database',
        group: 'Tools',
        disabled: !canEdit,
        run: () => setDatabaseOpen((v) => !v),
      },
      {
        id: 'deploy',
        label: 'Deploy',
        group: 'Tools',
        disabled: !canEdit,
        run: () => setDeployOpen((v) => !v),
      },
      {
        id: 'debug',
        label: 'Debug',
        group: 'Tools',
        disabled: !canEdit,
        run: () => setDebugOpen((v) => !v),
      },
      {
        id: 'save-as-template',
        label: 'Save as Template',
        group: 'Project',
        disabled: !canEdit,
        run: handleSaveAsTemplate,
      },
    ],
    [activeLanguage, canEdit, formatting, ytext],
  )

  return (
    <div className="workspace">
      <JoinLeaveToasts awareness={provider.awareness} />
      <div className="workspace-rail">
        <button
          type="button"
          className={`workspace-rail-btn${sourceControlOpen ? ' btn-toggle-active' : ''}`}
          onClick={() => setSourceControlOpen((v) => !v)}
          title="Source Control"
          aria-label="Source Control"
        >
          <GitBranch size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`workspace-rail-btn${reviewOpen ? ' btn-toggle-active' : ''}`}
          onClick={() => setReviewOpen((v) => !v)}
          title="Review"
          aria-label="Review"
        >
          <Eye size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`workspace-rail-btn${activityOpen ? ' btn-toggle-active' : ''}`}
          onClick={() => setActivityOpen((v) => !v)}
          title="Activity"
          aria-label="Activity"
        >
          <ActivityIcon size={18} aria-hidden="true" />
        </button>

        <span className="workspace-rail-divider" aria-hidden="true" />

        <button
          type="button"
          className={`workspace-rail-btn${testsOpen ? ' btn-toggle-active' : ''}`}
          onClick={() => setTestsOpen((v) => !v)}
          title="Tests"
          aria-label="Tests"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`workspace-rail-btn${aiChatOpen ? ' btn-toggle-active' : ''}`}
          onClick={() => setAiChatOpen((v) => !v)}
          title="AI Assistant"
          aria-label="AI Assistant"
        >
          <Bot size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`workspace-rail-btn${apiTestOpen ? ' btn-toggle-active' : ''}`}
          onClick={() => setApiTestOpen((v) => !v)}
          title="API Test"
          aria-label="API Test"
        >
          <Plug size={18} aria-hidden="true" />
        </button>
        {canEdit && (
          <button
            type="button"
            className={`workspace-rail-btn${databaseOpen ? ' btn-toggle-active' : ''}`}
            onClick={() => setDatabaseOpen((v) => !v)}
            title="Database"
            aria-label="Database"
          >
            <DatabaseIcon size={18} aria-hidden="true" />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className={`workspace-rail-btn${deployOpen ? ' btn-toggle-active' : ''}`}
            onClick={() => setDeployOpen((v) => !v)}
            title="Deploy"
            aria-label="Deploy"
          >
            <Rocket size={18} aria-hidden="true" />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className={`workspace-rail-btn${debugOpen ? ' btn-toggle-active' : ''}`}
            onClick={() => setDebugOpen((v) => !v)}
            title="Debug"
            aria-label="Debug"
          >
            <Bug size={18} aria-hidden="true" />
          </button>
        )}
      </div>
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
            <button
              type="button"
              className="command-palette-hint"
              onClick={() => setCommandPaletteOpen(true)}
              title="Command palette"
            >
              ⌘K
            </button>
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
                className="btn btn-small toolbar-chip"
                onClick={handleFormat}
                disabled={formatting || !ytext}
              >
                <Wand2 size={14} className="toolbar-chip-icon" aria-hidden="true" />
                {formatting ? 'Formatting…' : 'Format'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-small toolbar-chip"
              onClick={handleAddComment}
              disabled={!ytext}
            >
              <MessageSquare size={14} className="toolbar-chip-icon" aria-hidden="true" />
              Comment
            </button>
            <button
              type="button"
              className="btn btn-small toolbar-chip"
              onClick={handleExplain}
              disabled={!ytext}
            >
              <Lightbulb size={14} className="toolbar-chip-icon" aria-hidden="true" />
              Explain
            </button>
            <button
              type="button"
              className="btn btn-small toolbar-chip"
              onClick={() => setSymbolSearchOpen(true)}
            >
              <Target size={14} className="toolbar-chip-icon" aria-hidden="true" />
              Go to Symbol
            </button>
            <button
              type="button"
              className="btn btn-small toolbar-chip"
              onClick={() => setTextSearchOpen(true)}
            >
              <Search size={14} className="toolbar-chip-icon" aria-hidden="true" />
              Find in Files
            </button>

            {canEdit && (
              <>
                <span className="toolbar-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="btn btn-small toolbar-chip"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setSaveTemplateCoords({ top: rect.top, left: rect.left, bottom: rect.bottom })
                  }}
                >
                  <BookmarkPlus size={14} className="toolbar-chip-icon" aria-hidden="true" />
                  Save as Template
                </button>
              </>
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
            readOnly={!canEdit}
            threads={threads}
            onOpenThread={handleOpenThread}
            breakpoints={fileBreakpoints}
            onBreakpointGutterClick={handleBreakpointGutterClick}
            onGoToDefinition={handleGoToDefinition}
            projectSymbols={projectSymbols}
            onReady={setEditorHandle}
          />
        ) : (
          <div className="code-editor-empty">No file open</div>
        )}
        <RunPanel
          language={activeLanguage}
          getCode={getCode}
          getAllFiles={getAllFiles}
          activeFileName={activeFile?.name ?? ''}
          room={room}
          sessionToken={token}
          breakpoints={resolvedBreakpoints}
          onDebugWithAI={debugWithAI}
          isDark={isDark}
        />
      </div>
      {sourceControlOpen && (
        <SourceControlPanel
          room={room}
          canEdit={canEdit}
          sessionToken={token}
          onClose={() => setSourceControlOpen(false)}
        />
      )}
      {activityOpen && <ActivityPanel ydoc={ydoc} onClose={() => setActivityOpen(false)} />}
      {testsOpen && (
        <TestPanel room={room} onDebugWithAI={debugWithAI} onClose={() => setTestsOpen(false)} />
      )}
      {aiChatOpen && (
        <AIChatPanel
          ydoc={ydoc}
          room={room}
          sessionToken={token}
          activeFileId={activeId}
          onClose={() => setAiChatOpen(false)}
          prefill={aiPrefill}
          prefillKey={aiPrefillKey}
        />
      )}
      {reviewOpen && (
        <ReviewPanel
          ydoc={ydoc}
          room={room}
          user={user}
          canEdit={canEdit}
          onClose={() => setReviewOpen(false)}
        />
      )}
      {apiTestOpen && <APITestPanel onClose={() => setApiTestOpen(false)} />}
      {databaseOpen && (
        <DatabasePanel room={room} sessionToken={token} onClose={() => setDatabaseOpen(false)} />
      )}
      {deployOpen && (
        <DeployPanel
          room={room}
          sessionToken={token}
          getAllFiles={getAllFiles}
          onClose={() => setDeployOpen(false)}
        />
      )}
      {debugOpen && (
        <DebugPanel
          room={room}
          sessionToken={token}
          languageId={activeLanguage.id}
          getCode={getCode}
          breakpoints={resolvedBreakpoints}
          onClose={() => setDebugOpen(false)}
        />
      )}
      <CollabSidebar
        awareness={provider.awareness}
        ydoc={ydoc}
        user={user}
        room={room}
        participants={participants}
      />
      {explainRequest && (
        <ExplainPopover
          coords={explainRequest.coords}
          code={explainRequest.code}
          languageId={activeLanguage.id}
          room={room}
          sessionToken={token}
          onClose={() => setExplainRequest(null)}
        />
      )}
      {saveTemplateCoords && (
        <SaveTemplatePopover
          coords={saveTemplateCoords}
          room={room}
          sessionToken={token}
          onClose={() => setSaveTemplateCoords(null)}
        />
      )}
      {breakpointPopover && (
        <BreakpointPopover
          coords={breakpointPopover.coords}
          initialExpressions={breakpointPopover.existing?.expressions ?? []}
          isNew={!breakpointPopover.existing}
          onSave={handleSaveBreakpoint}
          onRemove={handleRemoveBreakpoint}
          onClose={() => setBreakpointPopover(null)}
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
      {symbolSearchOpen && (
        <SymbolSearchModal
          symbols={projectSymbols}
          onJump={jumpToSymbol}
          onClose={() => setSymbolSearchOpen(false)}
        />
      )}
      {textSearchOpen && (
        <TextSearchModal
          getAllFiles={getAllFilesForSearch}
          onJump={jumpToSymbol}
          onClose={() => setTextSearchOpen(false)}
        />
      )}
      {commandPaletteOpen && (
        <CommandPalette commands={commands} onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  )
}

export default Workspace
