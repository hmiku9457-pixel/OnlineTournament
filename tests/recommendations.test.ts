import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';

describe('format recommendations', () => {
  it('includes Swiss to knockout for a larger field', () => {
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
  });

  it('respects Swiss round and knockout qualifier limits', () => {
    const result = recommendTournamentFormats(
      { playerCount: 24, tableCount: 8, minimumMatches: 4 },
      { maxSwissRounds: 3, knockoutQualifierCount: 6 },
    );
    const swiss = result.find((item) => item.id === 'swiss-ko');
    expect(swiss?.label).toContain('3 Runden Schweizer System');
    expect(swiss?.label).toContain('6 Qualifizierte');
  });

  it('omits disabled tournament systems', () => {
    const result = recommendTournamentFormats(
      { playerCount: 24, tableCount: 8, minimumMatches: 4 },
      { enabledFormats: { 'swiss-ko': false, 'single-ko': false } },
    );
    expect(result.some((item) => item.id === 'swiss-ko')).toBe(false);
    expect(result.some((item) => item.id === 'single-ko')).toBe(false);
  });
});
