import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import Workspace from './Workspace'
import { loadDisplayName, loadUserColor, saveDisplayName } from './identity'
import { useTheme } from './useTheme'
import { useAccount } from './account'
import AccountPanel from './AccountPanel'
import NotificationBell from './NotificationBell'
import './App.css'

const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const

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
  const [displayName, setDisplayName] = useState(() => loadDisplayName())
  const userColor = useMemo(() => loadUserColor(), [])
  const { preference: themePreference, isDark, cyclePreference } = useTheme()
  const {
    username: accountUsername,
    token: accountToken,
    error: accountError,
    signup: accountSignup,
    login: accountLogin,
    logout: accountLogout,
  } = useAccount()
  const user = useMemo(
    () => ({ name: accountUsername ?? (displayName.trim() || 'Anonymous'), color: userColor }),
    [accountUsername, displayName, userColor],
  )

  function handleNameChange(name: string) {
    setDisplayName(name)
    saveDisplayName(name)
  }

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

  function openRoom(id: string) {
    window.history.pushState(null, '', `/${id}`)
    setRoom(id)
  }

  function newDocument() {
    openRoom(generateRoomId())
  }

  function openDocument(e: FormEvent) {
    e.preventDefault()
    const id = joinInput.trim()
    if (!id) return
    openRoom(id)
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
        <input
          className="text-input"
          value={accountUsername ?? displayName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          disabled={accountUsername !== null}
          title={accountUsername !== null ? 'Signed in: your account name is used instead' : undefined}
          style={{ '--dot-color': userColor } as CSSProperties}
        />
        <AccountPanel
          username={accountUsername}
          error={accountError}
          onSignup={accountSignup}
          onLogin={accountLogin}
          onLogout={accountLogout}
        />
        <NotificationBell token={accountToken} onOpenRoom={openRoom} />
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
        <button
          type="button"
          className="btn"
          onClick={cyclePreference}
          title="Cycle theme: Auto → Light → Dark"
        >
          Theme: {THEME_LABEL[themePreference]}
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
        <Workspace
          key={`${room}:${passphrase}`}
          room={room}
          passphrase={passphrase}
          user={user}
          isDark={isDark}
          onAuthError={handleAuthError}
          onConnected={handleConnected}
        />
      )}
    </div>
  )
}

export default App
