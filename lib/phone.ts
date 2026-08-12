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

/**
 * Compute the next field value for a phone input that reformats as you type.
 *
 * Naively re-running the formatter on the raw field value traps backspace. In the US,
 * "(923) " backspaces to "(923)", which reformats straight back to "(923)" — the digits
 * never change, so the caret sticks on the punctuation forever and the field cannot be
 * cleared.
 *
 * When an edit shortened the text without removing a digit, the operator was deleting
 * punctuation the formatter inserted. Honour the intent by dropping the last DIGIT.
 *
 * @param previous the current field value (formatted)
 * @param raw      the value the input element now reports
 */
export function handlePhoneInput(
  previous: string,
  raw: string,
  country: CountryCode
): string {
  const previousDigits = previous.replace(/[^\d]/g, '')
  let nextDigits = raw.replace(/[^\d]/g, '')

  const deleted = raw.length < previous.length
  if (deleted && nextDigits === previousDigits) {
    nextDigits = nextDigits.slice(0, -1)
  }

  if (!nextDigits) return ''
  return formatAsYouType(nextDigits, country)
}

export type LengthState =
  | 'empty'
  | 'short'
  | 'incomplete'
  | 'ok'
  | 'over'
  | 'not-a-number'

/**
 * How the typed number's LENGTH relates to what `country` expects.
 *
 * Separate from validity on purpose: this drives the input's colour while the operator is
 * still typing, where `isValidFor` would be red from the first keystroke and useless.
 *
 * The three failure modes are NOT interchangeable, and conflating them produces wrong
 * messages. A country can have several valid lengths with gaps between them — the
 * Philippines accepts 6, 8, 9 and 10 digits, so 7 digits is `INVALID_LENGTH`: not valid
 * yet, but still on the way to 8. Reporting that as "too long" is simply false.
 *
 *   TOO_SHORT      -> 'short'       below the shortest valid length
 *   INVALID_LENGTH -> 'incomplete'  in a gap between valid lengths; can still grow
 *   TOO_LONG       -> 'over'        past the longest valid length; cannot be rescued
 *
 * Only 'over' is unrecoverable by typing more digits, so only 'over' earns an error.
 */
export function lengthState(input: string, country: CountryCode): LengthState {
  if (!input.trim()) return 'empty'
  const result = validatePhoneNumberLength(input, country)
  if (result === undefined) return 'ok'
  switch (result) {
    case 'TOO_SHORT':
      return 'short'
    case 'INVALID_LENGTH':
      return 'incomplete'
    case 'TOO_LONG':
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
