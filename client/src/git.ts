import { postJson } from './api'

export interface GitStatus {
  current: string | null
  notAdded: string[]
  modified: string[]
  deleted: string[]
  created: string[]
  staged: string[]
  conflicted: string[]
  isClean: boolean
}

export interface GitCommit {
  hash: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}

export interface GitDiff {
  diff: string
  isNewFile: boolean
}

export function fetchGitStatus(room: string): Promise<GitStatus> {
  return postJson('/git/status', { room })
}

export function fetchGitLog(room: string): Promise<{ commits: GitCommit[] }> {
  return postJson('/git/log', { room })
}

export function fetchGitDiff(room: string, path: string): Promise<GitDiff> {
  return postJson('/git/diff', { room, path })
}

export interface GitBranches {
  current: string | null
  all: string[]
}

export function commitAll(
  room: string,
  message: string,
  sessionToken: string | null,
): Promise<{ commits: GitCommit[] }> {
  return postJson('/git/commit', { room, message, sessionToken })
}

export function restoreVersion(
  room: string,
  hash: string,
  sessionToken: string | null,
): Promise<{ commits: GitCommit[] }> {
  return postJson('/git/restore', { room, hash, sessionToken })
}

export interface ReviewChangedFile {
  status: string
  path: string
}

export function fetchReviewChangedFiles(
  room: string,
  baseBranch: string,
): Promise<{ files: ReviewChangedFile[] }> {
  return postJson('/git/review-diff', { room, baseBranch })
}

export function fetchReviewFileDiff(
  room: string,
  baseBranch: string,
  path: string,
): Promise<{ diff: string }> {
  return postJson('/git/review-file-diff', { room, baseBranch, path })
}

export function fetchBranches(room: string): Promise<GitBranches> {
  return postJson('/git/branches', { room })
}

export function createBranch(
  room: string,
  name: string,
  sessionToken: string | null,
): Promise<GitBranches> {
  return postJson('/git/branch/create', { room, name, sessionToken })
}

export function switchBranch(
  room: string,
  name: string,
  sessionToken: string | null,
): Promise<GitBranches> {
  return postJson('/git/branch/switch', { room, name, sessionToken })
}

export function pushBranch(
  room: string,
  remoteUrl: string,
  token: string,
  branch: string,
  sessionToken: string | null,
): Promise<{ ok: true }> {
  return postJson('/git/push', { room, remoteUrl, token, branch, sessionToken })
}

export function pullBranch(
  room: string,
  remoteUrl: string,
  token: string,
  branch: string,
  sessionToken: string | null,
): Promise<{ conflict: boolean }> {
  return postJson('/git/pull', { room, remoteUrl, token, branch, sessionToken })
}

export interface PullRequest {
  number: number
  title: string
  url: string
  author: string
  head: string
  base: string
  state: string
}

export function listPullRequests(remoteUrl: string, token: string): Promise<{ pullRequests: PullRequest[] }> {
  return postJson('/git/pr/list', { remoteUrl, token })
}

export function createPullRequest(
  remoteUrl: string,
  token: string,
  params: { title: string; head: string; base: string; body: string },
): Promise<{ number: number; url: string }> {
  return postJson('/git/pr/create', { remoteUrl, token, ...params })
}
