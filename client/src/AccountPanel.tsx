import { useState, type FormEvent } from 'react'

type AccountMode = 'login' | 'signup' | 'forgot'

interface AccountPanelProps {
  username: string | null
  error: string | null
  open: boolean
  mode: AccountMode
  onOpenChange: (open: boolean) => void
  onModeChange: (mode: AccountMode) => void
  onLogin: (username: string, password: string) => Promise<void>
  onSignup: (username: string, password: string, email: string) => Promise<void>
  onRequestPasswordReset: (email: string) => Promise<void>
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
  onRequestPasswordReset,
  onLogout,
}: AccountPanelProps) {
  const [usernameInput, setUsernameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)

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

  function switchMode(next: AccountMode) {
    onModeChange(next)
    setResetRequested(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await onSignup(usernameInput, passwordInput, emailInput)
        onOpenChange(false)
      } else if (mode === 'forgot') {
        await onRequestPasswordReset(emailInput)
        setResetRequested(true)
      } else {
        await onLogin(usernameInput, passwordInput)
        onOpenChange(false)
      }
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
          switchMode('login')
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
          {mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
        </h3>

        {mode === 'forgot' ? (
          resetRequested ? (
            <p className="account-form-note">
              If an account exists for that email, we've sent a link to reset your password.
            </p>
          ) : (
            <input
              className="text-input"
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Email"
              aria-label="Account email"
              autoFocus
            />
          )
        ) : (
          <>
            <input
              className="text-input"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Username"
              aria-label="Account username"
              autoFocus
            />
            {mode === 'signup' && (
              <input
                className="text-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Email"
                aria-label="Account email"
              />
            )}
            <input
              className="text-input"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              aria-label="Account password"
            />
          </>
        )}

        {error && <span className="account-error">{error}</span>}

        {!(mode === 'forgot' && resetRequested) && (
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {mode === 'signup' ? 'Sign up' : mode === 'forgot' ? 'Send reset link' : 'Log in'}
          </button>
        )}

        <div className="account-form-footer">
          {mode === 'login' && (
            <button type="button" className="link-button" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          )}
          {mode !== 'forgot' && (
            <button
              type="button"
              className="link-button"
              onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
            >
              {mode === 'signup' ? 'Have an account? Log in' : "Don't have an account? Sign up"}
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" className="link-button" onClick={() => switchMode('login')}>
              Back to log in
            </button>
          )}
          <button type="button" className="link-button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default AccountPanel
