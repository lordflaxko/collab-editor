import { useEffect, useRef, useState } from 'react'
import type { ResolvedBreakpoint } from './logpoints'
import { WS_SERVER_URL } from './api'

interface DebugVariable {
  name: string
  value: string
}

interface OutputSegment {
  stream: 'stdout' | 'stderr'
  text: string
}

type Status = 'idle' | 'connecting' | 'running' | 'paused' | 'exited'

interface DebugPanelProps {
  room: string
  sessionToken: string | null
  languageId: string
  getCode: () => string
  breakpoints: ResolvedBreakpoint[]
  onClose: () => void
}

const FORBIDDEN_CODE = 4003

// Only JavaScript: this attaches Node's real --inspect debugger to a
// process running in its own sandboxed container (see server/debugSandbox.js
// and server/debugWs.js) rather than sending code to Piston, since Piston
// has no debug protocol at all. Real pause/step/inspect, but a genuinely
// bigger security surface than Run -- the server only accepts this
// connection for a signed-in editor on a private project.
function DebugPanel({ room, sessionToken, languageId, getCode, breakpoints, onClose }: DebugPanelProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [output, setOutput] = useState<OutputSegment[]>([])
  const [pausedLine, setPausedLine] = useState<number | null>(null)
  const [variables, setVariables] = useState<DebugVariable[]>([])
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  function appendOutput(segment: OutputSegment) {
    setOutput((current) => {
      const last = current[current.length - 1]
      if (last && last.stream === segment.stream) {
        return [...current.slice(0, -1), { stream: last.stream, text: last.text + segment.text }]
      }
      return [...current, segment]
    })
  }

  function handleStart() {
    wsRef.current?.close()
    setOutput([])
    setPausedLine(null)
    setVariables([])
    setError(null)
    setStatus('connecting')

    const params = new URLSearchParams({ room, token: sessionToken ?? '' })
    const ws = new WebSocket(`${WS_SERVER_URL}/__debug?${params.toString()}`)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('running')
      ws.send(
        JSON.stringify({
          type: 'init',
          code: getCode(),
          breakpoints: breakpoints.map((b) => b.lineNumber),
        }),
      )
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        appendOutput({ stream: msg.type, text: msg.data })
      } else if (msg.type === 'paused') {
        setStatus('paused')
        setPausedLine(msg.line)
        setVariables(msg.variables)
      } else if (msg.type === 'exited') {
        setStatus('exited')
        setPausedLine(null)
      } else if (msg.type === 'error') {
        setError(msg.message)
        setStatus('exited')
      }
    }
    ws.onclose = (event) => {
      if (event.code === FORBIDDEN_CODE) {
        setError('Real debugging needs editor access on a private project.')
      }
      setStatus('exited')
      setPausedLine(null)
    }
    ws.onerror = () => {
      setError('Could not reach the debug service')
      setStatus('exited')
    }
  }

  function handleResume() {
    setStatus('running')
    setPausedLine(null)
    wsRef.current?.send(JSON.stringify({ type: 'resume' }))
  }

  function handleStepOver() {
    wsRef.current?.send(JSON.stringify({ type: 'stepOver' }))
  }

  function handleStop() {
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    wsRef.current?.close()
    setStatus('exited')
    setPausedLine(null)
  }

  const wrongLanguage = languageId !== 'javascript'
  const paused = status === 'paused'
  const active = status === 'running' || status === 'paused' || status === 'connecting'

  return (
    <div className="debug-panel">
      <div className="chat-panel-header">
        <span>Debug</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="debug-panel-body">
        {wrongLanguage ? (
          <div className="sc-empty">Real debugging only supports JavaScript files right now.</div>
        ) : (
          <>
            <div className="debug-panel-controls">
              {!active ? (
                <button type="button" className="btn btn-small" onClick={handleStart}>
                  <span className="icon-play" aria-hidden="true" />
                  Start Debugging
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-small" onClick={handleResume} disabled={!paused}>
                    <span className="icon-play" aria-hidden="true" />
                    Resume
                  </button>
                  <button type="button" className="btn btn-small" onClick={handleStepOver} disabled={!paused}>
                    ⤵ Step Over
                  </button>
                  <button type="button" className="btn btn-small btn-stop" onClick={handleStop}>
                    ■ Stop
                  </button>
                </>
              )}
            </div>
            <div className="debug-status">
              {status === 'connecting' && 'Starting sandbox…'}
              {status === 'running' && 'Running…'}
              {status === 'paused' && `Paused at line ${pausedLine}`}
              {status === 'exited' && 'Exited'}
              {status === 'idle' && 'Not started'}
            </div>
            {error && <div className="format-error">{error}</div>}
            {paused && (
              <div className="debug-variables">
                <div className="debug-hits-label">Variables</div>
                {variables.length === 0 ? (
                  <div className="sc-empty">No local variables in scope</div>
                ) : (
                  variables.map((v) => (
                    <div key={v.name} className="debug-var-item">
                      <span className="debug-var-name">{v.name}</span>
                      <span className="debug-var-value">{v.value}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {output.length > 0 && (
              <div className="run-output">
                {output.map((segment, i) => (
                  <pre key={i} className={`run-output-${segment.stream}`}>
                    {segment.text}
                  </pre>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default DebugPanel
