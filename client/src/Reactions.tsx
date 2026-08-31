import { useState } from 'react'
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react'

interface ReactionsProps {
  reactions: Record<string, string[]>
  currentUser: string
  onToggle: (emoji: string) => void
}

function Reactions({ reactions, currentUser, onToggle }: ReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0)

  function handlePick(data: EmojiClickData) {
    onToggle(data.emoji)
    setPickerOpen(false)
  }

  return (
    <div className="reactions-row">
      {entries.map(([emoji, users]) => (
        <button
          key={emoji}
          type="button"
          className={`reaction-pill${users.includes(currentUser) ? ' reaction-pill-active' : ''}`}
          onClick={() => onToggle(emoji)}
        >
          {emoji} {users.length}
        </button>
      ))}
      <button
        type="button"
        className="reaction-add-btn"
        onClick={() => setPickerOpen((v) => !v)}
        aria-label="Add reaction"
      >
        +
      </button>
      {pickerOpen && (
        <div className="reaction-picker-popover">
          <EmojiPicker onEmojiClick={handlePick} height={350} width={280} />
        </div>
      )}
    </div>
  )
}

export default Reactions
