import { useState } from 'react'
import { useNotifications } from './notifications'

interface NotificationBellProps {
  token: string | null
  onOpenRoom: (room: string) => void
}

function timeLabel(createdAt: number) {
  return new Date(createdAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function NotificationBell({ token, onOpenRoom }: NotificationBellProps) {
  const { notifications, markAllRead } = useNotifications(token)
  const [open, setOpen] = useState(false)
  const unreadCount = notifications.filter((n) => !n.read).length

  if (!token) return null

  function toggle() {
    setOpen((v) => {
      const next = !v
      if (next && unreadCount > 0) markAllRead()
      return next
    })
  }

  return (
    <div className="notification-bell">
      <button type="button" className="btn btn-small" onClick={toggle}>
        🔔{unreadCount > 0 ? ` ${unreadCount}` : ''}
      </button>
      {open && (
        <div className="notification-dropdown">
          {notifications.length === 0 ? (
            <div className="notification-empty">No notifications yet</div>
          ) : (
            [...notifications]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="notification-item"
                  onClick={() => {
                    onOpenRoom(n.room)
                    setOpen(false)
                  }}
                >
                  <span className="notification-from">{n.fromName}</span> mentioned you
                  <p className="notification-text">{n.text}</p>
                  <span className="comment-time">{timeLabel(n.createdAt)}</span>
                </button>
              ))
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
