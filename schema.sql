-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Tables are prefixed ep_ so they never clash with other projects.

create table if not exists ep_users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null unique,          -- stored as 265XXXXXXXXX
  password_hash text not null,
  role          text not null default 'user'       check (role   in ('user','admin')),
  status        text not null default 'registered' check (status in ('registered','pending','approved','rejected')),
  reject_reason text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists ep_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references ep_users(id) on delete cascade,
  method          text not null,
  transaction_id  text not null,
  screenshot_path text not null,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason   text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
-- The same transaction ID cannot be used twice (unless the earlier one was rejected).
create unique index if not exists ep_payments_txn_unique
  on ep_payments (transaction_id) where status <> 'rejected';
create index if not exists ep_payments_status_idx on ep_payments (status, created_at);

create table if not exists ep_tracks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  position     int  not null default 1,
  audio_path   text not null,
  preview_path text,
  created_at   timestamptz not null default now()
);

create table if not exists ep_downloads (
  id         bigint generated always as identity primary key,
  user_id    uuid references ep_users(id)  on delete set null,
  track_id   uuid references ep_tracks(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ep_downloads_track_idx on ep_downloads (track_id);
create index if not exists ep_downloads_user_idx  on ep_downloads (user_id);

create table if not exists ep_plays (
  id         bigint generated always as identity primary key,
  user_id    uuid references ep_users(id)  on delete set null,
  track_id   uuid references ep_tracks(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ep_plays_track_idx on ep_plays (track_id);
create index if not exists ep_plays_user_idx  on ep_plays (user_id);

-- Views and a function used by the admin dashboard.
create or replace view ep_track_stats with (security_invoker = true) as
select t.id, t.title, t.position, t.audio_path, t.preview_path, t.created_at,
       (select count(*) from ep_downloads d where d.track_id = t.id) as downloads,
       (select count(*) from ep_plays p     where p.track_id = t.id) as plays
from ep_tracks t
order by t.position, t.created_at;

create or replace view ep_user_overview with (security_invoker = true) as
select u.id, u.name, u.phone, u.role, u.status, u.reject_reason, u.created_at, u.approved_at,
       (select count(*) from ep_downloads d where d.user_id = u.id) as downloads,
       (select count(*) from ep_plays p     where p.user_id = u.id) as plays
from ep_users u
where u.role = 'user';

create or replace function ep_admin_stats() returns json
language sql stable security invoker as $$
  select json_build_object(
    'fans_total',        (select count(*) from ep_users where role = 'user'),
    'fans_registered',   (select count(*) from ep_users where role = 'user' and status = 'registered'),
    'fans_pending',      (select count(*) from ep_users where role = 'user' and status = 'pending'),
    'fans_approved',     (select count(*) from ep_users where role = 'user' and status = 'approved'),
    'fans_rejected',     (select count(*) from ep_users where role = 'user' and status = 'rejected'),
    'downloads_total',   (select count(*) from ep_downloads),
    'downloaders_unique',(select count(distinct user_id) from ep_downloads),
    'plays_total',       (select count(*) from ep_plays)
  );
$$;

-- Lock everything down. The website server uses the service key (bypasses RLS);
-- nobody can read these tables with the public anon key.
alter table ep_users     enable row level security;
alter table ep_payments  enable row level security;
alter table ep_tracks    enable row level security;
alter table ep_downloads enable row level security;
alter table ep_plays     enable row level security;

revoke all on ep_users, ep_payments, ep_tracks, ep_downloads, ep_plays,
              ep_track_stats, ep_user_overview from anon, authenticated;
revoke execute on function ep_admin_stats() from public, anon, authenticated;
