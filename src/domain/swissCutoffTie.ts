import type { RankedParticipant } from '@/domain/standingRankings';
import { compareRankingRows } from '@/domain/sportScoring';

export interface SwissCutoffTie {
  /** All players sharing the sporting ranking at the qualification boundary. */
  players: string[];
  /** Number of qualifying places available within that tied group. */
  slots: number;
  firstRank: number;
}

/** Ignore the purely alphabetic, technical final fallback of Swiss rankings. */
export function equalSwissSportingRank(a: RankedParticipant, b: RankedParticipant, sport: string): boolean {
  return compareRankingRows(sport, { ...a, name: '' }, { ...b, name: '' }, true) === 0;
}

/** Detect ties only if they actually straddle the qualification cutoff. */
export function findSwissCutoffTie(
  rows: readonly RankedParticipant[],
  sport: string,
  qualifyingPlaces: number,
  withdrawn: ReadonlySet<string> = new Set(),
): SwissCutoffTie | null {
  if (!Number.isInteger(qualifyingPlaces) || qualifyingPlaces < 1) return null;
  const eligible = rows.filter((row) => !withdrawn.has(row.name));
  if (qualifyingPlaces >= eligible.length) return null;
  const left = eligible[qualifyingPlaces - 1];
  const right = eligible[qualifyingPlaces];
  if (!equalSwissSportingRank(left, right, sport)) return null;
  let first = qualifyingPlaces - 1;
  while (first > 0 && equalSwissSportingRank(eligible[first - 1], left, sport)) first -= 1;
  let last = qualifyingPlaces;
  while (last + 1 < eligible.length && equalSwissSportingRank(eligible[last + 1], left, sport)) last += 1;
  return {
    players: eligible.slice(first, last + 1).map((row) => row.name),
    slots: qualifyingPlaces - first,
    firstRank: first + 1,
  };
}

export function applySwissCutoffDecision<T extends { name: string }>(
  rows: readonly T[], tie: SwissCutoffTie | null, winners: readonly string[],
): T[] {
  if (!tie || winners.length !== tie.slots || winners.some((name) => !tie.players.includes(name))) return [...rows];
  const winnersSet = new Set(winners);
  if (winnersSet.size !== winners.length) return [...rows];
  const positions = rows.map((row, index) => tie.players.includes(row.name) ? index : -1).filter((index) => index >= 0);
  if (positions.length !== tie.players.length) return [...rows];
  const ordered = positions.map((i) => rows[i]).sort((a, b) =>
    Number(winnersSet.has(b.name)) - Number(winnersSet.has(a.name)));
  const result = [...rows];
  positions.forEach((position, index) => { result[position] = ordered[index]; });
  return result;
}
