import { useState, type CSSProperties, type FormEvent } from 'react'
import type { Coords } from './CodeEditor'
import type { CommentThreadData } from './comments'
import MentionInput from './MentionInput'
import MentionText from './MentionText'
import Reactions from './Reactions'

interface NewThreadPopoverProps {
  mode: 'new'
  coords: Coords
  participants: string[]
  onSubmit: (text: string) => void
  onClose: () => void
}

interface ViewThreadPopoverProps {
  mode: 'view'
  coords: Coords
  thread: CommentThreadData
  participants: string[]
  currentUser: string
  onReply: (text: string) => void
  onToggleResolved: () => void
  onToggleReaction: (itemId: string, emoji: string) => void
  onClose: () => void
}

type CommentPopoverProps = NewThreadPopoverProps | ViewThreadPopoverProps

function timeLabel(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function CommentPopover(props: CommentPopoverProps) {
  const [draft, setDraft] = useState('')
  const style = {
    top: props.coords.bottom + 6,
    left: props.coords.left,
  } as CSSProperties

  if (props.mode === 'new') {
    return (
      <div className="comment-popover" style={style}>
        <MentionInput
          className="comment-textarea"
          value={draft}
          onChange={setDraft}
          participants={props.participants}
          placeholder="Leave a comment…"
          multiline
          autoFocus
        />
        <div className="comment-popover-actions">
          <button
            type="button"
            className="btn btn-small"
            disabled={!draft.trim()}
            onClick={() => draft.trim() && props.onSubmit(draft.trim())}
          >
            Comment
          </button>
          <button type="button" className="btn btn-small" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const { thread } = props

  function submitReply(e: FormEvent) {
    e.preventDefault()
    if (props.mode !== 'view' || !draft.trim()) return
    props.onReply(draft.trim())
    setDraft('')
  }

  return (
    <div className="comment-popover" style={style}>
      <div className="comment-popover-header">
        <button type="button" className="btn btn-small" onClick={props.onToggleResolved}>
          {thread.resolved ? 'Reopen' : 'Resolve'}
        </button>
        <button type="button" className="btn btn-small" onClick={props.onClose}>
          Close
        </button>
      </div>
      <ul className="comment-thread">
        <li className="comment-item">
          <span className="comment-author" style={{ color: thread.color }}>
            {thread.author}
          </span>{' '}
          <span className="comment-time">{timeLabel(thread.createdAt)}</span>
          <p className="comment-text">
            <MentionText text={thread.text} />
          </p>
          <Reactions
            reactions={thread.reactions}
            currentUser={props.currentUser}
            onToggle={(emoji) => props.onToggleReaction(thread.id, emoji)}
          />
        </li>
        {thread.replies.map((reply) => (
          <li key={reply.id} className="comment-item comment-reply">
            <span className="comment-author" style={{ color: reply.color }}>
              {reply.author}
            </span>{' '}
            <span className="comment-time">{timeLabel(reply.createdAt)}</span>
            <p className="comment-text">
              <MentionText text={reply.text} />
            </p>
            <Reactions
              reactions={reply.reactions}
              currentUser={props.currentUser}
              onToggle={(emoji) => props.onToggleReaction(reply.id, emoji)}
            />
          </li>
        ))}
      </ul>
      <form className="comment-reply-form" onSubmit={submitReply}>
        <MentionInput
          className="text-input"
          value={draft}
          onChange={setDraft}
          participants={props.participants}
          placeholder="Reply…"
        />
        <button type="submit" className="btn btn-small" disabled={!draft.trim()}>
          Reply
        </button>
      </form>
    </div>
  )
}

export default CommentPopover
