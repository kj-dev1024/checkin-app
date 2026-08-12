'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { checkIn, registerGuest } from './actions'
import type { CheckInResult, RecentCheckIn } from './types'
import {
  countryOptions,
  isValidFor,
  formatAsYouType,
  formatE164,
  lengthState,
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

  // Country picker state.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const options = countryOptions()
  const selected = options.find((o) => o.code === country) ?? options[0]

  // Read localStorage in an effect, never during render — reading it during render
  // makes the server and client output differ and breaks hydration.
  useEffect(() => {
    const saved = localStorage.getItem(COUNTRY_STORAGE_KEY)
    if (saved) setCountry(saved as CountryCode)
  }, [])

  useEffect(() => {
    if (unknownPhone) nameRef.current?.focus()
  }, [unknownPhone])

  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus()
  }, [pickerOpen])

  // Close the picker on an outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) closePicker()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePicker()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen])

  // Match on country name, dial code, or ISO code, so "sing", "65" and "SG" all find
  // Singapore. Digits are compared with any leading "+" stripped.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    const digits = q.replace(/\D/g, '')
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase() === q ||
        (digits.length > 0 && o.dialCode.slice(1).startsWith(digits))
    )
  }, [options, search])

  function closePicker() {
    setPickerOpen(false)
    setSearch('')
  }

  function pickCountry(next: CountryCode) {
    setCountry(next)
    localStorage.setItem(COUNTRY_STORAGE_KEY, next)
    closePicker()
    phoneRef.current?.focus()
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
  const length = lengthState(phone, country)
  // Red only once the operator has typed PAST a length this country accepts. Going red on
  // 'short' would mean the field is red from the first keystroke, which teaches nothing.
  const tooLong = length === 'over' || length === 'not-a-number'
  // Right number of digits, still not a real number — an unassigned area code or an
  // invalid exchange prefix. Without this the button just sits dead with no explanation,
  // because nothing about the length is wrong.
  const wrongPrefix = length === 'ok' && !phoneIsValid
  const showError = tooLong || wrongPrefix

  const errorText =
    length === 'not-a-number'
      ? 'Digits only, please.'
      : length === 'over'
        ? `Too long for ${selected.name} (${selected.dialCode}).`
        : wrongPrefix
          ? `Not a valid ${selected.name} number. The length is right, but that prefix is not in use.`
          : null

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
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  aria-label={`Country: ${selected.name}`}
                  aria-expanded={pickerOpen}
                  onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
                  className="flex h-full w-28 items-center justify-between gap-1 rounded-lg border border-slate-300 bg-white px-2 py-3 text-base"
                >
                  <span className="truncate">
                    {selected.flag} {selected.dialCode}
                  </span>
                  <span aria-hidden className="text-xs text-slate-400">
                    ▼
                  </span>
                </button>

                {pickerOpen && (
                  <div className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search country or code"
                      className="w-full border-b border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                    {filtered.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-slate-400">No match.</p>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto">
                        {filtered.map((option) => (
                          <li key={option.code}>
                            <button
                              type="button"
                              onClick={() => pickCountry(option.code)}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                                option.code === country ? 'bg-slate-50 font-medium' : ''
                              }`}
                            >
                              <span>{option.flag}</span>
                              <span className="flex-1 truncate">{option.name}</span>
                              <span className="tabular-nums text-slate-500">
                                {option.dialCode}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <input
                id="phone"
                ref={phoneRef}
                inputMode="tel"
                autoComplete="off"
                placeholder="9123 4567"
                aria-invalid={showError}
                value={phone}
                onChange={(e) => setPhone(formatAsYouType(e.target.value, country))}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-3 text-lg outline-none ${
                  showError
                    ? 'border-red-500 bg-red-50 text-red-700 focus:border-red-600'
                    : 'border-slate-300 focus:border-slate-500'
                }`}
              />
            </div>

            {errorText && (
              <p role="alert" className="-mt-1 text-sm text-red-600">
                {errorText}
              </p>
            )}

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
