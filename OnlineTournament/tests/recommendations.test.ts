import { describe, expect, it } from 'vitest';
import { recommendTournamentFormats } from '@/engine/recommendations';

describe('format recommendations', () => {
  it('includes Swiss to knockout for a larger field', () => {
    const result = recommendTournamentFormats({ playerCount: 24, tableCount: 8, minimumMatches: 4 });
    expect(result[0].id).toBe('swiss-ko');
    expect(result.some((item) => item.id === 'groups-ko')).toBe(true);
  });
});
