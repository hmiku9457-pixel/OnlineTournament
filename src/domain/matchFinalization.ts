import type { MatchSet } from '@/domain/types';

export type MatchFinalization = 'IN_PROGRESS' | 'AUTO_FINISH' | 'NEEDS_CONFIRMATION';

/** The last set of BO3+ never finishes a match without a separate confirmation. */
export function getMatchFinalization(bestOf: number, sets: MatchSet[]): MatchFinalization {
  const needed = Math.ceil(Math.max(1, bestOf) / 2);
  let a = 0;
  let b = 0;
  for (const set of sets) {
    if (set.sideAScore > set.sideBScore) a += 1;
    else if (set.sideBScore > set.sideAScore) b += 1;
  }
  if (a < needed && b < needed) return 'IN_PROGRESS';
  return bestOf === 1 ? 'AUTO_FINISH' : 'NEEDS_CONFIRMATION';
}

/** Auch bei BO1 bestätigt die Turnierleitung Schweizer Ergebnisse explizit.
 *  Bei Spielereingaben ersetzen die beiden Spielercodes diese Admin-Bestätigung. */
export function requiresFinalApproval(bestOf: number, sets: MatchSet[], swissAdminEntry: boolean): boolean {
  return getMatchFinalization(bestOf, sets) !== 'IN_PROGRESS' &&
    (bestOf > 1 || swissAdminEntry);
}
