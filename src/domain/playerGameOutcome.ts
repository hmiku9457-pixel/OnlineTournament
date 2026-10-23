export type PlayerGameTone = 'win' | 'loss' | 'open' | 'neutral';

/** Receives an already player-oriented score (resultForParticipant). */
export function describePlayerGameOutcome(score: string, finished: boolean): { label: string; tone: PlayerGameTone } {
  if (!finished) return { label: 'Offen', tone: 'open' };
  const match = /^(\d+)\s*:\s*(\d+)$/.exec(score);
  if (!match) return { label: 'Kampflos', tone: 'neutral' };
  const own = Number(match[1]);
  const opponent = Number(match[2]);
  if (own > opponent) return { label: 'Sieg', tone: 'win' };
  if (own < opponent) return { label: 'Niederlage', tone: 'loss' };
  return { label: 'Unentschieden', tone: 'neutral' };
}
