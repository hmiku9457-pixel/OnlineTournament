import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { canWithdrawMockParticipant, completeMockMatch, getMockStageMatches, withdrawMockParticipant } from '@/services/mockRuntime';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem(key: string) { return storage.get(key) ?? null; },
      setItem(key: string, value: string) { storage.set(key, String(value)); },
      removeItem(key: string) { storage.delete(key); },
    },
  }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Kein Rückzug nach sportlichem K.-o.-Ausscheiden', () => {
  it('sperrt den Rückzug für den Viertelfinalverlierer auf Service-Ebene', () => {
    const names = Array.from({ length: 8 }, (_, index) => `Spieler ${index + 1}`);
    const tournament = createMockTournament({ name: 'K.-o.-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 4,
      minimumMatches: 1, participantNames: names, estimatedDurationMinutes: 180,
      phases: [{ type: 'KNOCKOUT', label: 'K.-o.', entrantCount: 8, groupCount: 1,
        bestOf: 1, swissRounds: 1, knockoutBestOf: [1, 1, 1] }],
    });
    expect(startFirstStage(tournament)).toBe(true);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    const match = getMockStageMatches(running, running.stages[0]).find((item) => item.round === 'Viertelfinale');
    expect(match).toBeDefined();
    expect(canWithdrawMockParticipant(running, match!.sideB)).toBe(true);
    completeMockMatch(match!.id, [{ number: 1, sideAScore: 11, sideBScore: 6 }]);
    expect(canWithdrawMockParticipant(running, match!.sideB)).toBe(false);
    expect(withdrawMockParticipant(running, match!.sideB)).toBe(false);
    expect(canWithdrawMockParticipant(running, match!.sideA)).toBe(true);
  });
  it('lässt die beiden Halbfinalverlierer bis zur Bronze-Entscheidung teilnehmen', () => {
    const names = ['Anna A', 'Berta B', 'Clara C', 'Dora D'];
    const tournament = createMockTournament({ name: 'Bronze-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 2,
      minimumMatches: 1, participantNames: names, estimatedDurationMinutes: 120,
      phases: [{ type: 'KNOCKOUT', label: 'K.-o.', entrantCount: 4, groupCount: 1,
        bestOf: 1, swissRounds: 1, knockoutBestOf: [1, 1] }],
    });
    startFirstStage(tournament);
    const running = updateMockTournamentStatus(tournament.id, 'RUNNING');
    const semifinals = getMockStageMatches(running, running.stages[0]).filter((match) => match.round === 'Halbfinale');
    expect(semifinals).toHaveLength(2);
    semifinals.forEach((match) => completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 6 }]));
    const bronze = getMockStageMatches(running, running.stages[0]).find((match) => match.round === 'Spiel um Platz 3');
    expect(bronze).toBeDefined();
    expect(canWithdrawMockParticipant(running, semifinals[0].sideB)).toBe(true);
    completeMockMatch(bronze!.id, [{ number: 1, sideAScore: 11, sideBScore: 6 }]);
    expect(canWithdrawMockParticipant(running, bronze!.sideB)).toBe(false);
  });

});
