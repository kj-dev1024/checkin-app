import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COUNTRY,
  toE164,
  isValidFor,
  formatE164,
  formatAsYouType,
  countryOptions,
  lengthState,
  handlePhoneInput,
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

  it('is over only when past the LONGEST valid length', () => {
    expect(lengthState('9123456789012', 'SG')).toBe('over')
    expect(lengthState('21255512345678', 'US')).toBe('over')
  })

  // Regression: 7 digits for the Philippines was reported as "too long". PH accepts 6, 8,
  // 9 and 10 digits, so 7 sits in a GAP between valid lengths — it is on the way to 8, not
  // past the maximum. Calling that "too long" is false and blocks a legitimate entry.
  it('treats a gap between valid lengths as incomplete, never as over', () => {
    expect(lengthState('9632942', 'PH')).toBe('incomplete')
  })

  it('walks the PH lengths correctly', () => {
    expect(lengthState('96329', 'PH')).toBe('short') // below the shortest valid length
    expect(lengthState('963294', 'PH')).toBe('ok') // 6 is valid
    expect(lengthState('9632942', 'PH')).toBe('incomplete') // 7 is a gap
    expect(lengthState('96329425', 'PH')).toBe('ok') // 8 is valid
    expect(lengthState('9632942555', 'PH')).toBe('ok') // 10 is valid
  })

  it('treats a digit past a valid SG length as incomplete, since SG has longer valid lengths', () => {
    expect(lengthState('912345678', 'SG')).toBe('incomplete')
  })

  it('flags non-numeric input', () => {
    expect(lengthState('abc', 'SG')).toBe('not-a-number')
  })

  it('is country-sensitive: 8 digits is ok for SG but short for US', () => {
    expect(lengthState('91234567', 'SG')).toBe('ok')
    expect(lengthState('91234567', 'US')).toBe('short')
  })
})

describe('right length but invalid prefix', () => {
  // Regression: "(923) 156-7888" has the correct 10 digits for the US, so lengthState is
  // 'ok' and nothing turns red — but 923 is an unassigned area code and 156 is an invalid
  // exchange prefix, so the number is rejected. The form must explain this combination
  // rather than leaving the submit button dead with no message.
  it('reports ok length for a US number whose prefix is unassigned', () => {
    expect(lengthState('(923) 156-7888', 'US')).toBe('ok')
  })

  it('still rejects it as invalid', () => {
    expect(isValidFor('(923) 156-7888', 'US')).toBe(false)
    expect(toE164('(923) 156-7888', 'US')).toBeNull()
  })

  it('rejects a bad area code even with a good exchange', () => {
    expect(isValidFor('(923) 555-1234', 'US')).toBe(false)
  })

  it('rejects a bad exchange even with a good area code', () => {
    expect(isValidFor('(212) 156-7888', 'US')).toBe(false)
  })

  it('accepts genuinely valid US numbers', () => {
    expect(isValidFor('(212) 555-1234', 'US')).toBe(true)
    expect(isValidFor('(415) 555-2671', 'US')).toBe(true)
  })
})

describe('lengthState across every supported country', () => {
  // The PH bug generalised: 53 of 245 countries have GAPS between their valid lengths, and
  // the old mapping reported every gap as "too long". This sweeps all of them and asserts
  // the one invariant that matters — 'over' means unrecoverable, so it must never appear
  // at a length that is still shorter than a valid one.
  it('never reports "over" before a still-valid length', () => {
    const offenders: string[] = []

    for (const country of countryOptions().map((o) => o.code)) {
      const states = Array.from({ length: 17 }, (_, i) =>
        lengthState('9'.repeat(i + 1), country)
      )
      const lastValid = states.lastIndexOf('ok')
      const firstOver = states.indexOf('over')
      if (firstOver !== -1 && lastValid !== -1 && firstOver < lastValid) {
        offenders.push(`${country}: over at ${firstOver + 1}, still valid at ${lastValid + 1}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('classifies gap lengths as incomplete rather than over', () => {
    // A country with known gaps. Every gap below the longest valid length must be
    // 'incomplete', never 'over'.
    const states = Array.from({ length: 12 }, (_, i) => lengthState('9'.repeat(i + 1), 'PH'))
    const lastValid = states.lastIndexOf('ok')
    expect(states.slice(0, lastValid)).not.toContain('over')
  })
})

describe('handlePhoneInput', () => {
  it('formats as digits are typed', () => {
    expect(handlePhoneInput('', '9', 'US')).toBe('9')
    expect(handlePhoneInput('(923', '9231', 'US')).toBe('(923) 1')
  })

  // Regression: backspace used to stick. "(923) " -> backspace -> "(923)" reformats back
  // to "(923)", digits unchanged, so the field could never be cleared.
  it('deletes a digit when backspace removed only punctuation', () => {
    expect(handlePhoneInput('(923) ', '(923)', 'US')).toBe('92')
  })

  it('can always be emptied by repeated backspace', () => {
    let value = handlePhoneInput('', '9231567888', 'US')
    expect(value).toBe('(923) 156-7888')

    const seen = new Set<string>()
    for (let i = 0; i < 25 && value !== ''; i++) {
      // Guard against an infinite loop: a repeated value means it stuck again.
      expect(seen.has(value)).toBe(false)
      seen.add(value)
      value = handlePhoneInput(value, value.slice(0, -1), 'US')
    }
    expect(value).toBe('')
  })

  it('leaves a real digit deletion alone', () => {
    // Removing the trailing "8" changes the digits, so no extra digit should be dropped.
    expect(handlePhoneInput('(923) 156-7888', '(923) 156-788', 'US')).toBe('(923) 156-788')
  })

  it('returns empty for empty input', () => {
    expect(handlePhoneInput('9', '', 'US')).toBe('')
  })

  it('works for SG, which has no punctuation in its format', () => {
    expect(handlePhoneInput('', '91234567', 'SG')).toBe('9123 4567')
    expect(handlePhoneInput('9123 4567', '9123 456', 'SG')).toBe('9123 456')
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
