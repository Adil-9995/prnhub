import { createContext, useContext } from 'react'
import type { Meeting } from './types'
import type { MeetingInput } from './services/meeting-service'

export interface StoreValue {
  meetings: Meeting[]
  meetingsLoading: boolean
  dataError: string
  createMeeting: (meeting: MeetingInput) => Promise<Meeting>
  refreshMeetings: () => Promise<void>
  theme: 'light' | 'dark'
  toggleTheme: () => void
  notify: (message: string) => void
  notice: string
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore must be used within StoreProvider')
  return context
}
