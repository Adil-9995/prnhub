create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$'),
  title text not null check (char_length(title) between 3 and 120),
  host_id uuid not null references auth.users(id) on delete restrict,
  visibility text not null check (visibility in ('anyone', 'invited')),
  waiting_room boolean not null default true,
  participant_mic boolean not null default false,
  participant_camera boolean not null default true,
  password_hash text,
  scheduled_for timestamptz,
  duration_minutes integer check (duration_minutes between 5 and 480),
  status text not null default 'active' check (status in ('scheduled', 'active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.meeting_invites (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  created_at timestamptz not null default now(),
  unique (meeting_id, email)
);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'participant' check (role in ('host', 'participant')),
  status text not null default 'active' check (status in ('waiting', 'active', 'left')),
  mic_enabled boolean not null default false,
  camera_enabled boolean not null default false,
  hand_raised boolean not null default false,
  joined_at timestamptz,
  left_at timestamptz,
  unique (meeting_id, user_id)
);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists meetings_host_created_idx on public.meetings (host_id, created_at desc);
create index if not exists meetings_schedule_idx on public.meetings (scheduled_for) where status = 'scheduled';
create index if not exists meeting_invites_email_idx on public.meeting_invites (lower(email), meeting_id);
create index if not exists meeting_participants_member_idx on public.meeting_participants (meeting_id, status, joined_at);
create index if not exists meeting_participants_user_idx on public.meeting_participants (user_id, status);
create index if not exists chat_messages_meeting_cursor_idx on public.chat_messages (meeting_id, id desc);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_prnhub on auth.users;
create trigger on_auth_user_created_prnhub
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1), 'Member')
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_active_meeting_member(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meeting_participants p
    where p.meeting_id = p_meeting_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  );
$$;

create or replace function public.is_meeting_host(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id and m.host_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_invites enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.chat_messages enable row level security;

create policy "profile owner can read" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profile owner can update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "meeting members can read meeting" on public.meetings
  for select to authenticated using (
    host_id = auth.uid() or public.is_active_meeting_member(id)
  );
create policy "host can read invites" on public.meeting_invites
  for select to authenticated using (public.is_meeting_host(meeting_id));
create policy "meeting members can read participants" on public.meeting_participants
  for select to authenticated using (
    status = 'active'
    and (user_id = auth.uid() or public.is_active_meeting_member(meeting_id) or public.is_meeting_host(meeting_id))
    or public.is_meeting_host(meeting_id)
  );
create policy "meeting members can read chat" on public.chat_messages
  for select to authenticated using (public.is_active_meeting_member(meeting_id));

revoke all on public.profiles, public.meetings, public.meeting_invites, public.meeting_participants, public.chat_messages from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.meetings to authenticated;
grant select on public.meeting_invites, public.meeting_participants, public.chat_messages to authenticated;

create or replace function public.create_meeting(
  p_code text,
  p_title text,
  p_visibility text,
  p_waiting_room boolean,
  p_participant_mic boolean,
  p_participant_camera boolean,
  p_password text,
  p_scheduled_for timestamptz,
  p_duration_minutes integer,
  p_invited_emails text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'A registered account is required to create meetings' using errcode = '42501';
  end if;
  if p_code !~ '^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$' then
    raise exception 'Invalid meeting code' using errcode = '22023';
  end if;
  if p_password is not null and char_length(p_password) > 128 then
    raise exception 'Meeting password is too long' using errcode = '22023';
  end if;

  insert into public.meetings (
    code, title, host_id, visibility, waiting_room, participant_mic,
    participant_camera, password_hash, scheduled_for, duration_minutes, status
  ) values (
    p_code, trim(p_title), v_user_id, p_visibility, p_waiting_room,
    p_participant_mic, p_participant_camera,
    case when nullif(p_password, '') is null then null else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
    p_scheduled_for, p_duration_minutes,
    case when p_scheduled_for is null then 'active' else 'scheduled' end
  ) returning id into v_id;

  insert into public.meeting_participants (meeting_id, user_id, display_name, role, status, mic_enabled, camera_enabled, joined_at)
  select v_id, v_user_id, p.display_name, 'host', 'active', p_participant_mic, p_participant_camera, now()
  from public.profiles p where p.id = v_user_id;

  insert into public.meeting_invites (meeting_id, email)
  select v_id, lower(trim(email))
  from unnest(coalesce(p_invited_emails, '{}')) as invite(email)
  where trim(invite.email) <> ''
  on conflict (meeting_id, email) do nothing;
  return v_id;
end;
$$;

create or replace function public.get_meeting_preview(p_code text)
returns table (meeting_id uuid, code text, title text, password_required boolean, waiting_room boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.code, m.title, (m.password_hash is not null), m.waiting_room
  from public.meetings m
  where m.code = lower(trim(p_code)) and m.status <> 'ended';
$$;

create or replace function public.join_meeting(p_code text, p_display_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_meeting public.meetings%rowtype;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_participant public.meeting_participants%rowtype;
  v_waiting boolean;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Sign in or join as a guest before joining this meeting' using errcode = '42501';
  end if;
  if char_length(trim(p_display_name)) not between 1 and 80 then
    raise exception 'Display name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  select * into v_meeting
  from public.meetings m
  where m.code = lower(trim(p_code))
  for update;
  if not found or v_meeting.status = 'ended' then
    raise exception 'Meeting not found or already ended' using errcode = 'P0002';
  end if;
  if v_meeting.scheduled_for is not null and v_meeting.scheduled_for > now() then
    raise exception 'Meeting has not started yet' using errcode = 'P0001';
  end if;
  if v_meeting.visibility = 'invited' and v_meeting.host_id <> v_user_id
    and not exists (select 1 from public.meeting_invites i where i.meeting_id = v_meeting.id and i.email = v_email) then
    raise exception 'This meeting is limited to invited people' using errcode = '42501';
  end if;
  if v_meeting.password_hash is not null and (
    p_password is null or extensions.crypt(p_password, v_meeting.password_hash) <> v_meeting.password_hash
  ) then
    raise exception 'Incorrect meeting password' using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.meeting_participants p
  where p.meeting_id = v_meeting.id and p.status in ('active', 'waiting');
  if v_count >= 300 and not exists (
    select 1 from public.meeting_participants p
    where p.meeting_id = v_meeting.id and p.user_id = v_user_id and p.status in ('active', 'waiting')
  ) then
    raise exception 'This meeting has reached its 300 participant limit' using errcode = '54000';
  end if;

  v_waiting := v_meeting.waiting_room and v_meeting.host_id <> v_user_id;
  insert into public.meeting_participants (meeting_id, user_id, display_name, role, status, mic_enabled, camera_enabled, joined_at, left_at)
  values (
    v_meeting.id, v_user_id, trim(p_display_name),
    case when v_meeting.host_id = v_user_id then 'host' else 'participant' end,
    case when v_waiting then 'waiting' else 'active' end,
    v_meeting.participant_mic, v_meeting.participant_camera, now(), null
  )
  on conflict (meeting_id, user_id) do update set
    display_name = excluded.display_name,
    status = excluded.status,
    mic_enabled = excluded.mic_enabled,
    camera_enabled = excluded.camera_enabled,
    joined_at = now(),
    left_at = null
  returning * into v_participant;

  return jsonb_build_object(
    'meeting_id', v_meeting.id,
    'participant_id', v_participant.id,
    'code', v_meeting.code,
    'title', v_meeting.title,
    'role', v_participant.role,
    'waiting', v_waiting,
    'waiting_room', v_meeting.waiting_room,
    'password_required', v_meeting.password_hash is not null
  );
end;
$$;

create or replace function public.approve_participant(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meeting_id uuid;
begin
  select p.meeting_id into v_meeting_id
  from public.meeting_participants p where p.id = p_participant_id;
  if v_meeting_id is null or not public.is_meeting_host(v_meeting_id) then
    raise exception 'Only the meeting host can admit participants' using errcode = '42501';
  end if;
  update public.meeting_participants
  set status = 'active', joined_at = now()
  where id = p_participant_id and status = 'waiting';
end;
$$;

create or replace function public.leave_meeting(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.meeting_participants
  set status = 'left', left_at = now(), hand_raised = false
  where meeting_id = p_meeting_id and user_id = auth.uid() and status <> 'left';
end;
$$;

create or replace function public.end_meeting(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_meeting_host(p_meeting_id) then
    raise exception 'Only the meeting host can end this meeting' using errcode = '42501';
  end if;
  update public.meetings set status = 'ended', ended_at = now() where id = p_meeting_id and status <> 'ended';
  update public.meeting_participants set status = 'left', left_at = now(), hand_raised = false
  where meeting_id = p_meeting_id and status in ('active', 'waiting');
end;
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

create or replace function public.send_meeting_message(p_meeting_id uuid, p_content text)
returns public.chat_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_message public.chat_messages%rowtype;
begin
  if char_length(trim(p_content)) not between 1 and 2000 then
    raise exception 'Message must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  select display_name into v_name from public.meeting_participants
  where meeting_id = p_meeting_id and user_id = auth.uid() and status = 'active';
  if v_name is null then
    raise exception 'You are not an active participant in this meeting' using errcode = '42501';
  end if;
  insert into public.chat_messages (meeting_id, sender_id, display_name, content)
  values (p_meeting_id, auth.uid(), v_name, trim(p_content))
  returning * into v_message;
  return v_message;
end;
$$;

create or replace function public.broadcast_meeting_message()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.broadcast_changes(
    'meeting:' || new.meeting_id::text,
    'chat_message',
    'INSERT',
    'public',
    'chat_messages',
    new,
    null
  );
  return new;
end;
$$;

drop trigger if exists on_meeting_message_created on public.chat_messages;
create trigger on_meeting_message_created
  after insert on public.chat_messages
  for each row execute function public.broadcast_meeting_message();

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.is_active_meeting_member(uuid) from public, anon;
revoke all on function public.is_meeting_host(uuid) from public, anon;
revoke all on function public.create_meeting(text, text, text, boolean, boolean, boolean, text, timestamptz, integer, text[]) from public, anon;
revoke all on function public.get_meeting_preview(text) from public;
revoke all on function public.join_meeting(text, text, text) from public, anon;
revoke all on function public.approve_participant(uuid) from public, anon;
revoke all on function public.leave_meeting(uuid) from public, anon;
revoke all on function public.end_meeting(uuid) from public, anon;
revoke all on function public.update_participant_state(uuid, boolean, boolean, boolean) from public, anon;
revoke all on function public.send_meeting_message(uuid, text) from public, anon;
revoke all on function public.broadcast_meeting_message() from public, anon, authenticated;
grant execute on function public.is_active_meeting_member(uuid) to authenticated;
grant execute on function public.is_meeting_host(uuid) to authenticated;
grant execute on function public.create_meeting(text, text, text, boolean, boolean, boolean, text, timestamptz, integer, text[]) to authenticated;
grant execute on function public.get_meeting_preview(text) to anon, authenticated;
grant execute on function public.join_meeting(text, text, text) to authenticated;
grant execute on function public.approve_participant(uuid) to authenticated;
grant execute on function public.leave_meeting(uuid) to authenticated;
grant execute on function public.end_meeting(uuid) to authenticated;
grant execute on function public.update_participant_state(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.send_meeting_message(uuid, text) to authenticated;

create policy "meeting members can join private realtime topics" on realtime.messages
  for select to authenticated using (
    exists (
      select 1 from public.meeting_participants p
      where p.meeting_id::text = split_part(realtime.topic(), ':', 2)
        and p.user_id = auth.uid()
        and p.status = 'active'
    )
  );
