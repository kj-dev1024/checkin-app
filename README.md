# Event Check-In

Type a phone number, tap a button, the guest is checked in and a running count goes up.
Unrecognized numbers prompt for a name and register the guest.

**Live:** _<add your Vercel URL here>_

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres) ·
`libphonenumber-js` · Vitest

## How it works

All database access happens in Next.js server actions using the Supabase service-role key.
The browser never holds a database credential and never queries Supabase directly. Row
Level Security is enabled on both tables with **zero policies**, so the anon role can read
and write nothing; the server's service-role key bypasses RLS. That is the whole security
model.

Phone numbers are validated per-country with `libphonenumber-js` and stored as E.164
(`+6591234567`). That canonical form is the unique lookup key, so `9123 4567`,
`9123-4567`, `91234567`, and `+65 9123 4567` all resolve to the same guest. A country
selector drives validation, which checks length *and* prefix rules per country rather than
digit count alone.

`guests` and `check_ins` are separate tables: the guest registry and the check-in event log
are different things, and since repeat check-ins are allowed, one table would mean either
duplicating the name on every row or overwriting history.

## Local setup

**Node 22+ is required.** `@supabase/supabase-js` builds a Realtime client inside
`createClient()`, which needs a global `WebSocket`; Node 20 has none and throws at startup.
An `.nvmrc` is included — run `nvm use`.

```bash
nvm use
npm install
cp .env.example .env.local     # fill in both values from your Supabase project
npm run dev
```

Apply `supabase/schema.sql` in the Supabase SQL editor first.

Environment variables — neither is `NEXT_PUBLIC_`, because neither should reach the browser:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tests

```bash
npm test
```

28 unit tests covering `lib/phone.ts` and `lib/time.ts` — the pure logic, and where the
real edge cases live.

## Decisions and trade-offs

- **Repeat check-ins are allowed** and each one increments the count. The brief asked for
  the count to go up on every tap, so blocking duplicates would contradict it.
- **Realtime was deliberately skipped.** The count only changes when someone taps the
  button, and Supabase Realtime would have required a second browser-side client plus the
  RLS surface this architecture exists to avoid.
- **Landlines are accepted.** Rejecting a guest's landline at an event door helps nobody.
- **Timestamps are pinned** to `en-GB` and `Asia/Singapore` so server and client render
  identically and hydration stays clean.
- **The unique-violation race is handled**: if two operators register the same new number
  at once, the loser reuses the winner's guest row instead of erroring.
- **Phone parsing is not hand-rolled.** An earlier draft stripped a leading `65` when the
  remainder was 8 digits — a guess dressed up as logic. `libphonenumber-js` carries real
  per-country metadata instead.

## What I would add with more time

- Integration tests against a real Supabase instance, and end-to-end tests of the two
  check-in flows. Unit tests currently cover the pure logic only.
- An admin view listing and searching all guests and check-ins, with CSV export.
- Rate limiting — the check-in action is currently unauthenticated and public.
