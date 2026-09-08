const USER_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#a78bfa', '#f472b6']

const NAME_KEY = 'collab-editor:display-name'
const COLOR_KEY = 'collab-editor:color'

// No random default name here -- an unset name means "hasn't chosen to be a
// guest yet", which App.tsx falls back to displaying as "Anonymous" and the
// nav's guest button reflects as an inviting "Continue as guest" rather than
// looking like a name was already picked for them.
export function loadDisplayName(): string {
  return localStorage.getItem(NAME_KEY) ?? ''
}

export function saveDisplayName(name: string) {
  localStorage.setItem(NAME_KEY, name)
}

export function loadUserColor(): string {
  const existing = localStorage.getItem(COLOR_KEY)
  if (existing) return existing
  const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
  localStorage.setItem(COLOR_KEY, color)
  return color
}
