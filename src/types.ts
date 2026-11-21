export type MeetingVisibility = 'anyone' | 'invited'

export interface Meeting {
  id: string
  databaseId: string
  title: string
  hostId: string
  visibility: 'anyone' | 'invited'
  waitingRoom: boolean
  participantMic: boolean
  participantCamera: boolean
  passwordRequired: boolean
  scheduledFor: string | null
  durationMinutes: number | null
  participants: string[]
  status: 'scheduled' | 'active' | 'ended'
  createdAt: string
}

export interface ChatMessage {
  id: number
  senderId: string
  name: string
  text: string
  time: string
  createdAt: string
}
