import { useEffect, useState, type FormEvent } from 'react'
import Editor from './Editor'
import './App.css'

function generateRoomId() {
  return crypto.randomUUID().slice(0, 8)
}

function roomFromPath(pathname: string) {
  const id = pathname.slice(1).trim()
  return id.length > 0 ? id : null
}

function App() {
  const [room, setRoom] = useState(() => {
    const fromPath = roomFromPath(window.location.pathname)
    if (fromPath) return fromPath
    const id = generateRoomId()
    window.history.replaceState(null, '', `/${id}`)
    return id
  })
  const [joinInput, setJoinInput] = useState('')

  useEffect(() => {
    const onPopState = () => {
      const fromPath = roomFromPath(window.location.pathname)
      if (fromPath) setRoom(fromPath)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function newDocument() {
    const id = generateRoomId()
    window.history.pushState(null, '', `/${id}`)
    setRoom(id)
  }

  function openDocument(e: FormEvent) {
    e.preventDefault()
    const id = joinInput.trim()
    if (!id) return
    window.history.pushState(null, '', `/${id}`)
    setRoom(id)
    setJoinInput('')
  }

  return (
    <div className="app">
      <h1>Collab Editor</h1>
      <div className="doc-bar">
        <span className="doc-id">
          Document: <code>{room}</code>
        </span>
        <button type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}>
          Copy link
        </button>
        <button type="button" onClick={newDocument}>
          New document
        </button>
        <form className="join-form" onSubmit={openDocument}>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Open document id…"
          />
          <button type="submit">Open</button>
        </form>
      </div>
      <Editor key={room} room={room} />
    </div>
  )
}

export default App
