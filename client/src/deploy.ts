import { postJson, SERVER_URL } from './api'

export interface DeployResult {
  token: string
  kind: 'node' | 'static'
  expiresAt: number
}

export function startDeployment(
  room: string,
  sessionToken: string | null,
  files: { name: string; content: string }[],
): Promise<DeployResult> {
  return postJson('/deploy/start', { room, sessionToken, files })
}

export function stopDeployment(
  room: string,
  sessionToken: string | null,
  deployToken: string,
): Promise<{ ok: true }> {
  return postJson('/deploy/stop', { room, sessionToken, deployToken })
}

export function previewUrl(token: string): string {
  return `${SERVER_URL}/preview/${token}/`
}
