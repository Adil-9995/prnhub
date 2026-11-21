export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type MeetingRow = {
  id: string
  code: string
  title: string
  host_id: string
  visibility: 'anyone' | 'invited'
  waiting_room: boolean
  participant_mic: boolean
  participant_camera: boolean
  scheduled_for: string | null
  duration_minutes: number | null
  status: 'scheduled' | 'active' | 'ended'
  created_at: string
  ended_at: string | null
}

export type ParticipantRow = {
  id: string
  meeting_id: string
  user_id: string
  display_name: string
  role: 'host' | 'participant'
  status: 'waiting' | 'active' | 'left'
  mic_enabled: boolean
  camera_enabled: boolean
  hand_raised: boolean
  joined_at: string | null
}

export type ChatMessageRow = {
  id: number
  meeting_id: string
  sender_id: string
  display_name: string
  content: string
  created_at: string
}

export type MeetingPreviewRow = {
  meeting_id: string
  code: string
  title: string
  password_required: boolean
  waiting_room: boolean
}

export type JoinedMeeting = {
  meeting_id: string
  participant_id: string
  code: string
  title: string
  role: 'host' | 'participant'
  waiting: boolean
  waiting_room: boolean
  password_required: boolean
}

export type ParticipantStateRow = {
  meeting_id: string
  participant_id: string
  role: 'host' | 'participant'
  status: 'waiting' | 'active'
  display_name: string
  mic_enabled: boolean
  camera_enabled: boolean
  hand_raised: boolean
  code: string
  title: string
  waiting_room: boolean
  participant_mic: boolean
  participant_camera: boolean
}

export interface Database {
  public: {
    Tables: {
      meetings: {
        Row: MeetingRow
        Insert: Partial<MeetingRow>
        Update: Partial<MeetingRow>
        Relationships: []
      }
      meeting_participants: {
        Row: ParticipantRow
        Insert: Partial<ParticipantRow>
        Update: Partial<ParticipantRow>
        Relationships: []
      }
      chat_messages: {
        Row: ChatMessageRow
        Insert: Pick<ChatMessageRow, 'meeting_id' | 'sender_id' | 'display_name' | 'content'>
        Update: never
        Relationships: []
      }
      profiles: {
        Row: { id: string; display_name: string; created_at: string }
        Insert: { id: string; display_name: string }
        Update: { display_name?: string }
        Relationships: []
      }
      meeting_invites: {
        Row: { id: string; meeting_id: string; email: string; created_at: string }
        Insert: { meeting_id: string; email: string }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_meeting: {
        Args: {
          p_code: string
          p_title: string
          p_visibility: 'anyone' | 'invited'
          p_waiting_room: boolean
          p_participant_mic: boolean
          p_participant_camera: boolean
          p_password: string | null
          p_scheduled_for: string | null
          p_duration_minutes: number | null
          p_invited_emails: string[]
        }
        Returns: string
      }
      get_meeting_preview: {
        Args: { p_code: string }
        Returns: MeetingPreviewRow[]
      }
      join_meeting: {
        Args: { p_code: string; p_display_name: string; p_password: string | null }
        Returns: JoinedMeeting
      }
      get_participant_state: {
        Args: { p_code: string }
        Returns: ParticipantStateRow[]
      }
      is_meeting_participant: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      approve_participant: {
        Args: { p_participant_id: string }
        Returns: undefined
      }
      leave_meeting: {
        Args: { p_meeting_id: string }
        Returns: undefined
      }
      end_meeting: {
        Args: { p_meeting_id: string }
        Returns: undefined
      }
      update_participant_state: {
        Args: {
          p_meeting_id: string
          p_mic_enabled: boolean
          p_camera_enabled: boolean
          p_hand_raised: boolean
        }
        Returns: undefined
      }
      send_meeting_message: {
        Args: { p_meeting_id: string; p_content: string }
        Returns: ChatMessageRow
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
