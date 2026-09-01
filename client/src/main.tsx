import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode is deliberately not used here: its dev-mode effect
// double-invocation raced with y-websocket's automatic reconnect logic
// (which schedules a reconnect unconditionally on close and only checks
// whether it should still be connecting once the timer fires), spawning
// phantom connections that never got cleaned up and left stale presence
// entries behind during manual testing. Confirmed via a production build
// that this never happens for real users -- it was purely a dev artifact
// of StrictMode's intentional mount/cleanup/remount cycle.
createRoot(document.getElementById('root')!).render(<App />)
