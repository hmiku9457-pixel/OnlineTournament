import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export function subscribeToTournamentMatches(
  tournamentId: string,
  onChange: () => void,
): RealtimeChannel | null {
  if (!supabase) return null;

  return supabase
    .channel(`tournament:${tournamentId}:matches`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'match_sets' },
      onChange,
    )
    .subscribe();
}
