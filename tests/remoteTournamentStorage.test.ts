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
  it('retries exactly the uncertain snapshot and resumes after confirmation', async () => {
    const { adapter, backup, key } = await setup();
    const snapshots: import('@/services/localTournamentStorage').TournamentBackup[] = [];
    adapter.initializeRemoteTournamentStorage(backup, async (next) => {
      snapshots.push(next);
      if (snapshots.length === 1) throw new adapter.RemoteWriteUnavailableError('connection lost');
    });
    const record = JSON.parse(backup.entries[key]);
    const changed = JSON.stringify({ ...record, tournament: { ...record.tournament, name: 'Neue Daten' } });
    adapter.localTournamentStorage.setItem(key, changed);
    await expect(adapter.flushPendingLocalTournamentWrites()).rejects.toThrow('connection lost');
    expect(adapter.localTournamentStorage.getItem(key)).toBe(backup.entries[key]);
    expect(adapter.getRemoteRecovery()?.retryable).toBe(true);
    await adapter.retryRemoteTournamentWrite();
    expect(snapshots[0]).toBe(snapshots[1]);
    expect(adapter.localTournamentStorage.getItem(key)).toBe(changed);
    expect(adapter.getRemoteRecovery()).toBeNull();
    expect(adapter.getTournamentStorageError()).toBe('');
    adapter.localTournamentStorage.setItem(key, backup.entries[key]);
    await adapter.flushPendingLocalTournamentWrites();
    expect(snapshots).toHaveLength(3);
  });
  it('never retries a conflicting revision and clears private recovery on logout', async () => {
    const { adapter, backup, key } = await setup();
    adapter.initializeRemoteTournamentStorage(backup, async () => { throw new Error('revision conflict'); });
    adapter.localTournamentStorage.setItem(key, backup.entries[key]);
    await expect(adapter.flushPendingLocalTournamentWrites()).rejects.toThrow('revision conflict');
    expect(adapter.getRemoteRecovery()?.retryable).toBe(false);
    await expect(adapter.retryRemoteTournamentWrite()).rejects.toThrow('nicht automatisch');
    adapter.invalidateRemoteTournamentStorage();
    expect(adapter.getRemoteRecovery()).toBeNull();
    expect(adapter.localTournamentStorage.getItem(key)).toBeNull();
  });
  it('completes a round robin across independent remote workspaces with an interrupted result', async () => {
    const { adapter } = await setup();
    const store = await import('@/services/mockTournamentStore');
    const lifecycle = await import('@/services/mockPhaseLifecycle');
    const runtime = await import('@/services/mockRuntime');
    const t = store.buildNewTournament({ name: 'Online-Abnahme', sport: 'table_tennis', discipline: 'SINGLES',
      tables: 2, minimumMatches: 1, estimatedDurationMinutes: 60, participantNames: ['Anna','Bernd','Clara','Dieter'],
      phases: [{ type: 'ROUND_ROBIN', label: 'Liga', bestOf: 1, entrantCount: 4, groupCount: 1, swissRounds: 1, knockoutBestOf: [] }] });
    let persisted = adapter.initialTournamentBackup(t);
    let disconnect = false;
    const save = async (next: typeof persisted) => {
      if (disconnect) { disconnect = false; throw new adapter.RemoteWriteUnavailableError('offline'); }
      persisted = structuredClone(next);
    };
    adapter.initializeRemoteTournamentStorage(persisted, save);
    expect(lifecycle.startFirstStage(t)).toBe(true);
    store.updateMockTournamentStatus(t.id, 'RUNNING');
    await adapter.flushPendingLocalTournamentWrites();
    const first = runtime.getMockStageMatches(t, t.stages[0])[0];
    expect(runtime.assignMockMatchToTable(store.getMockTournament(t.id), first.id, 'Tisch 1')).toBe(true);
    await adapter.flushPendingLocalTournamentWrites();
    const sets = [{ number: 1, sideAScore: 11, sideBScore: 7 }];
    disconnect = true;
    runtime.completeMockMatch(first.id, sets);
    await expect(adapter.flushPendingLocalTournamentWrites()).rejects.toThrow('offline');
    await adapter.retryRemoteTournamentWrite();
    expect(runtime.getMockStoredResult(first.id)?.sets).toEqual(sets);
    // A separate module instance represents a freshly loaded client on a second device.
    vi.resetModules();
    const nextAdapter = await import('@/services/localTournamentStorage');
    const nextStore = await import('@/services/mockTournamentStore');
    const nextRuntime = await import('@/services/mockRuntime');
    nextAdapter.initializeRemoteTournamentStorage(persisted, async (next) => { persisted = structuredClone(next); });
    expect(nextRuntime.getMockStoredResult(first.id)?.sets).toEqual(sets);
    const active = nextStore.getMockTournament(t.id);
    const rest = nextRuntime.getMockStageMatches(active, active.stages[0]).filter(m => m.id !== first.id);
    expect(rest).toHaveLength(5);
    for (const match of rest) {
      nextRuntime.completeMockMatch(match.id, sets);
      await nextAdapter.flushPendingLocalTournamentWrites();
    }
    expect(nextRuntime.getPendingMockApproval(active)?.kind).toBe('STAGE');
    expect(nextRuntime.approveMockProgress(active)?.isLastStage).toBe(true);
    await nextAdapter.flushPendingLocalTournamentWrites();
    expect(nextStore.getMockTournament(t.id).status).toBe('FINISHED');
    expect(JSON.parse(persisted.entries['online-tournament:mock-match-results:v2'])).toHaveLength(6);
    expect(data.get('online-tournament:mock-match-results:v2') ?? '').not.toContain(t.id);
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
