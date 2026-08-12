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
