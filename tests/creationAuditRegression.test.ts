import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';
import { MAX_RECOMMENDATION_DURATION, normalizeRecommendationDuration }
  from '@/components/RecommendationDurationPicker';
import { convertToSingleDay, singleDayFixedPauseConflicts } from '@/domain/creationPlanTransitions';
import { generatedScheduleTitle, isAmbiguousLocalDateTime, parseLocalDateTime,
  toLocalDateTime, buildPlannedTimeline } from '@/domain/tournamentSchedule';
import { TOURNAMENT_TIME_ZONE } from '@/domain/tournamentLocalTime';

describe('tournament creation audit regression checks', () => {
  it('keeps shortfall knockout as a low-priority candidate and offers smaller qualifier cuts', () => {
    const candidates = recommendTournamentFormats(
      { playerCount: 12, tableCount: 4, minimumMatches: 4 },
      { maxResults: 0, knockoutQualifierCount: 8 },
    );
    expect(candidates.find((item) => item.id === 'single-ko')?.minimumMatchShortfall).toBe(3);
    const cuts = candidates.filter((item) => item.id.startsWith('groups-ko'))
      .map((item) => item.phases.at(-1)?.entrantCount);
    expect(cuts).toContain(8);
    expect(cuts).toContain(4);
    expect(cuts).toContain(2);
  });

  it('supports active duration targets above 24h only for a multi-day picker', () => {
    expect(normalizeRecommendationDuration(30, 15)).toBeNull();
    expect(normalizeRecommendationDuration(30, 15, MAX_RECOMMENDATION_DURATION)).toBe(1815);
  });

  it('keeps automatically generated headings within 80 characters', () => {
    const name = 'Ein besonders langer Phasenname mit vielen Zeichen und Vereinsangaben 2026 U19';
    const title = generatedScheduleTitle('Spieltagsende nach Runde 10', name);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title).toContain('Spieltagsende nach Runde 10');
    const timeline = buildPlannedTimeline('2030-11-10T09:00', [{
      type: 'SWISS', label: name, estimatedMinutes: 60, roundCount: 3,
      dayBreaks: [{ afterRound: 1, date: '2030-11-11', time: '09:00' }],
    }]);
    expect(timeline.items.every((item) => item.title.length <= 80)).toBe(true);
  });

  it('discloses and safely converts fixed pauses that cross the single-day boundary', () => {
    const phase = {
      id: 'phase-2', type: 'SWISS' as const, entrantCount: 6, groupCount: 2, swissRounds: 4,
      dayBreaks: [], inlineBreakAfterRound: 2, inlineBreakKind: 'until' as const,
      inlineBreakMinutes: 15, inlineBreakUntilDate: '2030-11-11',
      breakKind: 'minutes' as const, breakMinutes: 20, breakUntilDate: '',
    };
    expect(singleDayFixedPauseConflicts([phase], '2030-11-10')).toHaveLength(1);
    const converted = convertToSingleDay([phase], 'convert', '2030-11-10');
    expect(converted[0].inlineBreakKind).toBe('minutes');
    expect(converted[0].inlineBreakUntilDate).toBe('');
  });

  it('interprets local wall times in Europe/Berlin instead of the browser timezone', () => {
    expect(TOURNAMENT_TIME_ZONE).toBe('Europe/Berlin');
    expect(parseLocalDateTime('2030-11-21T09:00')?.toISOString()).toBe('2030-11-21T08:00:00.000Z');
    expect(toLocalDateTime(new Date('2030-11-21T08:00:00.000Z'))).toBe('2030-11-21T09:00');
    expect(isAmbiguousLocalDateTime('2027-10-31T02:30')).toBe(true);
    expect(parseLocalDateTime('2027-10-31T02:30')).toBeNull();
    expect(isAmbiguousLocalDateTime('2027-03-28T02:30')).toBe(false);
    expect(parseLocalDateTime('2027-03-28T02:30')).toBeNull();
    expect(parseLocalDateTime('2027-03-28T03:00')!.getTime()
      - parseLocalDateTime('2027-03-28T01:59')!.getTime()).toBe(60_000);
  });
});
