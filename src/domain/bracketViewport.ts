/** Ab vier Spielen pro Runde beginnt normalerweise das Viertelfinale. */
export function getBracketCompactStartIndex(rounds: ReadonlyArray<{ matches: readonly unknown[] }>): number {
  if (rounds.length <= 3) return 0;
  const firstSmallRound = rounds.findIndex((round) => round.matches.length <= 4);
  return firstSmallRound > 0 ? firstSmallRound : 0;
}
