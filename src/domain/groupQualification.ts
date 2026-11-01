interface GroupStanding { name: string }

/**
 * Qualifikationsplätze werden gruppenübergreifend nach Platzierung vergeben:
 * zunächst alle Gruppenersten, dann alle Zweiten usw. Ist der letzte Rang
 * nur teilweise qualifiziert, bleibt diese ganze Rangstufe vorläufig offen.
 */
export function getGroupQualificationHints(
  groups: ReadonlyArray<{ standings: readonly GroupStanding[] }>,
  targetCount: number,
  withdrawnNames: ReadonlySet<string> = new Set<string>(),
) {
  const projected = new Set<string>();
  const possible = new Set<string>();
  let remaining = Math.max(0, Math.trunc(targetCount));
  const maxRank = Math.max(0, ...groups.map((group) => group.standings.length));

  for (let index = 0; index < maxRank && remaining > 0; index += 1) {
    const tier = groups.map((group) => group.standings[index]?.name)
      .filter((name): name is string => Boolean(name) && !withdrawnNames.has(name));
    if (tier.length <= remaining) {
      tier.forEach((name) => projected.add(name));
      remaining -= tier.length;
    } else {
      tier.forEach((name) => possible.add(name));
      break;
    }
  }

  return { projected, possible };
}

/** Streichungsregel: Bei unterschiedlich großen Gruppen zählen für einen
 * gruppenübergreifenden Rangvergleich nur Partien gegen Gegner bis zum
 * letzten Rang der kleinsten Gruppe. Gruppentabellen bleiben unverändert. */
export function discardedGroupOpponents(
  fullRanking: readonly { name: string }[],
  smallestGroupSize: number,
): Set<string> {
  return new Set(fullRanking.slice(Math.max(0, smallestGroupSize)).map((row) => row.name));
}

export function recommendedEqualGroupQualifiers(
  entrants: number, groupCount: number, requested: number,
): number | null {
  const count = Math.trunc(entrants);
  const groups = Math.trunc(groupCount);
  if (count < 4 || groups < 2 || groups > Math.floor(count / 2)) return null;
  const candidates = Array.from({ length: Math.floor((count - 1) / groups) }, (_, i) => (i + 1) * groups)
    .filter((value) => value >= 2 && value < count);
  return candidates.sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested) || b - a)[0] ?? null;
}

export function needsGroupStreichungsregel(entrants: number, groups: number, qualifiers: number): boolean {
  return groups >= 2 && entrants % groups !== 0 && qualifiers < entrants && qualifiers % groups !== 0;
}
