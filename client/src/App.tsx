import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import ProjectView from './ProjectView'
import Dashboard from './Dashboard'
import JoinInvite from './JoinInvite'
import LandingPage from './LandingPage'
import ResetPasswordPage from './ResetPasswordPage'
import { loadDisplayName, loadUserColor, saveDisplayName } from './identity'
import { useTheme } from './useTheme'
import { useAccount } from './account'
import AccountPanel from './AccountPanel'
import NotificationBell from './NotificationBell'
import './App.css'

const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const

type Route =
  | { type: 'dashboard' }
  | { type: 'join'; inviteToken: string }
  | { type: 'reset-password'; token: string }
  | { type: 'project'; id: string }

function parseRoute(pathname: string, search: string): Route {
  const trimmed = pathname.slice(1)
  if (trimmed === '') return { type: 'dashboard' }
  if (trimmed === 'reset-password') {
    return { type: 'reset-password', token: new URLSearchParams(search).get('token') ?? '' }
  }
  if (trimmed.startsWith('join/'))
    return { type: 'join', inviteToken: trimmed.slice('join/'.length) }
  return { type: 'project', id: trimmed }
}

function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  )
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [accountFormMode, setAccountFormMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [displayName, setDisplayName] = useState(() => loadDisplayName())
  const userColor = useMemo(() => loadUserColor(), [])
  const { preference: themePreference, isDark, cyclePreference } = useTheme()
  const {
    username: accountUsername,
    token: accountToken,
    checking: accountChecking,
    error: accountError,
    signup: accountSignup,
    login: accountLogin,
    logout: accountLogout,
    requestPasswordReset: accountRequestPasswordReset,
    resetPassword: accountResetPassword,
  } = useAccount()
  const user = useMemo(
    () => ({
      name: accountUsername ?? (displayName.trim() || 'Anonymous'),
      color: userColor,
    }),
    [accountUsername, displayName, userColor],
  )

  function handleNameChange(name: string) {
    setDisplayName(name)
    saveDisplayName(name)
  }

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname, window.location.search))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Passed down through ProjectView into Workspace, whose connection effect
  // depends on this reference -- an unstable one would tear down and
  // reconnect the WebSocket on every unrelated App re-render, not just on
  // real navigation.
  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path)
    setRoute(parseRoute(path, window.location.search))
  }, [])

  const goToDashboard = useCallback(() => navigate('/'), [navigate])

  const openProject = useCallback((id: string) => navigate(`/${id}`), [navigate])

  const openSignup = useCallback(() => {
    setAccountFormMode('signup')
    setAccountFormOpen(true)
  }, [])

  return (
    <div className="app-shell">
      <header className="app-nav">
        <button type="button" className="app-brand" onClick={goToDashboard}>
          <span className="app-brand-mark">◆</span>
          Collab Editor
        </button>
        <div className="app-nav-controls">
          <input
            className="text-input app-name-input"
            value={accountUsername ?? displayName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            disabled={accountUsername !== null}
            title={
              accountUsername !== null ? 'Signed in: your account name is used instead' : undefined
            }
            style={{ '--dot-color': userColor } as CSSProperties}
          />
          <NotificationBell token={accountToken} onOpenRoom={openProject} />
          <button
            type="button"
            className="btn"
            onClick={cyclePreference}
            title="Cycle theme: Auto → Light → Dark"
          >
            Theme: {THEME_LABEL[themePreference]}
          </button>
          <AccountPanel
            username={accountUsername}
            error={accountError}
            open={accountFormOpen}
            mode={accountFormMode}
            onOpenChange={setAccountFormOpen}
            onModeChange={setAccountFormMode}
            onSignup={accountSignup}
            onLogin={accountLogin}
            onRequestPasswordReset={accountRequestPasswordReset}
            onLogout={accountLogout}
          />
        </div>
      </header>

      <main className="app-main">
        {route.type === 'reset-password' ? (
          <ResetPasswordPage token={route.token} onReset={accountResetPassword} onDone={goToDashboard} />
        ) : accountChecking ? (
          <div className="sc-loading">Loading…</div>
        ) : route.type === 'dashboard' ? (
          accountUsername && accountToken ? (
            <Dashboard
              token={accountToken}
              username={accountUsername}
              onOpenProject={openProject}
            />
          ) : (
            <LandingPage onGetStarted={openSignup} />
          )
        ) : route.type === 'join' ? (
          <JoinInvite inviteToken={route.inviteToken} token={accountToken} onJoined={openProject} />
        ) : (
          <ProjectView
            projectId={route.id}
            token={accountToken}
            user={user}
            isDark={isDark}
            onGoToDashboard={goToDashboard}
          />
        )}
      </main>
    </div>
  )
}

export default App
