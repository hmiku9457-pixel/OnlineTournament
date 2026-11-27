import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import publicConfig from '../../supabase-public.json';

// This is a public, RLS-protected browser key, never a service role key.
// Local development and browser smoke tests remain unconfigured unless opted in.
const url = import.meta.env.VITE_SUPABASE_URL || (import.meta.env.PROD ? publicConfig.url : '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (import.meta.env.PROD ? publicConfig.publishableKey : '');

export const supabaseConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/** A real database round trip, not just a check for configured environment variables. */
export async function checkSupabaseConnection(): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert.');
  const { data, error } = await supabase.rpc('tournament_health_check');
  if (error || data !== true) throw new Error('Die Datenbank ist nicht erreichbar oder der Verbindungstest ist noch nicht eingerichtet.');
}
