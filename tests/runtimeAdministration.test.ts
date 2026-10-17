import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import type { MockPhaseInput } from '@/services/mockTournamentStore';
import { getBracketSlots, getPinnedBracketSlots, randomizeBracketSlots, setBracketSlot, toggleBracketPin } from '@/services/mockDrawStore';
import { buildMockGroups } from '@/services/mockCompetitionViews';
import { canEditFinishedResults, completeMockMatch, getMockStageBaseMatches, getMockStageMatches, getMockStoredResult, withdrawMockParticipant } from '@/services/mockRuntime';
import { isStageCompleted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';

const group: MockPhaseInput = { type: 'GROUPS', label: 'Gruppen', bestOf: 1, entrantCount: 4, groupCount: 1, swissRounds: 1, knockoutBestOf: [] };
const ko: MockPhaseInput = { type: 'KNOCKOUT', label: 'K.-o.', bestOf: 3, entrantCount: 12, groupCount: 1, swissRounds: 1, knockoutBestOf: [1, 3, 5, 7] };

const store = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return store.get(key) ?? null; },
  setItem(key: string, value: string) { store.set(key, String(value)); },
  removeItem(key: string) { store.delete(key); },
};

function makeTournament(count: number, phases: MockPhaseInput[]) {
  return createMockTournament({
    name: 'Administrationstest', sport: 'table_tennis', discipline: 'SINGLES', tables: 4, minimumMatches: 1,
    participantNames: Array.from({ length: count }, (_, index) => `Testspieler ${index + 1}`),
    phases, estimatedDurationMinutes: 90,
  });
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Turnierleitung - Regressionen', () => {
  it('behält fixierte KO-Spieler bei einer neuen Zufallsverteilung an ihren Plätzen', () => {
    const tournament = makeTournament(12, [ko]);
    const stage = tournament.stages[0];
    const before = getBracketSlots(tournament, stage);
    const index = before.findIndex((name) => name !== 'Freilos');
    expect(toggleBracketPin(tournament, stage, index)).toBe(true);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(randomizeBracketSlots(tournament, stage)).toBe(true);
      expect(getBracketSlots(tournament, stage)[index]).toBe(before[index]);
    }
    expect(getPinnedBracketSlots(tournament, stage)).toContain(index);
    expect(setBracketSlot(tournament, stage, index, 'Testspieler 12')).toBe(false);
  });

  it('wertet nicht gespielte Gruppenmatches eines zurückgezogenen Teilnehmers als Walkover', () => {
    const tournament = makeTournament(4, [group]);
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    expect(withdrawMockParticipant(tournament, 'Testspieler 1')).toBe(true);
    const matches = getMockStageMatches(tournament, tournament.stages[0]);
    expect(matches.filter((match) => [match.sideA, match.sideB].includes('Testspieler 1') && match.score === 'W.O.')).toHaveLength(3);
    const row = buildMockGroups(tournament, tournament.stages[0])[0].standings.find((entry) => entry.name === 'Testspieler 1');
    expect(row?.played).toBe(3);
    expect(row?.losses).toBe(3);
  });

  it('paart im Schweizer System nach einem Rückzug die nächste Runde ohne den zurückgezogenen Teilnehmer', () => {
    const swiss: MockPhaseInput = { ...group, type: 'SWISS', label: 'Schweizer', entrantCount: 9, swissRounds: 3 };
    const tournament = makeTournament(9, [swiss]);
    const stage = tournament.stages[0];
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    const firstRound = getMockStageMatches(tournament, stage);
    const withdrawn = firstRound[0].sideA;
    expect(withdrawMockParticipant(tournament, withdrawn)).toBe(true);
    getMockStageMatches(tournament, stage).filter((match) => match.status !== 'FINISHED').forEach((match) => {
      completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    });
    const secondRound = getMockStageBaseMatches(tournament, stage).filter((match) => match.round === 'Runde 2');
    expect(secondRound.length).toBeGreaterThan(0);
    expect(secondRound.every((match) => match.sideA !== withdrawn && match.sideB !== withdrawn)).toBe(true);
  });

  it('sperrt nach dem Start der nächsten Phase Korrekturen an abgeschlossenen Spielen', () => {
    const tournament = makeTournament(4, [group, { ...ko, entrantCount: 2 }]);
    const first = tournament.stages[0];
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    const matches = getMockStageMatches(tournament, first);
    matches.forEach((match) => completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]));
    expect(isStageCompleted(tournament, first)).toBe(true);
    const saved = getMockStoredResult(matches[0].id);
    expect(startStage(tournament, tournament.stages[1])).toBe(true);
    expect(canEditFinishedResults(tournament, first)).toBe(false);
    completeMockMatch(matches[0].id, [{ number: 1, sideAScore: 7, sideBScore: 11 }]);
    expect(getMockStoredResult(matches[0].id)).toEqual(saved);
  });
});
