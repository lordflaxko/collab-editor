import { useCallback, useEffect, useState } from 'react'
import { postJson } from './api'

const TOKEN_KEY = 'account-token'

export function useAccount() {
  const [username, setUsername] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setChecking(false)
      return
    }
    postJson('/auth/me', { token: stored })
      .then((data) => {
        setUsername(data.username)
        setToken(stored)
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setChecking(false))
  }, [])

  const signup = useCallback(async (name: string, password: string) => {
    setError(null)
    try {
      const data = await postJson('/auth/signup', { username: name, password })
      localStorage.setItem(TOKEN_KEY, data.token)
      setUsername(data.username)
      setToken(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
      throw err
    }
  }, [])

  const login = useCallback(async (name: string, password: string) => {
    setError(null)
    try {
      const data = await postJson('/auth/login', { username: name, password })
      localStorage.setItem(TOKEN_KEY, data.token)
      setUsername(data.username)
      setToken(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
    setUsername(null)
    setToken(null)
    if (stored) postJson('/auth/logout', { token: stored }).catch(() => {})
  }, [])

  return { username, token, checking, error, signup, login, logout }
}
