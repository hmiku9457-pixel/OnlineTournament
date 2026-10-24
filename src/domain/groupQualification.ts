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
