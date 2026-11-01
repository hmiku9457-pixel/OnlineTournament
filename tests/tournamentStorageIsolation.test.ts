import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockTournament, getAllMockTournaments, getMockTournament, removeLocalPrototypeTournaments,
  updateMockTournamentStatus, updatePrestartTournamentPhases,
} from '@/services/mockTournamentStore';
import { initialPrestartPhases } from '@/domain/prestartPhasePlanning';

const STORAGE_KEY = 'online-tournament:local-prototype-tournaments:v1';
const INDEX_KEY = `${STORAGE_KEY}:index:v3`;
const DRAW_KEY = 'online-tournament:mock-draw-config:v1';
const data = new Map<string, string>();
let failDrawOnce = false;
let failIndexOnce = false;
let injectExternalDraw: (() => void) | null = null;
const storage = {
  get length() { return data.size; },
  key(index: number) { return [...data.keys()][index] ?? null; },
  getItem(key: string) { return data.get(key) ?? null; },
  removeItem(key: string) { data.delete(key); },
  setItem(key: string, value: string) {
    if (key === INDEX_KEY && failIndexOnce) {
      failIndexOnce = false;
      throw new Error('Simulierter Index-Speicherfehler');
    }
    if (key === DRAW_KEY && failDrawOnce) {
      failDrawOnce = false;
      injectExternalDraw?.();
      throw new Error('Simulated draw storage failure');
    }
    data.set(key, String(value));
  },
};
beforeEach(() => {
  data.clear();
  failDrawOnce = false;
  failIndexOnce = false;
  injectExternalDraw = null;
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(name: string, init?: CustomEventInit<T>) { super(name); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function input(name: string) {
  return {
    name, sport: 'table_tennis', discipline: 'SINGLES' as const, tables: 3,
    minimumMatches: 2, estimatedDurationMinutes: 60,
    participantNames: Array.from({ length: 8 }, (_, index) => `Spieler ${index + 1}`),
    phases: [
      { type: 'GROUPS' as const, label: 'Gruppen', bestOf: 3, entrantCount: 8,
        groupCount: 2, swissRounds: 1, knockoutBestOf: [] },
      { type: 'KNOCKOUT' as const, label: 'K.-o.', bestOf: 5, entrantCount: 4,
        groupCount: 2, swissRounds: 1, knockoutBestOf: [5, 5] },
    ],
  };
}

describe('sharded local tournament storage', () => {
  it('persists different tournaments as independent atomic storage keys', () => {
    const a = createMockTournament(input('Turnier A'));
    const b = createMockTournament(input('Turnier B'));
    const firstKey = `${STORAGE_KEY}:record:${a.id}`;
    const secondKey = `${STORAGE_KEY}:record:${b.id}`;
    const firstBefore = data.get(firstKey);
    const secondBefore = data.get(secondKey);
    expect(firstBefore).toBeTruthy();
    expect(secondBefore).toBeTruthy();
    updateMockTournamentStatus(a.id, 'PAUSED');
    expect(data.get(firstKey)).not.toBe(firstBefore);
    expect(data.get(secondKey)).toBe(secondBefore);
    updateMockTournamentStatus(b.id, 'PAUSED');
    expect(getMockTournament(a.id).status).toBe('PAUSED');
    expect(getMockTournament(b.id).status).toBe('PAUSED');
    expect(getAllMockTournaments()).toHaveLength(2);
  });

  it('does not load old shared-array tournament lists', () => {
    const a = createMockTournament(input('Aktuelles Turnier'));
    data.set(STORAGE_KEY, JSON.stringify([{ ...a, id: 'old-import', name: 'Altes Turnier' }]));
    expect(getAllMockTournaments().map((item) => item.id)).toEqual([a.id]);
    expect(JSON.parse(data.get(INDEX_KEY) ?? '[]')).toEqual([a.id]);
    removeLocalPrototypeTournaments();
    expect(getAllMockTournaments()).toEqual([]);
    expect(data.has(`${STORAGE_KEY}:record:${a.id}`)).toBe(false);
  });

  it('retains the original tournament when replacing it fails before the new index can be saved', () => {
    const original = createMockTournament(input('Mein Testturnier'));
    const originalKey = `${STORAGE_KEY}:record:${original.id}`;
    const originalData = data.get(originalKey);
    failIndexOnce = true;
    expect(() => createMockTournament({ ...input('Mein Testturnier'), overwriteTournamentId: original.id }))
      .toThrow('Simulierter Index-Speicherfehler');
    expect(data.get(originalKey)).toBe(originalData);
    expect(getAllMockTournaments().map((item) => item.id)).toEqual([original.id]);
    expect([...data.keys()].filter((key) => key.startsWith(`${STORAGE_KEY}:record:`))).toEqual([originalKey]);
  });

  it('rolls back only the failing tournament while preserving external draw edits for another event', () => {
    const a = createMockTournament(input('Turnier A'));
    const b = createMockTournament(input('Turnier B'));
    const aRecord = `${STORAGE_KEY}:record:${a.id}`;
    const bRecord = `${STORAGE_KEY}:record:${b.id}`;
    const before = data.get(aRecord);
    const otherBefore = data.get(bRecord);
    const unrelated = { tournamentId: b.id, stageId: b.stages[0].id, groupAssignments: {} };
    data.set(DRAW_KEY, JSON.stringify([
      { tournamentId: a.id, stageId: a.stages[0].id, groupAssignments: {} },
      unrelated,
    ]));
    const extra = { tournamentId: b.id, stageId: b.stages[1].id, swissOrder: ['B', 'A'] };
    injectExternalDraw = () => {
      const old = JSON.parse(data.get(DRAW_KEY) ?? '[]') as unknown[];
      data.set(DRAW_KEY, JSON.stringify([...old, extra]));
    };
    failDrawOnce = true;
    const phases = initialPrestartPhases(a);
    phases[0].label = 'Vorrunde';
    const result = updatePrestartTournamentPhases(a.id, phases);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('wiederhergestellt');
    expect(data.get(aRecord)).toBe(before);
    expect(data.get(bRecord)).toBe(otherBefore);
    const draws = JSON.parse(data.get(DRAW_KEY) ?? '[]') as Array<{ tournamentId: string; stageId: string }>;
    expect(draws.filter((record) => record.tournamentId === b.id)).toEqual([unrelated, extra]);
    expect(draws.filter((record) => record.tournamentId === a.id)).toHaveLength(1);
  });
});
