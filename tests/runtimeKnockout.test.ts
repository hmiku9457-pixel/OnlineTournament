import { describe, expect, it } from 'vitest';
import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { getBracketSlots } from '@/services/mockDrawStore';
import { getMockStageBaseMatches } from '@/services/mockRuntime';

function tournamentWith(stage: TournamentStage, participantCount: number): DemoTournament {
  return {
    id: 'test-ko',
    name: 'Test',
    subtitle: 'Test',
    status: 'READY',
    visibility: 'PRIVATE',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: participantCount,
    tables: 4,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'K.-o.',
    estimatedDuration: 'ca. 1h',
    lastUpdate: 'jetzt',
    stages: [stage],
    areas: [],
    participantNames: Array.from({ length: participantCount }, (_, index) => `Spieler ${index + 1}`),
    isLocalPrototype: true,
    hasStarted: false,
  };
}

describe('knockout runtime', () => {
  it('uses round-specific best-of settings', () => {
    const stage: TournamentStage = {
      id: 'ko-stage',
      tournamentId: 'test-ko',
      name: 'K.-o.',
      type: 'KNOCKOUT',
      orderIndex: 0,
      bestOf: 5,
      settings: { entrants: 16, roundBestOf: '1,3,5,7' },
      advancement: { type: 'manual', value: 0 },
    };
    const tournament = tournamentWith(stage, 16);
    const matches = getMockStageBaseMatches(tournament, stage);

    expect(new Set(matches.filter((match) => match.round === 'Achtelfinale').map((match) => match.bestOf))).toEqual(new Set([1]));
    expect(new Set(matches.filter((match) => match.round === 'Viertelfinale').map((match) => match.bestOf))).toEqual(new Set([3]));
  });

  it('spreads four first-round byes so bye winners do not meet immediately', () => {
    const stage: TournamentStage = {
      id: 'ko-stage',
      tournamentId: 'test-ko',
      name: 'K.-o.',
      type: 'KNOCKOUT',
      orderIndex: 0,
      bestOf: 3,
      settings: { entrants: 12 },
      advancement: { type: 'manual', value: 0 },
    };
    const tournament = tournamentWith(stage, 12);
    const slots = getBracketSlots(tournament, stage);
    const byeMatchIndexes = Array.from({ length: slots.length / 2 }, (_, matchIndex) => matchIndex)
      .filter((matchIndex) => slots[matchIndex * 2] === 'Freilos' || slots[matchIndex * 2 + 1] === 'Freilos');

    expect(byeMatchIndexes).toHaveLength(4);
    expect(new Set(byeMatchIndexes.map((matchIndex) => Math.floor(matchIndex / 2))).size).toBe(4);
  });
});
