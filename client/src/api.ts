export const SERVER_URL = 'http://localhost:1234'

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
