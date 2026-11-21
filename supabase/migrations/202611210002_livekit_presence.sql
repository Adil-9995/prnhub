create or replace function public.get_participant_state(p_code text)
returns table (
  meeting_id uuid,
  participant_id uuid,
  role text,
  status text,
  display_name text,
  mic_enabled boolean,
  camera_enabled boolean,
  hand_raised boolean,
  code text,
  title text,
  waiting_room boolean,
  participant_mic boolean,
  participant_camera boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.meeting_id,
    p.id,
    p.role,
    p.status,
    p.display_name,
    p.mic_enabled,
    p.camera_enabled,
    p.hand_raised,
    m.code,
    m.title,
    m.waiting_room,
    m.participant_mic,
    m.participant_camera
  from public.meeting_participants p
  join public.meetings m on m.id = p.meeting_id
  where m.code = lower(trim(p_code))
    and p.user_id = auth.uid()
    and p.status in ('waiting', 'active');
$$;

create or replace function public.update_participant_state(
  p_meeting_id uuid,
  p_mic_enabled boolean,
  p_camera_enabled boolean,
  p_hand_raised boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.meeting_participants
  set mic_enabled = p_mic_enabled, camera_enabled = p_camera_enabled, hand_raised = p_hand_raised
  where meeting_id = p_meeting_id and user_id = auth.uid() and status in ('active', 'waiting');
  if not found then
    raise exception 'Meeting participant not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.is_meeting_participant(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.meeting_participants p
    where p.meeting_id = p_meeting_id
      and p.user_id = auth.uid()
      and p.status in ('active', 'left')
  );
$$;

create or replace function public.broadcast_participant_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  v_topic text;
begin
  v_topic := case
    when new.status = 'waiting' or (tg_op = 'UPDATE' and old.status = 'waiting' and new.status = 'left')
      then 'meeting-host:' || new.meeting_id::text
    else 'meeting:' || new.meeting_id::text
  end;
  perform realtime.broadcast_changes(
    v_topic,
    'participant_change',
    tg_op,
    'public',
    'meeting_participants',
    new,
    old
  );
  return new;
end;
$$;

drop trigger if exists on_meeting_participant_changed on public.meeting_participants;
create trigger on_meeting_participant_changed
  after insert or update on public.meeting_participants
  for each row execute function public.broadcast_participant_change();

drop policy if exists "meeting members can join private realtime topics" on realtime.messages;
create policy "meeting members can join private realtime topics" on realtime.messages
  for select to authenticated using (
    (
      split_part(realtime.topic(), ':', 1) = 'meeting'
      and (
        exists (
          select 1
          from public.meeting_participants p
          where p.meeting_id::text = split_part(realtime.topic(), ':', 2)
            and p.user_id = auth.uid()
            and p.status = 'active'
        )
        or exists (
          select 1
          from public.meetings m
          where m.id::text = split_part(realtime.topic(), ':', 2)
            and m.host_id = auth.uid()
        )
      )
    )
    or (
      split_part(realtime.topic(), ':', 1) = 'meeting-host'
      and exists (
        select 1
        from public.meetings m
        where m.id::text = split_part(realtime.topic(), ':', 2)
          and m.host_id = auth.uid()
      )
    )
  );

revoke all on function public.get_participant_state(text) from public, anon;
revoke all on function public.is_meeting_participant(uuid) from public, anon;
revoke all on function public.broadcast_participant_change() from public, anon, authenticated;
grant execute on function public.get_participant_state(text) to authenticated;
grant execute on function public.is_meeting_participant(uuid) to authenticated;

create policy "participants can read meeting history" on public.meetings
  for select to authenticated using (public.is_meeting_participant(id));
