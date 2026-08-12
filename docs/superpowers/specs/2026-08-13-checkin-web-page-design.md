# Check-In Web Page — Design

**Date:** 2026-08-13
**Status:** Approved, ready for implementation planning
**Time budget:** ~2 hours

## Problem

Build a check-in page for an event. An operator types a guest's phone number and taps a
button. The page shows `Checked in: <name>` and a running count increases by one. Data
lives in a real backend, not `localStorage`. If the phone number is unknown, the page asks
for a name and registers the guest.

Deliverables are a live URL, a public GitHub repo, and short notes on how it was built.

## Decisions

These were settled during design. They are listed here so implementation does not
re-litigate them.

| Decision | Choice | Reason |
|---|---|---|
| Stack | Next.js 16 App Router on Vercel | Fastest reliable path from `git push` to a working live URL. (Design discussion said "15"; 16.3.0 is current stable as of 2026-08-13 and is what the plan targets.) |
| Backend | Supabase Postgres, service-role key server-side only | Browser never holds a database credential |
| Count semantics | Every check-in counts; repeats allowed | Matches the brief literally and demos well |
| Phone handling | `libphonenumber-js`, country selector, E.164 storage | Real per-country validation instead of invented length rules |
| Validation strictness | `isValidPhoneNumber` — mobile or landline both accepted | Rejecting a guest's landline helps nobody |
| Realtime | Skipped | The count only changes on button tap; realtime would require a second browser-side client and the RLS surface this design exists to avoid |
| Admin view | Out of scope | Protects the time budget |

## Architecture

Single page. All database access happens inside Next.js server actions. The browser holds
no Supabase credential and issues no database queries.

```
Browser (client component)
   |  server action call: checkIn(e164) / registerGuest(e164, name)
   v
Server action  ──uses──>  service-role Supabase client  ──>  Postgres
   |
   returns { status, name?, count, recent[] }
```

### Files

```
app/page.tsx            Server component. Renders initial count + recent list.
app/actions.ts          'use server'. checkIn(), registerGuest().
app/check-in-form.tsx   Client component. Input, country select, all UI states.
lib/supabase.ts         Service-role client. Marked `import 'server-only'`.
lib/phone.ts            Parse / validate / format wrapper over libphonenumber-js.
lib/phone.test.ts       Vitest unit tests.
```

`lib/phone.ts` is imported by both the client component and the server action. It is the
single source of truth for what counts as a valid number.

## Data model

```sql
create table guests (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table check_ins (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references guests(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index check_ins_created_at_idx on check_ins (created_at desc);

alter table guests   enable row level security;
alter table check_ins enable row level security;
-- No policies are created. Deny-all for anon and authenticated roles.
-- The service-role key used by the server bypasses RLS.
```

Two tables rather than one: the guest registry and the check-in event log are different
things. Because repeats are allowed, a single table would force either duplicating the
name on every row or overwriting history.

`guests.phone` stores E.164 (`+6591234567`). The unique constraint on that canonical form
is what makes lookup trustworthy — the same number entered with spaces, dashes, or a
country prefix resolves to one guest.

No `country` column. E.164 already encodes the country and `libphonenumber-js` can recover
it on demand; a separate column is a second source of truth that can drift.

The count is `select count(*) from check_ins`.

## Phone handling

`lib/phone.ts` wraps `libphonenumber-js`:

- `parsePhoneNumberFromString(input, selectedCountry)` produces the E.164 string.
- `isValidPhoneNumber(input, country)` gates the submit button. It checks length **and**
  prefix rules per country, which a hand-rolled length table cannot express.
- `AsYouType(country)` formats the input as the operator types.

The country dropdown is built with no hand-curated data:

- `getCountries()` — every supported ISO code
- `getCountryCallingCode(code)` — `"SG"` → `"65"`
- `new Intl.DisplayNames(['en'], { type: 'region' }).of(code)` — `"SG"` → `"Singapore"`
- Flag emoji derived from the ISO letters via regional-indicator code points

A native `<select>` is used deliberately: type-ahead on desktop, native picker on mobile,
no combobox code. It defaults to Singapore, and the last-used country persists in
`localStorage` so the operator rarely opens it.

Uses the default (smaller) metadata bundle. The larger `/max` bundle is only needed to
distinguish mobile from landline, which this design does not do.

## Server actions

Both actions re-validate the phone string with `lib/phone.ts` before touching the
database. The client's E.164 string is never trusted.

**`checkIn(e164)`**

1. Validate. Invalid → `{ status: 'invalid' }`, which the client renders as the `error`
   state. This is a defensive path: the submit button already blocks invalid input.
2. Look up the guest by phone.
3. Not found → return `{ status: 'unknown_phone' }`. **Writes nothing.**
4. Found → insert a `check_ins` row.
5. Return `{ status: 'checked_in', name, count, recent }`.

**`registerGuest(e164, name)`**

1. Validate phone; trim name, require non-empty, cap at 80 characters.
2. Insert into `guests`.
3. On Postgres error `23505` (unique violation), select the existing guest instead. This
   is the two-operators-register-the-same-new-number race.
4. Insert a `check_ins` row.
5. Return `{ status: 'checked_in', name, count, recent }`.

Both success paths return the fresh count **and** the fresh recent list (`recent` is the
five most recent check-ins, each as name plus timestamp). The client
replaces its state from the response, so there is no cache-revalidation behaviour to debug
under time pressure.

## UI

One centered card with kiosk-sized targets. The count is the hero element: a large numeral
above the word "checked in". Below it a single row — country select, phone input, then a
full-width **Check in** button, disabled until the number validates. Below that, the five
most recent check-ins as name plus time.

### States

| State | Display |
|---|---|
| `idle` | Button disabled until the number validates |
| `submitting` | Button disabled, label reads "Checking…" |
| `checked_in` | Green `Checked in: <name>`, count ticks up, input clears and refocuses, name prepends to the recent list |
| `unknown_phone` | Form swaps to name capture — phone shown formatted and read-only with a *change* link, name input autofocused, **Add & check in** / **Cancel** |
| `error` | Red inline message; form keeps its values so nothing is retyped |

The success banner persists until the next submission rather than auto-dismissing — an
operator looks up after they have started typing the next number. Clearing the input and
restoring focus is what makes the page feel fast in a queue.

Timestamps are formatted with an explicit locale and `timeZone: 'Asia/Singapore'` on both
server and client so hydration output matches.

## Error handling

- Phone and name validate on the client and again in the server action.
- Supabase failures return a generic "Something went wrong. Try again." while the real
  error goes to `console.error` server-side. Database errors never reach the UI.
- The submit button is disabled while a request is pending, preventing double submission.
- `23505` on guest insert falls back to selecting the existing row rather than erroring.

## Testing

Scaled to the time budget.

**Unit tests (Vitest) on `lib/phone.ts`** — the only place real logic lives, and it is
pure. Cases: SG number with and without `+65`; input containing spaces and dashes; too few
digits; too many digits; valid digit count but invalid prefix for the country; empty
string; non-numeric garbage.

**Manual smoke checklist**, run against the deployed URL:

1. Existing guest checks in → correct name shown, count increments
2. Unknown number → name prompt appears, no row written until submit
3. New guest registers → appears in recent list, count increments
4. Same guest checks in again → count increments again
5. Invalid number → submit button stays disabled
6. Cancel from the name prompt → returns to the phone input
7. Switch country → validation rules change accordingly

**Deliberately skipped:** integration tests against live Supabase, and end-to-end tests.
Both are named in the README as the first things to add with more time. Stating what was
consciously deferred is part of the deliverable.

## Delivery sequence

The skeleton deploys early, before there is real code to debug. Deploy problems discovered
at minute 110 are what sink timed exercises.

| Time | Step |
|---|---|
| 0:00 | Supabase project, run schema SQL, copy URL + service-role key, scaffold Next.js |
| 0:15 | Push to GitHub, import to Vercel, deploy skeleton — **pipeline proven early** |
| 0:25 | `lib/phone.ts`, server actions, UI |
| 1:05 | Polish and unit tests |
| 1:20 | Final deploy, smoke test the **live** URL |
| 1:35 | README and write-up |
| 1:50 | Buffer |

`.env.local` is gitignored. `.env.example` is committed, listing `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Neither takes a `NEXT_PUBLIC_` prefix — the browser never
talks to Supabase, so neither value needs to reach the client bundle.

## README contents

The README doubles as the written notes the task asks for: what the app is, the stack, the
schema SQL, local setup, and a decisions section covering RLS deny-all with the service
key held server-side, E.164 as the canonical key, repeats allowed by design, realtime
deliberately skipped, and tests focused on the pure logic.

## Out of scope

Admin or guest-list view. CSV export. Authentication. Multiple events. Daily count resets.
Duplicate-check-in blocking. Realtime cross-device updates. SMS confirmation.
