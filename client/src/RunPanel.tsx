import { useEffect, useRef, useState } from 'react'
import type { LanguageConfig } from './languages'
import { injectLogpoints, parseDebugLine, MARKER_START, type ResolvedBreakpoint } from './logpoints'

interface OutputSegment {
  stream: 'stdout' | 'stderr' | 'stdin'
  text: string
}

interface ExitInfo {
  code: number | null
  signal: string | null
  wallTimeMs: number
}

interface DebugHit {
  id: string
  breakpointId: string
  text: string
}

type Status = 'idle' | 'running' | 'stopped' | 'done'

interface RunPanelProps {
  language: LanguageConfig
  getCode: () => string
  breakpoints: ResolvedBreakpoint[]
  onDebugWithAI: (question: string) => void
}

function RunPanel({ language, getCode, breakpoints, onDebugWithAI }: RunPanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [output, setOutput] = useState<OutputSegment[]>([])
  const [exitInfo, setExitInfo] = useState<ExitInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stdinDraft, setStdinDraft] = useState('')
  const [debugHits, setDebugHits] = useState<DebugHit[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  // Piston's stdout arrives in arbitrary-sized chunks, not necessarily
  // line-aligned, so a logpoint marker can straddle two chunks -- this holds
  // whatever trailing partial line hasn't been resolved into a full line yet.
  const stdoutBufferRef = useRef('')

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

  // Splits an incoming stdout chunk into complete lines, diverting any line
  // that matches a logpoint marker into debugHits instead of the regular
  // output -- otherwise the (mostly invisible) marker byte would show up as
  // garbled noise in the plain output view. A trailing, not-yet-terminated
  // line is held back only while it could still turn out to be the start of
  // a marker; anything else is shown immediately, since an interactive
  // prompt like Python's input("name? ") never gets a trailing newline at
  // all, and withholding it would leave you staring at a stdin box with no
  // visible prompt to answer.
  function processStdoutChunk(chunk: string) {
    let combined = stdoutBufferRef.current + chunk
    let passthrough = ''
    while (true) {
      const newlineIndex = combined.indexOf('\n')
      if (newlineIndex === -1) break
      const line = combined.slice(0, newlineIndex)
      combined = combined.slice(newlineIndex + 1)
      const hit = parseDebugLine(line)
      if (hit) {
        setDebugHits((current) => [...current, { id: crypto.randomUUID(), ...hit }])
      } else {
        passthrough += `${line}\n`
      }
    }
    const couldBecomeMarker = MARKER_START.startsWith(combined) || combined.startsWith(MARKER_START)
    if (combined && !couldBecomeMarker) {
      passthrough += combined
      combined = ''
    }
    stdoutBufferRef.current = combined
    if (passthrough) appendOutput({ stream: 'stdout', text: passthrough })
  }

  function flushStdoutBuffer() {
    const leftover = stdoutBufferRef.current
    stdoutBufferRef.current = ''
    if (!leftover) return
    const hit = parseDebugLine(leftover)
    if (hit) setDebugHits((current) => [...current, { id: crypto.randomUUID(), ...hit }])
    else appendOutput({ stream: 'stdout', text: leftover })
  }

  function handleRun() {
    wsRef.current?.close()
    setOutput([])
    setExitInfo(null)
    setError(null)
    setDebugHits([])
    stdoutBufferRef.current = ''
    setStatus('running')

    const ws = new WebSocket('ws://localhost:1234/__run')
    wsRef.current = ws

    ws.onopen = () => {
      const code = injectLogpoints(getCode(), breakpoints, language.id)
      ws.send(JSON.stringify({ type: 'init', languageId: language.id, code }))
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout') {
        processStdoutChunk(msg.data)
      } else if (msg.type === 'stderr') {
        appendOutput({ stream: 'stderr', text: msg.data })
      } else if (msg.type === 'exit') {
        flushStdoutBuffer()
        setExitInfo({ code: msg.code, signal: msg.signal, wallTimeMs: msg.wallTimeMs })
        setStatus((current) => (current === 'stopped' ? current : 'done'))
      } else if (msg.type === 'error') {
        flushStdoutBuffer()
        setError(msg.message)
        setStatus('done')
      }
    }
    ws.onerror = () => {
      flushStdoutBuffer()
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
  const stderrText = output
    .filter((segment) => segment.stream === 'stderr')
    .map((segment) => segment.text)
    .join('')
  const hasFailure = status === 'done' && (stderrText.trim() || (exitInfo && exitInfo.code !== 0))

  function handleDebugWithAI() {
    onDebugWithAI(
      `My code failed when I ran it:\n\n\`\`\`\n${getCode()}\n\`\`\`\n\nError output:\n\`\`\`\n${stderrText.trim() || `(no stderr; exit code ${exitInfo?.code ?? 'unknown'})`}\n\`\`\`\n\nWhat's wrong and how do I fix it?`,
    )
  }

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
      {debugHits.length > 0 && (
        <div className="debug-hits">
          <div className="debug-hits-label">Debug values</div>
          {debugHits.map((hit, i) => {
            const bp = breakpoints.find((b) => b.id === hit.breakpointId)
            return (
              <div key={hit.id} className="debug-hit-item">
                <span className="debug-hit-index">#{i + 1}</span>
                {bp && <span className="debug-hit-line">Line {bp.lineNumber}:</span>}
                <span className="debug-hit-text">{hit.text.trim()}</span>
              </div>
            )
          })}
        </div>
      )}
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
              {hasFailure && (
                <button type="button" className="btn btn-small run-debug-ai" onClick={handleDebugWithAI}>
                  Debug with AI
                </button>
              )}
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
