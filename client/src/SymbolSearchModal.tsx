import { useMemo, useState } from 'react'
import type { ProjectSymbol } from './symbolIndex'
import { useEscapeToClose } from './useEscapeToClose'

interface SymbolSearchModalProps {
  symbols: ProjectSymbol[]
  onJump: (symbol: ProjectSymbol) => void
  onClose: () => void
}

function SymbolSearchModal({ symbols, onJump, onClose }: SymbolSearchModalProps) {
  useEscapeToClose(onClose)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? symbols.filter((s) => s.name.toLowerCase().includes(q)) : symbols
    return matches
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.fileName.localeCompare(b.fileName))
      .slice(0, 50)
  }, [symbols, query])

  function jump(symbol: ProjectSymbol) {
    onJump(symbol)
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[highlighted]) {
      jump(results[highlighted])
    }
  }

  return (
    <div className="symbol-search-backdrop" onClick={onClose}>
      <div className="symbol-search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          className="text-input"
          autoFocus
          placeholder="Go to symbol…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlighted(0)
          }}
          onKeyDown={handleKeyDown}
        />
        <ul className="symbol-search-results">
          {results.length === 0 ? (
            <li className="sc-empty">No matching symbols</li>
          ) : (
            results.map((s, i) => (
              <li
                key={`${s.fileId}:${s.from}`}
                className={i === highlighted ? 'symbol-result is-active' : 'symbol-result'}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => jump(s)}
              >
                <span className="symbol-kind">{s.kind}</span>
                <span className="symbol-name">{s.name}</span>
                <span className="symbol-location">
                  {s.fileName}:{s.line}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

export default SymbolSearchModal
