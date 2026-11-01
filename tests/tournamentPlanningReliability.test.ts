import { describe, expect, it } from 'vitest';
import { estimatePhaseMetrics, minimumPlayedMatches, recommendedSwissRounds, roundRobinPlayingWaves } from '@/domain/tournamentCreation';
import { recommendTournamentFormats } from '@/engine/recommendations';
import { buildPlannedTimeline, plannedTimelineConflicts, validatePlannedSchedule } from '@/domain/tournamentSchedule';

describe('creation wizard: safe durations and minimum actual matches', () => {
  it('never plans two games per participant in the same round-robin wave', () => {
    // Eight people split into two groups of four have 12 fixtures, but they
    // must be played over 3 rounds even when nine tables are available.
    expect(roundRobinPlayingWaves([4, 4], 9)).toBe(3);
    expect(estimatePhaseMetrics({ type: 'GROUPS', entrantCount: 8, groupCount: 2, bestOf: 1 }, 9, { minutesPerSet: 5 }))
      .toMatchObject({ estimatedMatches: 12, estimatedDurationMinutes: 15 });
    expect(estimatePhaseMetrics({ type: 'ROUND_ROBIN', entrantCount: 8, bestOf: 1 }, 9, { minutesPerSet: 5 }))
      .toMatchObject({ estimatedMatches: 28, estimatedDurationMinutes: 35 });
    expect(roundRobinPlayingWaves([4, 4], 2)).toBe(6);
    // Uneven groups contain byes; a fifth round is required for five-player groups.
    expect(roundRobinPlayingWaves([5, 5, 5, 4], 9)).toBe(5);
  });

  it('counts only actually played matches and warns about byes', () => {
    expect(minimumPlayedMatches('GROUPS', 19, 4)).toBe(3);
    expect(minimumPlayedMatches('SWISS', 9, 2, 4)).toBe(3);
    expect(minimumPlayedMatches('SWISS', 9, 2, 5)).toBe(4);
    expect(minimumPlayedMatches('KNOCKOUT', 6)).toBe(0);
    expect(minimumPlayedMatches('KNOCKOUT', 8)).toBe(1);
    expect(recommendedSwissRounds(9, 4)).toBe(5);

    const suggestions = recommendTournamentFormats(
      { playerCount: 9, tableCount: 9, minimumMatches: 4, sport: 'table_tennis', matchDurationMinutes: 5 },
      { maxRecommendedDurationMinutes: 5000, maxSwissRounds: 4 },
    );
    const swiss = suggestions.find((candidate) => candidate.id === 'swiss');
    expect(swiss).toBeDefined();
    expect(swiss?.minimumGuaranteedMatches).toBe(3);
    expect(swiss?.minimumMatchShortfall).toBe(1);
    const groups = recommendTournamentFormats(
      { playerCount: 9, tableCount: 9, minimumMatches: 4, sport: 'table_tennis', matchDurationMinutes: 5 },
      { maxRecommendedDurationMinutes: 5000 },
    ).find((candidate) => candidate.id === 'groups');
    expect(groups?.minimumGuaranteedMatches).toBe(3);
    expect(groups?.minimumMatchShortfall).toBe(1);
  });

  it('makes clock-bound pauses a blocking schedule conflict and accepts 600-character notes', () => {
    const timeline = buildPlannedTimeline('2026-11-12T10:00', [
      { type: 'SWISS', label: 'Schweizer Phase', estimatedMinutes: 150 },
      { type: 'BREAK', label: 'Pause', estimatedMinutes: 0, breakKind: 'until', breakUntil: '12:00' },
      { type: 'KNOCKOUT', label: 'Finale', estimatedMinutes: 60 },
    ]);
    expect(plannedTimelineConflicts(timeline)).toHaveLength(1);
    expect(plannedTimelineConflicts(timeline)[0]).toContain('12:30 Uhr');
    expect(validatePlannedSchedule([{ id: 'break', at: '2026-11-12T12:30', type: 'break', title: 'Pause', note: 'x'.repeat(600) }]))
      .toEqual([]);
    expect(validatePlannedSchedule([{ id: 'break', at: '2026-11-12T12:30', type: 'break', title: 'Pause', note: 'x'.repeat(601) }]))
      .toHaveLength(1);
  });
});
