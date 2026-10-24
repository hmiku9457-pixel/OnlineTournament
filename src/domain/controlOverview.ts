export type ControlMatchFilter = 'all' | 'waiting' | 'live' | 'finished';

export interface ControlMatchFilters {
  status: ControlMatchFilter;
  phase: string;
  table: string;
  search: string;
}

interface FilterableMatch {
  id: string;
  status: string;
  phase: string;
  table: string;
  sideA: string;
  sideB: string;
}

export function filterControlMatches<T extends FilterableMatch>(
  matches: T[],
  filters: ControlMatchFilters,
): T[] {
  const query = filters.search.trim().toLocaleLowerCase('de-DE');
  return matches.filter((match) => {
    if (filters.phase && match.phase !== filters.phase) return false;
    if (filters.table && match.table !== filters.table) return false;
    if (query && !`${match.sideA} ${match.sideB}`.toLocaleLowerCase('de-DE').includes(query)) return false;
    switch (filters.status) {
      case 'waiting': return match.status === 'WAITING';
      case 'live': return ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status);
      case 'finished': return match.status === 'FINISHED';
      default: return true;
    }
  });
}

interface PhaseProgressStep { id: string; name: string; started: boolean; completed: boolean }

export function summarizeControlProgress(
  stages: PhaseProgressStep[],
  activeStageId: string | null,
  activeMatches: Array<{ status: string }>,
) {
  const totalPhases = stages.length;
  const completedPhases = stages.filter((stage) => stage.completed).length;
  const current = stages.find((stage) => stage.id === activeStageId)
    ?? stages.find((stage) => !stage.completed)
    ?? stages[stages.length - 1];
  const currentPhaseIndex = current ? stages.indexOf(current) + 1 : 0;
  const matchesInPhase = activeStageId === current?.id ? activeMatches.length : 0;
  const completedMatches = activeStageId === current?.id
    ? activeMatches.filter((match) => match.status === 'FINISHED').length : 0;
  // Folgerunden und K.-o.-Paarungen können erst später entstehen: ein Phasen-
  // Näherungswert ist ehrlicher als eine vermeintlich exakte Turnier-Spielzahl.
  const activeFraction = current?.started && !current.completed && matchesInPhase > 0
    ? Math.min(.99, completedMatches / matchesInPhase) : 0;
  const percent = totalPhases ? Math.round((completedPhases + activeFraction) / totalPhases * 100) : 0;

  return { percent, totalPhases, completedPhases, currentPhaseIndex, currentPhaseName: current?.name ?? '', matchesInPhase, completedMatches };
}
