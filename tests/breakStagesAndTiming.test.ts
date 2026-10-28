import { describe, expect, it } from 'vitest';
import { planningMinutesPerSet } from '@/domain/sports';
import { estimatePhaseMetrics, estimateTournamentDurationMinutes, hasValidBreakStageOrder } from '@/domain/tournamentCreation';

describe('sport-specific set planning durations', () => {
  const cases = [
    ['Tischtennis', 5], ['Squash', 12], ['Badminton', 15],
    ['Beachvolleyball', 22], ['Volleyball', 25], ['Padel', 45], ['Tennis', 50],
  ] as const;

  it.each(cases)('%s uses the upper planning bound of %i minutes', (sport, minutes) => {
    expect(planningMinutesPerSet(sport)).toBe(minutes);
  });

  it('uses chosen set duration in estimates without changing the existing fallback', () => {
    const phase = { type: 'ROUND_ROBIN' as const, entrantCount: 4, bestOf: 1 };
    expect(estimateTournamentDurationMinutes([phase], 2)).toBe(45);
    expect(estimateTournamentDurationMinutes([phase], 2, { minutesPerSet: 5 })).toBe(15);
    expect(estimateTournamentDurationMinutes([phase], 2, { minutesPerSet: 50 })).toBe(150);
  });
});

describe('break phases', () => {
  const base = { type: 'BREAK' as const, entrantCount: 8, bestOf: 1 };
  it('adds normal breaks but excludes overnight gaps from playing duration', () => {
    expect(estimatePhaseMetrics({ ...base, breakMinutes: 25, breakKind: 'minutes' }, 4))
      .toMatchObject({ estimatedMatches: 0, estimatedDurationMinutes: 25 });
    expect(estimatePhaseMetrics({ ...base, breakKind: 'overnight', breakMinutes: 25 }, 4))
      .toMatchObject({ estimatedMatches: 0, estimatedDurationMinutes: 0 });
  });
  it('permits breaks between competitions, never first, last or adjacent', () => {
    expect(hasValidBreakStageOrder(['GROUPS', 'BREAK', 'SWISS', 'BREAK', 'KNOCKOUT'])).toBe(true);
    expect(hasValidBreakStageOrder(['BREAK', 'GROUPS'])).toBe(false);
    expect(hasValidBreakStageOrder(['SWISS', 'BREAK'])).toBe(false);
    expect(hasValidBreakStageOrder(['GROUPS', 'BREAK', 'BREAK', 'KNOCKOUT'])).toBe(false);
  });
});
