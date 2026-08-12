-- Guest registry. `phone` is E.164 and is the canonical lookup key.
create table guests (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Check-in event log. One row per check-in; repeats by the same guest are expected.
create table check_ins (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references guests(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index check_ins_created_at_idx on check_ins (created_at desc);

-- RLS on with zero policies: deny-all for the anon and authenticated roles.
-- The server's service-role key bypasses RLS. The browser never connects directly.
alter table guests    enable row level security;
alter table check_ins enable row level security;
