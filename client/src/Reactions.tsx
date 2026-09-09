import EmojiPickerButton from './EmojiPickerButton'

interface ReactionsProps {
  reactions: Record<string, string[]>
  currentUser: string
  onToggle: (emoji: string) => void
}

function Reactions({ reactions, currentUser, onToggle }: ReactionsProps) {
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0)

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
      {/* Opens on the quick-reaction strip: reacting is nearly always one of a
          handful of common emoji, so the full picker is a click further in. */}
      <EmojiPickerButton
        onPick={onToggle}
        label="Add reaction"
        className="reaction-add-btn"
        compact
      >
        +
      </EmojiPickerButton>
    </div>
  )
}

export default Reactions
