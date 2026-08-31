import { useEffect, useRef, useState } from 'react'
import type { Awareness } from 'y-protocols/awareness'

interface Toast {
  id: number
  text: string
}

const TOAST_LIFETIME_MS = 4000

function JoinLeaveToasts({ awareness }: { awareness: Awareness }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const namesRef = useRef(new Map<number, string>())
  const nextIdRef = useRef(0)

  useEffect(() => {
    // Seed the name cache with whoever's already here so we don't announce
    // the people already in the room as "joining" the moment we connect.
    namesRef.current = new Map()
    awareness.getStates().forEach((state, clientId) => {
      if (state.user) namesRef.current.set(clientId, state.user.name ?? 'Anonymous')
    })

    const pushToast = (text: string) => {
      const id = nextIdRef.current++
      setToasts((current) => [...current, { id, text }])
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, TOAST_LIFETIME_MS)
    }

    const handler = ({
      added,
      updated,
      removed,
    }: {
      added: number[]
      updated: number[]
      removed: number[]
    }) => {
      // A client's awareness state usually appears empty first (on connect)
      // and only gains `user` a moment later once the app sets it, which
      // arrives as an "updated" event rather than "added" -- so both need
      // checking here. The namesRef guard stops every later cursor-move
      // update (which also fires "updated") from re-triggering a toast.
      ;[...added, ...updated].forEach((clientId) => {
        if (clientId === awareness.clientID) return
        const user = awareness.getStates().get(clientId)?.user
        if (!user || namesRef.current.has(clientId)) return
        namesRef.current.set(clientId, user.name ?? 'Anonymous')
        pushToast(`${user.name ?? 'Anonymous'} joined`)
      })
      removed.forEach((clientId) => {
        if (clientId === awareness.clientID) return
        const name = namesRef.current.get(clientId)
        if (!name) return
        namesRef.current.delete(clientId)
        pushToast(`${name} left`)
      })
    }
    awareness.on('change', handler)
    return () => awareness.off('change', handler)
  }, [awareness])

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </div>
  )
}

export default JoinLeaveToasts
