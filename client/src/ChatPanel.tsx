import { useState } from 'react'
import type * as Y from 'yjs'
import { useChat, sendMessage, replyToMessage, toggleChatReaction } from './chat'
import { extractMentions } from './mentions'
import { notifyMention } from './notifications'
import MentionInput from './MentionInput'
import MentionText from './MentionText'
import Reactions from './Reactions'
import type { Author } from './threadHelpers'

interface ChatPanelProps {
  ydoc: Y.Doc
  user: Author
  room: string
  participants: string[]
  onClose: () => void
}

function timeLabel(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function notifyMentionsIn(text: string, user: Author, room: string) {
  for (const name of extractMentions(text)) {
    notifyMention(name, user.name, room, text)
  }
}

function ChatPanel({ ydoc, user, room, participants, onClose }: ChatPanelProps) {
  const messages = useChat(ydoc)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submitMessage() {
    if (!draft.trim()) return
    sendMessage(ydoc, user, draft.trim())
    notifyMentionsIn(draft.trim(), user, room)
    setDraft('')
  }

  function submitReply(messageId: string) {
    const text = (replyDrafts[messageId] ?? '').trim()
    if (!text) return
    replyToMessage(ydoc, messageId, user, text)
    notifyMentionsIn(text, user, room)
    setReplyDrafts((current) => ({ ...current, [messageId]: '' }))
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span>Chat</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className="chat-message">
            <span className="comment-author" style={{ color: message.color }}>
              {message.author}
            </span>{' '}
            <span className="comment-time">{timeLabel(message.createdAt)}</span>
            <p className="comment-text">
              <MentionText text={message.text} />
            </p>
            <Reactions
              reactions={message.reactions}
              currentUser={user.name}
              onToggle={(emoji) => toggleChatReaction(ydoc, message.id, emoji, user.name)}
            />
            <button
              type="button"
              className="btn btn-small chat-reply-toggle"
              onClick={() => toggleExpanded(message.id)}
            >
              {message.replies.length > 0
                ? `${message.replies.length} ${message.replies.length === 1 ? 'reply' : 'replies'}`
                : 'Reply'}
            </button>
            {expanded.has(message.id) && (
              <div className="chat-thread">
                {message.replies.map((reply) => (
                  <div key={reply.id} className="chat-message chat-reply">
                    <span className="comment-author" style={{ color: reply.color }}>
                      {reply.author}
                    </span>{' '}
                    <span className="comment-time">{timeLabel(reply.createdAt)}</span>
                    <p className="comment-text">
                      <MentionText text={reply.text} />
                    </p>
                    <Reactions
                      reactions={reply.reactions}
                      currentUser={user.name}
                      onToggle={(emoji) => toggleChatReaction(ydoc, reply.id, emoji, user.name)}
                    />
                  </div>
                ))}
                <form
                  className="comment-reply-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitReply(message.id)
                  }}
                >
                  <MentionInput
                    className="text-input"
                    value={replyDrafts[message.id] ?? ''}
                    onChange={(value) =>
                      setReplyDrafts((current) => ({ ...current, [message.id]: value }))
                    }
                    participants={participants}
                    placeholder="Reply…"
                  />
                  <button
                    type="submit"
                    className="btn btn-small"
                    disabled={!(replyDrafts[message.id] ?? '').trim()}
                  >
                    Reply
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          submitMessage()
        }}
      >
        <MentionInput
          className="text-input"
          value={draft}
          onChange={setDraft}
          participants={participants}
          placeholder="Message the room…"
        />
        <button type="submit" className="btn btn-small" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

export default ChatPanel
