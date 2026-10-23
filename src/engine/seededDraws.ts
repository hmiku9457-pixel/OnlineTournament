/**
 * Seeded hand-off from completed groups into a Swiss phase.
 * Each rank tier alternates group direction: A,B,C,D / D,C,B,A / ...
 * Only qualifying participants are included; no duplicates may be introduced.
 */
export function snakeSeededGroupOrder(rankedGroups: readonly (readonly string[])[], qualifiers: readonly string[]): string[] {
  const eligible = new Set(qualifiers);
  const ordered: string[] = [];
  const seen = new Set<string>();
  const maxRank = Math.max(0, ...rankedGroups.map((group) => group.length));
  for (let rank = 0; rank < maxRank; rank += 1) {
    const groups = rank % 2 === 0 ? rankedGroups : [...rankedGroups].reverse();
    for (const group of groups) {
      const player = group[rank];
      if (player && eligible.has(player) && !seen.has(player)) {
        ordered.push(player);
        seen.add(player);
      }
    }
  }
  // Keep valid qualifiers whose names were not found in the old rankings.
  qualifiers.forEach((name) => { if (!seen.has(name)) { ordered.push(name); seen.add(name); } });
  return ordered;
}

/**
 * Conventional bracket positions (1 vs N, 2 vs N-1 in opposite halves).
 * Non-power-of-two fields give first-round byes to seeds 1, 2, ... in order.
 */
export function seededKnockoutSlots(rankOrderedPlayers: readonly string[]): string[] {
  if (rankOrderedPlayers.length < 2) return [];
  let bracketSize = 2;
  while (bracketSize < rankOrderedPlayers.length) bracketSize *= 2;
  let seeds = [1, 2];
  while (seeds.length < bracketSize) {
    const nextSize = seeds.length * 2;
    seeds = seeds.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return seeds.map((seed) => rankOrderedPlayers[seed - 1] ?? 'Freilos');
}
