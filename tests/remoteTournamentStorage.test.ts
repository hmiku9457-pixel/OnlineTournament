import { appendFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type Snapshot = import('@/services/localTournamentStorage').TournamentBackup;
function recordSqlFixture(snapshot: Snapshot) {
  if(process.env.ONLINE_SQL_FIXTURES) appendFileSync(process.env.ONLINE_SQL_FIXTURES,JSON.stringify(snapshot)+'\n');
}
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
    recordSqlFixture(persisted);
    let disconnect = false;
    const save = async (next: typeof persisted) => {
      if (disconnect) { disconnect = false; throw new adapter.RemoteWriteUnavailableError('offline'); }
      persisted = structuredClone(next);
      recordSqlFixture(persisted);
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
    nextAdapter.initializeRemoteTournamentStorage(persisted, async (next) => { persisted = structuredClone(next); recordSqlFixture(persisted); });
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
  it('continues a multi-day Swiss event across reloads and round approvals', async () => {
    const { adapter } = await setup();
    const store = await import('@/services/mockTournamentStore');
    const lifecycle = await import('@/services/mockPhaseLifecycle');
    const runtime = await import('@/services/mockRuntime');
    const breaks = await import('@/services/mockInlineBreak');
    const t=store.buildNewTournament({name:'Schweizer Online',sport:'table_tennis',discipline:'SINGLES',tables:2,minimumMatches:1,estimatedDurationMinutes:120,
      tournamentMode:'multi',plannedDays:2,participantNames:['Anna','Bernd','Clara','Dieter'],
      phases:[{type:'SWISS',label:'Schweizer',entrantCount:4,groupCount:1,bestOf:1,swissRounds:2,knockoutBestOf:[],dayBreaks:[{afterRound:1,date:'2031-11-21',time:'09:00'}]}]});
    let saved=adapter.initialTournamentBackup(t);
    recordSqlFixture(saved);
    adapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);recordSqlFixture(saved);});
    expect(lifecycle.startFirstStage(t)).toBe(true);
    store.updateMockTournamentStatus(t.id,'RUNNING');
    await adapter.flushPendingLocalTournamentWrites();
    const score=[{number:1,sideAScore:11,sideBScore:6}];
    for(const match of runtime.getMockStageMatches(t,t.stages[0])) {
      runtime.completeMockMatch(match.id,score); await adapter.flushPendingLocalTournamentWrites();
    }
    expect(runtime.approveMockProgress(t)?.kind).toBe('ROUND');
    await adapter.flushPendingLocalTournamentWrites();
    expect(runtime.getMockStageMatches(t,t.stages[0]).some(m=>m.round==='Runde 2')).toBe(false);
    expect(breaks.startInlineBreak(t,t.stages[0],[],{kind:'minutes',minutes:15})).toBe(true);
    store.updateMockTournamentStatus(t.id,'PAUSED');
    await adapter.flushPendingLocalTournamentWrites();
    vi.resetModules();
    const nextAdapter=await import('@/services/localTournamentStorage');
    const nextRuntime=await import('@/services/mockRuntime');
    const nextStore=await import('@/services/mockTournamentStore');
    const nextBreaks=await import('@/services/mockInlineBreak');
    nextAdapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);recordSqlFixture(saved);});
    const paused=nextStore.getMockTournament(t.id);
    expect(paused.status).toBe('PAUSED');
    expect(nextBreaks.getInlineBreakStatus(paused,paused.stages[0])?.state).toBe('running');
    expect(nextBreaks.finishInlineBreak(paused,paused.stages[0],true)).toBe(true);
    nextStore.updateMockTournamentStatus(t.id,'RUNNING');
    await nextAdapter.flushPendingLocalTournamentWrites();
    const active=nextStore.getMockTournament(t.id);
    const second=nextRuntime.getMockStageMatches(active,active.stages[0]).filter(m=>m.round==='Runde 2');
    expect(second).toHaveLength(2);
    for(const match of second){nextRuntime.completeMockMatch(match.id,score);await nextAdapter.flushPendingLocalTournamentWrites();}
    expect(nextRuntime.approveMockProgress(active)?.kind).toBe('STAGE');
    await nextAdapter.flushPendingLocalTournamentWrites();
    expect(nextStore.getMockTournament(t.id).status).toBe('FINISHED');
  });
  it('persists odd Swiss rounds with a technical bye using PostgreSQL-safe identities',async()=>{
    const {adapter}=await setup();
    const store=await import('@/services/mockTournamentStore');
    const lifecycle=await import('@/services/mockPhaseLifecycle');
    const runtime=await import('@/services/mockRuntime');
    const t=store.buildNewTournament({name:'Swiss Freilos Test',sport:'table_tennis',discipline:'SINGLES',tables:2,minimumMatches:2,estimatedDurationMinutes:90,
      participantNames:['Anna','Bernd','Clara','Dieter','Eva'],phases:[{type:'SWISS',label:'Schweizer',entrantCount:5,groupCount:1,bestOf:1,swissRounds:4,knockoutBestOf:[]}]});
    let saved=adapter.initialTournamentBackup(t);
    recordSqlFixture(saved);
    adapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);recordSqlFixture(saved);});
    expect(lifecycle.startFirstStage(t)).toBe(true);
    store.updateMockTournamentStatus(t.id,'RUNNING');
    await adapter.flushPendingLocalTournamentWrites();
    const byes=new Set<string>();
    for(let round=1;round<=4;round++){
      const active=store.getMockTournament(t.id);
      const matches=runtime.getMockRuntimeMatches(active).filter(m=>m.round==='Runde '+round);
      expect(matches).toHaveLength(2);
      for(const match of matches)runtime.completeMockMatch(match.id,[{number:1,sideAScore:11,sideBScore:8}],'FINISHED',true);
      await adapter.flushPendingLocalTournamentWrites();
      const persisted=JSON.parse(saved.entries['online-tournament:swiss-round-fixtures:v1']);
      const pairs=persisted.find((r:{round:number})=>r.round===round).pairs;
      expect(pairs).toHaveLength(3);
      const byePairs=pairs.filter((pair:string[])=>pair[1]==='ot:slot:bye');
      expect(byePairs).toHaveLength(1);
      expect(byes.has(byePairs[0][0])).toBe(false);
      byes.add(byePairs[0][0]);
      expect(JSON.stringify(pairs)).not.toContain('\\u0000');
      expect(runtime.approveMockProgress(active)?.kind).toBe(round<4?'ROUND':'STAGE');
      await adapter.flushPendingLocalTournamentWrites();
    }
    expect(store.getMockTournament(t.id).status).toBe('FINISHED');
  });
  it('preserves group qualifiers and runs a knockout after a new workspace is opened', async () => {
    const { adapter }=await setup();
    const store=await import('@/services/mockTournamentStore');
    const lifecycle=await import('@/services/mockPhaseLifecycle');
    const runtime=await import('@/services/mockRuntime');
    const t=store.buildNewTournament({name:'Gruppen und Finale',sport:'table_tennis',discipline:'SINGLES',tables:2,minimumMatches:1,estimatedDurationMinutes:60,participantNames:['Anna','Bernd','Clara','Dieter'],
      phases:[{type:'GROUPS',label:'Gruppen',entrantCount:4,groupCount:2,swissRounds:1,bestOf:1,knockoutBestOf:[]},
        {type:'KNOCKOUT',label:'Finale',entrantCount:2,groupCount:1,swissRounds:1,bestOf:1,knockoutBestOf:[1]}]});
    let saved=adapter.initialTournamentBackup(t);
    recordSqlFixture(saved);
    adapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);recordSqlFixture(saved);});
    expect(lifecycle.startFirstStage(t)).toBe(true);
    store.updateMockTournamentStatus(t.id,'RUNNING');
    await adapter.flushPendingLocalTournamentWrites();
    const score=[{number:1,sideAScore:11,sideBScore:7}];
    for(const match of runtime.getMockStageMatches(t,t.stages[0])) {
      runtime.completeMockMatch(match.id,score);await adapter.flushPendingLocalTournamentWrites();
    }
    expect(runtime.approveMockProgress(t)?.kind).toBe('STAGE');
    await adapter.flushPendingLocalTournamentWrites();
    vi.resetModules();
    const nextAdapter=await import('@/services/localTournamentStorage');
    const nextRuntime=await import('@/services/mockRuntime');
    const nextStore=await import('@/services/mockTournamentStore');
    const nextLifecycle=await import('@/services/mockPhaseLifecycle');
    nextAdapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);recordSqlFixture(saved);});
    const paused=nextStore.getMockTournament(t.id);
    expect(paused.status).toBe('PAUSED');
    expect(nextLifecycle.startStage(paused,paused.stages[1])).toBe(true);
    nextStore.updateMockTournamentStatus(t.id,'RUNNING');
    await nextAdapter.flushPendingLocalTournamentWrites();
    const active=nextStore.getMockTournament(t.id);
    const final=nextRuntime.getMockStageMatches(active,active.stages[1]);
    expect(final).toHaveLength(1);
    nextRuntime.completeMockMatch(final[0].id,score);
    await nextAdapter.flushPendingLocalTournamentWrites();
    expect(nextRuntime.approveMockProgress(active)?.isLastStage).toBe(true);
    await nextAdapter.flushPendingLocalTournamentWrites();
    expect(nextStore.getMockTournament(t.id).status).toBe('FINISHED');
  });
  it('replays a six-player knockout including byes, semifinals and bronze through PostgreSQL',async()=>{
    const {adapter}=await setup();
    const store=await import('@/services/mockTournamentStore');
    const lifecycle=await import('@/services/mockPhaseLifecycle');
    const runtime=await import('@/services/mockRuntime');
    const t=store.buildNewTournament({name:'KO mit Freilosen und Bronze',sport:'table_tennis',discipline:'SINGLES',tables:3,minimumMatches:1,estimatedDurationMinutes:90,
      participantNames:['A','B','C','D','E','F'],phases:[{type:'KNOCKOUT',label:'KO',entrantCount:6,groupCount:1,swissRounds:1,bestOf:1,knockoutBestOf:[1,1,1]}]});
    let saved=adapter.initialTournamentBackup(t);
    recordSqlFixture(saved);
    adapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);recordSqlFixture(saved);});
    adapter.runRemoteTournamentBatch(()=>{expect(lifecycle.startFirstStage(t)).toBe(true);store.updateMockTournamentStatus(t.id,'RUNNING');});
    await adapter.flushPendingLocalTournamentWrites();
    const draws=JSON.parse(saved.entries['online-tournament:mock-draw-config:v1']);
    const slots=draws.find((d:{stageId:string})=>d.stageId===t.stages[0].id).bracketSlots;
    expect(slots).toHaveLength(8);
    expect(slots.filter((slot:{kind:string})=>slot.kind==='bye')).toHaveLength(2);
    const score=[{number:1,sideAScore:11,sideBScore:7}];
    let played=0;
    for(let pass=0;pass<4;pass++){
      const active=store.getMockTournament(t.id);
      const pending=runtime.getMockStageMatches(active,active.stages[0]).filter(m=>m.status==='WAITING');
      for(const match of pending){runtime.completeMockMatch(match.id,score,'FINISHED',true);await adapter.flushPendingLocalTournamentWrites();played++;}
      if(!pending.length)break;
    }
    const active=store.getMockTournament(t.id);
    expect(played).toBe(6);
    expect(runtime.getMockStageMatches(active,active.stages[0]).find(m=>m.round==='Spiel um Platz 3')?.status).toBe('FINISHED');
    expect(runtime.approveMockProgress(active)?.isLastStage).toBe(true);
    await adapter.flushPendingLocalTournamentWrites();
    expect(store.getMockTournament(t.id).status).toBe('FINISHED');
  });
  it('preserves cumulative unsaved changes for export when an earlier queued write fails', async () => {
    const { adapter, backup, key } = await setup();
    let rejectFirst!: (reason: Error) => void;
    const gate = new Promise<void>((_resolve,reject)=>{rejectFirst=reject;});
    const save = vi.fn(async ()=>gate);
    adapter.initializeRemoteTournamentStorage(backup,save);
    const record=JSON.parse(backup.entries[key]);
    const rename=(name:string)=>adapter.localTournamentStorage.setItem(key,JSON.stringify({...record,tournament:{...record.tournament,name}}));
    rename('Erste Änderung');
    const first=adapter.flushPendingLocalTournamentWrites();
    rename('Zweite Änderung');
    const second=adapter.flushPendingLocalTournamentWrites();
    const errors=Promise.allSettled([first,second]);
    await Promise.resolve();
    rejectFirst(new adapter.RemoteWriteUnavailableError('offline'));
    expect((await errors).map(result=>result.status)).toEqual(['rejected','rejected']);
    const recovery=adapter.getRemoteRecovery();
    expect(recovery?.retryable).toBe(false);
    expect(adapter.backupTournamentName(recovery!.snapshot)).toBe('Zweite Änderung');
    expect(adapter.localTournamentStorage.getItem(key)).toBe(backup.entries[key]);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('blocks mutations at the storage boundary after a stale revision is detected', async () => {
    const {adapter,backup,key}=await setup();
    const save=vi.fn(async()=>{});
    adapter.initializeRemoteTournamentStorage(backup,save);
    expect(adapter.markRemoteWorkspaceStale()).toBe(true);
    expect(()=>adapter.localTournamentStorage.setItem(key,'{}')).toThrow('neuerer Datenbankstand');
    expect(()=>adapter.localTournamentStorage.removeItem(key)).toThrow('neuerer Datenbankstand');
    expect(()=>adapter.localTournamentStorage.clear()).toThrow('neuerer Datenbankstand');
    expect(adapter.localTournamentStorage.getItem(key)).toBe(backup.entries[key]);
    await adapter.flushPendingLocalTournamentWrites();
    expect(save).not.toHaveBeenCalled();
  });
  it('rolls back a failed compound remote operation without committing partial data', async()=>{
    const {adapter,backup,key}=await setup();
    const save=vi.fn(async()=>{});
    adapter.initializeRemoteTournamentStorage(backup,save);
    expect(()=>adapter.runRemoteTournamentBatch(()=>{
      adapter.localTournamentStorage.setItem(key,JSON.stringify({...JSON.parse(backup.entries[key]),tournament:{...JSON.parse(backup.entries[key]).tournament,name:'Partial'}}));
      throw new Error('second operation failed');
    })).toThrow('second operation failed');
    await adapter.flushPendingLocalTournamentWrites();
    expect(save).not.toHaveBeenCalled();
    expect(adapter.localTournamentStorage.getItem(key)).toBe(backup.entries[key]);
    expect(adapter.hasPendingRemoteWrites()).toBe(false);
  });
  it('commits a compound operation in one revision and rejects overlapping work',async()=>{
    const {adapter,backup,key}=await setup();
    const save=vi.fn(async(snapshot:Snapshot)=>{void snapshot;});
    adapter.initializeRemoteTournamentStorage(backup,save);
    const initial=JSON.parse(backup.entries[key]);
    const rename=(name:string)=>adapter.localTournamentStorage.setItem(key,JSON.stringify({...initial,tournament:{...initial.tournament,name}}));
    expect(adapter.runRemoteTournamentBatch(()=>{rename('First');rename('Second');return 2;})).toBe(2);
    expect(()=>adapter.runRemoteTournamentBatch(()=>rename('Third'))).toThrow('Speicherung abschließen');
    await adapter.flushPendingLocalTournamentWrites();
    expect(save).toHaveBeenCalledTimes(1);
    expect(adapter.backupTournamentName(save.mock.calls[0][0] as Snapshot)).toBe('Second');
  });
  it('simulates a 16-player round robin with eight tables and atomic result batches',async()=>{
    const {adapter}=await setup();
    const store=await import('@/services/mockTournamentStore');
    const lifecycle=await import('@/services/mockPhaseLifecycle');
    const runtime=await import('@/services/mockRuntime');
    const {planControlAssignments}=await import('@/domain/controlAssignment');
    const t=store.buildNewTournament({name:'16 Spieler Online-Simulation',sport:'table_tennis',discipline:'SINGLES',
      tables:8,minimumMatches:15,estimatedDurationMinutes:240,participantNames:Array.from({length:16},(_,i)=>'Teilnehmer '+(i+1)),
      phases:[{type:'ROUND_ROBIN',label:'Liga',entrantCount:16,groupCount:1,swissRounds:1,bestOf:1,knockoutBestOf:[]}]});
    let saved=adapter.initialTournamentBackup(t);
    recordSqlFixture(saved);
    let writes=0;
    adapter.initializeRemoteTournamentStorage(saved,async next=>{saved=structuredClone(next);writes++;recordSqlFixture(saved);});
    expect(lifecycle.startFirstStage(t)).toBe(true);
    store.updateMockTournamentStatus(t.id,'RUNNING');
    await adapter.flushPendingLocalTournamentWrites();
    const free=Array.from({length:8},(_,i)=>'Tisch '+(i+1));
    let total=0,batches=0;
    while(total<120){
      const active=store.getMockTournament(t.id);
      const waiting=runtime.getMockRuntimeMatches(active).filter(m=>m.status==='WAITING');
      const plan=planControlAssignments(waiting,runtime.getMockQueueAssignableTables(active),free);
      expect(plan.length).toBeGreaterThan(0);
      expect(plan.length).toBeLessThanOrEqual(8);
      adapter.runRemoteTournamentBatch(()=>{
        for(const item of plan)expect(runtime.assignMockMatchToTable(active,item.matchId,item.table)).toBe(true);
      });
      await adapter.flushPendingLocalTournamentWrites();
      const before=writes;
      adapter.runRemoteTournamentBatch(()=>{
        for(const item of plan)runtime.completeMockMatch(item.matchId,[{number:1,sideAScore:11,sideBScore:7}],'FINISHED',true);
      });
      await adapter.flushPendingLocalTournamentWrites();
      expect(writes).toBe(before+1);
      total+=plan.length;batches++;
      expect(batches).toBeLessThanOrEqual(120);
    }
    const active=store.getMockTournament(t.id);
    expect(runtime.getPendingMockApproval(active)?.kind).toBe('STAGE');
    expect(runtime.approveMockProgress(active)?.isLastStage).toBe(true);
    await adapter.flushPendingLocalTournamentWrites();
    expect(store.getMockTournament(t.id).status).toBe('FINISHED');
    const finished=JSON.parse(saved.entries['online-tournament:mock-match-results:v2']);
    expect(finished).toHaveLength(120);
    expect(new Set(finished.map((m:{matchId:string})=>m.matchId)).size).toBe(120);
    expect(finished.every((m:{status:string;adminConfirmed:boolean})=>m.status==='FINISHED'&&m.adminConfirmed)).toBe(true);
  },30000);
  it('does not persist a replacement or deletion of the online event', async () => {
    const { adapter, backup } = await setup();
    const save = vi.fn(async () => {});
    adapter.initializeRemoteTournamentStorage(backup, save);
    adapter.localTournamentStorage.setItem('online-tournament:local-prototype-tournaments:v1:index:v3', '[]');
    await expect(adapter.flushPendingLocalTournamentWrites()).rejects.toThrow('nicht gelöscht');
    expect(save).not.toHaveBeenCalled();
  });
});
