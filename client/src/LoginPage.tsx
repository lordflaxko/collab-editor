import { useState, type FormEvent } from 'react'

type AuthMode = 'login' | 'signup' | 'forgot'

interface LoginPageProps {
  initialMode: 'login' | 'signup'
  error: string | null
  onLogin: (username: string, password: string) => Promise<void>
  onSignup: (username: string, password: string, email: string) => Promise<void>
  onRequestPasswordReset: (email: string) => Promise<void>
  onDone: () => void
}

function LoginPage({ initialMode, error, onLogin, onSignup, onRequestPasswordReset, onDone }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [usernameInput, setUsernameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)

  function switchMode(next: AuthMode) {
    setMode(next)
    setResetRequested(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await onSignup(usernameInput, passwordInput, emailInput)
        onDone()
      } else if (mode === 'forgot') {
        await onRequestPasswordReset(emailInput)
        setResetRequested(true)
      } else {
        await onLogin(usernameInput, passwordInput)
        onDone()
      }
      setPasswordInput('')
    } catch {
      // error is surfaced via the `error` prop
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="reset-password-page">
      <form className="dashboard-form reset-password-form login-form" onSubmit={submit}>
        <h2>
          {mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
        </h2>

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
          {(mode === 'login' || mode === 'signup') && (
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
        </div>
      </form>
    </div>
  )
}

export default LoginPage
