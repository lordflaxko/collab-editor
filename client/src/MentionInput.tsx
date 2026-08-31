import { useRef, useState, type ChangeEvent, type RefObject } from 'react'

interface ActiveQuery {
  start: number
  query: string
}

function activeMentionQuery(value: string, caret: number): ActiveQuery | null {
  const upToCaret = value.slice(0, caret)
  const at = upToCaret.lastIndexOf('@')
  if (at === -1) return null
  const query = upToCaret.slice(at + 1)
  if (/\s/.test(query)) return null
  return { start: at, query }
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  participants: string[]
  placeholder?: string
  multiline?: boolean
  className: string
  autoFocus?: boolean
}

function MentionInput({
  value,
  onChange,
  participants,
  placeholder,
  multiline,
  className,
  autoFocus,
}: MentionInputProps) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const [active, setActive] = useState<ActiveQuery | null>(null)

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = e.target.value
    onChange(next)
    const caret = e.target.selectionStart ?? next.length
    setActive(activeMentionQuery(next, caret))
  }

  function selectMention(name: string) {
    if (!active) return
    const caret = ref.current?.selectionStart ?? value.length
    const before = value.slice(0, active.start)
    const after = value.slice(caret)
    onChange(`${before}@${name} ${after}`)
    setActive(null)
    requestAnimationFrame(() => ref.current?.focus())
  }

  const matches = active
    ? participants
        .filter((name) => name.toLowerCase().startsWith(active.query.toLowerCase()))
        .slice(0, 5)
    : []

  return (
    <div className="mention-input-wrap">
      {multiline ? (
        <textarea
          ref={ref as RefObject<HTMLTextAreaElement>}
          className={className}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          ref={ref as RefObject<HTMLInputElement>}
          className={className}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      )}
      {matches.length > 0 && (
        <ul className="mention-suggestions">
          {matches.map((name) => (
            <li key={name}>
              <button type="button" onClick={() => selectMention(name)}>
                @{name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MentionInput
