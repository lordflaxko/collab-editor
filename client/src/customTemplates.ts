import { postJson } from './api'

export interface CustomTemplateSummary {
  id: string
  name: string
  savedBy: string
  createdAt: number
  fileCount: number
}

export function listCustomTemplates(): Promise<{ templates: CustomTemplateSummary[] }> {
  return postJson('/templates/list', {})
}

export function saveCustomTemplate(
  sessionToken: string | null,
  projectId: string,
  name: string,
): Promise<{ template: CustomTemplateSummary }> {
  return postJson('/templates/save', { sessionToken, projectId, name })
}

export function deleteCustomTemplate(sessionToken: string, templateId: string): Promise<{ ok: true }> {
  return postJson('/templates/delete', { sessionToken, templateId })
}
