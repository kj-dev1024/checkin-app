import { describe, it, expect } from 'vitest'
import { formatTime } from './time'

describe('formatTime', () => {
  it('renders UTC input in Singapore time', () => {
    // 02:30 UTC is 10:30 in Asia/Singapore (UTC+8).
    expect(formatTime('2026-08-13T02:30:00Z')).toBe('10:30')
  })

  it('uses 24-hour clock with a zero-padded hour', () => {
    expect(formatTime('2026-08-13T00:05:00Z')).toBe('08:05')
  })

  it('is independent of the machine timezone', () => {
    expect(formatTime('2026-08-13T10:30:00+08:00')).toBe(formatTime('2026-08-13T02:30:00Z'))
  })
})
