import { useState } from 'react'
import { runTests, type TestFileResult } from './tests'

interface TestPanelProps {
  room: string
  onDebugWithAI: (question: string) => void
  onClose: () => void
}

function TestPanel({ room, onDebugWithAI, onClose }: TestPanelProps) {
  const [results, setResults] = useState<TestFileResult[] | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleRun() {
    setRunning(true)
    setError(null)
    runTests(room)
      .then((data) => setResults(data.results))
      .catch((err) => setError(err instanceof Error ? err.message : 'Test run failed'))
      .finally(() => setRunning(false))
  }

  const totals = results?.reduce(
    (acc, r) => ({ passed: acc.passed + r.passed, failed: acc.failed + r.failed }),
    { passed: 0, failed: 0 },
  )

  return (
    <div className="test-panel">
      <div className="chat-panel-header">
        <span>Tests</span>
        <div>
          <button type="button" className="btn btn-small btn-primary" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run Tests'}
          </button>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="test-results">
        {error && <div className="format-error">{error}</div>}
        {!error && !results && !running && (
          <div className="sc-empty">
            Name a file like example.test.js and click Run Tests. Uses Node's built-in test runner
            (require('node:test')), so no framework install is needed.
          </div>
        )}
        {results?.map((fileResult) => (
          <div key={fileResult.file} className="test-file-result">
            <div className="test-file-header">
              <span className="sc-diff-header">{fileResult.file}</span>
              <span className="comment-time">
                {fileResult.passed} passed, {fileResult.failed} failed
              </span>
            </div>
            {fileResult.tests.map((t) => (
              <div key={t.id} className={`test-item ${t.passed ? 'test-item-pass' : 'test-item-fail'}`}>
                <span className="test-item-icon">{t.passed ? '✓' : '✗'}</span>
                <span className="test-item-name">{t.name}</span>
                {!t.passed && (
                  <button
                    type="button"
                    className="btn btn-small test-item-debug"
                    onClick={() =>
                      onDebugWithAI(
                        `The test "${t.name}" in ${fileResult.file} is failing. Here's the failure detail:\n\n\`\`\`\n${t.detail || '(no detail captured)'}\n\`\`\`\n\nWhat's wrong and how do I fix it?`,
                      )
                    }
                  >
                    Debug with AI
                  </button>
                )}
              </div>
            ))}
            {fileResult.tests.length === 0 && fileResult.stderr && (
              <pre className="sc-diff test-stderr">{fileResult.stderr}</pre>
            )}
          </div>
        ))}
        {totals && results && results.length > 1 && (
          <div className="test-totals comment-time">
            Total: {totals.passed} passed, {totals.failed} failed
          </div>
        )}
      </div>
    </div>
  )
}

export default TestPanel
