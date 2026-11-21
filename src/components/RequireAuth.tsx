import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { APP_NAME } from '../config'

export function RequireAuth({ children, registered = false }: { children: ReactNode; registered?: boolean }) {
  const { configured, loading, user } = useAuth()
  if (loading) return <div className="loading-screen" role="status"><span className="loading-spinner" />Checking session…</div>
  if (!configured) {
    return (
      <section className="form-card setup-required" role="alert">
        <span className="eyebrow">{APP_NAME} setup</span>
        <h1>Connect Supabase to continue</h1>
        <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart the dev server.</p>
        <Link className="btn btn-secondary" to="/">Back to home</Link>
      </section>
    )
  }
  if (!user) return <Navigate to="/signin" replace />
  if (registered && user.is_anonymous) return <Navigate to="/signup" replace />
  return children
}
