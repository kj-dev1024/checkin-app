import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COUNTRY,
  toE164,
  isValidFor,
  formatE164,
  formatAsYouType,
  countryOptions,
  lengthState,
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

describe('lengthState', () => {
  it('is empty for no input, so the field starts neutral', () => {
    expect(lengthState('', 'SG')).toBe('empty')
    expect(lengthState('   ', 'SG')).toBe('empty')
  })

  it('is short while the operator is still typing', () => {
    expect(lengthState('9', 'SG')).toBe('short')
    expect(lengthState('9123', 'SG')).toBe('short')
    expect(lengthState('912345', 'SG')).toBe('short')
  })

  it('is ok at the exact expected length', () => {
    expect(lengthState('91234567', 'SG')).toBe('ok')
    expect(lengthState('2125551234', 'US')).toBe('ok')
  })

  it('treats one digit past a valid SG length as over, not short', () => {
    // libphonenumber reports INVALID_LENGTH here rather than TOO_LONG; both mean "past a
    // length this country accepts", so both must turn the field red.
    expect(lengthState('912345678', 'SG')).toBe('over')
  })

  it('is over when well past the maximum', () => {
    expect(lengthState('9123456789012', 'SG')).toBe('over')
    expect(lengthState('21255512345678', 'US')).toBe('over')
  })

  it('flags non-numeric input', () => {
    expect(lengthState('abc', 'SG')).toBe('not-a-number')
  })

  it('is country-sensitive: 8 digits is ok for SG but short for US', () => {
    expect(lengthState('91234567', 'SG')).toBe('ok')
    expect(lengthState('91234567', 'US')).toBe('short')
  })
})

describe('countryOptions', () => {
  it('returns the full supported country list', () => {
    expect(countryOptions().length).toBeGreaterThan(200)
  })

  it('includes Singapore with dial code and flag', () => {
    const sg = countryOptions().find((c) => c.code === 'SG')
    expect(sg).toEqual({ code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' })
  })

  it('is sorted by country name', () => {
    const names = countryOptions().map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('defaults to Singapore', () => {
    expect(DEFAULT_COUNTRY).toBe('SG')
  })
})
