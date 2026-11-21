import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, requireSupabase } from './services/supabase'

interface AuthValue {
  configured: boolean
  loading: boolean
  recoveryPending: boolean
  session: Session | null
  user: User | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>
  resendConfirmation: (email: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  ensureGuestSession: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [recoveryPending, setRecoveryPending] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const client = requireSupabase()
    let active = true
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (active) setSession(nextSession)
      if (active && event === 'PASSWORD_RECOVERY') setRecoveryPending(true)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) console.error('Unable to restore the Supabase session.', error)
      setSession(data.session)
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!active) return
      console.error('Unable to restore the Supabase session.', reason)
      setLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(() => ({
    configured: isSupabaseConfigured,
    loading,
    recoveryPending,
    session,
    user: session?.user ?? null,
    signIn: async (email, password) => {
      const { error } = await requireSupabase().auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signUp: async (email, password, displayName) => {
      const { data, error } = await requireSupabase().auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${location.origin}/signin`,
        },
      })
      if (error) throw error
      return Boolean(data.session)
    },
    resendConfirmation: async (email) => {
      const { error } = await requireSupabase().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${location.origin}/signin` },
      })
      if (error) throw error
    },
    signOut: async () => {
      const { error } = await requireSupabase().auth.signOut()
      if (error) throw error
    },
    resetPassword: async (email) => {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/signin` })
      if (error) throw error
    },
    updatePassword: async (password) => {
      const { error } = await requireSupabase().auth.updateUser({ password })
      if (error) throw error
      setRecoveryPending(false)
    },
    ensureGuestSession: async () => {
      const client = requireSupabase()
      const { data: { session: current } } = await client.auth.getSession()
      if (current) return
      const { error } = await client.auth.signInAnonymously()
      if (error) throw error
    },
  }), [loading, recoveryPending, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
