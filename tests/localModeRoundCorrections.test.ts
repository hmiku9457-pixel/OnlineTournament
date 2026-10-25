import { approveMockProgress } from '@/services/mockRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import {
  assignMockMatchToTable, canEditMockMatch, completeMockMatch, getMockStageMatches,
  getMockStoredResult, unassignMockMatch,
} from '@/services/mockRuntime';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, opts?: CustomEventInit<T>) { super(type); this.detail = opts?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

const win = [{ number: 1, sideAScore: 11, sideBScore: 7 }];
const reverse = [{ number: 1, sideAScore: 7, sideBScore: 11 }];
function create(type: 'SWISS' | 'KNOCKOUT', players = 8, swissRounds = 3) {
  const t = createMockTournament({
    name: 'Korrekturgrenze', sport: 'table_tennis', discipline: 'SINGLES',
    tables: 4, minimumMatches: 1, estimatedDurationMinutes: 100,
    participantNames: Array.from({ length: players }, (_, index) => `Spieler ${index + 1}`),
    phases: [{
      type, label: type === 'SWISS' ? 'Schweizer' : 'K.-o.', entrantCount: players,
      groupCount: 1, swissRounds, bestOf: 1, knockoutBestOf: [1, 1, 1, 1],
    }],
  });
  expect(startFirstStage(t)).toBe(true);
  updateMockTournamentStatus(t.id, 'RUNNING');
  return t;
}

describe('Korrekturen an abgeschlossenen K.-o.- und Schweizer Runden', () => {
  it('erlaubt KO-Korrekturen bis zur ersten Tischzuweisung der Folgerunde und verhindert ungültige Halbfinalisten', () => {
    const t = create('KNOCKOUT');
    const stage = t.stages[0];
    const quarters = getMockStageMatches(t, stage).filter((m) => m.round === 'Viertelfinale');
    expect(quarters).toHaveLength(4);
    quarters.forEach((m) => completeMockMatch(m.id, win));
    const semifinalBefore = getMockStageMatches(t, stage).filter((m) => m.round === 'Halbfinale');
    expect(semifinalBefore).toHaveLength(2);
    expect(canEditMockMatch(t, quarters[0].id)).toBe(true);
    completeMockMatch(quarters[0].id, reverse);
    const semifinalAfter = getMockStageMatches(t, stage).filter((m) => m.round === 'Halbfinale');
    expect(semifinalAfter[0].sideA).not.toBe(semifinalBefore[0].sideA);
    expect(semifinalAfter[0].sideA).toBe(quarters[0].sideB);

    expect(assignMockMatchToTable(t, semifinalAfter[0].id, 'Tisch 1')).toBe(true);
    expect(canEditMockMatch(t, quarters[0].id)).toBe(false);
    const stored = getMockStoredResult(quarters[0].id);
    expect(() => completeMockMatch(quarters[0].id, win)).toThrow('gesperrt');
    expect(getMockStoredResult(quarters[0].id)).toEqual(stored);
    expect(unassignMockMatch(t, semifinalAfter[0].id)).toBe(true);
    expect(canEditMockMatch(t, quarters[0].id)).toBe(false);
  });

  it('verwirft vorbereitete Schweizer Paarungen nach Korrektur und sperrt ab der nächsten Tischzuweisung', () => {
    const t = create('SWISS', 8, 3);
    const stage = t.stages[0];
    const first = getMockStageMatches(t, stage).filter((m) => m.round === 'Runde 1');
    expect(first).toHaveLength(4);
    first.forEach((m) => completeMockMatch(m.id, win));
    expect(approveMockProgress(t)?.kind).toBe('ROUND');
    const next = getMockStageMatches(t, stage).filter((m) => m.round === 'Runde 2');
    expect(next).toHaveLength(4);
    const key = 'online-tournament:swiss-round-fixtures:v1';
    expect((JSON.parse(data.get(key) ?? '[]') as Array<{round:number}>).some((entry) => entry.round === 2)).toBe(true);
    expect(canEditMockMatch(t, first[0].id)).toBe(true);
    completeMockMatch(first[0].id, reverse, 'FINISHED', true);
    // Eine Korrektur entzieht der Folgerunde ihre Freigabe.
    expect(getMockStageMatches(t, stage).filter((m) => m.round === 'Runde 2')).toHaveLength(0);
    expect(approveMockProgress(t)?.kind).toBe('ROUND');
    const regenerated = getMockStageMatches(t, stage).filter((m) => m.round === 'Runde 2');
    expect(regenerated).toHaveLength(4);
    expect(regenerated.map((m) => [m.sideA,m.sideB])).not.toEqual(next.map((m) => [m.sideA,m.sideB]));
    expect(assignMockMatchToTable(t, regenerated[0].id, 'Tisch 1')).toBe(true);
    expect(canEditMockMatch(t, first[0].id)).toBe(false);
    const stored = getMockStoredResult(first[0].id);
    expect(() => completeMockMatch(first[0].id, win, 'FINISHED', true)).toThrow('gesperrt');
    expect(getMockStoredResult(first[0].id)).toEqual(stored);
  });
});
