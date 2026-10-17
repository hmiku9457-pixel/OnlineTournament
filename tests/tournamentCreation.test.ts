import { describe, expect, it } from 'vitest';
import {
  bestOfOptions,
  createPhaseTemplate,
  hasValidTerminalStageOrder,
  knockoutEntrantPresets,
  knockoutRoundLabels,
  tournamentSystemOptions,
} from '@/domain/tournamentCreation';

describe('tournament creation phase model', () => {
  it('offers best of one', () => {
    expect(bestOfOptions).toContain(1);
  });

  it('uses compact defaults for group stages', () => {
    expect(createPhaseTemplate('GROUPS', 1)).toMatchObject({
      type: 'GROUPS',
      defaultBestOf: 1,
    });
  });

  it('models tournament systems as individual building blocks', () => {
    expect(tournamentSystemOptions.map((system) => system.id)).toEqual([
      'round-robin',
      'groups',
      'swiss',
      'knockout',
      'double-elimination',
      'placement',
    ]);
  });

  it('provides round labels for knockout-specific best-of settings', () => {
    expect(knockoutRoundLabels(8)).toEqual(['Viertelfinale', 'Halbfinale', 'Finale']);
    expect(knockoutRoundLabels(6)).toEqual(['Viertelfinale', 'Halbfinale', 'Finale']);
    expect(knockoutRoundLabels(16)).toEqual(['Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale']);
  });

  it('offers only sensible knockout participant presets up to the available field', () => {
    expect(knockoutEntrantPresets(19)).toEqual([2, 4, 8, 16]);
    expect(knockoutEntrantPresets(64)).toEqual([2, 4, 8, 16, 32, 64]);
  });

  it('requires knockout stages to be terminal', () => {
    expect(hasValidTerminalStageOrder(['GROUPS', 'SWISS', 'KNOCKOUT'])).toBe(true);
    expect(hasValidTerminalStageOrder(['GROUPS', 'KNOCKOUT', 'SWISS'])).toBe(false);
    expect(hasValidTerminalStageOrder(['SWISS', 'DOUBLE_ELIMINATION'])).toBe(true);
  });

});
