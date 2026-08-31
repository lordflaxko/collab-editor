import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme-preference'

function loadPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadPreference)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    if (preference === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.dataset.theme = preference
    }
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const cyclePreference = useCallback(() => {
    setPreference(preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system')
  }, [preference, setPreference])

  const isDark = preference === 'system' ? systemDark : preference === 'dark'

  return { preference, isDark, setPreference, cyclePreference }
}
