# Check-In Web Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an event check-in page where an operator types a phone number, taps a button, and sees `Checked in: <name>` with a running count, backed by Supabase.

**Architecture:** Next.js App Router on Vercel. All database access happens inside server actions using the Supabase service-role key; the browser holds no database credential and issues no queries. Phone numbers are validated per-country with `libphonenumber-js` and stored as E.164, which serves as the canonical lookup key.

**Tech Stack:** Next.js 16.3.0, React 19.2.8, TypeScript, Tailwind CSS 4, `@supabase/supabase-js` 2.112.3, `libphonenumber-js` 1.13.10, Vitest 4.1.10.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-checkin-web-page-design.md`. Read it before starting.
- **The spec says "Next.js 15". Use Next.js 16** — 16.3.0 is current stable as of 2026-08-13. Everything else in the spec holds unchanged.
- Environment variables are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. **Neither takes a `NEXT_PUBLIC_` prefix.** If you ever prefix them, the service-role key ships to the browser and the security model collapses.
- `.env.local` is gitignored and must never be committed. `.env.example` is committed with empty values.
- Repo-local git identity is already set to `Kyle Joshua Ronquillo <73159808+kj-dev1024@users.noreply.github.com>`. Do not change it, and do not touch global git config.
- Remote is `origin` → `https://github.com/kj-dev1024/checkin-app` (public), default branch `main`.
- Every check-in counts. Repeat check-ins by the same guest are allowed and each increments the count.
- Phone validity is decided by `isValidPhoneNumber` / `.isValid()` — mobile **and** landline both accepted.
- Timestamps render with an explicit locale and `timeZone: 'Asia/Singapore'` on both server and client.
- Time budget is ~2 hours. Tasks 1–3 must be done before spending time on UI polish.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/schema.sql` | Table definitions, index, RLS enablement. Run manually in the Supabase SQL editor. |
| `lib/phone.ts` | Pure phone logic: E.164 conversion, validation, display formatting, country list. No I/O. |
| `lib/phone.test.ts` | Vitest unit tests for `lib/phone.ts`. |
| `lib/time.ts` | Deterministic timestamp formatting (prevents hydration mismatch). |
| `lib/time.test.ts` | Vitest unit tests for `lib/time.ts`. |
| `lib/supabase.ts` | Service-role Supabase client. `import 'server-only'`. |
| `app/types.ts` | Shared result types crossing the client/server boundary. |
| `app/actions.ts` | `'use server'` — `getSnapshot`, `checkIn`, `registerGuest`. |
| `app/page.tsx` | Server component. Fetches initial count + recent list. |
| `app/check-in-form.tsx` | Client component. Country select, phone input, all five UI states. |
| `README.md` | Setup instructions and the written notes the task asks for. |

---

## Task 1: Scaffold the project and test runner

**Files:**
- Create: `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tsconfig.json` (all via `create-next-app`)
- Create: `vitest.config.ts`
- Modify: `.gitignore` (replaced by the scaffold)

**Interfaces:**
- Consumes: nothing
- Produces: a running Next.js app and a working `npm test` command for all later tasks.

- [ ] **Step 1: Scaffold into the existing repo**

The repo already exists at `~/Documents/checkin-app` with a commit. Scaffold into a temp directory and move the files in, so git history is preserved.

```bash
cd ~/Documents/checkin-app
npx create-next-app@latest .temp-scaffold \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias "@/*" --use-npm --yes
```

If any flag is rejected by this version of `create-next-app`, drop the offending flag and
answer its prompt interactively. Do not add `--no-turbopack`; Turbopack is the Next 16
default and the negated flag may not exist.

- [ ] **Step 2: Move the scaffold into the repo root**

Use `rsync`, not `mv .temp-scaffold/*` — the shell here is **zsh**, where `*` does not
match dotfiles, so `.gitignore` and other dot-prefixed scaffold files would be silently
left behind.

```bash
cd ~/Documents/checkin-app
rm -rf .temp-scaffold/.git
rsync -a .temp-scaffold/ .
rm -rf .temp-scaffold
ls -a
```

Expected: `app/`, `package.json`, `tsconfig.json`, `next.config.*`, `.gitignore` now sit at the repo root alongside the existing `docs/` directory.

- [ ] **Step 3: Verify the dev server boots**

```bash
cd ~/Documents/checkin-app && npm run dev
```

Expected: `Ready in ...` and a URL. Open it, confirm the Next.js starter page renders, then stop the server with Ctrl-C.

- [ ] **Step 4: Install runtime and test dependencies**

```bash
cd ~/Documents/checkin-app
npm i @supabase/supabase-js@2.112.3 libphonenumber-js@1.13.10 server-only
npm i -D vitest@4.1.10
```

`server-only` is a real package and is not included by `create-next-app`. It makes the build fail loudly if server-only code is ever imported into a client component.

- [ ] **Step 5: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

Tests import with relative paths (`./phone`), so no path-alias plugin is needed.

- [ ] **Step 6: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Verify the test runner works with no tests**

```bash
cd ~/Documents/checkin-app && npm test
```

Expected: Vitest runs and reports "No test files found" (exit code may be non-zero — that is fine at this point and is fixed by Task 3).

- [ ] **Step 8: Confirm `.env.local` is ignored**

```bash
cd ~/Documents/checkin-app && grep -n "env" .gitignore
```

Expected: a line covering `.env*` or `.env.local`. If absent, append `.env.local` to `.gitignore`.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/checkin-app
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

## Task 2: Deploy the skeleton to Vercel

Deploy before there is real code to debug. Deploy problems found at minute 110 are what sink timed exercises.

**Files:**
- Create: `.env.example`

**Interfaces:**
- Consumes: the scaffolded app from Task 1
- Produces: a live URL and automatic deploy-on-push for every later task.

- [ ] **Step 1: Create `.env.example`**

Create `.env.example`:

```bash
# Supabase project settings -> Data API -> Project URL
SUPABASE_URL=

# Supabase project settings -> API keys -> service_role (SECRET — never commit the real value)
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Commit and push**

```bash
cd ~/Documents/checkin-app
git add .env.example
git commit -m "chore: add env example"
git push
```

- [ ] **Step 3: (USER ACTION) Import the repo into Vercel**

Go to <https://vercel.com/new>, import `kj-dev1024/checkin-app`, and deploy with all default settings. Vercel auto-detects Next.js. Leave environment variables empty for now — the skeleton does not read them yet.

- [ ] **Step 4: Verify the live URL renders**

Open the deployment URL Vercel gives you. Expected: the Next.js starter page, served from the live domain. **Record this URL — it is deliverable #1.**

If the build fails, fix it now. This is exactly why the skeleton deploys first.

---

## Task 3: Supabase schema and server-only client

**Files:**
- Create: `supabase/schema.sql`
- Create: `lib/supabase.ts`
- Create: `.env.local` (not committed)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `supabase` — a configured `SupabaseClient` exported from `lib/supabase.ts`, used by `app/actions.ts` in Task 5. Tables `guests(id, phone, name, created_at)` and `check_ins(id, guest_id, created_at)`.

- [ ] **Step 1: Write the schema file**

Create `supabase/schema.sql`:

```sql
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
```

- [ ] **Step 2: (USER ACTION) Create the Supabase project and apply the schema**

1. Create a new project at <https://supabase.com/dashboard>. Wait for provisioning (~2 min).
2. Open the **SQL Editor**, paste the entire contents of `supabase/schema.sql`, and run it.
3. Confirm both tables appear under **Table Editor**.

- [ ] **Step 3: (USER ACTION) Collect credentials into `.env.local`**

From **Project Settings → Data API** copy the Project URL, and from **Project Settings → API Keys** copy the `service_role` secret.

Create `.env.local` (gitignored):

```bash
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

- [ ] **Step 4: Write the Supabase client**

Create `lib/supabase.ts`:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill it in.'
  )
}

// Service-role key: bypasses RLS. Must only ever be used from server code.
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
```

- [ ] **Step 5: Verify the connection**

```bash
cd ~/Documents/checkin-app
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
c.from('check_ins').select('*', { count: 'exact', head: true })
 .then(r => console.log('count:', r.count, '| error:', r.error?.message ?? 'none'));
"
```

Expected: `count: 0 | error: none`.

If this errors, stop and fix it before continuing — every later task depends on it.

- [ ] **Step 6: Confirm `.env.local` is not staged**

```bash
cd ~/Documents/checkin-app && git status --short
```

Expected: `supabase/schema.sql` and `lib/supabase.ts` appear. **`.env.local` must NOT appear.**

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/checkin-app
git add supabase/schema.sql lib/supabase.ts
git commit -m "feat: add Supabase schema and server-only client"
```

---

## Task 4: Phone logic (TDD)

This is the only real logic in the app and it is pure, so it gets real tests.

**Files:**
- Create: `lib/phone.ts`
- Test: `lib/phone.test.ts`
- Create: `lib/time.ts`
- Test: `lib/time.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces, used by Tasks 5 and 6:
  - `DEFAULT_COUNTRY: CountryCode` (value `'SG'`)
  - `toE164(input: string, country: CountryCode): string | null`
  - `isValidFor(input: string, country: CountryCode): boolean`
  - `formatE164(e164: string): string`
  - `formatAsYouType(input: string, country: CountryCode): string`
  - `countryOptions(): CountryOption[]` where `CountryOption = { code: CountryCode; name: string; dialCode: string; flag: string }`
  - `formatTime(iso: string): string`

- [ ] **Step 1: Write the failing tests for `lib/phone.ts`**

Create `lib/phone.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COUNTRY,
  toE164,
  isValidFor,
  formatE164,
  formatAsYouType,
  countryOptions,
} from './phone'

describe('toE164', () => {
  it('normalizes an SG mobile written with a space', () => {
    expect(toE164('9123 4567', 'SG')).toBe('+6591234567')
  })

  it('normalizes an SG mobile written with a dash', () => {
    expect(toE164('9123-4567', 'SG')).toBe('+6591234567')
  })

  it('normalizes bare SG digits', () => {
    expect(toE164('91234567', 'SG')).toBe('+6591234567')
  })

  it('accepts a full international string', () => {
    expect(toE164('+65 9123 4567', 'SG')).toBe('+6591234567')
  })

  it('collapses every spelling of one number to a single key', () => {
    const keys = new Set([
      toE164('9123 4567', 'SG'),
      toE164('9123-4567', 'SG'),
      toE164('91234567', 'SG'),
      toE164('+65 9123 4567', 'SG'),
    ])
    expect(keys.size).toBe(1)
  })

  it('accepts an SG landline', () => {
    expect(toE164('61234567', 'SG')).toBe('+6561234567')
  })

  it('rejects too few digits', () => {
    expect(toE164('123', 'SG')).toBeNull()
  })

  it('rejects too many digits', () => {
    expect(toE164('912345678901', 'SG')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(toE164('', 'SG')).toBeNull()
  })

  it('rejects whitespace only', () => {
    expect(toE164('   ', 'SG')).toBeNull()
  })

  it('rejects non-numeric garbage', () => {
    expect(toE164('hello world', 'SG')).toBeNull()
  })

  it('validates against the selected country, not just digit count', () => {
    // 8 digits starting with 9 is a valid SG mobile but not a valid US number.
    expect(toE164('91234567', 'SG')).toBe('+6591234567')
    expect(toE164('91234567', 'US')).toBeNull()
  })

  it('normalizes a US number', () => {
    expect(toE164('(212) 555-1234', 'US')).toBe('+12125551234')
  })
})

describe('isValidFor', () => {
  it('is true for a valid SG mobile', () => {
    expect(isValidFor('9123 4567', 'SG')).toBe(true)
  })

  it('is false for too few digits', () => {
    expect(isValidFor('123', 'SG')).toBe(false)
  })

  it('is false for an empty string', () => {
    expect(isValidFor('', 'SG')).toBe(false)
  })

  it('is false for garbage', () => {
    expect(isValidFor('abc', 'SG')).toBe(false)
  })
})

describe('formatE164', () => {
  it('formats for display', () => {
    expect(formatE164('+6591234567')).toBe('+65 9123 4567')
  })

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatE164('not-a-number')).toBe('not-a-number')
  })
})

describe('formatAsYouType', () => {
  it('groups SG digits as they are typed', () => {
    expect(formatAsYouType('91234567', 'SG')).toBe('9123 4567')
  })

  it('groups US digits as they are typed', () => {
    expect(formatAsYouType('2125551234', 'US')).toBe('(212) 555-1234')
  })
})

describe('countryOptions', () => {
  it('returns the full supported country list', () => {
    expect(countryOptions().length).toBeGreaterThan(200)
  })

  it('includes Singapore with dial code and flag', () => {
    const sg = countryOptions().find((c) => c.code === 'SG')
    expect(sg).toEqual({
      code: 'SG',
      name: 'Singapore',
      dialCode: '+65',
      flag: '🇸🇬',
    })
  })

  it('is sorted by country name', () => {
    const names = countryOptions().map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('defaults to Singapore', () => {
    expect(DEFAULT_COUNTRY).toBe('SG')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ~/Documents/checkin-app && npm test
```

Expected: FAIL — `Failed to resolve import "./phone"`.

- [ ] **Step 3: Implement `lib/phone.ts`**

Create `lib/phone.ts`:

```ts
import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  getCountries,
  getCountryCallingCode,
  AsYouType,
  type CountryCode,
} from 'libphonenumber-js'

export type { CountryCode }

export const DEFAULT_COUNTRY: CountryCode = 'SG'

/**
 * Convert operator input to E.164, or null if it is not a valid number for `country`.
 *
 * IMPORTANT: parsePhoneNumberFromString returns `undefined` for unparseable garbage,
 * but returns a TRUTHY object for merely-invalid input ("123" -> "+65123"). Presence of
 * a parse result is therefore NOT a validity check — `.isValid()` is what rejects those.
 */
export function toE164(input: string, country: CountryCode): string | null {
  if (!input.trim()) return null
  const parsed = parsePhoneNumberFromString(input, country)
  if (!parsed || !parsed.isValid()) return null
  return parsed.number
}

/** Whether `input` is a valid number for `country`. Accepts mobile and landline alike. */
export function isValidFor(input: string, country: CountryCode): boolean {
  if (!input.trim()) return false
  return isValidPhoneNumber(input, country)
}

/** "+6591234567" -> "+65 9123 4567". Returns the input unchanged if unparseable. */
export function formatE164(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  return parsed ? parsed.formatInternational() : e164
}

/** Progressive formatting while the operator types. */
export function formatAsYouType(input: string, country: CountryCode): string {
  return new AsYouType(country).input(input)
}

export type CountryOption = {
  code: CountryCode
  name: string
  dialCode: string
  flag: string
}

/** "SG" -> "🇸🇬" via regional indicator symbols. */
function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...code.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  )
}

let cachedOptions: CountryOption[] | null = null

/** Every supported country, sorted by display name. Built from library data — nothing hand-curated. */
export function countryOptions(): CountryOption[] {
  if (cachedOptions) return cachedOptions
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  cachedOptions = getCountries()
    .map((code) => ({
      code,
      name: names.of(code) ?? code,
      dialCode: `+${getCountryCallingCode(code)}`,
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return cachedOptions
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ~/Documents/checkin-app && npm test
```

Expected: PASS — all `lib/phone.test.ts` tests green.

- [ ] **Step 5: Write the failing tests for `lib/time.ts`**

Create `lib/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatTime } from './time'

describe('formatTime', () => {
  it('renders UTC input in Singapore time', () => {
    // 02:30 UTC is 10:30 in Asia/Singapore (UTC+8).
    expect(formatTime('2026-08-13T02:30:00Z')).toBe('10:30')
  })

  it('uses 24-hour clock with a zero-padded hour', () => {
    // 00:05 UTC is 08:05 SGT.
    expect(formatTime('2026-08-13T00:05:00Z')).toBe('08:05')
  })

  it('is independent of the machine timezone', () => {
    // Same instant expressed with an offset must format identically.
    expect(formatTime('2026-08-13T10:30:00+08:00')).toBe(formatTime('2026-08-13T02:30:00Z'))
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
cd ~/Documents/checkin-app && npm test
```

Expected: FAIL — `Failed to resolve import "./time"`.

- [ ] **Step 7: Implement `lib/time.ts`**

Create `lib/time.ts`:

```ts
const TIME_ZONE = 'Asia/Singapore'

/**
 * Format an ISO timestamp as HH:mm in Singapore time.
 *
 * Locale and time zone are both pinned. Without that, the server and the browser can
 * format the same instant differently and React reports a hydration mismatch.
 */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(iso))
}
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd ~/Documents/checkin-app && npm test
```

Expected: PASS — all tests in both files green.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/checkin-app
git add lib/phone.ts lib/phone.test.ts lib/time.ts lib/time.test.ts vitest.config.ts package.json
git commit -m "feat: add phone validation and time formatting with tests"
```

---

## Task 5: Server actions

**Files:**
- Create: `app/types.ts`
- Create: `app/actions.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts` (Task 3); `toE164`, `CountryCode` from `lib/phone.ts` (Task 4)
- Produces, used by Task 6:
  - `type RecentCheckIn = { id: string; name: string; at: string }`
  - `type CheckInResult` — the discriminated union defined below
  - `getSnapshot(): Promise<{ count: number; recent: RecentCheckIn[] }>`
  - `checkIn(input: string, country: CountryCode): Promise<CheckInResult>`
  - `registerGuest(input: string, rawName: string, country: CountryCode): Promise<CheckInResult>`

- [ ] **Step 1: Define the shared types**

Create `app/types.ts`:

```ts
export type RecentCheckIn = {
  id: string
  name: string
  /** ISO 8601 timestamp. Formatted for display by lib/time.ts. */
  at: string
}

export type CheckInResult =
  | { status: 'checked_in'; name: string; count: number; recent: RecentCheckIn[] }
  | { status: 'unknown_phone'; e164: string }
  | { status: 'invalid' }
  | { status: 'error' }
```

- [ ] **Step 2: Write the server actions**

Create `app/actions.ts`:

```ts
'use server'

import { supabase } from '@/lib/supabase'
import { toE164, type CountryCode } from '@/lib/phone'
import type { CheckInResult, RecentCheckIn } from './types'

const RECENT_LIMIT = 5
const MAX_NAME_LENGTH = 80

/** Current total check-in count and the most recent check-ins. */
export async function getSnapshot(): Promise<{ count: number; recent: RecentCheckIn[] }> {
  const [countResult, recentResult] = await Promise.all([
    supabase.from('check_ins').select('*', { count: 'exact', head: true }),
    supabase
      .from('check_ins')
      .select('id, created_at, guests(name)')
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
  ])

  if (countResult.error) console.error('count query failed', countResult.error)
  if (recentResult.error) console.error('recent query failed', recentResult.error)

  // The embedded `guests(name)` join comes back as an object for a many-to-one FK,
  // but supabase-js types it loosely, so normalize both shapes defensively.
  const recent: RecentCheckIn[] = (recentResult.data ?? []).map((row: any) => {
    const guest = Array.isArray(row.guests) ? row.guests[0] : row.guests
    return { id: row.id, name: guest?.name ?? 'Unknown', at: row.created_at }
  })

  return { count: countResult.count ?? 0, recent }
}

/** Insert a check-in row, then return the refreshed snapshot. */
async function recordCheckIn(guestId: string, name: string): Promise<CheckInResult> {
  const { error } = await supabase.from('check_ins').insert({ guest_id: guestId })
  if (error) {
    console.error('check_in insert failed', error)
    return { status: 'error' }
  }
  const { count, recent } = await getSnapshot()
  return { status: 'checked_in', name, count, recent }
}

/**
 * Look up a guest by phone and check them in.
 * Returns `unknown_phone` without writing anything when the number is not registered.
 */
export async function checkIn(input: string, country: CountryCode): Promise<CheckInResult> {
  // Re-validate server-side. The client's value is never trusted.
  const e164 = toE164(input, country)
  if (!e164) return { status: 'invalid' }

  const { data, error } = await supabase
    .from('guests')
    .select('id, name')
    .eq('phone', e164)
    .maybeSingle()

  if (error) {
    console.error('guest lookup failed', error)
    return { status: 'error' }
  }
  if (!data) return { status: 'unknown_phone', e164 }

  return recordCheckIn(data.id, data.name)
}

/** Register a new guest for an unrecognized number, then check them in. */
export async function registerGuest(
  input: string,
  rawName: string,
  country: CountryCode
): Promise<CheckInResult> {
  const e164 = toE164(input, country)
  if (!e164) return { status: 'invalid' }

  const name = rawName.trim().slice(0, MAX_NAME_LENGTH)
  if (!name) return { status: 'invalid' }

  const { data, error } = await supabase
    .from('guests')
    .insert({ phone: e164, name })
    .select('id, name')
    .single()

  if (error) {
    // 23505 = unique_violation. Two operators registered the same new number at once;
    // the other one won. Use their row rather than failing the check-in.
    if (error.code === '23505') {
      const { data: existing, error: lookupError } = await supabase
        .from('guests')
        .select('id, name')
        .eq('phone', e164)
        .single()

      if (lookupError || !existing) {
        console.error('post-conflict lookup failed', lookupError)
        return { status: 'error' }
      }
      return recordCheckIn(existing.id, existing.name)
    }

    console.error('guest insert failed', error)
    return { status: 'error' }
  }

  return recordCheckIn(data.id, data.name)
}
```

- [ ] **Step 3: Verify it type-checks**

```bash
cd ~/Documents/checkin-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify the actions work against the real database**

Temporarily add to `app/page.tsx`, replacing the scaffold's default export:

```tsx
import { getSnapshot } from './actions'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const snapshot = await getSnapshot()
  return <pre>{JSON.stringify(snapshot, null, 2)}</pre>
}
```

Run `npm run dev` and open the page.

Expected: `{ "count": 0, "recent": [] }`. This proves the server action reaches Supabase before any UI exists. Stop the server afterwards.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/checkin-app
git add app/types.ts app/actions.ts app/page.tsx
git commit -m "feat: add check-in and guest registration server actions"
```

---

## Task 6: The check-in UI

**Files:**
- Modify: `app/page.tsx` (replace the debug output from Task 5)
- Create: `app/check-in-form.tsx`
- Modify: `app/layout.tsx` (page title)

**Interfaces:**
- Consumes: `getSnapshot`, `checkIn`, `registerGuest` from `app/actions.ts`; `CheckInResult`, `RecentCheckIn` from `app/types.ts`; `countryOptions`, `isValidFor`, `formatAsYouType`, `formatE164`, `DEFAULT_COUNTRY`, `CountryCode` from `lib/phone.ts`; `formatTime` from `lib/time.ts`
- Produces: the finished page. Nothing later consumes it.

- [ ] **Step 1: Write the page shell**

Replace `app/page.tsx` entirely:

```tsx
import { getSnapshot } from './actions'
import CheckInForm from './check-in-form'

// The count changes at runtime, so this page must never be statically cached.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { count, recent } = await getSnapshot()

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <CheckInForm initialCount={count} initialRecent={recent} />
    </main>
  )
}
```

- [ ] **Step 2: Set the page title**

In `app/layout.tsx`, replace the exported `metadata` object:

```tsx
export const metadata = {
  title: 'Event Check-In',
  description: 'Check guests in by phone number.',
}
```

- [ ] **Step 3: Write the client component**

Create `app/check-in-form.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { checkIn, registerGuest } from './actions'
import type { CheckInResult, RecentCheckIn } from './types'
import {
  countryOptions,
  isValidFor,
  formatAsYouType,
  formatE164,
  DEFAULT_COUNTRY,
  type CountryCode,
} from '@/lib/phone'
import { formatTime } from '@/lib/time'

const COUNTRY_STORAGE_KEY = 'checkin.country'

type Banner = { kind: 'success' | 'error'; text: string } | null

export default function CheckInForm({
  initialCount,
  initialRecent,
}: {
  initialCount: number
  initialRecent: RecentCheckIn[]
}) {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [count, setCount] = useState(initialCount)
  const [recent, setRecent] = useState(initialRecent)
  const [banner, setBanner] = useState<Banner>(null)
  // Non-null means the number was not recognized and we are asking for a name.
  const [unknownPhone, setUnknownPhone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const options = countryOptions()

  // Read localStorage in an effect, never during render — reading it during render
  // makes the server and client output differ and breaks hydration.
  useEffect(() => {
    const saved = localStorage.getItem(COUNTRY_STORAGE_KEY)
    if (saved) setCountry(saved as CountryCode)
  }, [])

  useEffect(() => {
    if (unknownPhone) nameRef.current?.focus()
  }, [unknownPhone])

  function onCountryChange(next: CountryCode) {
    setCountry(next)
    localStorage.setItem(COUNTRY_STORAGE_KEY, next)
  }

  function apply(result: CheckInResult) {
    switch (result.status) {
      case 'checked_in':
        setCount(result.count)
        setRecent(result.recent)
        setBanner({ kind: 'success', text: `Checked in: ${result.name}` })
        setPhone('')
        setName('')
        setUnknownPhone(null)
        phoneRef.current?.focus()
        break
      case 'unknown_phone':
        setUnknownPhone(result.e164)
        setBanner(null)
        break
      case 'invalid':
        setBanner({ kind: 'error', text: 'That is not a valid number for the selected country.' })
        break
      case 'error':
        setBanner({ kind: 'error', text: 'Something went wrong. Please try again.' })
        break
    }
  }

  function submitPhone(event: FormEvent) {
    event.preventDefault()
    startTransition(async () => apply(await checkIn(phone, country)))
  }

  function submitName(event: FormEvent) {
    event.preventDefault()
    startTransition(async () => apply(await registerGuest(phone, name, country)))
  }

  function cancelRegistration() {
    setUnknownPhone(null)
    setName('')
    phoneRef.current?.focus()
  }

  const phoneIsValid = isValidFor(phone, country)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="text-center">
        <p className="text-6xl font-bold tabular-nums tracking-tight">{count}</p>
        <p className="mt-1 text-sm uppercase tracking-widest text-slate-500">checked in</p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {unknownPhone === null ? (
          <form onSubmit={submitPhone} className="flex flex-col gap-3">
            <label htmlFor="phone" className="text-sm font-medium text-slate-700">
              Phone number
            </label>
            <div className="flex gap-2">
              <select
                aria-label="Country"
                value={country}
                onChange={(e) => onCountryChange(e.target.value as CountryCode)}
                className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-3 text-base"
              >
                {options.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.flag} {option.dialCode}
                  </option>
                ))}
              </select>
              <input
                id="phone"
                ref={phoneRef}
                inputMode="tel"
                autoComplete="off"
                placeholder="9123 4567"
                value={phone}
                onChange={(e) => setPhone(formatAsYouType(e.target.value, country))}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={!phoneIsValid || isPending}
              className="rounded-lg bg-slate-900 px-4 py-3 text-lg font-semibold text-white disabled:opacity-40"
            >
              {isPending ? 'Checking…' : 'Check in'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitName} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{formatE164(unknownPhone)}</span> is not
              registered yet.{' '}
              <button type="button" onClick={cancelRegistration} className="underline">
                change
              </button>
            </p>
            <label htmlFor="name" className="text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="name"
              ref={nameRef}
              maxLength={80}
              autoComplete="off"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-3 text-lg"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelRegistration}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={name.trim().length === 0 || isPending}
                className="flex-[2] rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-40"
              >
                {isPending ? 'Adding…' : 'Add & check in'}
              </button>
            </div>
          </form>
        )}

        {banner && (
          <p
            role="status"
            className={`mt-4 rounded-lg px-3 py-2 text-center font-medium ${
              banner.kind === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {banner.text}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          Recent check-ins
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No check-ins yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
            {recent.map((entry) => (
              <li key={entry.id} className="flex justify-between px-4 py-3">
                <span>{entry.name}</span>
                <span className="tabular-nums text-slate-500">{formatTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Verify it type-checks**

```bash
cd ~/Documents/checkin-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the manual smoke checklist**

```bash
cd ~/Documents/checkin-app && npm run dev
```

Work through every row. All seven must pass:

| # | Action | Expected |
| --- | --- | --- |
| 1 | Type `123`, look at the button | Disabled |
| 2 | Type `9123 4567` (a new number), tap Check in | Name prompt appears showing `+65 9123 4567` |
| 3 | Tap Cancel | Returns to the phone field, nothing written |
| 4 | Repeat 2, enter a name, tap Add & check in | `Checked in: <name>`, count 0 → 1, name in recent list |
| 5 | Type the same number again, tap Check in | `Checked in: <name>`, count 1 → 2 (repeats allowed) |
| 6 | Switch country to United States, type `9123 4567` | Button disabled — invalid for US |
| 7 | Reload the page | Count persists from the database |

- [ ] **Step 6: Confirm the service-role key is absent from the client bundle**

```bash
cd ~/Documents/checkin-app && npm run build
grep -r "$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2 | cut -c1-20)" .next/static/ && echo "!!! KEY LEAKED INTO CLIENT BUNDLE !!!" || echo "OK: key not in client bundle"
```

Expected: `OK: key not in client bundle`.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/checkin-app
git add app/
git commit -m "feat: add check-in UI with country selector and guest registration"
```

---

## Task 7: Deploy, verify live, and write the notes

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: the three deliverables — live URL, repo link, written notes.

- [ ] **Step 1: (USER ACTION) Add the environment variables in Vercel**

In the Vercel project → **Settings → Environment Variables**, add both for all environments:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the Project URL from `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key from `.env.local` |

Neither takes a `NEXT_PUBLIC_` prefix.

- [ ] **Step 2: Push to trigger a deploy**

```bash
cd ~/Documents/checkin-app && git push
```

- [ ] **Step 3: Verify the build succeeded**

Watch the deployment in the Vercel dashboard until it reports Ready. If it fails on a missing environment variable, Step 1 was incomplete.

- [ ] **Step 4: Run the smoke checklist against the LIVE url**

Repeat rows 2, 4, 5, and 7 from Task 6 Step 5 against the deployed URL, not localhost. A working localhost proves nothing about production environment variables.

- [ ] **Step 5: Write the README**

Create `README.md`:

````markdown
# Event Check-In

Type a phone number, tap a button, the guest is checked in and a running count goes up.
Unrecognized numbers prompt for a name and register the guest.

**Live:** <YOUR-VERCEL-URL>

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

```bash
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

Unit tests cover `lib/phone.ts` and `lib/time.ts` — the pure logic, and where the real
edge cases live.

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

## What I would add with more time

- Integration tests against a real Supabase instance, and end-to-end tests of the two
  check-in flows. Unit tests currently cover the pure logic only.
- An admin view listing and searching all guests and check-ins, with CSV export.
- Rate limiting — the check-in action is currently unauthenticated and public.
````

Replace `<YOUR-VERCEL-URL>` with the real deployment URL.

- [ ] **Step 6: Verify the full test suite and build one last time**

```bash
cd ~/Documents/checkin-app && npm test && npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 7: Commit and push**

```bash
cd ~/Documents/checkin-app
git add README.md
git commit -m "docs: add README with setup and design notes"
git push
```

- [ ] **Step 8: Assemble the reply**

Three deliverables:

1. **Live URL** — the Vercel deployment, smoke-tested in Step 4
2. **Repo** — <https://github.com/kj-dev1024/checkin-app>
3. **Notes** — condense the README's "How it works" and "Decisions and trade-offs" into a
   few sentences, and state honestly anything that cost time or remains unfinished.
