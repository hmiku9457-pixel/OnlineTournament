import { supabase } from '@/lib/supabase';

export async function unlockMatch(matchId: string, code: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('verify_match_code', { p_match_id: matchId, p_code: code });
  if (error) throw error;
  return Boolean(data);
}

export async function submitSet(input: {
  matchId: string;
  matchCode: string;
  setNumber: number;
  sideAScore: number;
  sideBScore: number;
}) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('submit_match_set', {
    p_match_id: input.matchId,
    p_match_code: input.matchCode,
    p_set_number: input.setNumber,
    p_side_a_score: input.sideAScore,
    p_side_b_score: input.sideBScore,
  });
  if (error) throw error;
  return data;
}

export async function confirmResult(matchId: string, playerCode: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('confirm_match_result', {
    p_match_id: matchId,
    p_player_code: playerCode,
  });
  if (error) throw error;
  return data;
}

export async function finishMatch(matchId: string, matchCode: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('finish_match_with_code', {
    p_match_id: matchId,
    p_match_code: matchCode,
  });
  if (error) throw error;
  return data;
}
