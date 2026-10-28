import { describe, expect, it } from 'vitest';
import {
  bestOfOptions,
  createPhaseTemplate,
  estimatePhaseMetrics,
  estimateTournamentDurationMinutes,
  hasValidTerminalStageOrder,
  knockoutByeCount,
  knockoutEntrantPresets,
  knockoutRoundLabels,
  projectSwissTopScores,
  recommendGroupCount,
  recommendedSwissRounds,
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

  it('provides per-phase metrics for the phase overview', () => {
    expect(estimatePhaseMetrics({
      type: 'KNOCKOUT',
      entrantCount: 12,
      bestOf: 3,
      knockoutBestOf: [3, 5, 5, 7],
    }, 6)).toMatchObject({
      estimatedMatches: 11,
      approximate: false,
    });
  });

  it('suggests compact groups and accounts for the following qualification cutoff', () => {
    expect(recommendGroupCount(19)).toBe(4);
    expect(recommendGroupCount(19, 8)).toBe(4); // two qualify from each group
    expect(recommendGroupCount(19, 12)).toBe(4); // three qualify from each group
    expect(recommendGroupCount(19, 15)).toBe(5); // three qualify from each group
    expect(recommendGroupCount(10, 3)).toBe(3); // one from each group
    expect(recommendGroupCount(6, 2)).toBe(2);
  });

  it('recommends Swiss rounds and projects the leading score groups', () => {
    expect(recommendedSwissRounds(19)).toBe(5);
    expect(projectSwissTopScores(19, 5)).toEqual([
      { wins: 5, losses: 0, approximatePlayers: 1 },
      { wins: 4, losses: 1, approximatePlayers: 3 },
      { wins: 3, losses: 2, approximatePlayers: 6 },
    ]);
  });

  it('calculates first-round knockout byes', () => {
    expect(knockoutByeCount(12)).toBe(4);
    expect(knockoutByeCount(8)).toBe(0);
    expect(knockoutByeCount(19)).toBe(13);
  });

});
