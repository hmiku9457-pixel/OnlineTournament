/** Persisted number of extra full-field Swiss rounds granted by the tournament director.
 * These are real Swiss rounds: pairings, match history, BHZ and qualification all include them. */
const KEY = 'online-tournament:swiss-extra-rounds:v1';
function records(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, number> : {};
  } catch { return {}; }
}
function id(tournamentId: string, stageId: string) { return `${tournamentId}:${stageId}`; }

export function getSwissExtraRoundCount(tournamentId: string, stageId: string): number {
  const count = records()[id(tournamentId, stageId)];
  return Number.isSafeInteger(count) && count > 0 ? Math.min(count, 50) : 0;
}
export function addSwissExtraRound(tournamentId: string, stageId: string): number {
  if (typeof window === 'undefined') return 0;
  const current = records();
  const next = getSwissExtraRoundCount(tournamentId, stageId) + 1;
  if (next > 50) return 0;
  current[id(tournamentId, stageId)] = next;
  window.localStorage.setItem(KEY, JSON.stringify(current));
  window.dispatchEvent(new CustomEvent('mock-runtime-change'));
  return next;
}
