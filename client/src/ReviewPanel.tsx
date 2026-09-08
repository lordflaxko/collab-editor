import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import {
  fetchBranches,
  fetchReviewChangedFiles,
  fetchReviewFileDiff,
  type GitBranches,
  type ReviewChangedFile,
} from './git'
import { useReview, requestReview, addReviewDecision, closeReview } from './reviews'

interface ReviewPanelProps {
  ydoc: Y.Doc
  room: string
  user: { name: string }
  canEdit: boolean
  onClose: () => void
}

function diffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'sc-diff-hunk'
  if (line.startsWith('+') && !line.startsWith('+++')) return 'sc-diff-add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'sc-diff-del'
  return ''
}

function fileKindFor(status: string): string {
  if (status === 'A') return 'added'
  if (status === 'D') return 'deleted'
  return 'modified'
}

function ReviewPanel({ ydoc, room, user, canEdit, onClose }: ReviewPanelProps) {
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [baseBranch, setBaseBranch] = useState('')
  const [changedFiles, setChangedFiles] = useState<ReviewChangedFile[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBranches(room).then(setBranches).catch(() => {})
  }, [room])

  const currentBranch = branches?.current ?? ''
  const review = useReview(ydoc, currentBranch)

  useEffect(() => {
    if (!review) {
      setChangedFiles(null)
      setSelectedFile(null)
      setDiff(null)
      return
    }
    setError(null)
    fetchReviewChangedFiles(room, review.baseBranch)
      .then((data) => setChangedFiles(data.files))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load changes'))
    // review.id changes on every new request, so a closed-then-reopened
    // review against the same branch still refetches instead of reusing
    // stale changedFiles from the last one.
  }, [room, review?.baseBranch, review?.id])

  function viewDiff(path: string) {
    if (!review) return
    setSelectedFile(path)
    setDiff(null)
    fetchReviewFileDiff(room, review.baseBranch, path)
      .then((data) => setDiff(data.diff))
      .catch(() => setDiff('Failed to load diff'))
  }

  function handleRequest() {
    if (!baseBranch || baseBranch === currentBranch) return
    requestReview(ydoc, currentBranch, baseBranch, user.name)
    setBaseBranch('')
  }

  function handleDecision(verdict: 'approved' | 'changes_requested') {
    if (!review) return
    addReviewDecision(ydoc, review.branch, user.name, verdict, comment.trim())
    setComment('')
  }

  function handleClose() {
    if (!review) return
    closeReview(ydoc, review.branch, user.name)
  }

  return (
    <div className="review-panel">
      <div className="chat-panel-header">
        <span>Review</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="review-body">
        {!review && (
          <div className="review-request-form">
            <div className="sc-empty">No open review for branch "{currentBranch || '…'}".</div>
            {canEdit && (
              <div className="review-request-row">
                <select
                  className="text-input"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                >
                  <option value="">Compare against…</option>
                  {(branches?.all ?? [])
                    .filter((b) => b !== currentBranch)
                    .map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={handleRequest}
                  disabled={!baseBranch}
                >
                  Request Review
                </button>
              </div>
            )}
          </div>
        )}
        {review && (
          <>
            <div className="review-meta">
              <div>
                <strong>{review.branch}</strong> vs <strong>{review.baseBranch}</strong>
              </div>
              <div className="comment-time">Requested by {review.requestedBy}</div>
              <span className={`review-status review-status-${review.status}`}>
                {review.status === 'open'
                  ? 'Awaiting review'
                  : review.status === 'approved'
                    ? 'Approved'
                    : 'Changes requested'}
              </span>
            </div>
            {error && <div className="format-error">{error}</div>}
            <div className="sc-file-list">
              {(changedFiles ?? []).map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className={`sc-file-item${selectedFile === f.path ? ' sc-file-item-active' : ''}`}
                  onClick={() => viewDiff(f.path)}
                >
                  <span className={`sc-file-kind sc-file-kind-${fileKindFor(f.status)}`}>
                    {f.status[0]}
                  </span>
                  {f.path}
                </button>
              ))}
              {changedFiles && changedFiles.length === 0 && (
                <div className="sc-empty">No differences from {review.baseBranch}</div>
              )}
            </div>
            {selectedFile && (
              <div className="sc-diff-viewer">
                <div className="sc-diff-header">{selectedFile}</div>
                <pre className="sc-diff">
                  {(diff ?? 'Loading diff…').split('\n').map((line, i) => (
                    <div key={i} className={`sc-diff-line ${diffLineClass(line)}`}>
                      {line}
                    </div>
                  ))}
                </pre>
              </div>
            )}
            <div className="review-decisions">
              {review.decisions.map((d) => (
                <div key={d.id} className="review-decision-item">
                  <span className="comment-author">{d.reviewer}</span>{' '}
                  <span className={`review-verdict review-verdict-${d.verdict}`}>
                    {d.verdict === 'approved' ? 'approved' : 'requested changes'}
                  </span>
                  {d.comment && <p className="comment-text">{d.comment}</p>}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="review-actions">
                <textarea
                  className="comment-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment"
                />
                <div className="review-action-buttons">
                  <button type="button" className="btn btn-small" onClick={() => handleDecision('approved')}>
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => handleDecision('changes_requested')}
                  >
                    Request changes
                  </button>
                  <button type="button" className="btn btn-small" onClick={handleClose}>
                    Close review
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ReviewPanel
