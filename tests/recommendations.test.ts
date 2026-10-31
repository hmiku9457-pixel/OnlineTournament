import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';

describe('format recommendations', () => {
  it('prefers Swiss to knockout for a larger field', () => {
    const result = recommendTournamentFormats({ playerCount: 24, tableCount: 8, minimumMatches: 4 });
    expect(result[0].id).toBe('swiss-ko');
    expect(result.some((item) => item.id === 'groups-ko')).toBe(true);
  });

  it('respects the configured maximum number of groups', () => {
    const result = recommendTournamentFormats(
      { playerCount: 24, tableCount: 8, minimumMatches: 4 },
      { maxGroups: 3 },
    );
    expect(result.find((item) => item.id === 'groups-ko')?.label).toContain('3 Gruppen');
    expect(result.find((item) => item.id === 'groups')?.label).toContain('3 Gruppen');
  });

  it('respects Swiss round and knockout participant limits', () => {
    const result = recommendTournamentFormats(
      { playerCount: 24, tableCount: 8, minimumMatches: 4 },
      { maxSwissRounds: 3, knockoutQualifierCount: 6 },
    );
    const swiss = result.find((item) => item.id === 'swiss-ko');
    expect(swiss?.label).toContain('3 Runden Schweizer System');
    expect(swiss?.label).toContain('6 Qualifizierte');
  });

  it('treats systems as independent building blocks', () => {
    const result = recommendTournamentFormats(
      { playerCount: 12, tableCount: 8, minimumMatches: 3 },
      { enabledSystems: { knockout: false, groups: true, swiss: true } },
    );
    expect(result.some((item) => item.requiredSystems.includes('knockout'))).toBe(false);
    expect(result.some((item) => item.id === 'groups-swiss')).toBe(true);
    expect(result.some((item) => item.id === 'groups')).toBe(true);
    expect(result.some((item) => item.id === 'swiss')).toBe(true);
  });

  it('removes group recommendations when groups are disabled', () => {
    const result = recommendTournamentFormats(
      { playerCount: 24, tableCount: 8, minimumMatches: 4 },
      { enabledSystems: { groups: false } },
    );
    expect(result.some((item) => item.requiredSystems.includes('groups'))).toBe(false);
  });

  it('filters formats whose one-set baseline would take too long for the available tables', () => {
    const result = recommendTournamentFormats({ playerCount: 19, tableCount: 6, minimumMatches: 4 });
    expect(result.some((item) => item.id === 'round-robin')).toBe(false);
    expect(result.every((item) => item.estimatedDurationMinutes <= 210)).toBe(true);
  });

  it('recommends a 78-match groups-to-Swiss format when qualification brings it within the duration limit', () => {
    const input = { playerCount: 24, tableCount: 6, minimumMatches: 4 };
    const settings = {
      maxSwissRounds: 3,
      enabledSystems: { knockout: false, groups: true, swiss: true },
      maxRecommendedDurationMinutes: 210,
    };

    const result = recommendTournamentFormats(input, settings);
    const groupSwiss = result.find((item) => item.id === 'groups-swiss');
    expect(groupSwiss).toBeDefined();
    expect(groupSwiss?.phases.map((phase) => phase.entrantCount)).toEqual([24, 12]);
    expect(groupSwiss?.estimatedMatches).toBe(78); // 60 group fixtures + 3 × 6 Swiss fixtures.
    expect(groupSwiss?.estimatedDurationMinutes).toBe(195); // 150 group + 45 Swiss minutes.
    expect(result.every((item) => item.estimatedDurationMinutes <= 210)).toBe(true);

    // A genuinely tighter limit must still exclude this combination.
    const shorter = recommendTournamentFormats(input, {
      ...settings,
      maxRecommendedDurationMinutes: 180,
    });
    expect(shorter.some((item) => item.id === 'groups-swiss')).toBe(false);
    expect(shorter.every((item) => item.estimatedDurationMinutes <= 180)).toBe(true);
  });

});
