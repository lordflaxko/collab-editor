import { useState, type MouseEvent, type ReactNode } from 'react'
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react'

const PICKER_WIDTH = 280
const PICKER_HEIGHT = 350
const GAP = 6

// Anchored to the viewport rather than to the trigger's own container: the
// chat panel clips its overflow and the message list scrolls, so an
// absolutely-positioned picker was cut off by both. Same fixed-position
// approach the comment and explain popovers already use.
//
// Both axes anchor to whichever edge leaves room, rather than computing an
// offset from the picker's size, so the position stays correct without
// knowing how big it is. That matters here because the compact reaction
// strip and the expanded full picker are different sizes -- the strip is
// wider than the `width` prop -- and it can switch between them while open.
type PickerPosition = {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

// Mirrors the workspace's own theme rule in index.css: the editor chrome is
// dark whatever the system preference says, and only an explicit light
// choice turns it back. Theme.AUTO would follow prefers-color-scheme and so
// render a white picker on the dark workspace for a system-light user.
function resolvePickerTheme() {
  return document.documentElement.dataset.theme === 'light' ? Theme.LIGHT : Theme.DARK
}

interface EmojiPickerButtonProps {
  onPick: (emoji: string) => void
  label: string
  className: string
  children: ReactNode
  /** Opens on the compact quick-reaction strip instead of the full picker. */
  compact?: boolean
}

function EmojiPickerButton({
  onPick,
  label,
  className,
  children,
  compact = false,
}: EmojiPickerButtonProps) {
  const [position, setPosition] = useState<PickerPosition | null>(null)

  function handlePick(data: EmojiClickData) {
    onPick(data.emoji)
    setPosition(null)
  }

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (position) {
      setPosition(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const horizontal =
      window.innerWidth - rect.left >= PICKER_WIDTH
        ? { left: rect.left }
        : { right: Math.max(0, window.innerWidth - rect.right) }
    const vertical =
      window.innerHeight - rect.bottom >= PICKER_HEIGHT + GAP
        ? { top: rect.bottom + GAP }
        : { bottom: window.innerHeight - rect.top + GAP }
    setPosition({ ...horizontal, ...vertical })
  }

  return (
    <>
      <button type="button" className={className} onClick={toggle} aria-label={label}>
        {children}
      </button>
      {position && (
        <div className="reaction-picker-popover" style={position}>
          <EmojiPicker
            onEmojiClick={handlePick}
            onReactionClick={handlePick}
            reactionsDefaultOpen={compact}
            theme={resolvePickerTheme()}
            height={PICKER_HEIGHT}
            width={PICKER_WIDTH}
          />
        </div>
      )}
    </>
  )
}

export default EmojiPickerButton
