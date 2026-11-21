import { WebhookReceiver } from 'npm:livekit-server-sdk@2'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !apiSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('Missing LiveKit webhook or Supabase configuration.')
    return new Response('Webhook service is not configured', { status: 503 })
  }

  const authorization = request.headers.get('Authorization')
  const body = await request.text()
  let event
  try {
    event = await new WebhookReceiver(apiKey, apiSecret).receive(body, authorization ?? '')
  } catch (reason) {
    console.error('Rejected invalid LiveKit webhook signature.', reason)
    return new Response('Invalid webhook signature', { status: 401 })
  }

  if (event.event !== 'participant_left' || !event.room?.name || !event.participant?.identity) {
    return new Response('ok')
  }

  const disconnectedAt = new Date(Number(event.createdAt) * 1000).toISOString()
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: meeting, error: meetingError } = await adminClient
    .from('meetings')
    .select('id')
    .eq('code', event.room.name)
    .maybeSingle()
  if (meetingError) {
    console.error('Could not locate meeting for LiveKit disconnect event.', meetingError)
    return new Response('Could not process webhook', { status: 500 })
  }
  if (!meeting) return new Response('ok')

  const { error: updateError } = await adminClient
    .from('meeting_participants')
    .update({ status: 'left', left_at: disconnectedAt, hand_raised: false })
    .eq('meeting_id', meeting.id)
    .eq('user_id', event.participant.identity)
    .eq('status', 'active')
    .lte('joined_at', disconnectedAt)
  if (updateError) {
    console.error('Could not mark disconnected LiveKit participant as left.', updateError)
    return new Response('Could not process webhook', { status: 500 })
  }

  return new Response('ok')
})
