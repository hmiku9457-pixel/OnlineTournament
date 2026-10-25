/** Separate qualification play-offs; never counted in the regular Swiss/Buchholz results. */
export type PlayoffMode = 'ROUND' | 'ROUND_ROBIN';
export interface PlayoffMatch { sideA: string; sideB: string; pointsA?: number; pointsB?: number }
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

export function playoffQualified(players: readonly string[], slots: number, rounds: readonly PlayoffRound[]): string[] | null {
  if (!rounds.length || rounds.some((round) => !playoffRoundFinished(round))) return null;
  const ranked = playoffScores(players, rounds);
  if (slots < 1 || slots >= ranked.length) return null;
  const a = ranked[slots - 1], b = ranked[slots];
  if (a.points === b.points && a.difference === b.difference && a.scored === b.scored) return null;
  return ranked.slice(0, slots).map((row) => row.name);
}

export function newPlayoffRound(players: readonly string[], kind: PlayoffMode, previous: readonly PlayoffRound[]): PlayoffRound {
  if (kind === 'ROUND_ROBIN') {
    const matches: PlayoffMatch[] = [];
    players.forEach((a, i) => players.slice(i + 1).forEach((b) => matches.push({ sideA: a, sideB: b })));
    return { kind, matches };
  }
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
