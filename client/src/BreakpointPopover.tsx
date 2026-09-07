import { useState, type CSSProperties } from 'react'
import type { Coords } from './CodeEditor'
import { useEscapeToClose } from './useEscapeToClose'

interface BreakpointPopoverProps {
  coords: Coords
  initialExpressions: string[]
  isNew: boolean
  onSave: (expressions: string[]) => void
  onRemove: () => void
  onClose: () => void
}

function BreakpointPopover({
  coords,
  initialExpressions,
  isNew,
  onSave,
  onRemove,
  onClose,
}: BreakpointPopoverProps) {
  useEscapeToClose(onClose)
  const [text, setText] = useState(initialExpressions.join(', '))
  const style = { top: coords.bottom + 6, left: coords.left } as CSSProperties

  function handleSave() {
    const expressions = text
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    onSave(expressions)
    onClose()
  }

  return (
    <div className="comment-popover breakpoint-popover" style={style}>
      <div className="comment-popover-header">
        <span>Breakpoint</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <input
        className="text-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Watch expressions, comma-separated (e.g. i, total)"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
        }}
      />
      <div className="comment-popover-actions">
        <button type="button" className="btn btn-small" onClick={handleSave}>
          {isNew ? 'Set breakpoint' : 'Save'}
        </button>
        {!isNew && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              onRemove()
              onClose()
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

export default BreakpointPopover
