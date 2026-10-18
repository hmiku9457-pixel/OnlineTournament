import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { MockPhaseInput } from '@/services/mockTournamentStore';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { assignMockMatchToTable, completeMockMatch, getMockAssignmentBlockReason, getMockRuntimeMatches } from '@/services/mockRuntime';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { estimateRemainingTournamentMinutes, formatRemainingTournamentDuration } from '@/services/mockDuration';
import { getBlockedMockTables, isMockTableBlocked, setMockTableBlocked } from '@/services/mockTableLocks';

const local = new Map<string, string>();
const storage = {
  getItem(key: string) { return local.get(key) ?? null; },
  setItem(key: string, value: string) { local.set(key, String(value)); },
  removeItem(key: string) { local.delete(key); },
};
const phase: MockPhaseInput = { type: 'ROUND_ROBIN', label: 'Jeder gegen jeden', bestOf: 1, entrantCount: 4, groupCount: 1, swissRounds: 1, knockoutBestOf: [] };

function createTournament(tableCount = 2) {
  return createMockTournament({
    name: 'Testturnier', sport: 'table_tennis', discipline: 'SINGLES',
    tables: tableCount, minimumMatches: 1, participantNames: ['A Test', 'B Test', 'C Test', 'D Test'],
    phases: [phase], estimatedDurationMinutes: 120,
  });
}

beforeEach(() => {
  local.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('table locks', () => {
  it('persist per tournament and block all assignment methods via the service', () => {
    const tournament = createTournament();
    const other = createTournament();
    startFirstStage(tournament);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    const first = getMockRuntimeMatches(tournament)[0];
    expect(setMockTableBlocked(tournament, 'Tisch 1', true)).toBe(true);
    expect(getBlockedMockTables(tournament)).toEqual(['Tisch 1']);
    expect(isMockTableBlocked(other, 'Tisch 1')).toBe(false);
    expect(getMockAssignmentBlockReason(tournament, first.id, 'Tisch 1')).toContain('gesperrt');
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 1')).toBe(false);
    expect(assignMockMatchToTable(tournament, first.id, 'Tisch 2')).toBe(true);
    expect(setMockTableBlocked(tournament, 'Tisch 2', true)).toBe(true);
    expect(getMockRuntimeMatches(tournament).find((match) => match.id === first.id)?.status).toBe('LIVE');
    expect(setMockTableBlocked(tournament, 'Tisch 1', false)).toBe(true);
    expect(isMockTableBlocked(tournament, 'Tisch 1')).toBe(false);
    expect(setMockTableBlocked(tournament, 'Tisch 3', true)).toBe(false);
  });
});

describe('remaining tournament duration', () => {
  it('decreases after completing a game, and responds to fewer available tables', () => {
    const tournament = createTournament();
    startFirstStage(tournament);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    const before = estimateRemainingTournamentMinutes(tournament);
    expect(before).toBeGreaterThan(0);
    const first = getMockRuntimeMatches(tournament)[0];
    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    const after = estimateRemainingTournamentMinutes(tournament);
    expect(after).not.toBeNull();
    expect(after!).toBeLessThan(before!);
    expect(setMockTableBlocked(tournament, 'Tisch 1', true)).toBe(true);
    const withOneTable = estimateRemainingTournamentMinutes(tournament);
    expect(withOneTable).toBeGreaterThan(after!);
    expect(setMockTableBlocked(tournament, 'Tisch 2', true)).toBe(true);
    expect(estimateRemainingTournamentMinutes(tournament)).toBeNull();
    expect(formatRemainingTournamentDuration(null)).toBe('Keine Tische verfügbar');
  });
});
