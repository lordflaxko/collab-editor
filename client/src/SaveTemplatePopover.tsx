import { useState, type CSSProperties } from 'react'
import type { Coords } from './CodeEditor'
import { saveCustomTemplate } from './customTemplates'

interface SaveTemplatePopoverProps {
  coords: Coords
  room: string
  sessionToken: string | null
  onClose: () => void
}

function SaveTemplatePopover({ coords, room, sessionToken, onClose }: SaveTemplatePopoverProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const style = { top: coords.bottom + 6, left: coords.left } as CSSProperties

  function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    saveCustomTemplate(sessionToken, room, name.trim())
      .then(() => setSaved(true))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not save template'))
      .finally(() => setSaving(false))
  }

  return (
    <div className="comment-popover save-template-popover" style={style}>
      <div className="comment-popover-header">
        <span>Save as Template</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      {saved ? (
        <div className="sc-empty">Saved -- it'll show up in the template list on the dashboard.</div>
      ) : (
        <>
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
          {error && <div className="format-error">{error}</div>}
          <div className="comment-popover-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default SaveTemplatePopover
