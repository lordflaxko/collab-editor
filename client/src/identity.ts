const USER_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#a78bfa', '#f472b6']

const NAME_KEY = 'collab-editor:display-name'
const COLOR_KEY = 'collab-editor:color'

export function loadDisplayName(): string {
  return localStorage.getItem(NAME_KEY) ?? `User ${Math.floor(Math.random() * 1000)}`
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
