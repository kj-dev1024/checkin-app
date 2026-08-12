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
