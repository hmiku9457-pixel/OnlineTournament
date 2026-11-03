import type { PlannedTimeline } from './tournamentSchedule';
import type { PlayingRoundPause } from './playingDays';

export interface DateAnchoredPausePhase {
  type: string;
  breakKind: string;
  breakUntilDate: string;
  inlineBreakAfterRound: number;
  inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number;
  inlineBreakUntil: string;
  inlineBreakUntilDate: string;
  extraInlineBreaks?: PlayingRoundPause[];
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
    const extras = phase.extraInlineBreaks?.map((pause) => {
      if (pause.kind !== 'until' || pause.untilDate) return pause;
      const start = timeline.items.find((item) => item.id === `inline-break-${index + 1}-${pause.afterRound}`)?.at;
      return start ? { ...pause, untilDate: start.slice(0, 10) } : pause;
    });
    if (!fixed && !inlineFixed && (!extras || extras.every((item, position) => item === phase.extraInlineBreaks?.[position]))) return phase;
    modified = true;
    return {
      ...phase,
      ...(fixed ? { breakUntilDate: fixed } : {}),
      ...(inlineFixed ? { inlineBreakUntilDate: inlineFixed } : {}),
      ...(extras ? { extraInlineBreaks: extras } : {}),
    };
  });
  return modified ? next : phases as T[];
}

/** A new phase type never inherits a no-longer-visible round interruption. */
export function clearInlinePauseOnTypeChange<T extends {
  inlineBreakAfterRound: number; inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number; inlineBreakUntil: string; inlineBreakUntilDate: string;
  extraInlineBreaks?: PlayingRoundPause[];
}>(phase: T): T {
  return { ...phase, inlineBreakAfterRound: 0, inlineBreakKind: 'minutes',
    inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '', extraInlineBreaks: [] };
}
