import { useState, type FormEvent } from 'react'

interface AccountPanelProps {
  username: string | null
  error: string | null
  open: boolean
  mode: 'login' | 'signup'
  onOpenChange: (open: boolean) => void
  onModeChange: (mode: 'login' | 'signup') => void
  onLogin: (username: string, password: string) => Promise<void>
  onSignup: (username: string, password: string) => Promise<void>
  onLogout: () => void
}

function AccountPanel({
  username,
  error,
  open,
  mode,
  onOpenChange,
  onModeChange,
  onLogin,
  onSignup,
  onLogout,
}: AccountPanelProps) {
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
      onOpenChange(false)
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
        className="btn btn-primary"
        onClick={() => {
          onModeChange('login')
          onOpenChange(true)
        }}
      >
        Log in
      </button>
    )
  }

  return (
    <div className="account-form-anchor">
      <form className="account-form" onSubmit={submit}>
        <h3 className="account-form-title">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h3>
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
        {error && <span className="account-error">{error}</span>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {mode === 'signup' ? 'Sign up' : 'Log in'}
        </button>
        <div className="account-form-footer">
          <button
            type="button"
            className="link-button"
            onClick={() => onModeChange(mode === 'signup' ? 'login' : 'signup')}
          >
            {mode === 'signup' ? 'Have an account? Log in' : "Don't have an account? Sign up"}
          </button>
          <button type="button" className="link-button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default AccountPanel
