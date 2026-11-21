import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { APP_NAME } from './config'
import type { Meeting } from './types'
import { StoreContext, type StoreValue } from './store-context'
import { useAuth } from './auth'
import { createMeeting as createMeetingRecord, listMeetings } from './services/meeting-service'
import type { MeetingInput } from './services/meeting-service'

export function StoreProvider({ children }: { children: ReactNode }) {
  const { configured, loading: authLoading, user } = useAuth()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('fosshub-theme') === 'dark' ? 'dark' : 'light',
  )
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    if (authLoading) return
    if (!configured || !user?.id) {
      setMeetings([])
      setMeetingsLoading(false)
      return
    }
    setMeetingsLoading(true)
    setDataError('')
    void listMeetings()
      .then((items) => { if (active) setMeetings(items) })
      .catch((error: unknown) => {
        console.error('Unable to load meetings from Supabase.', error)
        if (active) setDataError(error instanceof Error ? error.message : 'Unable to load your meetings.')
      })
      .finally(() => { if (active) setMeetingsLoading(false) })
    return () => { active = false }
  }, [authLoading, configured, user?.id])

  useEffect(() => {
    localStorage.setItem('fosshub-theme', theme)
    document.documentElement.classList.toggle('dark-theme', theme === 'dark')
  }, [theme])

  useEffect(() => {
    document.title = `${APP_NAME} — Learning, in sync`
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  const refreshMeetings = useCallback(async () => {
    setMeetingsLoading(true)
    setDataError('')
    try {
      setMeetings(await listMeetings())
    } catch (error) {
      console.error('Unable to refresh meetings from Supabase.', error)
      const message = error instanceof Error ? error.message : 'Unable to refresh your meetings.'
      setDataError(message)
      throw error
    } finally {
      setMeetingsLoading(false)
    }
  }, [])

  const createMeeting = useCallback(async (input: MeetingInput) => {
    const meeting = await createMeetingRecord(input)
    setMeetings((current) => [meeting, ...current])
    return meeting
  }, [])

  const value = useMemo<StoreValue>(() => ({
    meetings,
    meetingsLoading,
    dataError,
    createMeeting,
    refreshMeetings,
    theme,
    toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light'),
    notify: setNotice,
    notice,
  }), [createMeeting, dataError, meetings, meetingsLoading, notice, refreshMeetings, theme])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

