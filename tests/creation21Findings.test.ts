import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';
import {
  assessRecommendationTime, creationPlanTimeIssues, distributePlayingDays, type DayDistributionPhase,
} from '@/domain/creationPlanRecommendations';
import { proposePlayingDayInsertion, proposePlayingDayMove } from '@/domain/creationPlanTransitions';

function swiss(rounds: number, entrants = 8): DayDistributionPhase {
  return {
    type: 'SWISS', label: 'Schweizer System', entrantCount: entrants,
    bestOf: 1, groupCount: 2, swissRounds: rounds, knockoutBestOf: [],
    breakKind: 'minutes', breakMinutes: 15, breakUntil: '12:00', breakUntilDate: '',
    nextDayStart: '09:00', nextDayDate: '', dayBreaks: [],
    inlineBreakAfterRound: 0, inlineBreakKind: 'minutes', inlineBreakMinutes: 15,
    inlineBreakUntil: '13:00', inlineBreakUntilDate: '',
  };
}
const timing = { matchDurationMinutes: 15, venueTurnoverMinutes: 0 };
function overnight(entrants: number): DayDistributionPhase {
  return { ...swiss(2, entrants), type: 'BREAK', label: 'Spieltagsende',
    breakKind: 'overnight', dayBreaks: [] };
}

describe('creation wizard: comprehensive review regressions', () => {
  it('keeps all recommendation candidates available before feasibility selection', () => {
    const options = { enabledSystems: { 'round-robin': true, groups: true, swiss: true, knockout: true } };
    const input = { playerCount: 16, tableCount: 4, minimumMatches: 4, sport: 'table_tennis' };
    const defaultRecommendations = recommendTournamentFormats(input, options);
    const allCandidates = recommendTournamentFormats(input, { ...options, maxResults: 0 });
    expect(defaultRecommendations.length).toBeLessThanOrEqual(5);
    expect(allCandidates.length).toBeGreaterThan(defaultRecommendations.length);
    expect(allCandidates.length).toBeGreaterThan(5);
  });

  it('finds a late-start day split far from the balanced midpoint', () => {
    const plan = distributePlayingDays([swiss(51, 52)], 2, '2030-11-10', 26, timing,
      overnight, { scheduledStart: '2030-11-10T20:00' });
    expect(plan.possible).toBe(true);
    expect(plan.phases[0].dayBreaks).toHaveLength(1);
    expect(plan.phases[0].dayBreaks[0].afterRound).toBeLessThanOrEqual(15);
  });

  it('preserves a 07:00 continuation when redistributing an existing tournament', () => {
    const phase = swiss(4);
    phase.dayBreaks = [{ afterRound: 1, date: '2030-11-11', time: '07:00' }];
    const result = distributePlayingDays([phase], 2, '2030-11-10', 4, timing,
      overnight, { scheduledStart: '2030-11-10T09:00' });
    expect(result.possible).toBe(true);
    expect(result.phases[0].dayBreaks[0].time).toBe('07:00');
  });

  it('rejects re-distribution if a manual awards ceremony would precede tournament finish', () => {
    const result = distributePlayingDays([swiss(4)], 2, '2030-11-10', 4, timing,
      overnight, { scheduledStart: '2030-11-10T09:00',
        awardsEnabled: true, awardsAtOverride: '2030-11-11T08:00' });
    expect(result.possible).toBe(false);
    expect(result.reason).toMatch(/Siegerehrung/);
  });

  it('never discards a previously preserved but out-of-range inline pause', () => {
    const invalid = swiss(2);
    invalid.inlineBreakAfterRound = 3;
    expect(creationPlanTimeIssues([invalid], '2030-11-10T09:00', 4, timing))
      .toEqual(expect.arrayContaining([expect.stringContaining('Zwischenpause')]));
    const result = distributePlayingDays([invalid], 2, '2030-11-10', 4, timing,
      overnight, { scheduledStart: '2030-11-10T09:00' });
    expect(result.possible).toBe(false);
  });

  it('chooses dates after both the previous playing day and the real round finish', () => {
    const initial = [{ afterRound: 1, date: '2030-11-11', time: '09:00' },
      { afterRound: 3, date: '2030-11-12', time: '09:00' }];
    const added = proposePlayingDayInsertion(initial, 2, '2030-11-10', '09:00', '2030-11-13');
    expect(added.dayBreaks.find((day) => day.afterRound === 2)?.date).toBe('2030-11-13');
    expect(added.dayBreaks.find((day) => day.afterRound === 3)?.date).toBe('2030-11-14');
    const moved = proposePlayingDayMove(initial, 3, 2, '2030-11-10', '2030-11-15');
    expect(moved.dayBreaks.find((day) => day.afterRound === 2)?.date).toBe('2030-11-15');
  });

  it('uses real knockout-round durations rather than assigning equal weights', () => {
    const ko: DayDistributionPhase = {
      ...swiss(2, 16), type: 'KNOCKOUT', entrantCount: 16,
      bestOf: 1, knockoutBestOf: [1, 1, 1, 7],
    };
    const result = distributePlayingDays([ko], 2, '2030-11-10', 16,
      { minutesPerSet: 15 }, overnight, { scheduledStart: '2030-11-10T09:00' });
    expect(result.possible).toBe(true);
    expect(result.phases[0].dayBreaks[0].afterRound).toBeGreaterThanOrEqual(2);
  });

  it('blocks one-day recommendation if it exceeds midnight', () => {
    const rec = recommendTournamentFormats(
      { playerCount: 8, tableCount: 1, minimumMatches: 1, sport: 'football',
        matchDurationMinutes: 300 }, { maxResults: 0 },
    ).find((item) => item.id === 'round-robin')!;
    expect(assessRecommendationTime(rec, {
      start: '2030-11-10T20:00', days: 1, participants: 8,
      tableCount: 1, timing: { matchDurationMinutes: 300 },
      bestOfFor: () => 1,
    }).feasible).toBe(false);
  });
});
