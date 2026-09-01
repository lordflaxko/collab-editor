import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { useAiChat, askAssistant } from './aiChat'

interface AIChatPanelProps {
  ydoc: Y.Doc
  room: string
  sessionToken: string | null
  activeFileId: string | null
  onClose: () => void
  // "Debug with AI" buttons elsewhere (Run/Test failures) fill this in to
  // seed the draft with a ready-made question -- prefillKey changes on every
  // request so clicking it again re-fills the box even with the same text.
  prefill?: string
  prefillKey?: number
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function AIChatPanel({
  ydoc,
  room,
  sessionToken,
  activeFileId,
  onClose,
  prefill,
  prefillKey,
}: AIChatPanelProps) {
  const messages = useAiChat(ydoc)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (prefill !== undefined) setDraft(prefill)
    // Only re-run when a new debug request comes in (prefillKey changes),
    // not on every keystroke of the user's own edits to the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey])

  function submit() {
    const question = draft.trim()
    if (!question || asking) return
    setAsking(true)
    setError(null)
    setDraft('')
    askAssistant(room, question, sessionToken, activeFileId).catch((err) =>
      setError(err instanceof Error ? err.message : 'The assistant could not be reached'),
    ).finally(() => setAsking(false))
  }

  return (
    <div className="ai-chat-panel">
      <div className="chat-panel-header">
        <span>AI Assistant</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="sc-empty">
            Ask a question about the currently open file, or about this project in general.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message${message.role === 'assistant' ? ' ai-message' : ''}`}
            >
              <span className="comment-author">
                {message.role === 'assistant' ? 'Assistant' : message.author}
              </span>{' '}
              <span className="comment-time">{timeLabel(message.timestamp)}</span>
              <p className={`comment-text ai-message-text${message.error ? ' ai-message-error' : ''}`}>
                {message.text}
              </p>
            </div>
          ))
        )}
        {asking && <div className="sc-loading">Thinking…</div>}
      </div>
      {error && <div className="format-error">{error}</div>}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          className="text-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about this code…"
          disabled={asking}
        />
        <button type="submit" className="btn btn-small" disabled={asking || !draft.trim()}>
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </form>
    </div>
  )
}

export default AIChatPanel
