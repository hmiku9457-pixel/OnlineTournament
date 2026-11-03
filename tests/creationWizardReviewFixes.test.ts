import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';
import { estimatePhaseMetrics, estimateRoundRobinRoundMinutes } from '@/domain/tournamentCreation';
import { buildPlannedTimeline, plannedTimelineConflicts } from '@/domain/tournamentSchedule';

describe('creation wizard review regressions', () => {
  it('offers genuinely reducing knock-out qualification with four players', () => {
    const formats = recommendTournamentFormats(
      { playerCount: 4, tableCount: 2, minimumMatches: 2 },
      { maxResults: 0 },
    );
    expect(formats.find((item) => item.id === 'groups-ko')?.phases.map((phase) => phase.entrantCount))
      .toEqual([4, 2]);
  });

  it('permits groups to qualify three entrants into valid two-round Swiss play', () => {
    const formats = recommendTournamentFormats(
      { playerCount: 4, tableCount: 2, minimumMatches: 2 },
      { maxResults: 0 },
    );
    const groupSwiss = formats.find((item) => item.id === 'groups-swiss');
    expect(groupSwiss?.phases.map((phase) => phase.entrantCount)).toEqual([4, 3]);
    expect(groupSwiss?.phases[1].swissRounds).toBe(2);
  });

  it('does not replace explicitly selected six knock-out qualifiers with four', () => {
    const formats = recommendTournamentFormats(
      { playerCount: 24, tableCount: 8, minimumMatches: 3 },
      { maxResults: 0, knockoutQualifierCount: 6 },
    );
    expect(formats.find((item) => item.id === 'swiss-ko')?.phases.at(-1)?.entrantCount).toBe(6);
  });

  it('uses actual group round waves, not equal duration slices', () => {
    // Ten entrants in 6- and 4-player groups on four tables:
    // five rounds with 5, 5, 5, 3, 3 concurrent matches.
    const rounds = estimateRoundRobinRoundMinutes('GROUPS', 10, 2, 4, 1, undefined, [6, 4]);
    expect(rounds).toEqual([30, 30, 30, 15, 15]);
    expect(rounds.reduce((sum, value) => sum + value, 0))
      .toBe(estimatePhaseMetrics({ type: 'GROUPS', entrantCount: 10,
        groupCount: 2, groupSizes: [6, 4], bestOf: 1 }, 4).estimatedDurationMinutes);
  });

  it('retains turnover after the final timed fixture in a phase', () => {
    const result = estimatePhaseMetrics({ type: 'ROUND_ROBIN',
      entrantCount: 2, bestOf: 1 }, 1,
    { matchDurationMinutes: 30, venueTurnoverMinutes: 5 });
    expect(result.estimatedDurationMinutes).toBe(35);
  });

  it('marks an invalid projected finish as a scheduling conflict', () => {
    const timeline = buildPlannedTimeline('2030-11-03T09:00', [
      { type: 'GROUPS', label: 'Gruppen', estimatedMinutes: 30 },
    ]);
    expect(plannedTimelineConflicts(timeline)).toEqual([]);
    expect(timeline.estimatedEnd).toBe('2030-11-03T09:30');
  });
});
