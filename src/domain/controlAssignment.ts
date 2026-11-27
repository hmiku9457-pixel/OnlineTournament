export interface AssignmentCandidate {
  id: string;
  sideA: string;
  sideB: string;
  startedAt?: number;
}
export interface PlannedAssignment { matchId: string; table: string }

/**
 * Plan simultaneous assignments from a single validated eligibility snapshot.
 * Start with the existing greedy priority order, then search for improvements.
 * No result is ever worse in cardinality than that greedy plan. The search
 * stops on the first full allocation or at a fixed work budget. It is not
 * claimed to be a globally optimal solver for large/specialized queues.
 *
 * In rest-priority mode, already-started matches selected by the greedy pass
 * are preserved; avoid delaying resumed play merely to fill another table.
 */
export function planControlAssignments(
  ordered: readonly AssignmentCandidate[],
  eligibleTables: ReadonlyMap<string, readonly string[]>,
  freeTables: readonly string[],
  preserveResumed = false,
): PlannedAssignment[] {
  const free = new Set(freeTables);
  if (!free.size) return [];
  const seen = new Set<string>();
  const candidates = ordered.flatMap(match => {
    if (seen.has(match.id) || !match.sideA || !match.sideB || match.sideA === match.sideB) return [];
    seen.add(match.id);
    const tables = [...new Set(eligibleTables.get(match.id) ?? [])].filter(table => free.has(table));
    return tables.length ? [{ ...match, tables }] : [];
  });
  const occupied = new Set<string>();
  const usedTables = new Set<string>();
  const greedy: PlannedAssignment[] = [];
  for (const match of candidates) {
    if (occupied.has(match.sideA) || occupied.has(match.sideB)) continue;
    const table = match.tables.find(t => !usedTables.has(t));
    if (!table) continue;
    greedy.push({matchId:match.id,table});
    occupied.add(match.sideA); occupied.add(match.sideB); usedTables.add(table);
    if (usedTables.size === free.size) return greedy;
  }
  const participants = new Set(candidates.flatMap(match => [match.sideA, match.sideB]));
  const upperBound = Math.min(free.size, Math.floor(participants.size / 2), candidates.length);
  if (greedy.length >= upperBound || upperBound > 64) return greedy;

  const byId = new Map(candidates.map(match => [match.id,match]));
  const fixed = preserveResumed ? greedy.filter(a => Boolean(byId.get(a.matchId)?.startedAt)) : [];
  occupied.clear(); usedTables.clear();
  for (const assignment of fixed) {
    const match = byId.get(assignment.matchId)!;
    occupied.add(match.sideA); occupied.add(match.sideB); usedTables.add(assignment.table);
  }
  const remaining = candidates.filter(match => !occupied.has(match.sideA) && !occupied.has(match.sideB));
  let best = greedy;
  let budget = 20000;
  const path = [...fixed];
  function search(start: number): void {
    if (path.length > best.length) best = [...path];
    if (best.length >= upperBound || budget <= 0 || path.length + remaining.length - start <= best.length) return;
    for (let i = start; i < remaining.length && budget > 0; i++) {
      if (path.length + remaining.length - i <= best.length) break;
      budget--;
      const match = remaining[i];
      if (occupied.has(match.sideA) || occupied.has(match.sideB)) continue;
      for (const table of match.tables) {
        if (--budget < 0) return;
        if (usedTables.has(table)) continue;
        occupied.add(match.sideA); occupied.add(match.sideB); usedTables.add(table);
        path.push({matchId:match.id,table});
        search(i+1);
        path.pop(); occupied.delete(match.sideA); occupied.delete(match.sideB); usedTables.delete(table);
        if (best.length >= upperBound || budget <= 0) return;
      }
    }
  }
  search(0);
  const positions = new Map(ordered.map((match,index)=>[match.id,index]));
  return best.sort((a,b)=>(positions.get(a.matchId) ?? 0)-(positions.get(b.matchId) ?? 0));
}
