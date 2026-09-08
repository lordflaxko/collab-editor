import { useState, type FormEvent } from 'react'

interface ResetPasswordPageProps {
  token: string
  onReset: (token: string, password: string) => Promise<void>
  onDone: () => void
}

function ResetPasswordPage({ token, onReset, onDone }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await onReset(token, password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="reset-password-page">
        <div className="unlock-gate">
          <p>This reset link is missing its token. Please use the link from your email.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="reset-password-page">
      <form className="dashboard-form reset-password-form" onSubmit={submit}>
        <h2>Choose a new password</h2>
        <input
          className="text-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
          autoFocus
        />
        <input
          className="text-input"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          aria-label="Confirm new password"
        />
        {error && <div className="format-error">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}

export default ResetPasswordPage
