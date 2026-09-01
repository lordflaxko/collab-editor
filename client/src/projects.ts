import { postJson } from './api'

export type Role = 'viewer' | 'editor' | 'admin' | 'owner'

export interface Project {
  id: string
  name: string
  ownerUsername: string
  visibility: 'public' | 'private'
  members: Record<string, Role>
  createdAt: number
}

export function createProject(
  token: string,
  name: string,
  visibility: 'public' | 'private',
  templateId?: string,
): Promise<{ project: Project }> {
  return postJson('/projects/create', { token, name, visibility, templateId })
}

export function myProjects(token: string): Promise<{ projects: Project[] }> {
  return postJson('/projects/mine', { token })
}

export function getProject(
  token: string | null,
  projectId: string,
): Promise<{ project: Project; role: Role }> {
  return postJson('/projects/get', { token, projectId })
}

export function createInviteLink(
  token: string,
  projectId: string,
  role: Role,
): Promise<{ inviteToken: string }> {
  return postJson('/projects/invite-link', { token, projectId, role })
}

export function joinViaInvite(token: string, inviteToken: string): Promise<{ project: Project }> {
  return postJson('/projects/join', { token, inviteToken })
}

export function listMembers(
  token: string | null,
  projectId: string,
): Promise<{ members: Record<string, Role> }> {
  return postJson('/projects/members', { token, projectId })
}

export function changeRole(
  token: string,
  projectId: string,
  targetUsername: string,
  role: Role,
): Promise<{ project: Project }> {
  return postJson('/projects/member/role', { token, projectId, targetUsername, role })
}

export function removeMember(
  token: string,
  projectId: string,
  targetUsername: string,
): Promise<{ project: Project }> {
  return postJson('/projects/member/remove', { token, projectId, targetUsername })
}

export function setVisibility(
  token: string,
  projectId: string,
  visibility: 'public' | 'private',
): Promise<{ project: Project }> {
  return postJson('/projects/visibility', { token, projectId, visibility })
}

export function deleteProject(token: string, projectId: string): Promise<{ ok: true }> {
  return postJson('/projects/delete', { token, projectId })
}

export function transferOwnership(
  token: string,
  projectId: string,
  newOwnerUsername: string,
): Promise<{ project: Project }> {
  return postJson('/projects/transfer', { token, projectId, newOwnerUsername })
}

export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }

export function atLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}
