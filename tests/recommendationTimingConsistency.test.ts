import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';
import { defaultBestOfForStage, estimatePhaseMetrics, isValidSwissRoundCount, recommendedSwissRounds } from '@/domain/tournamentCreation';
import { sportScoring } from '@/domain/sportScoring';

describe('wizard recommendations and phase editor use compatible timing', () => {
  it('uses phase Best-of durations for table tennis, not a one-set baseline', () => {
    const options = recommendTournamentFormats(
      { playerCount: 19, tableCount: 9, minimumMatches: 4, sport: 'table_tennis', matchDurationMinutes: 5 },
      { maxRecommendedDurationMinutes: 10000 },
    );
    const selected = options.find((item) => item.id === 'swiss-ko');
    expect(selected).toBeDefined();
    const expected = selected!.phases.reduce((sum, phase) =>
      sum + estimatePhaseMetrics({
        type: phase.type, entrantCount: phase.entrantCount ?? 19,
        groupCount: phase.groupCount, swissRounds: phase.swissRounds,
        bestOf: defaultBestOfForStage(phase.type),
      }, 9, { minutesPerSet: 5 }).estimatedDurationMinutes, 0);
    expect(selected!.estimatedDurationMinutes).toBe(expected);
    expect(selected!.estimatedDurationMinutes).toBeGreaterThan(0);
  });

  it('uses full fixture duration for sports scored by match result', () => {
    const rules = sportScoring('football');
    expect(rules.mode).toBe('score');
    const options = recommendTournamentFormats(
      { playerCount: 8, tableCount: 2, minimumMatches: 2, sport: 'football',
        matchDurationMinutes: 90, venueTurnoverMinutes: 5 },
      { maxRecommendedDurationMinutes: 10000 },
    );
    const swiss = options.find((item) => item.id === 'swiss');
    expect(swiss).toBeDefined();
    const stage = swiss!.phases[0];
    expect(swiss!.estimatedDurationMinutes).toBe(estimatePhaseMetrics({
      type: stage.type, entrantCount: stage.entrantCount ?? 8,
      bestOf: 1, swissRounds: stage.swissRounds,
    }, 2, { matchDurationMinutes: 90, venueTurnoverMinutes: 5 }).estimatedDurationMinutes);
  });

  it('offers at least two Swiss rounds and no Swiss phase with only two entrants', () => {
    expect(recommendedSwissRounds(3, 1)).toBe(2);
    expect(recommendedSwissRounds(3, 2)).toBe(2);
    expect(recommendedSwissRounds(2, 1)).toBe(2);
    for (const playerCount of [2, 3, 4, 9]) {
      const offers = recommendTournamentFormats(
        { playerCount, tableCount: 4, minimumMatches: 1, sport: 'table_tennis' },
        { maxSwissRounds: 1, maxRecommendedDurationMinutes: 10000 },
      );
      expect(offers.flatMap((option) => option.phases.filter((phase) => phase.type === 'SWISS'))
        .every((phase) => (phase.swissRounds ?? 0) >= 2 && (phase.entrantCount ?? playerCount) >= 3)).toBe(true);
      if (playerCount === 2) expect(offers.some((option) => option.requiredSystems.includes('swiss'))).toBe(false);
      if (playerCount === 3) expect(offers.find((option) => option.id === 'swiss')?.phases[0].swissRounds).toBe(2);
    }
  });

  it('rejects impossible Swiss rounds before creation and at pre-start edits', () => {
    expect(isValidSwissRoundCount(4, 9)).toBe(true);
    expect(isValidSwissRoundCount(1, 2)).toBe(false);
    expect(isValidSwissRoundCount(1, 3)).toBe(false);
    expect(isValidSwissRoundCount(2, 2)).toBe(false);
    expect(isValidSwissRoundCount(2, 3)).toBe(true);
    expect(isValidSwissRoundCount(30, 3)).toBe(false);
    expect(isValidSwissRoundCount(39, 40)).toBe(true);
    expect(isValidSwissRoundCount(40, 40)).toBe(false);
    expect(isValidSwissRoundCount(1.5, 9)).toBe(false);
    expect(isValidSwissRoundCount(0, 9)).toBe(false);
  });
});
