import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  LayoutDashboard,
  Menu,
  Moon,
  LogOut,
  Settings,
  Video,
  X,
} from 'lucide-react'
import { APP_NAME } from '../config'
import { useStore } from '../store-context'
import { useAuth } from '../auth'

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/create', label: 'New meeting', icon: Video },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
]

export function AppShell() {
  const [open, setOpen] = useState(false)
  const { toggleTheme, theme, notify } = useStore()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const title = location.pathname.startsWith('/meeting') ? 'Meeting room' : 'Workspace'
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Guest'
  const initials = displayName.slice(0, 2).toUpperCase()
  const logout = async () => {
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (reason) {
      console.error('Unable to sign out.', reason)
      notify(reason instanceof Error ? reason.message : 'Could not sign out.')
    }
  }

  return (
    <div className="app-shell">
      <button className={`mobile-backdrop ${open ? 'visible' : ''}`} aria-label="Close navigation" onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink className="brand" to="/dashboard" onClick={() => setOpen(false)}>
          <span className="brand-mark"><Video size={18} strokeWidth={2.5} /></span>
          <span>{APP_NAME}</span>
        </NavLink>
        <div className="sidebar-section">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setOpen(false)}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <Settings size={17} />Settings
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip">
            <span className="avatar">{initials}</span>
            <div className="user-meta"><strong>{displayName}</strong><span>{user?.is_anonymous ? 'Guest session' : 'FOSSHub account'}</span></div>
            <button className="icon-button" aria-label="Sign out" onClick={() => void logout()}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <NavLink className="brand mobile-brand" to="/dashboard"><span className="brand-mark"><Video size={17} /></span>{APP_NAME}</NavLink>
          <span className="eyebrow" style={{ marginRight: 'auto', marginLeft: 16 }}>{title}</span>
          <button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={toggleTheme}>
            <Moon size={17} />
          </button>
          <span className="avatar" aria-label={`${displayName} profile`}>{initials}</span>
        </header>
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  )
}
