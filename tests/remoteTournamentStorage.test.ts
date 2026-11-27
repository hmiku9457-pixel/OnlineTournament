import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const data = new Map<string, string>();
const storage = {
  get length() { return data.size; },
  key(index: number) { return [...data.keys()][index] ?? null; },
  getItem(key: string) { return data.get(key) ?? null; },
  removeItem(key: string) { data.delete(key); },
  setItem(key: string, value: string) { data.set(key, String(value)); },
};
beforeEach(() => {
  vi.resetModules();
  data.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(name: string, init?: CustomEventInit<T>) { super(name, init); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const store = await import('@/services/mockTournamentStore');
  const adapter = await import('@/services/localTournamentStorage');
  const t = store.createMockTournament({
    name: 'Online-Test', sport: 'table_tennis', discipline: 'SINGLES', tables: 3,
    minimumMatches: 2, estimatedDurationMinutes: 60,
    participantNames: Array.from({ length: 8 }, (_, index) => 'Spieler ' + (index + 1)),
    phases: [{ type: 'GROUPS', label: 'Gruppen', bestOf: 3, entrantCount: 8, groupCount: 2, swissRounds: 1, knockoutBestOf: [] }],
  });
  const backup = await adapter.captureTournamentBackup(t.id);
  const key = 'online-tournament:local-prototype-tournaments:v1:record:' + t.id;
  return { adapter, t, backup, key };
}

describe('isolated remote tournament persistence', () => {
  it('commits immutable snapshots in order, without writing browser-local data', async () => {
    const { adapter, backup, key } = await setup();
    const localBefore = [...data];
    const saves: import('@/services/localTournamentStorage').TournamentBackup[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    adapter.initializeRemoteTournamentStorage(backup, async (value) => {
      saves.push(value);
      if (saves.length === 1) await gate;
    });
    const record = JSON.parse(backup.entries[key]);
    adapter.localTournamentStorage.setItem(key, JSON.stringify({ ...record, tournament: { ...record.tournament, name: 'Erster Stand' } }));
    const first = adapter.flushPendingLocalTournamentWrites();
    expect(adapter.hasPendingRemoteWrites()).toBe(true);
    adapter.localTournamentStorage.setItem(key, JSON.stringify({ ...record, tournament: { ...record.tournament, name: 'Zweiter Stand' } }));
    const second = adapter.flushPendingLocalTournamentWrites();
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(saves.map(adapter.backupTournamentName)).toEqual(['Erster Stand', 'Zweiter Stand']);
    expect(adapter.hasPendingRemoteWrites()).toBe(false);
    expect([...data]).toEqual(localBefore);
  });
  it('restores last confirmed state and rejects further writes after conflict', async () => {
    const { adapter, backup, key } = await setup();
    const save = vi.fn(async () => { throw new Error('revision conflict'); });
    adapter.initializeRemoteTournamentStorage(backup, save);
    const record = JSON.parse(backup.entries[key]);
    adapter.localTournamentStorage.setItem(key, JSON.stringify({ ...record, tournament: { ...record.tournament, name: 'Nicht gespeichert' } }));
    await expect(adapter.flushPendingLocalTournamentWrites()).rejects.toThrow('revision conflict');
    expect(adapter.localTournamentStorage.getItem(key)).toBe(backup.entries[key]);
    expect(adapter.getTournamentStorageError()).toContain('nicht bestätigt');
    expect(() => adapter.localTournamentStorage.setItem(key, backup.entries[key])).toThrow();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('runs the existing director engine against the remote storage boundary', async () => {
    const { adapter, backup, t } = await setup();
    const store = await import('@/services/mockTournamentStore');
    const lifecycle = await import('@/services/mockPhaseLifecycle');
    const runtime = await import('@/services/mockRuntime');
    let persisted = backup;
    adapter.initializeRemoteTournamentStorage(backup, async (next) => { persisted = next; });
    expect(adapter.prestartRecoveryStorageKey(t.id)).toContain('online-prestart-recovery');
    expect(lifecycle.startFirstStage(t)).toBe(true);
    await adapter.flushPendingLocalTournamentWrites();
    store.updateMockTournamentStatus(t.id, 'RUNNING');
    await adapter.flushPendingLocalTournamentWrites();
    const running = store.getMockTournament(t.id);
    const match = runtime.getMockRuntimeMatches(running).find((m) => m.status === 'WAITING');
    expect(match).toBeDefined();
    expect(runtime.assignMockMatchToTable(running, match!.id, 'Tisch 1')).toBe(true);
    await adapter.flushPendingLocalTournamentWrites();
    runtime.saveMockMatchSets(match!.id, [{ number: 1, sideAScore: 11, sideBScore: 6 }]);
    await adapter.flushPendingLocalTournamentWrites();
    const results = JSON.parse(persisted.entries['online-tournament:mock-match-results:v2']);
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ matchId: match!.id })]));
    expect(JSON.stringify(persisted)).toContain('Tisch 1');
    expect(data.get('online-tournament:mock-match-results:v2') ?? '').not.toContain(match!.id);
  });
  it('builds initial cloud state without modifying local storage', async () => {
    const { adapter } = await setup();
    const store = await import('@/services/mockTournamentStore');
    const before = [...data];
    const tournament = store.buildNewTournament({
      name: 'Direkt online', sport: 'table_tennis', discipline: 'SINGLES', tables: 3,
      minimumMatches: 2, estimatedDurationMinutes: 60,
      participantNames: ['A', 'B', 'C', 'D'],
      phases: [{ type: 'GROUPS', label: 'Gruppen', bestOf: 3, entrantCount: 4, groupCount: 2, swissRounds: 1, knockoutBestOf: [] }],
    });
    const backup = adapter.initialTournamentBackup(tournament);
    expect(adapter.backupTournamentName(backup)).toBe('Direkt online');
    expect([...data]).toEqual(before);
    expect(store.getAllMockTournaments().some(t => t.id === tournament.id)).toBe(false);
  });
  it('does not persist a replacement or deletion of the online event', async () => {
    const { adapter, backup } = await setup();
    const save = vi.fn(async () => {});
    adapter.initializeRemoteTournamentStorage(backup, save);
    adapter.localTournamentStorage.setItem('online-tournament:local-prototype-tournaments:v1:index:v3', '[]');
    await expect(adapter.flushPendingLocalTournamentWrites()).rejects.toThrow('nicht gelöscht');
    expect(save).not.toHaveBeenCalled();
  });
});
