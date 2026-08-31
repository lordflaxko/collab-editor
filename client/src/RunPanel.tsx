import { useEffect, useRef, useState } from 'react'
import type { LanguageConfig } from './languages'

interface OutputSegment {
  stream: 'stdout' | 'stderr' | 'stdin'
  text: string
}

interface ExitInfo {
  code: number | null
  signal: string | null
  wallTimeMs: number
}

type Status = 'idle' | 'running' | 'stopped' | 'done'

interface RunPanelProps {
  language: LanguageConfig
  getCode: () => string
}

function RunPanel({ language, getCode }: RunPanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [output, setOutput] = useState<OutputSegment[]>([])
  const [exitInfo, setExitInfo] = useState<ExitInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stdinDraft, setStdinDraft] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  function appendOutput(segment: OutputSegment) {
    setOutput((current) => {
      const last = current[current.length - 1]
      // Coalesce consecutive same-stream chunks so fast output doesn't turn
      // into dozens of separate <pre> blocks.
      if (last && last.stream === segment.stream) {
        return [...current.slice(0, -1), { stream: last.stream, text: last.text + segment.text }]
      }
      return [...current, segment]
    })
  }

  function handleRun() {
    wsRef.current?.close()
    setOutput([])
    setExitInfo(null)
    setError(null)
    setStatus('running')

    const ws = new WebSocket('ws://localhost:1234/__run')
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', languageId: language.id, code: getCode() }))
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        appendOutput({ stream: msg.type, text: msg.data })
      } else if (msg.type === 'exit') {
        setExitInfo({ code: msg.code, signal: msg.signal, wallTimeMs: msg.wallTimeMs })
        setStatus((current) => (current === 'stopped' ? current : 'done'))
      } else if (msg.type === 'error') {
        setError(msg.message)
        setStatus('done')
      }
    }
    ws.onerror = () => {
      setError('Could not reach the execution service')
      setStatus('done')
    }
  }

  function handleStop() {
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    wsRef.current?.close()
    setStatus('stopped')
  }

  function submitStdin() {
    if (status !== 'running' || !wsRef.current) return
    wsRef.current.send(JSON.stringify({ type: 'stdin', data: `${stdinDraft}\n` }))
    appendOutput({ stream: 'stdin', text: `${stdinDraft}\n` })
    setStdinDraft('')
  }

  const running = status === 'running'

  return (
    <div className="run-panel">
      <div className="run-panel-controls">
        {running ? (
          <button type="button" className="btn btn-run btn-stop" onClick={handleStop}>
            ■ Stop
          </button>
        ) : (
          <button type="button" className="btn btn-run" onClick={handleRun}>
            ▶ {status === 'idle' ? 'Run' : 'Run again'}
          </button>
        )}
        <input
          className="text-input run-stdin"
          value={stdinDraft}
          onChange={(e) => setStdinDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitStdin()
          }}
          placeholder={running ? 'Type input and press Enter…' : 'stdin (available while running)'}
          disabled={!running}
        />
      </div>
      {(output.length > 0 || error || exitInfo) && (
        <div className="run-output">
          {error && <div className="run-output-error">{error}</div>}
          {output.length === 0 && !error && <div className="run-output-empty">(no output yet)</div>}
          {output.map((segment, i) => (
            <pre key={i} className={`run-output-${segment.stream}`}>
              {segment.text}
            </pre>
          ))}
          {exitInfo && (
            <div className="run-output-exit">
              Exit code: {exitInfo.code ?? '—'}
              {exitInfo.signal && ` (${exitInfo.signal})`} · {exitInfo.wallTimeMs}ms
            </div>
          )}
          {status === 'stopped' && (
            <div className="run-output-exit">
              Stopped -- the sandboxed process may keep running briefly server-side.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RunPanel
