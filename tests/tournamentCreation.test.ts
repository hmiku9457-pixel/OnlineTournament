import { describe, expect, it } from 'vitest';
import {
  bestOfOptions,
  createPhaseTemplate,
  estimateTournamentDurationMinutes,
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

  it('estimates a rough tournament duration from tables and configured best-of values', () => {
    expect(estimateTournamentDurationMinutes([
      { type: 'ROUND_ROBIN', entrantCount: 4, bestOf: 1 },
    ], 2)).toBe(45);

    expect(estimateTournamentDurationMinutes([
      { type: 'SWISS', entrantCount: 8, bestOf: 3, swissRounds: 3 },
    ], 4)).toBe(113);
  });

  it('uses round-specific best-of settings for knockout duration estimates', () => {
    expect(estimateTournamentDurationMinutes([
      {
        type: 'KNOCKOUT',
        entrantCount: 8,
        bestOf: 3,
        knockoutBestOf: [3, 5, 7],
      },
    ], 2)).toBe(218);
  });

});
