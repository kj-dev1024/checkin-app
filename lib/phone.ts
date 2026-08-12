import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  validatePhoneNumberLength,
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
 * IMPORTANT: parsePhoneNumberFromString returns `undefined` for unparseable garbage, but
 * returns a TRUTHY object for merely-invalid input ("123" -> "+65123"). Presence of a
 * parse result is therefore NOT a validity check — `.isValid()` is what rejects those.
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

export type LengthState = 'empty' | 'short' | 'ok' | 'over' | 'not-a-number'

/**
 * How the typed number's LENGTH relates to what `country` expects.
 *
 * Separate from validity on purpose: this drives the input's colour while the operator is
 * still typing, where `isValidFor` would be red from the first keystroke and useless.
 *
 * `TOO_LONG` and `INVALID_LENGTH` both collapse to 'over' — for SG, 9 digits reports
 * INVALID_LENGTH rather than TOO_LONG, but from the operator's seat both mean the same
 * thing: you have typed past a length this country accepts.
 */
export function lengthState(input: string, country: CountryCode): LengthState {
  if (!input.trim()) return 'empty'
  const result = validatePhoneNumberLength(input, country)
  if (result === undefined) return 'ok'
  switch (result) {
    case 'TOO_SHORT':
      return 'short'
    case 'TOO_LONG':
    case 'INVALID_LENGTH':
      return 'over'
    default:
      // NOT_A_NUMBER, INVALID_COUNTRY
      return 'not-a-number'
  }
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

/** Every supported country, sorted by name. Built from library data — nothing hand-curated. */
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
