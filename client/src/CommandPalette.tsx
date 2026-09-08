import { useMemo, useState } from 'react'
import { useEscapeToClose } from './useEscapeToClose'

export interface Command {
  id: string
  label: string
  group: string
  disabled?: boolean
  run: () => void
}

interface CommandPaletteProps {
  commands: Command[]
  onClose: () => void
}

function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  useEscapeToClose(onClose)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const available = commands.filter((c) => !c.disabled)
    if (!q) return available
    return available.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    )
  }, [commands, query])

  function run(command: Command) {
    onClose()
    command.run()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[highlighted]) {
      run(results[highlighted])
    }
  }

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette-modal" onClick={(e) => e.stopPropagation()}>
        <input
          className="text-input"
          autoFocus
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlighted(0)
          }}
          onKeyDown={handleKeyDown}
        />
        <ul className="command-palette-results">
          {results.length === 0 ? (
            <li className="sc-empty">No matching commands</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                className={i === highlighted ? 'command-result is-active' : 'command-result'}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => run(c)}
              >
                <span className="command-group">{c.group}</span>
                <span className="command-label">{c.label}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

export default CommandPalette
