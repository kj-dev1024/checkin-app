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
