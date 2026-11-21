import { createClient } from 'npm:@supabase/supabase-js@2'
import { RoomServiceClient } from 'npm:livekit-server-sdk@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond('Method not allowed.', 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return respond('Sign in before ending a meeting.', 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Missing Supabase Edge Function configuration.')
    return respond('The meeting service is not configured.', 503)
  }

  let meetingId: string
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('meetingId' in body) || typeof body.meetingId !== 'string') {
      return respond('A meeting id is required.', 400)
    }
    meetingId = body.meetingId
  } catch {
    return respond('Invalid request body.', 400)
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meetingId)) {
    return respond('Invalid meeting id.', 400)
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await callerClient.auth.getUser()
  if (authError || !user) return respond('Your session is invalid. Sign in again.', 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: meeting, error: meetingError } = await adminClient
    .from('meetings')
    .select('id,code,host_id')
    .eq('id', meetingId)
    .maybeSingle()
  if (meetingError) {
    console.error('Unable to verify meeting host.', meetingError)
    return respond('Could not verify meeting ownership.', 500)
  }
  if (!meeting) return respond('Meeting not found.', 404)
  if (meeting.host_id !== user.id) return respond('Only the meeting host can end it.', 403)

  const { error: endError } = await callerClient.rpc('end_meeting', { p_meeting_id: meeting.id })
  if (endError) return respond(endError.message, 403)

  const liveKitUrl = Deno.env.get('LIVEKIT_URL')
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY')
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    console.error('Meeting is ended in Supabase but LiveKit credentials are missing.')
    return respond('Meeting ended, but the LiveKit room could not be closed because media credentials are missing.', 503)
  }

  try {
    const roomService = new RoomServiceClient(liveKitUrl, liveKitApiKey, liveKitApiSecret)
    const rooms = await roomService.listRooms([meeting.code])
    if (rooms.length > 0) await roomService.deleteRoom(meeting.code)
  } catch (reason) {
    console.error('Meeting is ended in Supabase but the LiveKit room could not be closed.', reason)
    return respond('Meeting ended, but closing the LiveKit room failed. Retry the end-meeting action.', 503)
  }

  return new Response(JSON.stringify({ ended: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
