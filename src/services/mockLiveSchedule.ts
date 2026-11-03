import type { DemoTournament } from '@/data/demoTournaments';
import { getPhaseLifecycle } from '@/services/mockPhaseLifecycle';
import { getInlineBreakStatus } from '@/services/mockInlineBreak';
import { parseLocalDateTime, type PlannedScheduleItem } from '@/domain/tournamentSchedule';

/** Keep the original timetable immutable. These are projected deviations,
 * recalculated only from a phase/break that has actually started. */
export interface LiveScheduleDeviation {
  offsetMinutes: number;
  extraMinutes: number;
}

function minutesBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.ceil((later.getTime() - earlier.getTime()) / 60000));
}
function actualTime(iso?: string): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getLiveScheduleDeviations(tournament: DemoTournament): Record<string, LiveScheduleDeviation> {
  const result: Record<string, LiveScheduleDeviation> = {};
  if (!tournament.plannedSchedule?.length) return result;
  const planned = tournament.plannedSchedule;
  const lifecycle = getPhaseLifecycle(tournament);
  let shift = 0;
  tournament.stages.forEach((stage, index) => {
    const id = `phase-${index + 1}`;
    const entry = planned.find((item) => item.id === id);
    if (!entry) return;
    const originally = parseLocalDateTime(entry.at);
    const started = actualTime(lifecycle.stageStartedAt?.[stage.id]);
    // The actual start is authoritative. Early starts never create a + tag.
    if (originally && started) shift = minutesBetween(started, originally);
    const stageExtra = started ? Math.max(0, lifecycle.stageExtraMinutes?.[stage.id] ?? 0) : 0;
    result[id] = { offsetMinutes: shift, extraMinutes: stageExtra };
    if (stage.type === 'BREAK') {
      const next = planned.find((item) => item.id === `phase-${index + 2}`);
      const nextOriginal = next ? parseLocalDateTime(next.at) : null;
      const resume = actualTime(lifecycle.breakResumeAt?.[stage.id]);
      if (started && resume && nextOriginal) {
        // The director's chosen resume time (duration or clock) replaces any
        // predicted absorption by a fixed-end break.
        shift = minutesBetween(resume, nextOriginal);
      } else if (!started && (stage.settings.breakKind === 'until' || stage.settings.breakKind === 'overnight')) {
        // An unstarted break with a fixed clock target can absorb earlier
        // delays, but never make the projected tournament earlier than planned.
        shift = Math.max(0, shift - Math.max(0, entry.durationMinutes ?? 0));
      }
    } else {
      const inline = getInlineBreakStatus(tournament, stage);
      if (inline?.resumeAt) {
        const originalResume = planned.find((item) => item.id === `inline-resume-${index + 1}-${inline.config.afterRound}`)
          ?? planned.find((item) => item.id === `inline-resume-${index + 1}`);
        const expected = originalResume ? parseLocalDateTime(originalResume.at) : null;
        if (expected) {
          const extra = minutesBetween(inline.resumeAt, expected);
          shift = Math.max(shift + stageExtra, extra);
        } else shift += stageExtra;
      } else shift += stageExtra;
    }
  });
  // Only show delay projections for later phases, breaks and the ceremony;
  // never rewrite the original dates in tournament.plannedSchedule.
  const finalShift = shift;
  planned.forEach((item: PlannedScheduleItem) => {
    if (item.id === 'award-ceremony' && finalShift > 0) {
      result[item.id] = { offsetMinutes: finalShift, extraMinutes: 0 };
    }
  });
  return result;
}
