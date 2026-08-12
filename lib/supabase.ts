import 'server-only'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill it in.'
  )
}

// Service-role key: bypasses RLS. Must only ever be used from server code.
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
