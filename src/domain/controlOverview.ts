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

export type ControlQueueStatusFilter = 'all' | 'assignable' | 'blocked';

export interface ControlQueueFilters {
  status: ControlQueueStatusFilter;
  group: string;
  matchDay: string;
  search: string;
}

interface FilterableQueueMatch {
  id: string;
  sideA: string;
  sideB: string;
  round: string;
  matchDay?: number;
}

export function filterControlQueueMatches<T extends FilterableQueueMatch>(
  matches: readonly T[],
  filters: ControlQueueFilters,
  assignableIds: ReadonlySet<string>,
): T[] {
  const query = filters.search.trim().toLocaleLowerCase('de-DE');
  return matches.filter((match) => {
    const assignable = assignableIds.has(match.id);
    if (filters.status === 'assignable' && !assignable) return false;
    if (filters.status === 'blocked' && assignable) return false;
    if (filters.group && match.round !== filters.group) return false;
    if (filters.matchDay && match.matchDay !== Number(filters.matchDay)) return false;
    return !query || [match.sideA, match.sideB].some((name) => name.toLocaleLowerCase('de-DE').includes(query));
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

export type ControlQueueOrder = 'scheduled' | 'rest';
interface RestQueueMatch {
  id: string;
  pauseA: number | null;
  pauseB: number | null;
  startedAt?: number;
}

/** Prioritize the shorter of the two measured rest times, then the longer.
 * No measured rest (first match or missing timestamp) is not a fabricated time.
 * Already started, unassigned matches come first for continuation. Stable
 * original order breaks ties. Only current WAITING fixtures may be supplied. */
export function orderControlQueue<T extends RestQueueMatch>(matches: readonly T[], order: ControlQueueOrder): T[] {
  if (order === 'scheduled') return [...matches];
  const rest = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0 ? value : -1;
  return [...matches].sort((a, b) =>
    Number(Boolean(b.startedAt)) - Number(Boolean(a.startedAt))
    || Math.min(rest(b.pauseA), rest(b.pauseB)) - Math.min(rest(a.pauseA), rest(a.pauseB))
    || Math.max(rest(b.pauseA), rest(b.pauseB)) - Math.max(rest(a.pauseA), rest(a.pauseB)));
}
export function summarizeControlQueue<T extends RestQueueMatch>(matches: readonly T[], assignableIds: ReadonlySet<string>) {
  const assignable = matches.filter(match => assignableIds.has(match.id));
  const measured = assignable.filter(match => !match.startedAt && match.pauseA !== null && match.pauseB !== null
    && Number.isFinite(match.pauseA) && Number.isFinite(match.pauseB) && match.pauseA >= 0 && match.pauseB >= 0);
  return { total: matches.length, assignable: assignable.length, blocked: matches.length - assignable.length,
    longestSharedRest: measured.length ? Math.max(...measured.map(match => Math.min(match.pauseA!, match.pauseB!))) : null };
}

/** Instantaneous occupancy, not historical utilization. Deduplicate physical
 * venues and never count a blocked, occupied venue twice. */
export function summarizeVenueCapacity(total:number, occupied:Iterable<string>, blocked:Iterable<string>) {
  const valid = new Set(Array.from({length:Math.max(0,total)},(_,i)=>'Tisch '+(i+1)));
  const used = new Set([...occupied].filter(name=>valid.has(name)));
  const locked = new Set([...blocked].filter(name=>valid.has(name)));
  const unavailable = new Set([...used,...locked]);
  const usable = valid.size - locked.size;
  const busyUsable = [...used].filter(name=>!locked.has(name)).length;
  return {occupied:used.size, blocked:locked.size, free:valid.size-unavailable.size,
    usable, utilization:usable?Math.round(busyUsable/usable*100):null, overlap:[...used].filter(name=>locked.has(name)).length};
}

/** Measured shared rest is a warning, not a scheduling restriction.
 * Missing timestamps and interrupted games do not qualify. */
export function longRestMatches<T extends RestQueueMatch>(matches:readonly T[], assignable:ReadonlySet<string>, threshold:number):T[] {
  return orderControlQueue(matches.filter(m=>assignable.has(m.id)&&!m.startedAt&&m.pauseA!==null&&m.pauseB!==null
    && Number.isFinite(m.pauseA)&&Number.isFinite(m.pauseB)&&Math.min(m.pauseA,m.pauseB)>=threshold),'rest');
}

/** A wall-clock assignment age, not net playing time. */
export function elapsedMatchMinutes(startedAt:number|undefined,now:number):number|null {
 return typeof startedAt==='number'&&Number.isFinite(startedAt)&&startedAt>0&&Number.isFinite(now)&&now>=startedAt?Math.floor((now-startedAt)/60000):null;
}
