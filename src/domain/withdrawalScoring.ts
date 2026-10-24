import type { MatchSet } from '@/domain/types';
import { findSportOption } from '@/domain/sports';
import { setTarget, sportScoring } from '@/domain/sportScoring';

export type WithdrawnSide = 'A' | 'B' | 'BOTH';

/**
 * Lokale Standardwerte für kampflos gewertete Spiele; keine universell
 * geltenden Verbandsregeln. Die Ausschreibung kann andere Ergebnisse
 * vorschreiben (insbesondere bei Abbruch statt Nichtantreten).
 *
 * Fußball: 3:0, Futsal: 5:0, Handball: 10:0, Basketball: 20:0,
 * Hockey und Eishockey: 5:0.
 *
 * Bei Satzsportarten erhält der Gegner die benötigte Anzahl Sätze
 * mit dem regulären Satz-Zielwert, jeweils zu null.
 */
const scoreAwards: Record<string, number> = {
  football: 3,
  futsal: 5,
  handball: 10,
  basketball: 20,
  hockey: 5,
  ice_hockey: 5,
};

/** Punkt- bzw. Satzergebnisse für kampflos gewertete Gruppenspiele. */
export function getWithdrawalAwardSets(sport: string, bestOf: number, withdrawn: WithdrawnSide): MatchSet[] {
  // Bei zwei Rückzügen gibt es keinen Sieger und keine fiktiven Punkte.
  if (withdrawn === 'BOTH') return [];

  const sportId = findSportOption(sport)?.id ?? sport;
  const scoreMode = sportScoring(sport).mode === 'score';
  const count = scoreMode ? 1 : Math.max(1, Math.ceil(bestOf / 2));

  return Array.from({ length: count }, (_, index): MatchSet => {
    const points = scoreMode ? (scoreAwards[sportId] ?? 3) : setTarget(sport, index, bestOf);
    return {
      number: index + 1,
      sideAScore: withdrawn === 'A' ? 0 : points,
      sideBScore: withdrawn === 'B' ? 0 : points,
    };
  });
}
