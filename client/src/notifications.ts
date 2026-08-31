import { useCallback, useEffect, useState } from 'react'
import { postJson } from './api'

const POLL_INTERVAL_MS = 15000

export interface NotificationData {
  id: string
  fromName: string
  room: string
  text: string
  createdAt: number
  read: boolean
}

export function notifyMention(targetUsername: string, fromName: string, room: string, text: string) {
  postJson('/notifications/mention', { targetUsername, fromName, room, text }).catch(() => {})
}

// Notifications are account-wide (not tied to a room's Y.Doc), so they're
// fetched over the same REST API as login/signup rather than through Yjs.
// There's no push channel for them, so this polls while a token is present.
export function useNotifications(token: string | null) {
  const [notifications, setNotifications] = useState<NotificationData[]>([])

  const refresh = useCallback(() => {
    if (!token) {
      setNotifications([])
      return
    }
    postJson('/notifications/mine', { token })
      .then((data) => setNotifications(data.notifications))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    refresh()
    if (!token) return
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [token, refresh])

  const markAllRead = useCallback(() => {
    if (!token) return
    postJson('/notifications/read', { token })
      .then(refresh)
      .catch(() => {})
  }, [token, refresh])

  return { notifications, refresh, markAllRead }
}
