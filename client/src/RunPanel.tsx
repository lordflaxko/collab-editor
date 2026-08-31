import { useState } from 'react'
import type { LanguageConfig } from './languages'

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

interface RunPanelProps {
  language: LanguageConfig
  getCode: () => string
}

function RunPanel({ language, getCode }: RunPanelProps) {
  const [stdin, setStdin] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function handleRun() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('http://localhost:1234/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languageId: language.id, code: getCode(), stdin }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Run failed')
      } else {
        setResult(data)
      }
    } catch {
      setError('Could not reach the execution service')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="run-panel">
      <div className="run-panel-controls">
        <button type="button" className="btn btn-run" onClick={handleRun} disabled={running}>
          {running ? 'Running…' : '▶ Run'}
        </button>
        <input
          className="text-input run-stdin"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="stdin (optional)"
        />
      </div>
      {(result || error) && (
        <div className="run-output">
          {error && <div className="run-output-error">{error}</div>}
          {result && (
            <>
              {result.stdout && <pre className="run-output-stdout">{result.stdout}</pre>}
              {result.stderr && <pre className="run-output-stderr">{result.stderr}</pre>}
              {!result.stdout && !result.stderr && (
                <div className="run-output-empty">(no output)</div>
              )}
              {result.exitCode !== null && (
                <div className="run-output-exit">Exit code: {result.exitCode}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default RunPanel
