import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';

const generousDurationLimit = { maxRecommendedDurationMinutes: 100_000 };

describe('multi-system tournament recommendations', () => {
  it('eliminates participants at every system transition, even with an oversized K.-o. request', () => {
    for (let playerCount = 4; playerCount <= 32; playerCount += 1) {
      for (const knockoutQualifierCount of [2, 8, playerCount]) {
        const recommendations = recommendTournamentFormats(
          { playerCount, tableCount: 9, minimumMatches: 4 },
          { ...generousDurationLimit, knockoutQualifierCount },
        );
        for (const recommendation of recommendations.filter((item) => item.phases.length > 1)) {
          const entrants = recommendation.phases.map((phase) => phase.entrantCount ?? playerCount);
          expect(entrants[0]).toBe(playerCount);
          for (let index = 1; index < entrants.length; index += 1) {
            expect(entrants[index], `${recommendation.id}: ${entrants.join(' → ')}`).toBeLessThan(entrants[index - 1]);
            expect(entrants[index]).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  it('reduces the field in the group-to-Swiss format and calculates matches using the reduced field', () => {
    const recommendations = recommendTournamentFormats(
      { playerCount: 20, tableCount: 9, minimumMatches: 4 },
      generousDurationLimit,
    );
    const groupSwiss = recommendations.find((item) => item.id === 'groups-swiss');
    expect(groupSwiss).toBeDefined();
    expect(groupSwiss!.phases.map((phase) => phase.entrantCount)).toEqual([20, 12]);
    expect(groupSwiss!.estimatedMatches).toBe(70); // 40 in groups, then 6 × 5 Swiss fixtures.
    expect(groupSwiss!.minimumGuaranteedMatches).toBe(4); // Eliminated players receive no Swiss matches.
  });

  it('cuts participants twice when groups, Swiss and K.-o. are combined', () => {
    const recommendations = recommendTournamentFormats(
      { playerCount: 20, tableCount: 9, minimumMatches: 4 },
      generousDurationLimit,
    );
    const triple = recommendations.find((item) => item.id === 'groups-swiss-ko');
    expect(triple).toBeDefined();
    expect(triple!.phases.map((phase) => phase.entrantCount)).toEqual([20, 12, 8]);
    expect(triple!.estimatedMatches).toBe(77); // 40 group, 30 Swiss, 7 knockout.
    expect(triple!.minimumGuaranteedMatches).toBe(4);
  });

  it('never proposes more Swiss rounds than distinct opponents after qualification', () => {
    const recommendations = recommendTournamentFormats(
      { playerCount: 6, tableCount: 3, minimumMatches: 5 },
      generousDurationLimit,
    );
    const groupSwiss = recommendations.find((item) => item.id === 'groups-swiss');
    expect(groupSwiss).toBeDefined();
    const swiss = groupSwiss!.phases[1];
    expect(swiss.type).toBe('SWISS');
    expect(swiss.swissRounds).toBeLessThanOrEqual((swiss.entrantCount ?? 0) - 1);
  });
});
