import { playingRounds, type PlayingDayBreak } from './playingDays';
import type { StageType } from './types';

export const MAX_CREATION_SCHEDULE_ENTRIES = 80;

export interface RoundDependentPhase {
  type: StageType;
  entrantCount: number;
  groupCount: number;
  swissRounds: number;
  dayBreaks: PlayingDayBreak[];
  inlineBreakAfterRound: number;
}

export interface RoundAdjustmentImpact {
  removedDayBreaks: number;
  removedInlineBreak: boolean;
}

/** A change to the number of rounds must not leave invisible, invalid breaks. */
export function reconcileRoundDependentBreaks<T extends RoundDependentPhase>(phase: T): {
  phase: T;
  impact: RoundAdjustmentImpact;
} {
  const rounds = playingRounds(phase);
  const dayBreaks = phase.dayBreaks
    .filter((entry) => entry.afterRound >= 1 && entry.afterRound < rounds)
    .sort((a, b) => a.afterRound - b.afterRound);
  const removedInlineBreak = phase.inlineBreakAfterRound > 0
    && (phase.inlineBreakAfterRound >= rounds || (phase.type !== 'SWISS' && phase.type !== 'KNOCKOUT'));
  const inlineBreakAfterRound = removedInlineBreak ? 0 : phase.inlineBreakAfterRound;
  return {
    phase: { ...phase, dayBreaks, inlineBreakAfterRound },
    impact: { removedDayBreaks: phase.dayBreaks.length - dayBreaks.length, removedInlineBreak },
  };
}

/** A phase is one entry; every in-round interruption adds a break and a resume. */
export function countCreationScheduleEntries(
  phases: readonly RoundDependentPhase[], awardsEnabled = false,
): number {
  return (awardsEnabled ? 1 : 0) + phases.reduce((count, phase) => {
    if (phase.type === 'BREAK') return count + 1;
    const inline = (phase.type === 'SWISS' || phase.type === 'KNOCKOUT')
      && phase.inlineBreakAfterRound > 0 && phase.inlineBreakAfterRound < playingRounds(phase);
    return count + 1 + phase.dayBreaks.length * 2 + (inline ? 2 : 0);
  }, 0);
}

/** A single-day plan has no overnight phase or round-level day boundaries. */
export function convertToSingleDay<T extends RoundDependentPhase & { breakKind: string }>(
  phases: readonly T[],
): T[] {
  return phases.filter((phase) => phase.type !== 'BREAK' || phase.breakKind !== 'overnight')
    .map((phase) => phase.dayBreaks.length ? { ...phase, dayBreaks: [] } : phase);
}

export function countConfiguredDayTransitions<T extends { type: string; breakKind: string; dayBreaks: readonly PlayingDayBreak[] }>(
  phases: readonly T[],
): number {
  return phases.reduce((count, phase) => count + phase.dayBreaks.length
    + (phase.type === 'BREAK' && phase.breakKind === 'overnight' ? 1 : 0), 0);
}
