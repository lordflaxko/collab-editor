import { useState, type FormEvent } from 'react'

interface AccountPanelProps {
  username: string | null
  guestName: string
  guestFormOpen: boolean
  onGuestFormOpenChange: (open: boolean) => void
  onGuestNameChange: (name: string) => void
  onLoginClick: () => void
  onLogout: () => void
}

function AccountPanel({
  username,
  guestName,
  guestFormOpen,
  onGuestFormOpenChange,
  onGuestNameChange,
  onLoginClick,
  onLogout,
}: AccountPanelProps) {
  const [guestNameInput, setGuestNameInput] = useState(guestName)

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

  function openGuestForm() {
    setGuestNameInput(guestName)
    onGuestFormOpenChange(true)
  }

  function handleGuestLogout() {
    onGuestNameChange('')
  }

  function submitGuestForm(e: FormEvent) {
    e.preventDefault()
    onGuestNameChange(guestNameInput.trim())
    onGuestFormOpenChange(false)
  }

  function goToLoginInstead() {
    onGuestFormOpenChange(false)
    onLoginClick()
  }

  if (!guestFormOpen) {
    return (
      <>
        {guestName.trim() ? (
          <div className="account-panel">
            <button type="button" className="link-button" onClick={openGuestForm}>
              Guest: {guestName.trim()}
            </button>
            <button type="button" className="btn btn-small" onClick={handleGuestLogout}>
              Log out
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-small" onClick={openGuestForm}>
            Continue as guest
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onLoginClick}>
          Log in
        </button>
      </>
    )
  }

  return (
    <div className="account-form-anchor">
      <form className="account-form" onSubmit={submitGuestForm}>
        <h3 className="account-form-title">Continue as a guest</h3>
        <input
          className="text-input"
          value={guestNameInput}
          onChange={(e) => setGuestNameInput(e.target.value)}
          placeholder="Your name"
          aria-label="Guest name"
          autoFocus
        />
        <button type="submit" className="btn btn-primary">
          Continue as guest
        </button>
        <div className="account-form-footer">
          <button type="button" className="link-button" onClick={goToLoginInstead}>
            Log in instead
          </button>
          <button type="button" className="link-button" onClick={() => onGuestFormOpenChange(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default AccountPanel
