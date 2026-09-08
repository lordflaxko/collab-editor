import { useState } from 'react'

interface ApiHeaderRow {
  id: string
  key: string
  value: string
}

interface ApiResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  timeMs: number
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

function newHeaderRow(): ApiHeaderRow {
  return { id: crypto.randomUUID(), key: '', value: '' }
}

function prettyBody(text: string, contentType: string | null): string {
  if (!contentType?.includes('json')) return text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

interface APITestPanelProps {
  onClose: () => void
}

// Sent straight from the browser via fetch -- like Postman's browser
// extension, not its desktop app -- so there's no new server attack surface,
// but the target API's own CORS policy decides whether a given request can
// succeed from here. Nothing here is persisted or shared with the room: it's
// a private scratch pad that resets when the panel closes or the page
// reloads, so a response body (which can contain tokens or other secrets)
// never ends up broadcast to teammates or written to disk.
function APITestPanel({ onClose }: APITestPanelProps) {
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<ApiHeaderRow[]>([newHeaderRow()])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<ApiResponse | null>(null)

  function updateHeader(id: string, field: 'key' | 'value', value: string) {
    setHeaders((current) => current.map((h) => (h.id === id ? { ...h, [field]: value } : h)))
  }

  function addHeader() {
    setHeaders((current) => [...current, newHeaderRow()])
  }

  function removeHeader(id: string) {
    setHeaders((current) => current.filter((h) => h.id !== id))
  }

  async function handleSend() {
    if (!url.trim() || sending) return
    setSending(true)
    setError(null)
    setResponse(null)
    const startedAt = performance.now()
    try {
      const headerEntries = headers.filter((h) => h.key.trim())
      const res = await fetch(url.trim(), {
        method,
        headers: Object.fromEntries(headerEntries.map((h) => [h.key.trim(), h.value])),
        body: BODY_METHODS.has(method) && body.trim() ? body : undefined,
      })
      const text = await res.text()
      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: [...res.headers.entries()],
        body: text,
        timeMs: Math.round(performance.now() - startedAt),
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} -- this can mean the target's CORS policy is blocking a browser request.`
          : 'Request failed',
      )
    } finally {
      setSending(false)
    }
  }

  const responseContentType =
    response?.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? null

  return (
    <div className="api-test-panel">
      <div className="chat-panel-header">
        <span>API Test</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="api-test-body">
        <div className="api-test-request-row">
          <select
            className="api-method-select"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            className="text-input api-url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend()
            }}
          />
        </div>
        <div className="api-test-headers">
          <div className="api-test-headers-label">Headers</div>
          {headers.map((h) => (
            <div key={h.id} className="api-header-row">
              <input
                className="text-input"
                value={h.key}
                onChange={(e) => updateHeader(h.id, 'key', e.target.value)}
                placeholder="Header"
              />
              <input
                className="text-input"
                value={h.value}
                onChange={(e) => updateHeader(h.id, 'value', e.target.value)}
                placeholder="Value"
              />
              <button type="button" className="btn btn-small" onClick={() => removeHeader(h.id)}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-small" onClick={addHeader}>
            + Header
          </button>
        </div>
        {BODY_METHODS.has(method) && (
          <textarea
            className="comment-textarea api-test-body-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Request body (raw text or JSON)"
          />
        )}
        <button type="button" className="btn btn-small btn-primary" onClick={handleSend} disabled={sending || !url.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        {error && <div className="format-error">{error}</div>}
        {response && (
          <div className="api-response">
            <div
              className={`api-response-status ${
                response.status >= 200 && response.status < 300 ? 'api-status-ok' : 'api-status-error'
              }`}
            >
              {response.status} {response.statusText} · {response.timeMs}ms
            </div>
            <details className="api-response-headers">
              <summary>Response headers ({response.headers.length})</summary>
              {response.headers.map(([k, v]) => (
                <div key={k} className="api-response-header-row">
                  {k}: {v}
                </div>
              ))}
            </details>
            <pre className="sc-diff api-response-body">{prettyBody(response.body, responseContentType)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default APITestPanel
