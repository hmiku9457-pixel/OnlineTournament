import { describe, expect, it } from 'vitest';
import { bestOfOptions, phasesForFormat } from '@/domain/tournamentCreation';

describe('tournament creation phase templates', () => {
  it('offers best of one', () => {
    expect(bestOfOptions).toContain(1);
  });

  it('uses separate best-of defaults for groups and knockout', () => {
    const phases = phasesForFormat('groups-ko');
    expect(phases).toHaveLength(2);
    expect(phases[0]).toMatchObject({ type: 'GROUPS', defaultBestOf: 1 });
    expect(phases[1]).toMatchObject({ type: 'KNOCKOUT', defaultBestOf: 5 });
  });

  it('models Swiss to knockout as two configurable phases', () => {
    expect(phasesForFormat('swiss-ko').map((phase) => phase.type)).toEqual(['SWISS', 'KNOCKOUT']);
  });
});
