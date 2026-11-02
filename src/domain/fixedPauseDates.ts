import type { PlannedTimeline } from './tournamentSchedule';

export interface DateAnchoredPausePhase {
  type: string;
  breakKind: string;
  breakUntilDate: string;
  inlineBreakAfterRound: number;
  inlineBreakKind: string;
  inlineBreakUntilDate: string;
}

/** Persist dates displayed by the pickers when a fixed-time pause first becomes
 * active. Subsequent duration/phase edits may not silently move those dates. */
export function anchorFixedPauseDates<T extends DateAnchoredPausePhase>(
  phases: readonly T[], timeline: PlannedTimeline,
): T[] {
  let modified = false;
  const next = phases.map((phase, index) => {
    const phaseStart = timeline.items.find((item) => item.id === `phase-${index + 1}`)?.at;
    const inlineStart = timeline.items.find((item) => item.id === `inline-break-${index + 1}`)?.at;
    const fixed = phase.type === 'BREAK' && phase.breakKind === 'until'
      && !phase.breakUntilDate && phaseStart ? phaseStart.slice(0, 10) : null;
    const inlineFixed = phase.inlineBreakAfterRound > 0 && phase.inlineBreakKind === 'until'
      && !phase.inlineBreakUntilDate && inlineStart ? inlineStart.slice(0, 10) : null;
    if (!fixed && !inlineFixed) return phase;
    modified = true;
    return {
      ...phase,
      ...(fixed ? { breakUntilDate: fixed } : {}),
      ...(inlineFixed ? { inlineBreakUntilDate: inlineFixed } : {}),
    };
  });
  return modified ? next : phases as T[];
}

/** A new phase type never inherits a no-longer-visible round interruption. */
export function clearInlinePauseOnTypeChange<T extends {
  inlineBreakAfterRound: number; inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number; inlineBreakUntil: string; inlineBreakUntilDate: string;
}>(phase: T): T {
  return { ...phase, inlineBreakAfterRound: 0, inlineBreakKind: 'minutes',
    inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '' };
}
