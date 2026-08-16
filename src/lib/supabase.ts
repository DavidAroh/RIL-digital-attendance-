import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

try {
  // Basic validation to catch common misconfigurations early
  const url = new URL(String(SUPABASE_URL));
  if (!/^https:/i.test(url.protocol)) {
    throw new Error('Invalid Supabase URL: must start with https://');
  }
  if (String(SUPABASE_ANON_KEY).length < 20) {
    throw new Error('Invalid Supabase anon key: value is too short');
  }
} catch (e) {
  throw e instanceof Error ? e : new Error('Invalid Supabase configuration');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  global: {
    headers: {
      apikey: String(SUPABASE_ANON_KEY),
    },
  },
});
