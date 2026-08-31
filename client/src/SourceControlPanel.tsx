import { useCallback, useEffect, useState } from 'react'
import {
  fetchGitStatus,
  fetchGitLog,
  fetchGitDiff,
  commitAll,
  fetchBranches,
  createBranch,
  switchBranch,
  pushBranch,
  pullBranch,
  listPullRequests,
  createPullRequest,
  type GitStatus,
  type GitCommit,
  type GitDiff,
  type GitBranches,
  type PullRequest,
} from './git'

interface SourceControlPanelProps {
  room: string
  user: { name: string }
  canEdit: boolean
  onClose: () => void
}

type ChangeKind = 'untracked' | 'modified' | 'added' | 'deleted' | 'conflicted'
type Tab = 'changes' | 'history' | 'remote'

function diffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'sc-diff-hunk'
  if (line.startsWith('+') && !line.startsWith('+++')) return 'sc-diff-add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'sc-diff-del'
  return ''
}

function DiffView({ diff }: { diff: GitDiff | null }) {
  if (!diff) return <div className="sc-loading">Loading diff…</div>
  const lines = diff.isNewFile ? diff.diff.split('\n').map((l) => `+${l}`) : diff.diff.split('\n')
  return (
    <pre className="sc-diff">
      {lines.map((line, i) => (
        <div key={i} className={`sc-diff-line ${diffLineClass(line)}`}>
          {line}
        </div>
      ))}
    </pre>
  )
}

function SourceControlPanel({ room, user, canEdit, onClose }: SourceControlPanelProps) {
  const [tab, setTab] = useState<Tab>('changes')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  // Deliberately not persisted anywhere (not even sessionStorage) -- this is
  // a real credential with repo write access, so it only ever lives in this
  // component's state and is gone as soon as the panel unmounts or reloads.
  const [remoteUrl, setRemoteUrl] = useState('')
  const [token, setToken] = useState('')
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [remoteMessage, setRemoteMessage] = useState<string | null>(null)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
  const [prTitle, setPrTitle] = useState('')
  const [prBase, setPrBase] = useState('master')
  const [prBody, setPrBody] = useState('')

  const refreshStatus = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchGitStatus(room)
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load status'))
      .finally(() => setLoading(false))
  }, [room])

  const refreshLog = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchGitLog(room)
      .then((data) => setCommits(data.commits))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [room])

  const refreshBranches = useCallback(() => {
    fetchBranches(room).then(setBranches).catch(() => {})
  }, [room])

  useEffect(() => {
    refreshBranches()
  }, [refreshBranches])

  useEffect(() => {
    if (tab === 'changes') refreshStatus()
    else if (tab === 'history') refreshLog()
  }, [tab, refreshStatus, refreshLog])

  function viewDiff(path: string) {
    setSelectedFile(path)
    setDiff(null)
    fetchGitDiff(room, path)
      .then(setDiff)
      .catch(() => setDiff({ diff: 'Failed to load diff', isNewFile: false }))
  }

  function handleCommit() {
    if (!commitMessage.trim()) return
    setCommitting(true)
    setError(null)
    commitAll(room, commitMessage.trim(), user)
      .then(() => {
        setCommitMessage('')
        setSelectedFile(null)
        setDiff(null)
        refreshStatus()
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Commit failed'))
      .finally(() => setCommitting(false))
  }

  function handleCreateBranch() {
    if (!newBranchName.trim()) return
    createBranch(room, newBranchName.trim())
      .then((b) => {
        setBranches(b)
        setNewBranchName('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not create branch'))
  }

  function handleSwitchBranch(name: string) {
    if (name === branches?.current) return
    if (
      !window.confirm(
        `Switch to "${name}"? This changes the file contents everyone in this room sees, not just you.`,
      )
    ) {
      return
    }
    switchBranch(room, name)
      .then((b) => {
        setBranches(b)
        setSelectedFile(null)
        setDiff(null)
        if (tab === 'changes') refreshStatus()
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not switch branch'))
  }

  function handlePush() {
    if (!remoteUrl.trim() || !token.trim() || !branches?.current) return
    setRemoteBusy(true)
    setRemoteError(null)
    setRemoteMessage(null)
    pushBranch(room, remoteUrl.trim(), token.trim(), branches.current)
      .then(() => setRemoteMessage(`Pushed ${branches.current} to remote.`))
      .catch((err) => setRemoteError(err instanceof Error ? err.message : 'Push failed'))
      .finally(() => setRemoteBusy(false))
  }

  function handlePull() {
    if (!remoteUrl.trim() || !token.trim() || !branches?.current) return
    setRemoteBusy(true)
    setRemoteError(null)
    setRemoteMessage(null)
    pullBranch(room, remoteUrl.trim(), token.trim(), branches.current)
      .then((result) => {
        setRemoteMessage(
          result.conflict
            ? 'Pulled with conflicts -- resolve the markers left in the affected files, then commit.'
            : `Pulled ${branches.current} from remote.`,
        )
        if (tab === 'changes') refreshStatus()
      })
      .catch((err) => setRemoteError(err instanceof Error ? err.message : 'Pull failed'))
      .finally(() => setRemoteBusy(false))
  }

  function refreshPullRequests() {
    if (!remoteUrl.trim() || !token.trim()) return
    setRemoteBusy(true)
    setRemoteError(null)
    listPullRequests(remoteUrl.trim(), token.trim())
      .then((data) => setPullRequests(data.pullRequests))
      .catch((err) => setRemoteError(err instanceof Error ? err.message : 'Could not load pull requests'))
      .finally(() => setRemoteBusy(false))
  }

  function handleCreatePr() {
    if (!remoteUrl.trim() || !token.trim() || !branches?.current || !prTitle.trim()) return
    setRemoteBusy(true)
    setRemoteError(null)
    createPullRequest(remoteUrl.trim(), token.trim(), {
      title: prTitle.trim(),
      head: branches.current,
      base: prBase.trim() || 'master',
      body: prBody.trim(),
    })
      .then((pr) => {
        setRemoteMessage(`Opened PR #${pr.number}: ${pr.url}`)
        setPrTitle('')
        setPrBody('')
        refreshPullRequests()
      })
      .catch((err) => setRemoteError(err instanceof Error ? err.message : 'Could not create pull request'))
      .finally(() => setRemoteBusy(false))
  }

  const changedFiles: Array<{ path: string; kind: ChangeKind }> = status
    ? [
        ...status.conflicted.map((path) => ({ path, kind: 'conflicted' as const })),
        ...status.notAdded.map((path) => ({ path, kind: 'untracked' as const })),
        ...status.modified
          .filter((path) => !status.conflicted.includes(path))
          .map((path) => ({ path, kind: 'modified' as const })),
        ...status.created.map((path) => ({ path, kind: 'added' as const })),
        ...status.deleted.map((path) => ({ path, kind: 'deleted' as const })),
      ]
    : []

  return (
    <div className="source-control-panel">
      <div className="chat-panel-header">
        <span>Source Control</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="sc-branch-bar">
        <select
          className="sc-branch-select"
          value={branches?.current ?? ''}
          disabled={!canEdit}
          onChange={(e) => handleSwitchBranch(e.target.value)}
        >
          {(branches?.all ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {canEdit && (
          <>
            <input
              className="text-input sc-branch-input"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="New branch name"
            />
            <button type="button" className="btn btn-small" onClick={handleCreateBranch}>
              Create
            </button>
          </>
        )}
      </div>
      <div className="sc-tabs">
        <button
          type="button"
          className={`sc-tab${tab === 'changes' ? ' sc-tab-active' : ''}`}
          onClick={() => setTab('changes')}
        >
          Changes
        </button>
        <button
          type="button"
          className={`sc-tab${tab === 'history' ? ' sc-tab-active' : ''}`}
          onClick={() => setTab('history')}
        >
          History
        </button>
        <button
          type="button"
          className={`sc-tab${tab === 'remote' ? ' sc-tab-active' : ''}`}
          onClick={() => setTab('remote')}
        >
          Remote
        </button>
        {tab !== 'remote' && (
          <button
            type="button"
            className="btn btn-small sc-refresh"
            onClick={tab === 'changes' ? refreshStatus : refreshLog}
          >
            Refresh
          </button>
        )}
      </div>
      {error && <div className="format-error">{error}</div>}
      {loading && <div className="sc-loading">Loading…</div>}
      {tab === 'changes' && !loading && (
        <>
          <div className="sc-file-list">
            {changedFiles.length === 0 ? (
              <div className="sc-empty">No changes</div>
            ) : (
              changedFiles.map(({ path, kind }) => (
                <button
                  key={path}
                  type="button"
                  className={`sc-file-item${selectedFile === path ? ' sc-file-item-active' : ''}`}
                  onClick={() => viewDiff(path)}
                >
                  <span className={`sc-file-kind sc-file-kind-${kind}`}>{kind[0].toUpperCase()}</span>
                  {path}
                </button>
              ))
            )}
          </div>
          {canEdit && (
            <div className="sc-commit-box">
              <input
                className="text-input"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message"
              />
              <button
                type="button"
                className="btn btn-small"
                onClick={handleCommit}
                disabled={committing || !commitMessage.trim()}
              >
                {committing ? 'Committing…' : 'Commit'}
              </button>
            </div>
          )}
        </>
      )}
      {tab === 'history' && !loading && (
        <div className="sc-commit-list">
          {commits.length === 0 ? (
            <div className="sc-empty">No commits yet</div>
          ) : (
            commits.map((c) => (
              <div key={c.hash} className="sc-commit-item">
                <div className="sc-commit-message">{c.message}</div>
                <div className="comment-time">
                  {c.authorName} · {c.hash.slice(0, 7)} · {new Date(c.date).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {tab === 'remote' && (
        <div className="sc-remote">
          <input
            className="text-input"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder="https://github.com/owner/repo.git"
          />
          <input
            className="text-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Personal access token"
          />
          <div className="sc-remote-note">Never stored -- re-enter each time you open this panel.</div>
          {canEdit && (
            <div className="sc-remote-actions">
              <button type="button" className="btn btn-small" onClick={handlePush} disabled={remoteBusy}>
                Push
              </button>
              <button type="button" className="btn btn-small" onClick={handlePull} disabled={remoteBusy}>
                Pull
              </button>
            </div>
          )}
          {remoteError && <div className="format-error">{remoteError}</div>}
          {remoteMessage && <div className="sc-remote-message">{remoteMessage}</div>}

          <div className="sc-pr-section">
            <div className="sc-pr-header">
              <span>Pull requests</span>
              <button type="button" className="btn btn-small" onClick={refreshPullRequests} disabled={remoteBusy}>
                Refresh
              </button>
            </div>
            <div className="sc-pr-list">
              {pullRequests.length === 0 ? (
                <div className="sc-empty">No open pull requests loaded</div>
              ) : (
                pullRequests.map((pr) => (
                  <a key={pr.number} className="sc-pr-item" href={pr.url} target="_blank" rel="noreferrer">
                    #{pr.number} {pr.title} <span className="comment-time">{pr.head} → {pr.base}</span>
                  </a>
                ))
              )}
            </div>
            {canEdit && (
              <div className="sc-pr-form">
                <input
                  className="text-input"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder="Pull request title"
                />
                <div className="sc-pr-form-row">
                  <span className="comment-time">{branches?.current ?? '…'} →</span>
                  <input
                    className="text-input"
                    value={prBase}
                    onChange={(e) => setPrBase(e.target.value)}
                    placeholder="base branch"
                  />
                </div>
                <textarea
                  className="comment-textarea"
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  placeholder="Description (optional)"
                />
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={handleCreatePr}
                  disabled={remoteBusy || !prTitle.trim()}
                >
                  Open pull request
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {selectedFile && tab === 'changes' && (
        <div className="sc-diff-viewer">
          <div className="sc-diff-header">{selectedFile}</div>
          <DiffView diff={diff} />
        </div>
      )}
    </div>
  )
}

export default SourceControlPanel
