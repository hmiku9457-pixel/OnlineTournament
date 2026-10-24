import type { MatchSet } from '@/domain/types';
import { compareRankingRows, resultMetrics, resultWinnerSide, type WinnerSide } from '@/domain/sportScoring';

/** Ein fertiges Spiel oder ein automatisches Freilos für die Rangberechnung. */
export interface RankingMatch {
  sideA: string;
  sideB: string;
  status?: string;
  sets?: MatchSet[];
  forcedWinner?: string;
  decisionSide?: WinnerSide;
}

export interface RankedParticipant {
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  setsWon: number;
  setsLost: number;
  ballsWon: number;
  ballsLost: number;
  buchholz: number;
}

/** Dieselbe Rangfolge für sichtbare Tabelle, Setzung und Qualifikation. */
export function rankStandings(
  members: readonly string[],
  matches: readonly RankingMatch[],
  sport: string,
  automaticWins: readonly string[] = [],
): RankedParticipant[] {
  const rows = new Map(members.map((name): [string, RankedParticipant] => [name, {
    name, played: 0, wins: 0, losses: 0, draws: 0,
    setsWon: 0, setsLost: 0, ballsWon: 0, ballsLost: 0, buchholz: 0,
  }]));
  const opponents = new Map(members.map((name): [string, string[]] => [name, []]));

  matches.forEach((match) => {
    if (match.status !== 'FINISHED') return;
    const sets = match.sets ?? [];
    if (!sets.length && !match.forcedWinner) return;
    const a = rows.get(match.sideA);
    const b = rows.get(match.sideB);
    if (!a || !b) return;
    a.played += 1;
    b.played += 1;
    opponents.get(match.sideA)!.push(match.sideB);
    opponents.get(match.sideB)!.push(match.sideA);
    const { winsA, winsB } = resultMetrics(sport, sets);
    a.setsWon += winsA;
    a.setsLost += winsB;
    b.setsWon += winsB;
    b.setsLost += winsA;
    sets.forEach((set) => {
      a.ballsWon += set.sideAScore;
      a.ballsLost += set.sideBScore;
      b.ballsWon += set.sideBScore;
      b.ballsLost += set.sideAScore;
    });
    const winnerSide = resultWinnerSide(sport, sets, match.decisionSide);
    if (match.forcedWinner === 'Freilos') {
      a.losses += 1;
      b.losses += 1;
    } else if (match.forcedWinner === match.sideA || (!match.forcedWinner && winnerSide === 'A')) {
      a.wins += 1;
      b.losses += 1;
    } else if (match.forcedWinner === match.sideB || (!match.forcedWinner && winnerSide === 'B')) {
      b.wins += 1;
      a.losses += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
    }
  });

  // Schweizer Freilos: ein Spiel und ein Sieg, aber keine Satz-/Ballpunkte und kein Gegner.
  automaticWins.forEach((name) => {
    const row = rows.get(name);
    if (!row) return;
    row.played += 1;
    row.wins += 1;
  });

  rows.forEach((row) => {
    row.buchholz = (opponents.get(row.name) ?? []).reduce(
      (sum, opponent) => sum + (rows.get(opponent)?.wins ?? 0), 0,
    );
  });
  return [...rows.values()].sort((a, b) => compareRankingRows(sport, a, b));
}
