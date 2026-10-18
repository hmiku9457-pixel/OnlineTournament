import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { completeMockMatch, formatPlayerRest, getElapsedRestMinutes, getMockRuntimeMatches, getMockStoredResult } from '@/services/mockRuntime';
import { startFirstStage } from '@/services/mockPhaseLifecycle';

const store = new Map<string, string>();
const localStorage = {
  getItem(key: string) { return store.get(key) ?? null; },
  setItem(key: string, value: string) { store.set(key, String(value)); },
  removeItem(key: string) { store.delete(key); },
};

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('reale Pausenzeit', () => {
  it('zeigt ohne vorheriges Ergebnis keinen erfundenen Minutenwert', () => {
    expect(getElapsedRestMinutes(undefined)).toBeNull();
    expect(formatPlayerRest(null)).toBe('Noch kein Spiel');
    expect(formatPlayerRest(0)).toBe('0 Min. Pause');
    expect(formatPlayerRest(75)).toBe('1 Std. 15 Min. Pause');
  });

  it('berechnet für die nächsten Spiele die Zeit seit dem letzten Abschluss', () => {
    const tournament = createMockTournament({
      name: 'Pausentest', sport: 'table_tennis', discipline: 'SINGLES', tables: 2, minimumMatches: 1,
      participantNames: ['Anna Eins', 'Ben Zwei', 'Cora Drei', 'Dora Vier'],
      phases: [{ type: 'ROUND_ROBIN', label: 'Jeder gegen jeden', bestOf: 1, entrantCount: 4, groupCount: 1, swissRounds: 1, knockoutBestOf: [] }],
      estimatedDurationMinutes: 90,
    });
    expect(startFirstStage(tournament)).toBe(true);
    updateMockTournamentStatus(tournament.id, 'RUNNING');
    const first = getMockRuntimeMatches(tournament)[0];
    expect(first.pauseA).toBeNull();
    expect(first.pauseB).toBeNull();
    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    expect(getMockStoredResult(first.id)?.finishedAt).toBe(Date.now());
    vi.advanceTimersByTime(7 * 60_000 + 2000);
    const next = getMockRuntimeMatches(tournament).filter((match) => match.status === 'WAITING');
    const adjacent = next.find((match) => [match.sideA, match.sideB].includes(first.sideA));
    expect(adjacent).toBeDefined();
    expect(adjacent?.sideA === first.sideA ? adjacent.pauseA : adjacent?.pauseB).toBe(7);
    const untouched = next.find((match) => ![first.sideA, first.sideB].includes(match.sideA) && ![first.sideA, first.sideB].includes(match.sideB));
    if (untouched) expect(untouched.pauseA).toBeNull();
  });
});
