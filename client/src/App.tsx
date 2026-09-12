import { useCallback, useEffect, useMemo, useState } from 'react'
import ProjectView from './ProjectView'
import Dashboard from './Dashboard'
import JoinInvite from './JoinInvite'
import LandingPage from './LandingPage'
import ResetPasswordPage from './ResetPasswordPage'
import LoginPage from './LoginPage'
import LegalPage from './LegalPage'
import PublicGallery from './PublicGallery'
import { loadDisplayName, loadUserColor, saveDisplayName } from './identity'
import { useTheme } from './useTheme'
import { useAccount } from './account'
import AccountPanel from './AccountPanel'
import NotificationBell from './NotificationBell'
import './App.css'

const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const

const SITE_NAME = 'CodeMesh'
const TAGLINE = 'Real-time collaborative code editor'

// index.html carries the title crawlers and link scrapers read; this keeps
// the browser tab and back-history meaningful once the app is routing on
// the client, where that static title would otherwise stick on every page.
const ROUTE_TITLES: Record<string, string> = {
  gallery: 'Explore',
  login: 'Sign in',
  signup: 'Sign up',
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  'reset-password': 'Reset password',
  join: 'Join project',
  project: 'Project',
}

type Route =
  | { type: 'dashboard' }
  | { type: 'join'; inviteToken: string }
  | { type: 'reset-password'; token: string }
  | { type: 'gallery' }
  | { type: 'login' }
  | { type: 'signup' }
  | { type: 'privacy' }
  | { type: 'terms' }
  | { type: 'project'; id: string }

function parseRoute(pathname: string, search: string): Route {
  const trimmed = pathname.slice(1)
  if (trimmed === '') return { type: 'dashboard' }
  if (trimmed === 'reset-password') {
    return { type: 'reset-password', token: new URLSearchParams(search).get('token') ?? '' }
  }
  if (trimmed === 'explore') return { type: 'gallery' }
  if (trimmed === 'login') return { type: 'login' }
  if (trimmed === 'signup') return { type: 'signup' }
  if (trimmed === 'privacy') return { type: 'privacy' }
  if (trimmed === 'terms') return { type: 'terms' }
  if (trimmed.startsWith('join/'))
    return { type: 'join', inviteToken: trimmed.slice('join/'.length) }
  return { type: 'project', id: trimmed }
}

function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  )
  const [guestFormOpen, setGuestFormOpen] = useState(false)
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
    const section = ROUTE_TITLES[route.type]
    document.title = section
      ? `${section} · ${SITE_NAME}`
      : accountUsername
        ? `Dashboard · ${SITE_NAME}`
        : `${SITE_NAME} — ${TAGLINE}`
  }, [route.type, accountUsername])

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

  const goToGallery = useCallback(() => navigate('/explore'), [navigate])

  const goToLogin = useCallback(() => navigate('/login'), [navigate])

  const goToSignup = useCallback(() => navigate('/signup'), [navigate])
  const goToLegal = useCallback(
    (kind: 'privacy' | 'terms') => navigate(`/${kind}`),
    [navigate],
  )

  // The landing page carries its own footer, and the workspace is a
  // full-height IDE where one would be out of place -- everywhere else had
  // none, which left the legal pages unreachable once signed in.
  const showingLanding = route.type === 'dashboard' && !accountChecking && !accountUsername
  const showFooter = route.type !== 'project' && !showingLanding

  return (
    <div className="app-shell">
      <header className="app-nav">
        <button type="button" className="app-brand" onClick={goToDashboard}>
          <span className="app-brand-mark">◆</span>
          CodeMesh
        </button>
        <div className="app-nav-controls">
          <button type="button" className="btn" onClick={goToGallery}>
            Explore
          </button>
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
            guestName={displayName}
            guestFormOpen={guestFormOpen}
            onGuestFormOpenChange={setGuestFormOpen}
            onGuestNameChange={handleNameChange}
            onLoginClick={goToLogin}
            onLogout={accountLogout}
          />
        </div>
      </header>

      <main className="app-main">
        {route.type === 'privacy' || route.type === 'terms' ? (
          <LegalPage kind={route.type} onBack={goToDashboard} />
        ) : route.type === 'reset-password' ? (
          <ResetPasswordPage token={route.token} onReset={accountResetPassword} onDone={goToDashboard} />
        ) : route.type === 'login' || route.type === 'signup' ? (
          accountUsername && accountToken ? (
            <Dashboard token={accountToken} username={accountUsername} onOpenProject={openProject} />
          ) : (
            <LoginPage
              initialMode={route.type}
              error={accountError}
              onLogin={accountLogin}
              onSignup={accountSignup}
              onRequestPasswordReset={accountRequestPasswordReset}
              onDone={goToDashboard}
            />
          )
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
            <LandingPage onGetStarted={goToSignup} onOpenLegal={goToLegal} />
          )
        ) : route.type === 'join' ? (
          <JoinInvite inviteToken={route.inviteToken} token={accountToken} onJoined={openProject} />
        ) : route.type === 'gallery' ? (
          <PublicGallery onOpenProject={openProject} />
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

      {showFooter && (
        <footer className="app-footer">
          <button type="button" className="link-button" onClick={() => goToLegal('privacy')}>
            Privacy
          </button>
          <button type="button" className="link-button" onClick={() => goToLegal('terms')}>
            Terms
          </button>
        </footer>
      )}
    </div>
  )
}

export default App
