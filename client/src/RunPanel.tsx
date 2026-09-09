import { useEffect, useRef, useState } from 'react'
import type { LanguageConfig } from './languages'
import { injectLogpoints, parseDebugLine, MARKER_START, type ResolvedBreakpoint } from './logpoints'
import TerminalView, { type TerminalHandle } from './TerminalView'
import { WS_SERVER_URL } from './api'
import { PlayIcon } from './icons'

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

interface ProjectFile {
  name: string
  content: string
}

interface RunPanelProps {
  language: LanguageConfig
  getCode: () => string
  getAllFiles: () => ProjectFile[]
  activeFileName: string
  room: string
  sessionToken: string | null
  breakpoints: ResolvedBreakpoint[]
  onDebugWithAI: (question: string) => void
  isDark: boolean
}

const INSTALL_RUN_FORBIDDEN_CODE = 4003
const BACKSPACE_CODES = new Set([8, 127])
const CTRL_C_CODE = 3

function RunPanel({
  language,
  getCode,
  getAllFiles,
  activeFileName,
  room,
  sessionToken,
  breakpoints,
  onDebugWithAI,
  isDark,
}: RunPanelProps) {
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
  const terminalRef = useRef<TerminalHandle>(null)
  // The line currently being composed by typing directly into the visible
  // terminal -- a separate, from-scratch input path from the hidden
  // .run-stdin field below (kept for accessibility: a canvas-rendered
  // terminal has no text for a screen reader to read or focus to land on).
  const terminalLineRef = useRef('')

  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  function appendOutput(segment: OutputSegment) {
    terminalRef.current?.write(segment.text)
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

  function resetForNewRun() {
    wsRef.current?.close()
    setOutput([])
    setExitInfo(null)
    setError(null)
    setDebugHits([])
    stdoutBufferRef.current = ''
    terminalLineRef.current = ''
    terminalRef.current?.clear()
    setStatus('running')
  }

  function handleRun() {
    resetForNewRun()

    const ws = new WebSocket(`${WS_SERVER_URL}/__run`)
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
        terminalRef.current?.write(
          `\r\n[exit code ${msg.code ?? '—'}${msg.signal ? ` (${msg.signal})` : ''}]\r\n`,
        )
      } else if (msg.type === 'error') {
        flushStdoutBuffer()
        setError(msg.message)
        setStatus('done')
        terminalRef.current?.write(`\r\n[error] ${msg.message}\r\n`)
      }
    }
    ws.onerror = () => {
      flushStdoutBuffer()
      setError('Could not reach the execution service')
      setStatus('done')
      terminalRef.current?.write('\r\n[error] Could not reach the execution service\r\n')
    }
  }

  // A separate, deliberate action rather than something plain Run falls
  // back to automatically: this runs inside a writable, network-connected
  // container (see server/packageRunner.js) so npm install can actually
  // fetch and install real packages, which is both slower and a bigger
  // sandbox than Piston's package-less, read-only Run. Breakpoints/logpoints
  // don't apply here -- that stays a plain-Run-only feature.
  function handleInstallAndRun() {
    resetForNewRun()

    const startedAt = Date.now()
    const params = new URLSearchParams({ room, token: sessionToken ?? '' })
    const ws = new WebSocket(`${WS_SERVER_URL}/__runpkg?${params.toString()}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', files: getAllFiles(), entryFile: activeFileName }))
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        appendOutput({ stream: msg.type, text: msg.data })
      } else if (msg.type === 'exit') {
        setExitInfo({ code: msg.code, signal: msg.signal, wallTimeMs: Date.now() - startedAt })
        setStatus((current) => (current === 'stopped' ? current : 'done'))
        terminalRef.current?.write(
          `\r\n[exit code ${msg.code ?? '—'}${msg.signal ? ` (${msg.signal})` : ''}]\r\n`,
        )
      } else if (msg.type === 'error') {
        setError(msg.message)
        setStatus('done')
        terminalRef.current?.write(`\r\n[error] ${msg.message}\r\n`)
      }
    }
    ws.onclose = (event) => {
      if (event.code === INSTALL_RUN_FORBIDDEN_CODE) {
        const message = 'Install & Run needs editor access on a private project.'
        setError(message)
        setStatus('done')
        terminalRef.current?.write(`\r\n[error] ${message}\r\n`)
      }
    }
    ws.onerror = () => {
      setError('Could not reach the install-and-run service')
      setStatus('done')
      terminalRef.current?.write('\r\n[error] Could not reach the install-and-run service\r\n')
    }
  }

  function handleStop() {
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    wsRef.current?.close()
    setStatus('stopped')
    terminalRef.current?.write('\r\n[stopped]\r\n')
  }

  function submitStdin() {
    if (status !== 'running' || !wsRef.current) return
    wsRef.current.send(JSON.stringify({ type: 'stdin', data: `${stdinDraft}\n` }))
    appendOutput({ stream: 'stdin', text: `${stdinDraft}\n` })
    setStdinDraft('')
  }

  // Typing directly into the visible terminal -- a minimal line editor since
  // the sandboxed processes on the other end read stdin a line at a time
  // (Piston and the install-and-run container are both plain pipes, not a
  // real pty), so there's nothing for raw per-keystroke bytes to do until
  // Enter. Unlike submitStdin above, this echoes locally as you type instead
  // of only appearing once you submit, which is what makes it feel like a
  // terminal rather than a text box. Character codes (rather than escape-
  // sequence literals) identify the control keys, which is more robust than
  // matching against '\x7f'/'\x03' string literals.
  function handleTerminalData(data: string) {
    if (status !== 'running' || !wsRef.current) return
    for (const ch of data) {
      const code = ch.charCodeAt(0)
      if (ch === '\r' || ch === '\n') {
        const line = terminalLineRef.current
        terminalLineRef.current = ''
        terminalRef.current?.write('\r\n')
        wsRef.current.send(JSON.stringify({ type: 'stdin', data: `${line}\n` }))
      } else if (BACKSPACE_CODES.has(code)) {
        if (terminalLineRef.current.length > 0) {
          terminalLineRef.current = terminalLineRef.current.slice(0, -1)
          terminalRef.current?.write('\b \b')
        }
      } else if (code === CTRL_C_CODE) {
        handleStop()
      } else if (code >= 32 || ch === '\t') {
        terminalLineRef.current += ch
        terminalRef.current?.write(ch)
      }
    }
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
            <PlayIcon />
            {status === 'idle' ? 'Run' : 'Run again'}
          </button>
        )}
        {!running && language.id === 'javascript' && (
          <button type="button" className="btn btn-small" onClick={handleInstallAndRun}>
            📦 Install &amp; Run
          </button>
        )}
        <input
          className="text-input run-stdin sr-only"
          value={stdinDraft}
          onChange={(e) => setStdinDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitStdin()
          }}
          placeholder={running ? 'Type input and press Enter…' : 'stdin (available while running)'}
          disabled={!running}
          aria-label="Program input"
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
      <TerminalView ref={terminalRef} isDark={isDark} onData={handleTerminalData} />
      {(output.length > 0 || error || exitInfo) && (
        <div className="run-output">
          {error && <div className="run-output-error">{error}</div>}
          {output.length === 0 && !error && (
            <div className="run-output-empty sr-only">(no output yet)</div>
          )}
          {output.map((segment, i) => (
            <pre key={i} className={`run-output-${segment.stream} sr-only`}>
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
