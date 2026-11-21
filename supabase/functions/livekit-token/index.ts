import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in before joining a meeting.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const liveKitUrl = Deno.env.get('LIVEKIT_URL')
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY')
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    console.error('Missing Supabase or LiveKit Edge Function configuration.')
    return respond({ error: 'The meeting service is not configured.' }, 503)
  }
  if (!/^https?:\/\//.test(liveKitUrl)) {
    console.error('LIVEKIT_URL must use the HTTP(S) base URL.')
    return respond({ error: 'The media service URL is invalid.' }, 503)
  }

  let code: string
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('code' in body) || typeof body.code !== 'string') {
      return respond({ error: 'A meeting code is required.' }, 400)
    }
    code = body.code.trim().toLowerCase()
  } catch {
    return respond({ error: 'Invalid request body.' }, 400)
  }
  if (!/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(code)) {
    return respond({ error: 'Invalid meeting code.' }, 400)
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await callerClient.auth.getUser()
  if (authError || !user) return respond({ error: 'Your session is invalid. Sign in again.' }, 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: meeting, error: meetingError } = await adminClient
    .from('meetings')
    .select('id,code,status,scheduled_for')
    .eq('code', code)
    .maybeSingle()
  if (meetingError) {
    console.error('Unable to verify meeting for LiveKit token.', meetingError)
    return respond({ error: 'Could not verify meeting access.' }, 500)
  }
  if (!meeting || meeting.status === 'ended') return respond({ error: 'Meeting not found or ended.' }, 404)
  if (meeting.scheduled_for && new Date(meeting.scheduled_for).getTime() > Date.now()) {
    return respond({ error: 'This meeting has not started yet.' }, 403)
  }

  const { data: participant, error: participantError } = await adminClient
    .from('meeting_participants')
    .select('display_name,status')
    .eq('meeting_id', meeting.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (participantError) {
    console.error('Unable to verify LiveKit participant.', participantError)
    return respond({ error: 'Could not verify meeting access.' }, 500)
  }
  if (!participant || participant.status !== 'active') {
    return respond({ error: participant?.status === 'waiting' ? 'The host has not admitted you yet.' : 'Join this meeting before connecting media.' }, 403)
  }

  const roomService = new RoomServiceClient(liveKitUrl, liveKitApiKey, liveKitApiSecret)
  let rooms = await roomService.listRooms([meeting.code])
  if (rooms.length === 0) {
    try {
      await roomService.createRoom({ name: meeting.code, maxParticipants: 300, emptyTimeout: 300, departureTimeout: 20 })
    } catch (error) {
      rooms = await roomService.listRooms([meeting.code])
      if (rooms.length === 0) {
        console.error('Unable to create the LiveKit room.', error)
        return respond({ error: 'Could not prepare the media room.' }, 503)
      }
    }
    rooms = await roomService.listRooms([meeting.code])
  }
  if (!rooms[0] || rooms[0].maxParticipants !== 300) {
    return respond({ error: 'This LiveKit room is not configured for the FOSSHub 300-participant limit.' }, 503)
  }

  const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: user.id,
    name: participant.display_name,
    ttl: '2h',
  })
  token.addGrant({
    roomJoin: true,
    room: meeting.code,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  return respond({ url: liveKitUrl.replace(/^http/, 'ws'), token: await token.toJwt(), room: meeting.code })
})
