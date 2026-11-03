import { estimateKnockoutRoundMinutes, estimatePhaseMetrics, knockoutRoundLabels, type TimedMatchSettings } from './tournamentCreation';
import { buildPlannedTimeline, plannedTimelineConflicts, playingDayOverflowWarnings, validatePlannedSchedule } from './tournamentSchedule';
import { countCreationScheduleEntries, MAX_CREATION_SCHEDULE_ENTRIES } from './creationPlanTransitions';
import { configuredPlayingDays, followingPlayingDate, playingRounds, validPlayingDayBreaks, type PlayingDayBreak } from './playingDays';
import type { StageType } from './types';
import type { FormatRecommendation } from '../engine/recommendations';

export interface DayDistributionPhase {
  type: StageType;
  label: string;
  entrantCount: number;
  bestOf: number;
  groupCount: number;
  swissRounds: number;
  knockoutBestOf: number[];
  dayBreaks: PlayingDayBreak[];
  breakKind: 'minutes' | 'until' | 'overnight';
  breakMinutes: number;
  nextDayStart: string;
  nextDayDate: string;
  inlineBreakAfterRound: number;
  inlineBreakKind: 'minutes' | 'until';
  inlineBreakMinutes: number;
  inlineBreakUntil: string;
  inlineBreakUntilDate: string;
  breakUntil: string;
  breakUntilDate: string;
}

export interface AutomaticDayDistribution<T> {
  possible: boolean;
  phases: T[];
  convertedExistingBreaks: number;
  insertedOvernightBreaks: number;
  reason?: string;
  /** Explicit differences to display before accepting the proposed plan. */
  changes?: string[];
}

export interface PlayingDaySearchOptions {
  /** Full tournament-local start, not only its calendar date. */
  scheduledStart?: string;
  /** Whether the awards ceremony occupies the final time-plan entry. */
  awardsEnabled?: boolean;
}

export function creationPlanTimeIssues(
  phases: readonly DayDistributionPhase[], scheduledStart: string,
  tables: number, timing: TimedMatchSettings, awardsEnabled = false,
): string[] {
  if (countCreationScheduleEntries(phases, awardsEnabled) > MAX_CREATION_SCHEDULE_ENTRIES) {
    return ['Die automatische Verteilung überschreitet die Grenze von 80 Zeitplaneinträgen.'];
  }
  for (const phase of phases) {
    if (phase.type === 'BREAK') continue;
    if (!validPlayingDayBreaks(phase.dayBreaks, playingRounds(phase))) {
      return [`„${phase.label}“: Spieltagswechsel müssen an gültigen, unterschiedlichen Rundengrenzen liegen.`];
    }
    if (phase.dayBreaks.some((entry) => entry.afterRound === phase.inlineBreakAfterRound)) {
      return [`„${phase.label}“: Zwischenpause und Spieltagsende dürfen nicht auf dieselbe Runde fallen.`];
    }
  }
  const timeline = buildPlannedTimeline(scheduledStart, phases.map((phase) => ({
    label: phase.label, type: phase.type,
    estimatedMinutes: estimatePhaseMetrics(phase, tables, timing).estimatedDurationMinutes,
    breakKind: phase.breakKind, breakMinutes: phase.breakMinutes,
    breakUntil: phase.breakUntil, breakUntilDate: phase.breakUntilDate || undefined,
    nextDayStart: phase.nextDayStart, nextDayDate: phase.nextDayDate,
    roundCount: playingRounds(phase) || undefined,
    roundDurationsMinutes: phase.type === 'KNOCKOUT'
      ? estimateKnockoutRoundMinutes(phase.entrantCount, tables, phase.bestOf, phase.knockoutBestOf, timing)
      : undefined,
    inlineBreakAfterRound: phase.inlineBreakAfterRound,
    inlineBreakKind: phase.inlineBreakKind, inlineBreakMinutes: phase.inlineBreakMinutes,
    inlineBreakUntil: phase.inlineBreakUntil, inlineBreakUntilDate: phase.inlineBreakUntilDate || undefined,
    dayBreaks: phase.dayBreaks,
  })));
  if (!timeline.estimatedEnd) return ['Das gewählte Turnierdatum oder die Startuhrzeit ist ungültig.'];
  return [
    ...plannedTimelineConflicts(timeline),
    ...playingDayOverflowWarnings(timeline),
    ...validatePlannedSchedule(timeline.items),
  ];
}

function distributeAtBoundaries<T extends DayDistributionPhase>(
  phases: readonly T[], boundaries: readonly { phaseIndex: number; afterRound: number; atPhaseEnd: boolean }[],
  startDate: string, createOvernight: (entrants: number) => T,
): AutomaticDayDistribution<T> {
  const between = new Set(boundaries.filter((item) => item.atPhaseEnd).map((item) => item.phaseIndex));
  const inside = new Map<number, number[]>();
  boundaries.filter((item) => !item.atPhaseEnd).forEach(({ phaseIndex, afterRound }) => {
    inside.set(phaseIndex, [...(inside.get(phaseIndex) ?? []), afterRound]);
  });
  let dayIndex = 0;
  let competitionIndex = -1;
  let convertedExistingBreaks = 0;
  let insertedOvernightBreaks = 0;
  const result: T[] = [];
  phases.forEach((phase, index) => {
    if (phase.type === 'BREAK') {
      const becomesOvernight = between.has(competitionIndex);
      if (becomesOvernight) {
        dayIndex++;
        result.push({ ...phase, dayBreaks: [], breakKind: 'overnight',
          nextDayDate: followingPlayingDate(startDate, dayIndex), nextDayStart: '09:00' });
      } else {
        result.push({ ...phase, dayBreaks: [], ...(phase.breakKind === 'overnight'
          ? { breakKind: 'minutes' as const, breakMinutes: 15 } : {}) });
      }
      if ((becomesOvernight && phase.breakKind !== 'overnight')
        || (!becomesOvernight && phase.breakKind === 'overnight')) convertedExistingBreaks++;
      return;
    }
    competitionIndex++;
    const dayBreaks = (inside.get(competitionIndex) ?? []).sort((a, b) => a - b)
      .map((afterRound) => ({ afterRound, date: followingPlayingDate(startDate, ++dayIndex), time: '09:00' }));
    result.push({ ...phase, dayBreaks });
    if (between.has(competitionIndex) && phases[index + 1]?.type !== 'BREAK') {
      const nextDayDate = followingPlayingDate(startDate, ++dayIndex);
      result.push({ ...createOvernight(phase.entrantCount), breakKind: 'overnight',
        nextDayDate, nextDayStart: '09:00', dayBreaks: [] });
      insertedOvernightBreaks++;
    }
  });
  const changes: string[] = [];
  const oldById = new Map(phases.filter((item): item is T & { id: string } => 'id' in item)
    .map((item) => [item.id, item]));
  result.forEach((phase, index) => {
    const previous = 'id' in phase ? oldById.get(String(phase.id)) : phases[index];
    if (!previous) {
      changes.push(`„${phase.label}“: neues Spieltagsende am ${phase.nextDayDate} um ${phase.nextDayStart} Uhr.`);
      return;
    }
    if (phase.type === 'BREAK' && (phase.breakKind !== previous.breakKind
      || (phase.breakKind === 'overnight' && (phase.nextDayDate !== previous.nextDayDate
        || phase.nextDayStart !== previous.nextDayStart)))) {
      const details = previous.breakKind === 'until'
        ? `Pause bis ${previous.breakUntilDate || 'Tag der Pause'} ${previous.breakUntil} Uhr`
        : previous.breakKind === 'minutes' ? `${previous.breakMinutes} Minuten`
          : `Spieltagsende bis ${previous.nextDayDate || 'Folgetag'} ${previous.nextDayStart} Uhr`;
      const newDetails = phase.breakKind === 'overnight'
        ? `Spieltagsende bis ${phase.nextDayDate} ${phase.nextDayStart} Uhr`
        : `${phase.breakMinutes} Minuten`;
      changes.push(`„${phase.label}“: ${details} → ${newDetails}.`);
    }
    if (phase.type !== 'BREAK' && JSON.stringify(previous.dayBreaks) !== JSON.stringify(phase.dayBreaks)) {
      changes.push(`„${phase.label}“: bisherige Rundengrenzen ${previous.dayBreaks.map((b) => `R${b.afterRound} ${b.date} ${b.time}`).join(', ') || 'keine'} → ${phase.dayBreaks.map((b) => `R${b.afterRound} ${b.date} ${b.time}`).join(', ') || 'keine'}.`);
    }
  });
  return { possible: true, phases: result, convertedExistingBreaks, insertedOvernightBreaks, changes };
}

/** Single solver for automatic distribution AND recommendation feasibility.
 * Search alternative whole-round cutoffs when the most balanced proposal collides
 * with a fixed pause or reaches past midnight. Keep the search bounded to avoid
 * combinatorial growth for large Swiss/round-robin tournaments. */
export function distributePlayingDays<T extends DayDistributionPhase>(
  phases: readonly T[], days: number, startDate: string, tableCount: number,
  timing: TimedMatchSettings, createOvernight: (entrants: number) => T,
  options: PlayingDaySearchOptions = {},
): AutomaticDayDistribution<T> {
  const competition = phases.filter((phase) => phase.type !== 'BREAK');
  const impossible = (reason: string): AutomaticDayDistribution<T> => ({
    possible: false, phases: [...phases], convertedExistingBreaks: 0,
    insertedOvernightBreaks: 0, reason, changes: [],
  });
  if (!competition.length) return impossible('Mindestens eine Wettkampfphase erforderlich.');
  const scheduledStart = options.scheduledStart ?? `${startDate}T09:00`;
  if (days === 1) {
    const result = distributeAtBoundaries(phases, [], startDate, createOvernight);
    const issues = creationPlanTimeIssues(result.phases, scheduledStart, tableCount, timing, options.awardsEnabled);
    return issues.length ? impossible(issues[0]) : result;
  }
  if (days < 2 || days > 14) return impossible('Die Anzahl der Spieltage muss zwischen 2 und 14 liegen.');
  const slots = competition.flatMap((phase, phaseIndex) => {
    const rounds = playingRounds(phase);
    const totalMinutes = estimatePhaseMetrics(phase, tableCount, timing).estimatedDurationMinutes;
    return Array.from({ length: rounds }, (_, round) => ({
      phaseIndex, afterRound: round + 1,
      weight: Math.max(1, totalMinutes / rounds),
    }));
  });
  if (slots.length < days) return impossible('Zu wenige vollständige Rundengrenzen für die gewünschten Spieltage.');
  const cumulative = [0];
  slots.forEach((slot) => cumulative.push(cumulative[cumulative.length - 1] + slot.weight));
  const total = cumulative[cumulative.length - 1];
  type PartialPlan = { cuts: number[]; score: number };
  let beam: PartialPlan[] = [{ cuts: [], score: 0 }];
  for (let day = 1; day < days; day++) {
    const next: PartialPlan[] = [];
    const target = total * day / days;
    for (const plan of beam) {
      const lower = (plan.cuts.at(-1) ?? 0) + 1;
      const upper = slots.length - (days - day);
      const candidates: number[] = [];
      // Always consider nearby alternatives, not only the balanced boundary.
      for (let position = lower; position <= upper; position++) {
        const here = slots[position - 1];
        const nextSlot = slots[position];
        // Existing inline pauses cannot double as day-end boundaries.
        if (here.phaseIndex === nextSlot.phaseIndex
          && competition[here.phaseIndex].inlineBreakAfterRound === here.afterRound) continue;
        candidates.push(position);
      }
      candidates.sort((a, b) => Math.abs(cumulative[a] - target) - Math.abs(cumulative[b] - target) || a - b);
      for (const position of candidates.slice(0, 14)) {
        const boundary = slots[position - 1];
        const phase = competition[boundary.phaseIndex];
        // Discourage converting existing fixed-length/until pauses if another
        // similarly balanced whole-round boundary is available.
        const nextIsPhase = slots[position].phaseIndex !== boundary.phaseIndex;
        const competitionSourceIndex = nextIsPhase ? phases.indexOf(phase) : -1;
        const existingBreak = nextIsPhase ? phases[competitionSourceIndex + 1] : undefined;
        const conversionPenalty = existingBreak?.type === 'BREAK'
          && existingBreak.breakKind !== 'overnight' ? 120 : 0;
        next.push({ cuts: [...plan.cuts, position],
          score: plan.score + Math.abs(cumulative[position] - target) + conversionPenalty });
      }
    }
    next.sort((a, b) => a.score - b.score || a.cuts.join(',').localeCompare(b.cuts.join(',')));
    beam = next.slice(0, 64);
    if (!beam.length) return impossible('Keine freien Rundengrenzen für die gewünschte Spieltagsverteilung.');
  }
  let firstIssue = '';
  for (const proposal of beam) {
    const boundaries = proposal.cuts.map((position) => {
      const last = slots[position - 1];
      const following = slots[position];
      return { phaseIndex: last.phaseIndex, afterRound: last.afterRound,
        atPhaseEnd: following.phaseIndex !== last.phaseIndex };
    });
    const candidate = distributeAtBoundaries(phases, boundaries, startDate, createOvernight);
    if (configuredPlayingDays(candidate.phases) !== days) continue;
    const issues = creationPlanTimeIssues(candidate.phases, scheduledStart, tableCount, timing, options.awardsEnabled);
    if (!issues.length) return candidate;
    if (!firstIssue) firstIssue = issues[0];
  }
  return impossible(firstIssue || 'Keine zeitlich durchführbare Aufteilung für die gewählten Spieltage gefunden.');
}

export interface RecommendationTimeAssessment {
  feasible: boolean;
  daySplitPossible: boolean;
  reason: string | null;
}

/** Simulate the exact planning model used by Step 4. Enough rounds are
 * necessary but not sufficient: a day may still overrun midnight. */
export function assessRecommendationTime(
  recommendation: FormatRecommendation,
  options: {
    start: string;
    days: number;
    participants: number;
    tableCount: number;
    timing: TimedMatchSettings;
    bestOfFor: (type: StageType) => number;
  },
): RecommendationTimeAssessment {
  const { start, days, participants, tableCount, timing, bestOfFor } = options;
  const phases: DayDistributionPhase[] = recommendation.phases.map((phase) => {
    const entrantCount = phase.entrantCount ?? participants;
    const bestOf = bestOfFor(phase.type);
    return {
      type: phase.type, label: phase.label, entrantCount,
      bestOf, groupCount: phase.groupCount ?? 2,
      swissRounds: phase.swissRounds ?? 2,
      knockoutBestOf: Array.from({ length: knockoutRoundLabels(entrantCount).length }, () => bestOf),
      dayBreaks: [], breakKind: 'minutes', breakMinutes: 15,
      nextDayStart: '09:00', nextDayDate: '', breakUntil: '12:00', breakUntilDate: '',
      inlineBreakAfterRound: 0, inlineBreakKind: 'minutes',
      inlineBreakMinutes: 15, inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
    };
  });
  const distribution = distributePlayingDays(phases, days, start.slice(0, 10), tableCount, timing,
    (entrants) => ({
      ...phases[0], type: 'BREAK', label: 'Spieltagsende', entrantCount: entrants,
      dayBreaks: [], breakKind: 'overnight', breakMinutes: 15,
      inlineBreakAfterRound: 0,
    }), { scheduledStart: start });
  return {
    feasible: distribution.possible,
    daySplitPossible: days === 1 || phases.reduce((count, phase) => count + playingRounds(phase), 0) >= days,
    reason: distribution.reason ?? null,
  };
}
