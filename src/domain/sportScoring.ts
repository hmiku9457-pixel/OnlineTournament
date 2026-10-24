import type { MatchSet } from '@/domain/types';
import { findSportOption } from '@/domain/sports';
import { parseShortSet } from '@/domain/shortSetNotation';

export type ResultMode = 'score' | 'sets';
export type WinnerSide = 'A' | 'B';

export interface SportScoringRules {
  mode: ResultMode;
  unit: string;
  plural: string;
  allowsDraw: boolean;
  shortSetEntry: boolean;
  recommendedBestOf: number;
}

const setSports = new Set(['table_tennis', 'volleyball', 'beach_volleyball', 'tennis', 'badminton', 'padel', 'squash']);
const drawSports = new Set(['football', 'futsal', 'handball', 'hockey', 'ice_hockey']);

/** Sportregeln werden anhand der ID oder des gespeicherten Anzeigenamens aufgelöst. */
export function sportScoring(sport: string): SportScoringRules {
  const id = findSportOption(sport)?.id ?? 'table_tennis';
  if (setSports.has(id)) {
    const recommendedBestOf = id === 'volleyball' ? 5 : 3;
    return { mode: 'sets', unit: 'Satz', plural: 'Sätze', allowsDraw: false, shortSetEntry: id === 'table_tennis', recommendedBestOf };
  }
  return {
    mode: 'score', unit: id === 'basketball' ? 'Punkt' : 'Tor', plural: id === 'basketball' ? 'Punkte' : 'Tore',
    allowsDraw: drawSports.has(id), shortSetEntry: false, recommendedBestOf: 1,
  };
}

export function setTarget(sport: string, index: number, bestOf: number): number {
  const id = findSportOption(sport)?.id ?? 'table_tennis';
  if (id === 'badminton') return 21;
  if (id === 'tennis' || id === 'padel') return 6;
  if (id === 'volleyball') return bestOf > 1 && index === bestOf - 1 ? 15 : 25;
  if (id === 'beach_volleyball') return bestOf >= 3 && index === 2 ? 15 : 21;
  return 11;
}

export function isValidSportSet(sport: string, bestOf: number, index: number, set: MatchSet): boolean {
  const a = set.sideAScore;
  const b = set.sideBScore;
  if (![a, b].every((value) => Number.isSafeInteger(value) && value >= 0) || a === b) return false;
  const id = findSportOption(sport)?.id ?? 'table_tennis';
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  const target = setTarget(sport, index, bestOf);
  if (id === 'tennis' || id === 'padel') return (winner === 7 && loser === 6) || (winner >= target && winner - loser === 2 && loser <= 5);
  if (id === 'badminton') return (winner === 30 && loser === 29) || (winner >= 21 && winner - loser === 2 && winner <= 30);
  return (winner >= target && winner - loser === 2) || (winner === target && loser < target - 1);
}

/** Andere Satzsportarten verwenden explizit A:B; TT behält die bewährte Kurzschreibweise. */
export function parseSportSet(sport: string, bestOf: number, index: number, value: string): MatchSet | null {
  const parsed = sportScoring(sport).shortSetEntry
    ? parseShortSet(value, index + 1)
    : /^\s*\d+\s*:\s*\d+\s*$/.test(value)
      ? (() => {
          const [a, b] = value.split(':').map(Number);
          return { number: index + 1, sideAScore: a, sideBScore: b };
        })()
      : null;
  return parsed && isValidSportSet(sport, bestOf, index, parsed) ? parsed : null;
}

export function resultMetrics(sport: string, sets: MatchSet[]) {
  const pointsA = sets.reduce((sum, set) => sum + set.sideAScore, 0);
  const pointsB = sets.reduce((sum, set) => sum + set.sideBScore, 0);
  const scoreMode = sportScoring(sport).mode === 'score';
  return {
    pointsA, pointsB,
    winsA: scoreMode ? 0 : sets.filter((set) => set.sideAScore > set.sideBScore).length,
    winsB: scoreMode ? 0 : sets.filter((set) => set.sideBScore > set.sideAScore).length,
  };
}

export function resultScore(sport: string, sets: MatchSet[]): string {
  if (!sets.length) return '0:0';
  const { pointsA, pointsB, winsA, winsB } = resultMetrics(sport, sets);
  return sportScoring(sport).mode === 'score' ? `${pointsA}:${pointsB}` : `${winsA}:${winsB}`;
}

/** Die Entscheidung bei Unentschieden ändert den Endstand nicht. */
export function resultWinnerSide(sport: string, sets: MatchSet[], decisionSide?: WinnerSide): WinnerSide | undefined {
  if (decisionSide) return decisionSide;
  if (!sets.length) return undefined;
  const { pointsA, pointsB, winsA, winsB } = resultMetrics(sport, sets);
  const a = sportScoring(sport).mode === 'score' ? pointsA : winsA;
  const b = sportScoring(sport).mode === 'score' ? pointsB : winsB;
  return a > b ? 'A' : b > a ? 'B' : undefined;
}

export function validateCompleteResult(sport: string, bestOf: number, sets: MatchSet[], knockout: boolean, decisionSide?: WinnerSide): string | null {
  const rules = sportScoring(sport);
  if (rules.mode === 'score') {
    if (sets.length !== 1 || sets.some((set) => !Number.isSafeInteger(set.sideAScore) || !Number.isSafeInteger(set.sideBScore) || set.sideAScore < 0 || set.sideBScore < 0)) {
      return `Bitte beide ${rules.plural.toLowerCase()} als nichtnegative ganze Zahlen eintragen.`;
    }
    if (sets[0].sideAScore === sets[0].sideBScore && !rules.allowsDraw) {
      return 'Ein Unentschieden ist in dieser Sportart nicht zulässig. Bitte den Spielstand nach Verlängerung eintragen.';
    }
    if (sets[0].sideAScore === sets[0].sideBScore && knockout && !decisionSide) {
      return 'Bei Gleichstand muss der Sieger der Entscheidung gewählt werden.';
    }
    return null;
  }
  if (!sets.length || sets.length > bestOf || sets.some((set, index) => !isValidSportSet(sport, bestOf, index, set))) return 'Die Satzergebnisse sind ungültig.';
  const { winsA, winsB } = resultMetrics(sport, sets);
  const needed = Math.ceil(bestOf / 2);
  if (Math.max(winsA, winsB) !== needed) return `Zum Abschluss sind ${needed} gewonnene Sätze erforderlich.`;
  if (sets.slice(0, -1).some((_, index) => {
    const earlier = resultMetrics(sport, sets.slice(0, index + 1));
    return Math.max(earlier.winsA, earlier.winsB) >= needed;
  })) return 'Nach dem entscheidenden Satz dürfen keine weiteren Sätze folgen.';
  return null;
}

/** Einheitliche Wertung für Anzeige UND Qualifikation. */
export function compareRankingRows(
  sport: string,
  a: { name: string; wins: number; draws?: number; setsWon: number; setsLost: number; ballsWon: number; ballsLost: number; buchholz?: number },
  b: { name: string; wins: number; draws?: number; setsWon: number; setsLost: number; ballsWon: number; ballsLost: number; buchholz?: number },
) {
  if (sportScoring(sport).mode === 'score') {
    const pointsA = 3 * a.wins + (a.draws ?? 0);
    const pointsB = 3 * b.wins + (b.draws ?? 0);
    return pointsB - pointsA || (b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost)
      || b.ballsWon - a.ballsWon || b.wins - a.wins || a.name.localeCompare(b.name, 'de');
  }
  return b.wins - a.wins || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
    || b.setsWon - a.setsWon || (b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost)
    || b.ballsWon - a.ballsWon || (b.buchholz ?? 0) - (a.buchholz ?? 0)
    || a.name.localeCompare(b.name, 'de');
}
