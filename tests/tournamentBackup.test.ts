import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, getAllMockTournaments, getMockTournament, removeLocalPrototypeTournaments } from '@/services/mockTournamentStore';
import { captureTournamentBackup, restoreTournamentBackup, validateTournamentBackup } from '@/services/localTournamentStorage';
const data = new Map<string, string>();
const storage = {
  get length() { return data.size; },
  key(index: number) { return [...data.keys()][index] ?? null; },
  getItem(key: string) { return data.get(key) ?? null; },
  removeItem(key: string) { data.delete(key); },
  setItem(key: string, value: string) { data.set(key, String(value)); },
};
beforeEach(() => {
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(name: string, init?: CustomEventInit<T>) { super(name); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());
function create(name: string) {
  return createMockTournament({
    name, sport: 'table_tennis', discipline: 'SINGLES', tables: 3,
    minimumMatches: 2, estimatedDurationMinutes: 60,
    participantNames: Array.from({ length: 8 }, (_, index) => 'Spieler ' + (index + 1)),
    phases: [{ type: 'GROUPS', label: 'Gruppen', bestOf: 3, entrantCount: 8,
      groupCount: 2, swissRounds: 1, knockoutBestOf: [] }],
  });
}
const results = 'online-tournament:mock-match-results:v2';
const pauses = 'online-tournament:mock-inline-breaks:v2';
const cutoffs = 'online-tournament:swiss-extra-rounds:v1';
describe('tournament backup isolation', () => {
  it('preserves scoped runtime records and restores alongside another event', async () => {
    const a = create('Turnier A'), b = create('Turnier B');
    const ar = { matchId: a.stages[0].id + '-match-1', sets: [{ a: 11, b: 8 }], status: 'FINISHED' };
    const br = { matchId: b.stages[0].id + '-match-1', sets: [], status: 'LIVE' };
    data.set(results, JSON.stringify([ar, br]));
    data.set(pauses, JSON.stringify([{ tournamentId: a.id, stageId: a.stages[0].id, afterRound: 1 }]));
    data.set(cutoffs, JSON.stringify({ [a.id + ':' + a.stages[0].id]: 1, [b.id + ':' + b.stages[0].id]: 2 }));
    const backup = await captureTournamentBackup(a.id);
    const other = await captureTournamentBackup(b.id);
    expect(JSON.parse(backup.entries[results])).toEqual([ar]);
    expect(JSON.parse(backup.entries[pauses])).toHaveLength(1);
    expect(Object.keys(JSON.parse(backup.entries[cutoffs]))).toEqual([a.id + ':' + a.stages[0].id]);
    expect(JSON.stringify(backup)).not.toContain(b.id);
    removeLocalPrototypeTournaments();
    await restoreTournamentBackup(other);
    await restoreTournamentBackup(backup);
    expect(getAllMockTournaments()).toHaveLength(2);
    expect(getMockTournament(a.id)).toEqual(a);
    expect(getMockTournament(b.id)).toEqual(b);
    expect(JSON.parse(data.get(results)!)).toEqual([br, ar]);
    expect(JSON.parse(data.get(pauses)!)).toHaveLength(1);
  });
  it('refuses overwrite and rejects foreign or missing records without writes', async () => {
    const a = create('Turnier A');
    const backup = await captureTournamentBackup(a.id);
    const before = [...data];
    await expect(restoreTournamentBackup(backup)).rejects.toThrow('existiert bereits');
    expect([...data]).toEqual(before);
    const foreign = structuredClone(backup);
    foreign.entries[results] = JSON.stringify([{ matchId: 'local-foreign-phase-1-match-1' }]);
    expect(() => validateTournamentBackup(foreign)).toThrow('fremde');
    const incomplete = structuredClone(backup);
    delete incomplete.entries[pauses];
    expect(() => validateTournamentBackup(incomplete)).toThrow('Unvollständige');
    await expect(restoreTournamentBackup(foreign)).rejects.toThrow();
    expect([...data]).toEqual(before);
  });
});
