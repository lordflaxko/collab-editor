import type * as Y from 'yjs'
import { useActivity, type ActivityEntry } from './activity'

interface ActivityPanelProps {
  ydoc: Y.Doc
  onClose: () => void
}

function describe(entry: ActivityEntry): string {
  const d = entry.details
  switch (entry.type) {
    case 'file-created':
      return `created ${d.name}`
    case 'file-renamed':
      return `renamed ${d.oldName} to ${d.name}`
    case 'file-deleted':
      return `deleted ${d.name}`
    case 'commit':
      return `committed "${d.message}"`
    case 'checkpoint':
      return 'auto-saved a checkpoint of uncommitted changes'
    case 'version-restored':
      return `restored the project to ${d.hash}`
    case 'review-requested':
      return `requested review of ${d.branch} against ${d.baseBranch}`
    case 'review-approved':
      return `approved ${d.branch}`
    case 'review-changes-requested':
      return `requested changes on ${d.branch}`
    case 'review-closed':
      return `closed the review on ${d.branch}`
    case 'branch-created':
      return `created branch ${d.name}`
    case 'branch-switched':
      return `switched to branch ${d.name}`
    case 'member-added':
      return `joined as ${d.role}`
    case 'role-changed':
      return `changed ${d.targetUsername}'s role to ${d.role}`
    case 'member-removed':
      return `removed ${d.targetUsername} from the project`
    case 'visibility-changed':
      return `made the project ${d.visibility}`
    case 'ownership-transferred':
      return `transferred ownership to ${d.newOwnerUsername}`
    default:
      return entry.type
  }
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ActivityPanel({ ydoc, onClose }: ActivityPanelProps) {
  const entries = useActivity(ydoc)

  return (
    <div className="activity-panel">
      <div className="chat-panel-header">
        <span>Activity</span>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="activity-list">
        {entries.length === 0 ? (
          <div className="sc-empty">No activity yet</div>
        ) : (
          [...entries].reverse().map((entry) => (
            <div key={entry.id} className="activity-item">
              <div className="activity-text">
                <span className="comment-author">{entry.actor}</span> {describe(entry)}
              </div>
              <div className="comment-time">{timeLabel(entry.timestamp)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ActivityPanel
