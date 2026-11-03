import { followingPlayingDate, playingRounds, type PlayingDayBreak } from './playingDays';
import type { StageType } from './types';
import { buildPlannedTimeline, type SchedulePhaseProposal } from './tournamentSchedule';

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
export function convertToSingleDay<T extends RoundDependentPhase & { breakKind: string; breakMinutes?: number }>(
  phases: readonly T[],
  overnightTreatment: 'remove' | 'convert' = 'remove',
): T[] {
  return phases
    .filter((phase) => overnightTreatment === 'convert' || phase.type !== 'BREAK' || phase.breakKind !== 'overnight')
    .map((phase) => ({
      ...phase,
      dayBreaks: [],
      ...(overnightTreatment === 'convert' && phase.type === 'BREAK' && phase.breakKind === 'overnight'
        ? { breakKind: 'minutes', breakMinutes: 15 } : {}),
    } as T));
}

export interface PhaseBreakLoss {
  id: string;
  label: string;
  removedRounds: number[];
  removedInlineBreak: boolean;
  /** Lost early KO round settings, in their former chronological order. */
  removedKnockoutBestOf?: number[];
}

/** Compare complete plans, including later phases altered by entrant normalization. */
export function phaseBreakLosses<T extends RoundDependentPhase & { id: string; label: string; knockoutBestOf?: readonly number[] }>(
  before: readonly T[], after: readonly T[],
): PhaseBreakLoss[] {
  const afterById = new Map(after.map((phase) => [phase.id, phase]));
  return before.flatMap((phase) => {
    const updated = afterById.get(phase.id);
    const retained = new Set(updated?.dayBreaks.map((boundary) => boundary.afterRound) ?? []);
    // Moving a day break to another round is an edit, not a deletion.
    const removedCount = Math.max(0, phase.dayBreaks.length - (updated?.dayBreaks.length ?? 0));
    const removedRounds = phase.dayBreaks.filter((boundary) => !retained.has(boundary.afterRound))
      .slice(0, removedCount).map((boundary) => boundary.afterRound);
    const removedInlineBreak = phase.inlineBreakAfterRound > 0
      && (!updated || updated.inlineBreakAfterRound === 0);
    const originalKo = phase.type === 'KNOCKOUT' ? phase.knockoutBestOf ?? [] : [];
    const newKoLength = updated?.type === 'KNOCKOUT' ? updated.knockoutBestOf?.length ?? 0 : 0;
    const removedKnockoutBestOf = originalKo.slice(0, Math.max(0, originalKo.length - newKoLength));
    return removedRounds.length || removedInlineBreak || removedKnockoutBestOf.length
      ? [{ id: phase.id, label: phase.label, removedRounds, removedInlineBreak,
        ...(removedKnockoutBestOf.length ? { removedKnockoutBestOf: [...removedKnockoutBestOf] } : {}) }] : [];
  });
}

export interface ShiftedPlayingDate {
  afterRound: number;
  previousDate: string;
  nextDate: string;
}

/** Use the projected finish of the actual chosen round, including preceding
 * breaks, rather than guessing from the start date of its phase. */
export function earliestRoundContinuationDate(
  scheduledStart: string, phases: readonly SchedulePhaseProposal[],
  phaseIndex: number, afterRound: number,
): string {
  const simulation = phases.map((phase, index) => index !== phaseIndex ? phase : ({
    ...phase,
    dayBreaks: [
      ...(phase.dayBreaks ?? []).filter((item) => item.afterRound !== afterRound),
      { afterRound, date: '9999-12-31', time: '09:00' },
    ],
  }));
  const timeline = buildPlannedTimeline(scheduledStart, simulation);
  const finish = timeline.items.find((item) => item.id === `day-break-${phaseIndex + 1}-${afterRound}`)?.at;
  return followingPlayingDate((finish || scheduledStart).slice(0, 10), 1);
}

/** Insert at the actual round position; offer dependent date shifts before applying. */
export function proposePlayingDayInsertion(
  current: readonly PlayingDayBreak[], afterRound: number,
  phaseStartDate: string, time = '09:00',
): { dayBreaks: PlayingDayBreak[]; shifted: ShiftedPlayingDate[] } {
  if (current.some((item) => item.afterRound === afterRound)) {
    return { dayBreaks: [...current].sort((a, b) => a.afterRound - b.afterRound), shifted: [] };
  }
  const sorted = [...current].sort((a, b) => a.afterRound - b.afterRound);
  const previous = [...sorted].reverse().find((entry) => entry.afterRound < afterRound);
  const insertedDate = followingPlayingDate(previous?.date || phaseStartDate, 1);
  const next = [...sorted, { afterRound, date: insertedDate, time }].sort((a, b) => a.afterRound - b.afterRound);
  const shifted: ShiftedPlayingDate[] = [];
  let latest = phaseStartDate;
  const dayBreaks = next.map((entry) => {
    const date = entry.date <= latest ? followingPlayingDate(latest, 1) : entry.date;
    if (date !== entry.date && entry.afterRound !== afterRound) {
      shifted.push({ afterRound: entry.afterRound, previousDate: entry.date, nextDate: date });
    }
    latest = date;
    return date === entry.date ? entry : { ...entry, date };
  });
  return { dayBreaks, shifted };
}

/** Reposition a day transition without retaining dates that now run backwards.
 * The moved transition keeps its requested date if possible; later transitions
 * are shifted to the earliest following day and listed for explicit approval. */
export function proposePlayingDayMove(
  current: readonly PlayingDayBreak[], fromRound: number, toRound: number,
  phaseStartDate: string,
): { dayBreaks: PlayingDayBreak[]; shifted: ShiftedPlayingDate[] } {
  const source = current.find((item) => item.afterRound === fromRound);
  if (!source || (toRound !== fromRound && current.some((item) => item.afterRound === toRound))) {
    return { dayBreaks: [...current].sort((a, b) => a.afterRound - b.afterRound), shifted: [] };
  }
  const reordered = current.map((item) => item === source ? { ...item, afterRound: toRound } : { ...item })
    .sort((a, b) => a.afterRound - b.afterRound);
  let previous = phaseStartDate;
  const shifted: ShiftedPlayingDate[] = [];
  const dayBreaks = reordered.map((item) => {
    const date = item.date <= previous ? followingPlayingDate(previous, 1) : item.date;
    if (date !== item.date) shifted.push({
      afterRound: item.afterRound, previousDate: item.date, nextDate: date,
    });
    previous = date;
    return date === item.date ? item : { ...item, date };
  });
  return { dayBreaks, shifted };
}

/** Pauses after the same round cannot coexist. */
export function availableDayBreakRounds(
  totalRounds: number, dayBreaks: readonly PlayingDayBreak[], inlineBreakAfterRound: number,
): number[] {
  return Array.from({ length: Math.max(0, totalRounds - 1) }, (_, i) => i + 1)
    .filter((round) => round !== inlineBreakAfterRound
      && !dayBreaks.some((item) => item.afterRound === round));
}

export function countConfiguredDayTransitions<T extends { type: string; breakKind: string; dayBreaks: readonly PlayingDayBreak[] }>(
  phases: readonly T[],
): number {
  return phases.reduce((count, phase) => count + phase.dayBreaks.length
    + (phase.type === 'BREAK' && phase.breakKind === 'overnight' ? 1 : 0), 0);
}
