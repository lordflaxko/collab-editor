import { useState, type FormEvent } from 'react'

interface AccountPanelProps {
  username: string | null
  error: string | null
  onLogin: (username: string, password: string) => Promise<void>
  onSignup: (username: string, password: string) => Promise<void>
  onLogout: () => void
}

function AccountPanel({ username, error, onLogin, onSignup, onLogout }: AccountPanelProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (username) {
    return (
      <div className="account-panel">
        <span className="account-status">Signed in as {username}</span>
        <button type="button" className="btn btn-small" onClick={onLogout}>
          Log out
        </button>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await onSignup(usernameInput, passwordInput)
      } else {
        await onLogin(usernameInput, passwordInput)
      }
      setOpen(false)
      setPasswordInput('')
    } catch {
      // error is surfaced via the `error` prop
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => {
          setMode('login')
          setOpen(true)
        }}
      >
        Log in
      </button>
    )
  }

  return (
    <form className="account-panel account-form" onSubmit={submit}>
      <input
        className="text-input"
        value={usernameInput}
        onChange={(e) => setUsernameInput(e.target.value)}
        placeholder="Username"
        aria-label="Account username"
        autoFocus
      />
      <input
        className="text-input"
        type="password"
        value={passwordInput}
        onChange={(e) => setPasswordInput(e.target.value)}
        placeholder="Password"
        aria-label="Account password"
      />
      <button type="submit" className="btn" disabled={submitting}>
        {mode === 'signup' ? 'Sign up' : 'Log in'}
      </button>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
      >
        {mode === 'signup' ? 'Have an account?' : 'Sign up instead'}
      </button>
      <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span className="account-error">{error}</span>}
    </form>
  )
}

export default AccountPanel
