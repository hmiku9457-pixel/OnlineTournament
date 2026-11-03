import { estimateKnockoutRoundMinutes, estimatePhaseMetrics, knockoutRoundLabels, type TimedMatchSettings } from './tournamentCreation';
import { buildPlannedTimeline, plannedTimelineConflicts, playingDayOverflowWarnings, validatePlannedSchedule } from './tournamentSchedule';
import { countCreationScheduleEntries, MAX_CREATION_SCHEDULE_ENTRIES } from './creationPlanTransitions';
import { configuredPlayingDays, followingPlayingDate, playingRounds, suggestDaySplit, type PlayingDayBreak } from './playingDays';
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
}

/** Redistribute the existing phase plan, not a newly generated recommendation.
 * Existing game settings and ordinary pauses survive. An ordinary pause at a
 * chosen day boundary is reused as the overnight transition instead of making
 * two adjacent break phases. Other overnight phases become ordinary pauses. */
export function distributePlayingDays<T extends DayDistributionPhase>(
  phases: readonly T[], days: number, startDate: string, tableCount: number,
  timing: TimedMatchSettings, createOvernight: (entrants: number) => T,
): AutomaticDayDistribution<T> {
  const competition = phases.filter((phase) => phase.type !== 'BREAK');
  const weighted = competition.map((phase) => ({
    ...phase,
    estimatedMinutes: estimatePhaseMetrics(phase, tableCount, timing).estimatedDurationMinutes,
  }));
  const split = suggestDaySplit(weighted, days);
  if (!split.possible || competition.length === 0) {
    return { possible: false, phases: [...phases], convertedExistingBreaks: 0, insertedOvernightBreaks: 0 };
  }
  const between = new Set(split.betweenPhases);
  const inside = new Map<number, number[]>();
  split.insidePhases.forEach(({ phaseIndex, afterRound }) => {
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
        result.push({
          ...phase, dayBreaks: [], breakKind: 'overnight',
          nextDayDate: followingPlayingDate(startDate, dayIndex), nextDayStart: '09:00',
        });
      } else {
        result.push({ ...phase, dayBreaks: [], ...(phase.breakKind === 'overnight'
          ? { breakKind: 'minutes' as const, breakMinutes: 15 } : {}) });
      }
      if ((becomesOvernight && phase.breakKind !== 'overnight')
        || (!becomesOvernight && phase.breakKind === 'overnight')) convertedExistingBreaks++;
      return;
    }
    competitionIndex++;
    const breaks = (inside.get(competitionIndex) ?? []).sort((a, b) => a - b)
      .map((afterRound) => ({
        afterRound, date: followingPlayingDate(startDate, ++dayIndex), time: '09:00',
      }));
    result.push({ ...phase, dayBreaks: breaks });
    if (between.has(competitionIndex) && phases[index + 1]?.type !== 'BREAK') {
      const nextDayDate = followingPlayingDate(startDate, ++dayIndex);
      result.push({
        ...createOvernight(phase.entrantCount), breakKind: 'overnight',
        nextDayDate, nextDayStart: '09:00', dayBreaks: [],
      });
      insertedOvernightBreaks++;
    }
  });
  return {
    possible: configuredPlayingDays(result) === days, phases: result,
    convertedExistingBreaks, insertedOvernightBreaks,
  };
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
    }));
  if (!distribution.possible) return {
    feasible: false, daySplitPossible: false,
    reason: 'Zu wenige vollständige Rundengrenzen für die gewünschten Spieltage.',
  };
  if (countCreationScheduleEntries(distribution.phases) > MAX_CREATION_SCHEDULE_ENTRIES) return {
    feasible: false, daySplitPossible: true,
    reason: 'Die automatische Verteilung überschreitet die Grenze von 80 Zeitplaneinträgen.',
  };
  const proposals = distribution.phases.map((phase) => ({
    label: phase.label, type: phase.type,
    estimatedMinutes: estimatePhaseMetrics(phase, tableCount, timing).estimatedDurationMinutes,
    breakKind: phase.breakKind, breakMinutes: phase.breakMinutes,
    nextDayStart: phase.nextDayStart, nextDayDate: phase.nextDayDate,
    roundCount: playingRounds(phase) || undefined,
    roundDurationsMinutes: phase.type === 'KNOCKOUT'
      ? estimateKnockoutRoundMinutes(phase.entrantCount, tableCount, phase.bestOf, phase.knockoutBestOf, timing)
      : undefined,
    dayBreaks: phase.dayBreaks,
  }));
  const timeline = buildPlannedTimeline(start, proposals);
  const issues = [
    ...plannedTimelineConflicts(timeline), ...playingDayOverflowWarnings(timeline),
    ...validatePlannedSchedule(timeline.items),
  ];
  return issues.length ? {
    feasible: false, daySplitPossible: true,
    reason: issues[0],
  } : { feasible: true, daySplitPossible: true, reason: null };
}
