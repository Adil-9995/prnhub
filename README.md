# PrnHub

PrnHub is a responsive learning and video-meeting application built with React, TypeScript, Vite, Tailwind CSS, React Router, Lucide, Supabase, and LiveKit. Supabase provides authentication, meeting data, access policies, chat, and participant records. LiveKit provides real-time audio, video, and screen sharing.

The source is deployment-ready but requires project credentials and external services before protected pages and real meetings can work. No real 300-person load test or two-client production meeting has been performed.

## Features

- Email/password sign-up, sign-in, email verification, password reset, and guest sessions through Supabase Auth.
- Supabase-backed meeting creation, scheduling, joining, password checks, invite restrictions, and waiting-room admission.
- Database-enforced meeting limit of 300 active or waiting members, plus LiveKit rooms configured with a 300-participant maximum.
- LiveKit audio/video, screen sharing, paged video subscriptions, and active-speaker audio selection.
- Supabase-persisted meeting chat with Realtime broadcast.
- Participant status, hand raising, host admission, meeting termination, and disconnect cleanup through the signed LiveKit webhook.
- Responsive dashboard, meeting lobby, room controls, theme settings, and SPA routing.

## Requirements

- Node.js 20.19+ or 22.12+ (Node.js 24 LTS is supported)
- npm
- A Supabase project with Auth, Realtime, and Edge Functions enabled
- A LiveKit deployment with a public endpoint reachable by browsers
- Supabase CLI for migrations and Edge Function deployment

## Local development

```sh
npm install
Copy-Item .env.example .env.local
```

Set these browser-safe variables in `.env.local`:

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_APP_NAME` | No | Display brand; defaults to `PrnHub`. |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key. This key is public by design; database security must be enforced by RLS. |

Never put a Supabase service-role key or LiveKit API secret in a `VITE_` variable or browser file.

```sh
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. In Authentication settings, enable email/password and anonymous sign-in. Configure email confirmation and password recovery to redirect to the application origin (localhost and production).
3. Apply the database migrations:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. Confirm the project's Realtime service is enabled. The migrations create private Broadcast policies and triggers for chat and participant updates.
5. Add `.env.local` values from the Supabase project's API settings, then restart Vite.

The migrations create profiles, meetings, invitations, participant and chat tables; indexes; RLS policies; password-hashing and access-control RPCs; participant-cap enforcement; and private Realtime topics. Meeting passwords are bcrypt-hashed in Postgres using `pgcrypto`. The service-role key is used only by trusted Edge Functions.

## LiveKit setup

Create a LiveKit project or self-host LiveKit and configure the Supabase Edge Function secrets:

```sh
supabase secrets set `
  LIVEKIT_URL=https://YOUR_LIVEKIT_HOST `
  LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY `
  LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
```

`LIVEKIT_URL` is the HTTP(S) server URL; the token endpoint converts it to the browser's WS(S) URL. The Supabase Edge Function environment provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; verify these are present in the deployed function environment without exposing them to the client.

Deploy the functions:

```sh
supabase functions deploy livekit-token
supabase functions deploy livekit-webhook
supabase functions deploy end-livekit-meeting
```

Configure LiveKit's signed webhook URL as:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/livekit-webhook
```

The webhook's JWT verification is disabled in `supabase/config.toml` because LiveKit signs webhook requests with its API secret; the function verifies that signature itself. Subscribe the webhook to `participant_left` events. Do not disable signature verification or expose the API secret. The token function validates the caller session and active Supabase membership before issuing a short-lived room token; it also refuses rooms not configured for the 300-member maximum. The end-meeting function validates the host, marks the database meeting ended, and deletes its LiveKit room so connected clients are disconnected.

## Routes

- `/` landing page
- `/signin`, `/signup` authentication
- `/dashboard` account meetings and history
- `/create` create a meeting
- `/join` join by code or link
- `/join/:meetingId` meeting preview and waiting room
- `/meeting/:meetingId` live media room
- `/schedule` schedule a meeting
- `/settings` user and device preferences

## Commands

- `npm run dev` — local development server
- `npm run build` — TypeScript checks and production build
- `npm run preview` — preview the production build
- `npm run lint` — Oxlint

Vite writes production assets to `dist`. `vercel.json` configures the SPA fallback so direct route loads resolve to the React app.

## Deployment checklist

- Set `VITE_APP_NAME`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in Vercel for every environment.
- Deploy both Supabase Edge Functions and set the LiveKit secrets with Supabase Secrets.
- Apply all Supabase migrations to the target project.
- Enable email confirmation and anonymous sessions in Supabase Auth; set the production callback URLs.
- Configure LiveKit webhook delivery to the Supabase Edge Function URL.
- Use HTTPS for the app and public WSS/HTTPS endpoints for media.
- Verify RLS, function secrets, and Auth redirect URLs before inviting users.
- Run two-client smoke tests and a staged concurrency/load test before representing the system as production-capable at 300 users.

## Capacity and known limitations

The application and database enforce a maximum of 300 active or waiting participants per room. The client subscribes to video only for the current page (up to eight remote videos) and to audio for up to four active speakers to reduce browser and network load. A database cap and room setting do not guarantee that a particular LiveKit deployment, region, browser, or network can sustain 300 users. Capacity must be measured on the selected LiveKit deployment with representative client devices, network conditions, and media settings.

This workspace has no configured Supabase project or LiveKit credentials, so migrations, Edge Functions, authentication, real cross-client meetings, and 300-user load have not been verified against live services. Background blur and live captions are not implemented. Device access and media require browser permission and HTTPS (localhost is allowed for development). Browser screen sharing support varies by platform.

The LiveKit endpoint is trusted to enforce room membership once a token is issued. Do not enable unauthenticated room access or bypass token issuance in the LiveKit server. Review LiveKit ingress, egress, recording, and retention settings separately if those features are enabled later.

## Troubleshooting

- **“Connect Supabase to continue”**: add the public Supabase URL and anon key to `.env.local`, then restart Vite.
- **Email sign-up is pending**: confirm the address using the Supabase email and check the Auth redirect URL configuration.
- **Guest join fails**: enable anonymous sign-in in Supabase Auth and deploy the migrations.
- **Meeting data is unavailable**: confirm `supabase db push` completed and check the Supabase project's RLS/function errors.
- **Media service is not configured**: deploy `livekit-token` and set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` as Supabase function secrets.
- **Waiting-room request remains pending**: the meeting host must be online and admit the request; check the Realtime connection if the lobby does not update.
- **Camera/microphone unavailable**: grant browser permissions, check that another application is not holding the device, and use HTTPS or localhost.
