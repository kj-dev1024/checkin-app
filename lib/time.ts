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
