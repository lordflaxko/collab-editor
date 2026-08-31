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

function rememberedPassphrase(room: string) {
  return sessionStorage.getItem(`passphrase:${room}`)
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
  const [passphrase, setPassphrase] = useState<string | null>(() => rememberedPassphrase(room))
  const [passphraseInput, setPassphraseInput] = useState('')
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    const onPopState = () => {
      const fromPath = roomFromPath(window.location.pathname)
      if (fromPath) setRoom(fromPath)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Reset the unlock gate whenever we land on a different document.
  useEffect(() => {
    setPassphrase(rememberedPassphrase(room))
    setPassphraseInput('')
    setAuthError(false)
  }, [room])

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

  function unlock(e: FormEvent) {
    e.preventDefault()
    setAuthError(false)
    setPassphrase(passphraseInput)
  }

  function handleAuthError() {
    sessionStorage.removeItem(`passphrase:${room}`)
    setPassphrase(null)
    setAuthError(true)
  }

  function handleConnected() {
    if (passphrase !== null) {
      sessionStorage.setItem(`passphrase:${room}`, passphrase)
    }
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>Collab Editor</h1>
      </div>
      <div className="doc-bar">
        <span className="doc-id">
          Document: <code>{room}</code>
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => navigator.clipboard.writeText(window.location.href)}
        >
          Copy link
        </button>
        <button type="button" className="btn" onClick={newDocument}>
          New document
        </button>
        <form className="join-form" onSubmit={openDocument}>
          <input
            className="text-input"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Open document id…"
          />
          <button type="submit" className="btn">
            Open
          </button>
        </form>
      </div>
      {passphrase === null ? (
        <form className="unlock-gate" onSubmit={unlock}>
          <p>
            Enter this document's passphrase to continue. If it doesn't have one yet, leave this
            blank or set one now — whatever you enter first becomes its passphrase.
          </p>
          {authError && <p className="error">Incorrect passphrase.</p>}
          <div className="unlock-row">
            <input
              className="text-input"
              type="password"
              value={passphraseInput}
              onChange={(e) => setPassphraseInput(e.target.value)}
              placeholder="Passphrase (optional)"
              autoFocus
            />
            <button type="submit" className="btn">
              Continue
            </button>
          </div>
        </form>
      ) : (
        <Editor
          key={`${room}:${passphrase}`}
          room={room}
          passphrase={passphrase}
          onAuthError={handleAuthError}
          onConnected={handleConnected}
        />
      )}
    </div>
  )
}

export default App
