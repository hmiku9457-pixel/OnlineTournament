import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { requiresFinalApproval } from '@/domain/matchFinalization';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import {
  assignMockMatchToTable, completeMockMatch, confirmMockMatchSide,
  countMockOpenConfirmations, getMockAssignmentBlockReason,
  getMockParticipantCode, getMockRuntimeMatches, getMockStoredResult, saveMockMatchSets,
} from '@/services/mockRuntime';

const store = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return store.get(key) ?? null; },
  setItem(key: string, value: string) { store.set(key, String(value)); },
  removeItem(key: string) { store.delete(key); },
};

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function createStartedTournament(sport: 'football' | 'table_tennis', type: 'ROUND_ROBIN' | 'SWISS', bestOf: number) {
  const draft = createMockTournament({
    name: 'Betriebstest', sport, discipline: 'SINGLES', tables: 2, minimumMatches: 1,
    participantNames: ['Anna A', 'Ben B', 'Cora C', 'Dora D'],
    phases: [{ type, label: 'Runde 1', bestOf, entrantCount: 4, groupCount: 1, swissRounds: 2, knockoutBestOf: [] }],
    estimatedDurationMinutes: 180, matchDurationMinutes: 12, venueTurnoverMinutes: 20,
  });
  expect(startFirstStage(draft)).toBe(true);
  return updateMockTournamentStatus(draft.id, 'RUNNING');
}

const oneSet = [{ number: 1, sideAScore: 11, sideBScore: 7 }];

describe('Tischwechselzeit als Planungshinweis', () => {
  it('blockiert die nächste Zuweisung nicht, selbst wenn 20 Minuten Platzpause konfiguriert sind', () => {
    const tournament = createStartedTournament('football', 'ROUND_ROBIN', 1);
    const [first, second] = getMockRuntimeMatches(tournament);
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(true);
    completeMockMatch(first.id, oneSet);
    expect(getMockAssignmentBlockReason(tournament, second.id, 'Tisch 1')).toBeNull();
    expect(assignMockMatchToTable(tournament, second.id, 'Tisch 1')).toBe(true);
  });
});

describe('Zusatzbestätigung im Schweizer System', () => {
  it('erfordert auch für BO1 bei Admin-Eingabe eine gesonderte Endbestätigung, nicht aber bei Spielereingabe', () => {
    expect(requiresFinalApproval(1, oneSet, true)).toBe(true);
    expect(requiresFinalApproval(1, oneSet, false)).toBe(false);
    expect(requiresFinalApproval(3, [...oneSet, { number: 2, sideAScore: 11, sideBScore: 8 }], true)).toBe(true);
  });

  it('lässt das Schweizer Spiel bis zum Admin-Klick offen und speichert danach die Bestätigung', () => {
    const tournament = createStartedTournament('table_tennis', 'SWISS', 1);
    const match = getMockRuntimeMatches(tournament)[0];
    expect(assignMockMatchToTable(tournament, match.id, 'Tisch 1')).toBe(true);
    saveMockMatchSets(match.id, oneSet, 'LIVE');
    expect(getMockRuntimeMatches(tournament).find((game) => game.id === match.id)?.status).toBe('LIVE');
    completeMockMatch(match.id, oneSet, 'FINISHED', true);
    expect(getMockStoredResult(match.id)?.adminConfirmed).toBe(true);
    expect(countMockOpenConfirmations(tournament)).toBe(0);
  });

  it('verlangt keine zusätzliche Turnierleitungsbestätigung, wenn beide Spieler ihr Ergebnis bestätigt haben', () => {
    const tournament = createStartedTournament('table_tennis', 'SWISS', 1);
    const match = getMockRuntimeMatches(tournament)[0];
    expect(assignMockMatchToTable(tournament, match.id, 'Tisch 1')).toBe(true);
    completeMockMatch(match.id, oneSet); // Eintrag auf dem Tablet, noch unbestätigt
    expect(countMockOpenConfirmations(tournament)).toBe(1);
    expect(confirmMockMatchSide(match.id, 'A', getMockParticipantCode(tournament, match.sideA)!)).toBe(true);
    expect(confirmMockMatchSide(match.id, 'B', getMockParticipantCode(tournament, match.sideB)!)).toBe(true);
    expect(countMockOpenConfirmations(tournament)).toBe(0);
  });
});
