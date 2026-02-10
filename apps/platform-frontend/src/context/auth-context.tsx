import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, login as loginApi, logout as logoutApi, register as registerApi } from '@/service/api/auth-api'
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from '@/service/auth-storage'
import type { AuthUser } from '@/service/api/auth-api'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

const AUTH_ENABLED =
  import.meta.env.VITE_AUTH_ENABLED !== 'false' && import.meta.env.VITE_AUTH_ENABLED !== '0'

const AUTH_DISABLED_USER: AuthUser = {
  id: 'auth-disabled',
  email: 'auth-disabled@local',
  name: 'Auth Disabled',
  avatarUrl: null,
  role: 'admin',
}

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login: (email: string, password: string, remember: boolean) => Promise<AuthUser>
  register: (name: string, email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let isActive = true

    const bootstrap = async () => {
      if (!AUTH_ENABLED) {
        if (isActive) {
          setUser(AUTH_DISABLED_USER)
          setStatus('authenticated')
        }
        return
      }

      const token = getStoredAuthToken()
      if (!token) {
        if (isActive) {
          setStatus('unauthenticated')
        }
        return
      }

      try {
        const currentUser = await getCurrentUser(token)
        if (!isActive) return
        setUser(currentUser)
        setStatus('authenticated')
      } catch {
        if (!isActive) return
        clearStoredAuthToken()
        setUser(null)
        setStatus('unauthenticated')
      }
    }

    void bootstrap()

    return () => {
      isActive = false
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (email: string, password: string, remember: boolean) => {
        if (!AUTH_ENABLED) {
          setUser(AUTH_DISABLED_USER)
          setStatus('authenticated')
          return AUTH_DISABLED_USER
        }

        const response = await loginApi(email, password)
        setStoredAuthToken(response.token, remember)
        setUser(response.user)
        setStatus('authenticated')
        return response.user
      },
      register: async (name: string, email: string, password: string) => {
        if (!AUTH_ENABLED) {
          setUser(AUTH_DISABLED_USER)
          setStatus('authenticated')
          return AUTH_DISABLED_USER
        }

        const response = await registerApi(name, email, password)
        setStoredAuthToken(response.token, true)
        setUser(response.user)
        setStatus('authenticated')
        return response.user
      },
      logout: async () => {
        if (!AUTH_ENABLED) {
          return
        }

        await logoutApi().catch(() => undefined)
        clearStoredAuthToken()
        setUser(null)
        setStatus('unauthenticated')
      },
    }),
    [user, status]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
