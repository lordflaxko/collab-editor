// Overridable via VITE_SERVER_URL (e.g. to point a dev build at a tunnel
// exposing the server publicly) -- defaults to the local dev server.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:1234'
export const WS_SERVER_URL = SERVER_URL.replace(/^http/, 'ws')

export async function postJson(path: string, body: unknown) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed')
  }
  return data
}
