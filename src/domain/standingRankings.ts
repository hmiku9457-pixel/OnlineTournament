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
  swiss = false,
  plannedRounds?: number,
): RankedParticipant[] {
  const rows = new Map(members.map((name): [string, RankedParticipant] => [name, {
    name, played: 0, wins: 0, losses: 0, draws: 0,
    setsWon: 0, setsLost: 0, ballsWon: 0, ballsLost: 0, buchholz: 0,
  }]));
  const opponents = new Map(members.map((name): [string, Array<{ name: string; unplayed: boolean }>] => [name, []]));
  const score = (row: RankedParticipant) => row.wins + row.draws / 2;

  matches.forEach((match) => {
    if (match.status !== 'FINISHED') return;
    const sets = match.sets ?? [];
    if (!sets.length && !match.forcedWinner) return;
    const a = rows.get(match.sideA);
    const b = rows.get(match.sideB);
    if (!a || !b) return;
    a.played += 1;
    b.played += 1;
    // Kampflos entschiedene Paarungen haben zwar einen zugeordneten Gegner,
    // sind für Buchholz jedoch ungespielte Runden (virtueller Gegner).
    opponents.get(match.sideA)!.push({ name: match.sideB, unplayed: Boolean(match.forcedWinner) });
    opponents.get(match.sideB)!.push({ name: match.sideA, unplayed: Boolean(match.forcedWinner) });
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

  // Buchholz: Summe der Wertungspunkte aller Gegner, mit jeder Begegnung erneut.
  // Nach FIDE-Vorbild erhalten ungespielte Runden virtuelle Gegner:
  // - Freilos: eigene Wertung, maximal Remis-Punkte für alle vorgesehenen Runden.
  // - kampfloses Spiel: eigene Wertung, maximal die Wertung des zugelosten Gegners.
  // Die tatsächlichen Siege, Sätze und Bälle bleiben davon unberührt.
  const byeCap = Math.max(1, plannedRounds ?? Math.max(0, ...[...rows.values()].map((row) => row.played))) / 2;
  rows.forEach((row) => {
    const ownScore = score(row);
    row.buchholz = (opponents.get(row.name) ?? []).reduce((sum, opponent) => {
      const other = rows.get(opponent.name);
      if (!other) return sum;
      return sum + (swiss
        ? opponent.unplayed ? Math.min(ownScore, score(other)) : score(other)
        : other.wins);
    }, 0);
    if (swiss) {
      row.buchholz += automaticWins.filter((name) => name === row.name).length * Math.min(ownScore, byeCap);
    }
  });
  return [...rows.values()].sort((a, b) => compareRankingRows(sport, a, b, swiss));
}
