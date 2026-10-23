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


/** Schweizer Platz 1..N -> Gruppen A..Z im Schlangenverfahren. */
export function seededGroupAssignments(rankOrderedPlayers: readonly string[], groupCount: number): Record<string, number> {
  if (!Number.isInteger(groupCount) || groupCount < 1) return {};
  return Object.fromEntries(rankOrderedPlayers.map((name, index) => {
    const row = Math.floor(index / groupCount);
    const column = index % groupCount;
    return [name, row % 2 === 0 ? column : groupCount - 1 - column];
  }));
}

/**
 * Re-seed the lower seeds to reduce early repeat meetings from a previous group.
 * Preserves standard bracket byes and top seeds' bracket positions. In a 4x2
 * qualifier bracket, group winners/runners can be split across opposite halves.
 */
export function seededKnockoutSlotsAvoidingGroups(
  rankOrderedPlayers: readonly string[], groupByPlayer: Readonly<Record<string, string>>,
): string[] {
  const original = seededKnockoutSlots(rankOrderedPlayers);
  if (original.length < 4 || !rankOrderedPlayers.some((player) => groupByPlayer[player])) return original;
  const byes = new Set<string>();
  for (let i = 0; i < original.length; i += 2) {
    if (original[i] === 'Freilos') byes.add(original[i + 1]);
    if (original[i + 1] === 'Freilos') byes.add(original[i]);
  }
  // Keep seeds 1-2, the highest available seeds and all bye recipients fixed.
  const anchors = new Set(rankOrderedPlayers.slice(0, Math.min(4, rankOrderedPlayers.length)));
  for (const player of byes) anchors.add(player);
  const movable = original.map((player, index) => player !== 'Freilos' && !anchors.has(player) ? index : -1).filter((index) => index >= 0);
  if (movable.length < 2) return original;
  const current = [...original];
  const roundCount = Math.log2(current.length);
  const groupPairs = rankOrderedPlayers.flatMap((a, i) => rankOrderedPlayers.slice(i + 1).filter((b) => groupByPlayer[a] && groupByPlayer[a] === groupByPlayer[b]).map((b) => [a, b] as const));
  if (!groupPairs.length) return original;
  const originalPositions = new Map(original.map((player, index) => [player, index]));
  const cost = (slots: string[]) => {
    const pos = new Map(slots.map((player, index) => [player, index]));
    let penalty = 0;
    for (const [a,b] of groupPairs) {
      const i = pos.get(a)!;
      const j = pos.get(b)!;
      for (let level = 1; level < roundCount; level += 1) {
        if (Math.floor(i / (2 ** level)) === Math.floor(j / (2 ** level))) {
          // Earliest shared bracket block: larger penalty for earlier clashes.
          penalty += 100000 / (2 ** (level - 1));
          break;
        }
      }
    }
    // Prefer conventional seeding when two allocations separate group mates equally well.
    for (const [player,index] of pos) {
      if (player !== 'Freilos') penalty += Math.abs(index - (originalPositions.get(player) ?? index)) / 100;
    }
    return penalty;
  };
  // Deterministic best-improvement swaps, preserving bye placements and seed anchors.
  let best = cost(current);
  for (let iteration = 0; iteration < movable.length * 2; iteration += 1) {
    let bestPair: [number, number] | null = null;
    let candidateCost = best;
    for (let a = 0; a < movable.length; a += 1) {
      for (let b = a + 1; b < movable.length; b += 1) {
        const i = movable[a]; const j = movable[b];
        [current[i], current[j]] = [current[j], current[i]];
        const score = cost(current);
        [current[i], current[j]] = [current[j], current[i]];
        if (score < candidateCost - 0.000001) { candidateCost = score; bestPair = [i,j]; }
      }
    }
    if (!bestPair) break;
    const [i,j] = bestPair;
    [current[i], current[j]] = [current[j], current[i]];
    best = candidateCost;
  }
  return current;
}
