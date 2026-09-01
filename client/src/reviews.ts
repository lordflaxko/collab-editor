import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { logClientActivity } from './activity'

export interface ReviewDecision {
  id: string
  reviewer: string
  verdict: 'approved' | 'changes_requested'
  comment: string
  timestamp: number
}

export interface ReviewRequest {
  id: string
  branch: string
  baseBranch: string
  requestedBy: string
  createdAt: number
  status: 'open' | 'approved' | 'changes_requested'
  decisions: ReviewDecision[]
}

type ReviewEntry = Y.Map<unknown>

// Lives in the project's own Y.Doc, one open request per branch at a time --
// keyed by branch name so switching branches naturally shows whichever
// review (if any) applies to the branch you're now on. Server-enforced
// read-only for viewers (readOnlyGuard.js drops their sync updates) covers
// this the same way it already covers file edits, so no separate
// authorization plumbing is needed for review actions.
function reviewsMapFor(ydoc: Y.Doc): Y.Map<ReviewEntry> {
  return ydoc.getMap('reviews')
}

function toReviewRequest(entry: ReviewEntry): ReviewRequest {
  return {
    id: entry.get('id') as string,
    branch: entry.get('branch') as string,
    baseBranch: entry.get('baseBranch') as string,
    requestedBy: entry.get('requestedBy') as string,
    createdAt: entry.get('createdAt') as number,
    status: entry.get('status') as ReviewRequest['status'],
    decisions: (entry.get('decisions') as Y.Array<ReviewDecision>).toArray(),
  }
}

export function requestReview(
  ydoc: Y.Doc,
  branch: string,
  baseBranch: string,
  requestedBy: string,
) {
  const entry: ReviewEntry = new Y.Map()
  entry.set('id', crypto.randomUUID())
  entry.set('branch', branch)
  entry.set('baseBranch', baseBranch)
  entry.set('requestedBy', requestedBy)
  entry.set('createdAt', Date.now())
  entry.set('status', 'open')
  entry.set('decisions', new Y.Array())
  reviewsMapFor(ydoc).set(branch, entry)
  logClientActivity(ydoc, 'review-requested', requestedBy, { branch, baseBranch })
}

export function addReviewDecision(
  ydoc: Y.Doc,
  branch: string,
  reviewer: string,
  verdict: 'approved' | 'changes_requested',
  comment: string,
) {
  const entry = reviewsMapFor(ydoc).get(branch)
  if (!entry) return
  const decisions = entry.get('decisions') as Y.Array<ReviewDecision>
  decisions.push([{ id: crypto.randomUUID(), reviewer, verdict, comment, timestamp: Date.now() }])
  entry.set('status', verdict)
  logClientActivity(
    ydoc,
    verdict === 'approved' ? 'review-approved' : 'review-changes-requested',
    reviewer,
    { branch },
  )
}

export function closeReview(ydoc: Y.Doc, branch: string, actor: string) {
  const map = reviewsMapFor(ydoc)
  if (!map.has(branch)) return
  map.delete(branch)
  logClientActivity(ydoc, 'review-closed', actor, { branch })
}

export function useReview(ydoc: Y.Doc, branch: string): ReviewRequest | null {
  const map = reviewsMapFor(ydoc)
  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; branch: string; review: ReviewRequest | null }>({
    version: -1,
    branch: '',
    review: null,
  })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = () => {
        versionRef.current += 1
        onStoreChange()
      }
      map.observeDeep(handler)
      return () => map.unobserveDeep(handler)
    },
    [map],
  )

  const getSnapshot = useCallback((): ReviewRequest | null => {
    if (cacheRef.current.version === versionRef.current && cacheRef.current.branch === branch) {
      return cacheRef.current.review
    }
    const entry = map.get(branch)
    const review = entry ? toReviewRequest(entry) : null
    cacheRef.current = { version: versionRef.current, branch, review }
    return review
  }, [map, branch])

  return useSyncExternalStore(subscribe, getSnapshot)
}
