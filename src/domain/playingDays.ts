import type { StageType } from './types';

export interface PlayingDayBreak {
  afterRound: number;
  date: string;
  time: string;
}
export interface PlayingDayPhase {
  type: StageType;
  entrantCount: number;
  groupCount?: number;
  swissRounds?: number;
  estimatedMinutes?: number;
}
export function playingRounds(phase: PlayingDayPhase): number {
  switch (phase.type) {
    case 'SWISS': return Math.max(1, phase.swissRounds ?? 1);
    case 'KNOCKOUT': return Math.ceil(Math.log2(Math.max(2, phase.entrantCount)));
    case 'ROUND_ROBIN': {
      const n = phase.entrantCount;
      return n % 2 ? n : Math.max(1, n - 1);
    }
    case 'GROUPS': {
      const n = Math.ceil(phase.entrantCount / Math.max(1, phase.groupCount ?? 2));
      return n % 2 ? n : Math.max(1, n - 1);
    }
    default: return 0;
  }
}
export interface SuggestedDaySplit {
  betweenPhases: number[];
  insidePhases: Array<{ phaseIndex: number; afterRound: number }>;
  possible: boolean;
}
/** Split at whole-round boundaries; never promise an impossible distribution. */
export function suggestDaySplit(phases: readonly PlayingDayPhase[], days: number): SuggestedDaySplit {
  const slots = phases.flatMap((phase, phaseIndex) => {
    const count = playingRounds(phase);
    return Array.from({ length: count }, (_, index) => ({
      phaseIndex, afterRound: index + 1,
      weight: Math.max(1, (phase.estimatedMinutes ?? count * 15) / count),
    }));
  });
  if (days < 2) return { betweenPhases: [], insidePhases: [], possible: true };
  if (slots.length < days) return { betweenPhases: [], insidePhases: [], possible: false };
  const total = slots.reduce((sum, item) => sum + item.weight, 0);
  const betweenPhases: number[] = [];
  const insidePhases: Array<{ phaseIndex: number; afterRound: number }> = [];
  let previous = 0;
  for (let day = 1; day < days; day++) {
    let best = previous + 1;
    let bestError = Infinity;
    const cutoff = slots.length - (days - day);
    let elapsed = slots.slice(0, best).reduce((sum, x) => sum + x.weight, 0);
    for (let end = best; end <= cutoff; end++) {
      if (end > best) elapsed += slots[end - 1].weight;
      const error = Math.abs(elapsed - total * day / days);
      if (error < bestError) { bestError = error; best = end; }
    }
    const last = slots[best - 1], next = slots[best];
    if (last.phaseIndex === next.phaseIndex) insidePhases.push({ phaseIndex: last.phaseIndex, afterRound: last.afterRound });
    else betweenPhases.push(last.phaseIndex);
    previous = best;
  }
  return { betweenPhases, insidePhases, possible: true };
}
export function followingPlayingDate(startDate: string, index: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (!parts) return startDate;
  const date = new Date(Number(parts[1]), Number(parts[2])-1, Number(parts[3]), 12);
  date.setDate(date.getDate() + index);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
export function configuredPlayingDays(phases: readonly {
  type: string; breakKind?: string; dayBreaks?: readonly PlayingDayBreak[];
}[]): number {
  return 1 + phases.reduce((sum, phase) => sum
    + (phase.type === 'BREAK' && phase.breakKind === 'overnight' ? 1 : 0)
    + (phase.dayBreaks?.length ?? 0), 0);
}
export function validPlayingDayBreaks(breaks: readonly PlayingDayBreak[] | undefined, rounds: number): boolean {
  if (!breaks) return true;
  const seen = new Set<number>();
  return breaks.every((entry) => {
    if (!Number.isInteger(entry.afterRound) || entry.afterRound < 1 || entry.afterRound >= rounds
      || seen.has(entry.afterRound) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) return false;
    seen.add(entry.afterRound);
    return true;
  });
}

/** Stage settings store JSON scalars, so day breaks are serialized as text. */
export function parseSavedPlayingDayBreaks(value: unknown): PlayingDayBreak[] {
  if (typeof value !== 'string') return [];
  try {
    const decoded: unknown = JSON.parse(value);
    if (!Array.isArray(decoded) || decoded.length > 13) return [];
    if (!decoded.every((item) => item && typeof item === 'object' && Number.isInteger(item.afterRound)
      && typeof item.date === 'string' && typeof item.time === 'string')) return [];
    return decoded as PlayingDayBreak[];
  } catch { return []; }
}
