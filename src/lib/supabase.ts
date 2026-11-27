import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
