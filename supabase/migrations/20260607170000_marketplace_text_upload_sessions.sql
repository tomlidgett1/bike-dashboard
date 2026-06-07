create table if not exists public.marketplace_text_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  phone_e164 text not null,
  source text not null default 'nest',
  image_urls jsonb not null default '[]'::jsonb,
  uploaded_images jsonb not null default '[]'::jsonb,
  analysis jsonb null,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'ready',
  error text null,
  claimed_user_id uuid null references auth.users(id) on delete set null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  constraint marketplace_text_upload_sessions_status_check
    check (status in ('ready', 'claimed', 'expired', 'failed')),
  constraint marketplace_text_upload_sessions_phone_check
    check (phone_e164 ~ '^\+[1-9][0-9]{8,14}$')
);

create index if not exists marketplace_text_upload_sessions_token_idx
  on public.marketplace_text_upload_sessions (session_token);

create index if not exists marketplace_text_upload_sessions_phone_idx
  on public.marketplace_text_upload_sessions (phone_e164, created_at desc);

create index if not exists marketplace_text_upload_sessions_claimed_user_idx
  on public.marketplace_text_upload_sessions (claimed_user_id, created_at desc)
  where claimed_user_id is not null;

alter table public.marketplace_text_upload_sessions enable row level security;

drop policy if exists "Service role full access to marketplace text upload sessions"
  on public.marketplace_text_upload_sessions;

create policy "Service role full access to marketplace text upload sessions"
  on public.marketplace_text_upload_sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.marketplace_text_upload_sessions is
  'One-time Yellow Jersey listing handoff sessions generated from Nest iMessage text uploads.';

comment on column public.marketplace_text_upload_sessions.form_data is
  'Pre-filled sell wizard form data, shaped like the existing Quick Upload sessionStorage payload.';
