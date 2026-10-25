import { rankStandings, type RankedParticipant, type RankingMatch } from '@/domain/standingRankings';
import { sportScoring } from '@/domain/sportScoring';

/** Separate qualification play-offs; never counted in the regular Swiss/Buchholz results. */
export type PlayoffMode = 'ROUND' | 'ROUND_ROBIN';
export interface PlayoffMatch { sideA: string; sideB: string; pointsA?: number; pointsB?: number; matchDay?: number }
export interface PlayoffRound { kind: PlayoffMode; matches: PlayoffMatch[]; bye?: string }
export interface PlayoffScore { name: string; points: number; difference: number; scored: number; byes: number }

export function playoffScores(players: readonly string[], rounds: readonly PlayoffRound[]): PlayoffScore[] {
  const scores = new Map(players.map((name): [string, PlayoffScore] => [name, { name, points: 0, difference: 0, scored: 0, byes: 0 }]));
  rounds.forEach((round) => {
    if (round.bye) { const row = scores.get(round.bye); if (row) { row.points += 1; row.byes += 1; } }
    round.matches.forEach((match) => {
      if (match.pointsA === undefined || match.pointsB === undefined) return;
      const a = scores.get(match.sideA), b = scores.get(match.sideB);
      if (!a || !b) return;
      a.scored += match.pointsA; b.scored += match.pointsB;
      a.difference += match.pointsA - match.pointsB;
      b.difference += match.pointsB - match.pointsA;
      if (match.pointsA > match.pointsB) a.points += 1;
      else if (match.pointsB > match.pointsA) b.points += 1;
      else { a.points += .5; b.points += .5; }
    });
  });
  return [...scores.values()].sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name, 'de'));
}

export function playoffRoundFinished(round: PlayoffRound): boolean {
  return round.matches.every((match) => match.pointsA !== undefined && match.pointsB !== undefined);
}

/** Full sport-specific standings without Buchholz, reused in Phase 1.5 and
 * qualification. Names are only a display fallback, never a qualification rule. */
function comparePlayoffRows(sport: string, a: RankedParticipant, b: RankedParticipant): number {
  if (sportScoring(sport).mode === 'score') {
    return (3 * b.wins + b.draws) - (3 * a.wins + a.draws)
      || (b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost)
      || b.ballsWon - a.ballsWon || b.wins - a.wins;
  }
  return b.wins - a.wins
    || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
    || b.setsWon - a.setsWon
    || (b.ballsWon - b.ballsLost) - (a.ballsWon - a.ballsLost)
    || b.ballsWon - a.ballsWon;
}

function playedMatches(rounds: readonly PlayoffRound[]): RankingMatch[] {
  return rounds.flatMap((round) => round.matches
    .filter((match) => match.pointsA !== undefined && match.pointsB !== undefined)
    .map((match): RankingMatch => ({
      sideA: match.sideA, sideB: match.sideB, status: 'FINISHED',
      sets: [{ number: 1, sideAScore: match.pointsA!, sideBScore: match.pointsB! }],
    })));
}

export function playoffRankings(players: readonly string[], rounds: readonly PlayoffRound[], sport = 'table_tennis'): RankedParticipant[] {
  const sorted = rankStandings(players, playedMatches(rounds), sport).sort((a, b) =>
    comparePlayoffRows(sport, a, b) || a.name.localeCompare(b.name, 'de'));
  return sorted.map((row) => ({ ...row, buchholz: 0 }));
}

/** Secondary head-to-head classification only within otherwise identical ranks.
 * A cyclic three-way tie stays tied and must never be alphabetically resolved. */
export function playoffRankingsWithHeadToHead(players: readonly string[], rounds: readonly PlayoffRound[], sport = 'table_tennis'): RankedParticipant[] {
  const standings = playoffRankings(players, rounds, sport);
  const games = playedMatches(rounds);
  const ordered: RankedParticipant[] = [];
  for (let i = 0; i < standings.length;) {
    let end = i + 1;
    while (end < standings.length && comparePlayoffRows(sport, standings[i], standings[end]) === 0) end += 1;
    const tied = standings.slice(i, end);
    if (tied.length > 1) {
      const mini = rankStandings(tied.map((row) => row.name),
        games.filter((match) => tied.some((row) => row.name === match.sideA)
          && tied.some((row) => row.name === match.sideB)), sport);
      const lookup = new Map(mini.map((row) => [row.name, row]));
      tied.sort((a, b) => comparePlayoffRows(sport, lookup.get(a.name)!, lookup.get(b.name)!)
        || a.name.localeCompare(b.name, 'de'));
    }
    ordered.push(...tied);
    i = end;
  }
  return ordered;
}

export interface PlayoffBoundaryTie {
  players: string[];
  slots: number;
  alreadyQualified: string[];
}

/** Returns who still requires a *physical* draw after ALL matches and head-to-head.
 * Only the names actually straddling the qualification boundary are candidates. */
export function playoffBoundaryTie(players: readonly string[], slots: number, rounds: readonly PlayoffRound[], sport = 'table_tennis'): PlayoffBoundaryTie | null {
  if (!rounds.length || rounds.some((round) => !playoffRoundFinished(round))) return null;
  const ranking = playoffRankingsWithHeadToHead(players, rounds, sport);
  if (slots <= 0 || slots >= ranking.length) return null;
  const global = playoffRankings(players, rounds, sport);
  const groups = new Map<string, RankedParticipant[]>();
  global.forEach((row) => {
    const key = [
      row.wins, row.draws, row.setsWon, row.setsLost, row.ballsWon, row.ballsLost,
      sportScoring(sport).mode,
    ].join('|');
    const list = groups.get(key) ?? [];
    list.push(row); groups.set(key, list);
  });
  const miniRanks = new Map<string, RankedParticipant>();
  groups.forEach((group) => {
    const groupNames = new Set(group.map((row) => row.name));
    const minis = rankStandings([...groupNames], playedMatches(rounds)
      .filter((game) => groupNames.has(game.sideA) && groupNames.has(game.sideB)), sport);
    minis.forEach((row) => miniRanks.set(row.name, row));
  });
  const sameRank = (a: RankedParticipant, b: RankedParticipant) => {
    if (comparePlayoffRows(sport, a, b) !== 0) return false;
    return comparePlayoffRows(sport, miniRanks.get(a.name)!, miniRanks.get(b.name)!) === 0;
  };
  if (!sameRank(ranking[slots - 1], ranking[slots])) return null;
  let first = slots - 1;
  while (first > 0 && sameRank(ranking[first - 1], ranking[slots - 1])) first--;
  let last = slots;
  while (last + 1 < ranking.length && sameRank(ranking[last + 1], ranking[slots])) last++;
  return {
    players: ranking.slice(first, last + 1).map((row) => row.name),
    slots: slots - first,
    alreadyQualified: ranking.slice(0, first).map((row) => row.name),
  };
}

export function playoffQualified(players: readonly string[], slots: number, rounds: readonly PlayoffRound[], sport = 'table_tennis'): string[] | null {
  if (!rounds.length || rounds.some((round) => !playoffRoundFinished(round))) return null;
  if (slots < 1 || slots >= players.length || playoffBoundaryTie(players, slots, rounds, sport)) return null;
  return playoffRankingsWithHeadToHead(players, rounds, sport).slice(0, slots).map((row) => row.name);
}

/** Circle-method matchday schedule: n-1 days for even n, n for odd n.
 * At most one match per player per day, with balanced byes when odd. */
export function roundRobinMatchdays(players: readonly string[]): PlayoffMatch[] {
  if (players.length < 2) return [];
  const ghost = '__PLAYOFF_BYE__';
  const slots = players.length % 2 ? [...players, ghost] : [...players];
  const result: PlayoffMatch[] = [];
  for (let day = 1; day < slots.length; day++) {
    for (let index = 0; index < slots.length / 2; index++) {
      const a = slots[index], b = slots[slots.length - 1 - index];
      if (a !== ghost && b !== ghost) {
        result.push(day % 2 === 0 ? { sideA: b, sideB: a, matchDay: day } : { sideA: a, sideB: b, matchDay: day });
      }
    }
    const moved = slots.pop()!;
    slots.splice(1, 0, moved);
  }
  return result;
}

export function newPlayoffRound(players: readonly string[], kind: PlayoffMode, previous: readonly PlayoffRound[]): PlayoffRound {
  if (kind === 'ROUND_ROBIN') return { kind, matches: roundRobinMatchdays(players) };
  const standings = playoffScores(players, previous);
  const seen = (a: string, b: string) => previous.some((round) => round.matches.some((match) =>
    (match.sideA === a && match.sideB === b) || (match.sideA === b && match.sideB === a)));
  const byes = standings.map((row) => row.byes);
  const minByes = Math.min(...byes);
  // If odd, award the bye to a player with the fewest previous byes; favor
  // the lowest-ranked candidate so it is not an additional reward for leaders.
  const bye = standings.length % 2 ? [...standings].reverse().find((row) => row.byes === minByes)?.name : undefined;
  const remaining = standings.map((row) => row.name).filter((name) => name !== bye);
  const matches: PlayoffMatch[] = [];
  while (remaining.length >= 2) {
    const a = remaining.shift()!;
    const index = remaining.findIndex((b) => !seen(a, b));
    const b = remaining.splice(index >= 0 ? index : 0, 1)[0];
    matches.push({ sideA: a, sideB: b });
  }
  return { kind, matches, bye };
}
