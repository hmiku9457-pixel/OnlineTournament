import type { MatchSet } from './types';

export interface SetBasedRuleSet {
  sport: string;
  bestOf: number;
  pointsToWin: number;
  winBy: number;
}

export const tableTennisRules = (bestOf = 5): SetBasedRuleSet => ({
  sport: 'table_tennis',
  bestOf,
  pointsToWin: 11,
  winBy: 2,
});

export function winsRequired(bestOf: number): number {
  if (bestOf < 1 || bestOf % 2 === 0) throw new Error('bestOf must be a positive odd number');
  return Math.floor(bestOf / 2) + 1;
}

export function isValidFinishedSet(set: MatchSet, rules: SetBasedRuleSet): boolean {
  const high = Math.max(set.sideAScore, set.sideBScore);
  const low = Math.min(set.sideAScore, set.sideBScore);
  if (high < rules.pointsToWin) return false;
  return high - low >= rules.winBy;
}

export function matchSetWins(sets: MatchSet[]): { sideA: number; sideB: number } {
  return sets.reduce(
    (result, set) => {
      if (set.sideAScore > set.sideBScore) result.sideA += 1;
      if (set.sideBScore > set.sideAScore) result.sideB += 1;
      return result;
    },
    { sideA: 0, sideB: 0 },
  );
}

export function hasMatchWinner(sets: MatchSet[], bestOf: number): 'A' | 'B' | null {
  const required = winsRequired(bestOf);
  const wins = matchSetWins(sets);
  if (wins.sideA >= required) return 'A';
  if (wins.sideB >= required) return 'B';
  return null;
}
