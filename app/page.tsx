import { getSnapshot } from './actions'
import CheckInForm from './check-in-form'

// The count changes at runtime, so this page must never be statically cached.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { count, recent } = await getSnapshot()

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <CheckInForm initialCount={count} initialRecent={recent} />
    </main>
  )
}
