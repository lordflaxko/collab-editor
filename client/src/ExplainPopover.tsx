import { useEffect, useState, type CSSProperties } from 'react'
import type { Coords } from './CodeEditor'
import { explainCode } from './aiChat'
import { useEscapeToClose } from './useEscapeToClose'

interface ExplainPopoverProps {
  coords: Coords
  code: string
  languageId: string
  room: string
  sessionToken: string | null
  onClose: () => void
}

function ExplainPopover({ coords, code, languageId, room, sessionToken, onClose }: ExplainPopoverProps) {
  useEscapeToClose(onClose)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    explainCode(room, code, languageId, sessionToken)
      .then((data) => {
        if (!cancelled) setExplanation(data.explanation)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not get an explanation')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Runs once per popover instance -- a fresh one mounts each time
    // "Explain" is clicked, since it only renders while a request is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = { top: coords.bottom + 6, left: coords.left } as CSSProperties

  return (
    <div className="comment-popover explain-popover" style={style}>
      <div className="comment-popover-header">
        <span>Explain</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      {loading && <div className="sc-loading">Thinking…</div>}
      {error && <div className="format-error">{error}</div>}
      {explanation && <p className="comment-text ai-message-text">{explanation}</p>}
    </div>
  )
}

export default ExplainPopover
