import type { DemoTournament } from '@/data/demoTournaments';
/** Canonical, transactionally committed browser-local tournament state.
 * The synchronous façade exists for the match engine; IndexedDB is the
 * durable authority. One browser event's writes share one readwrite tx. */
const DB_NAME = 'online-tournament:local-state:v1';
const VALUES = 'values';
const META = 'meta';
const QUARANTINE = 'quarantine';
const PREFIX = 'online-tournament:';
const INDEX = 'online-tournament:local-prototype-tournaments:v1:index:v3';
const RECORD_PREFIX = 'online-tournament:local-prototype-tournaments:v1:record:';
const ARRAY_KEYS = [
  'online-tournament:mock-draw-config:v1',
  'online-tournament:mock-phase-lifecycle:v1',
  'online-tournament:mock-audit:v1',
  'online-tournament:mock-inline-breaks:v2',
  'online-tournament:group-cutoff-decisions:v1',
  'online-tournament:mock-match-results:v2',
  'online-tournament:mock-match-runtime:v1',
  'online-tournament:swiss-round-fixtures:v1',
] as const;
const OBJECT_KEYS = [
  'online-tournament:withdrawn-participants:v1',
  'online-tournament:withdrawal-timing:v1',
  'online-tournament:withdrawal-restore:v1',
  'online-tournament:mock-blocked-tables:v1',
  'online-tournament:swiss-cutoff-decisions:v1',
  'online-tournament:swiss-round-robin-history:v1',
  'online-tournament:swiss-extra-rounds:v1',
] as const;

interface StoredValue { key: string; value: string }
export interface CorruptLocalRecord {
  key: string;
  reason: string;
  raw: string | null;
  detectedAt: string;
}
let database: IDBDatabase | null = null;
let ready = false;
let revision = 0;
let currentError = '';
let workingValues = new Map<string, string>();
let nativeCleared = false;
let quarantine: CorruptLocalRecord[] = [];
const pendingChanges = new Map<string, string | null>();
let outstandingCommits = 0;
let flushScheduled = false;
let writeTail: Promise<void> = Promise.resolve();
let channel: BroadcastChannel | null = null;
let remote: { id: string; save: (snapshot: TournamentBackup) => Promise<void>; confirmed: Map<string, string> } | null = null;

function nativeStorage(): Storage { return window.localStorage; }
function allLocalKeys(): string[] {
  const store = nativeStorage();
  return Array.from({ length: store.length }, (_, i) => store.key(i))
    .filter((key): key is string => Boolean(key && key.startsWith(PREFIX)));
}
function replaceLocalSnapshot(entries: StoredValue[]): void {
  // A synchronous view is still needed by the existing tournament engine,
  // but the browser's quota-limited localStorage must not hold a second copy.
  workingValues = new Map(entries.map((entry) => [entry.key, entry.value]));
  if (!nativeCleared) {
    const store = nativeStorage();
    for (const key of allLocalKeys()) store.removeItem(key);
    nativeCleared = true;
  }
}
function signalError(message: string): void {
  currentError = message;
  window.dispatchEvent(new Event('tournament-storage-integrity-change'));
}
export function getTournamentStorageError(): string { return currentError; }
/** When IndexedDB is unavailable, retain the editor for draft inspection but
 * reject every local tournament mutation instead of silently falling back. */
export function markLocalTournamentStorageUnavailable(error: unknown): void {
  ready = true;
  signalError(error instanceof Error ? error.message : 'Der sichere Turnierspeicher ist nicht verfügbar.');
}
export function listCorruptLocalRecords(): CorruptLocalRecord[] { return [...quarantine]; }

async function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB ist nicht verfügbar. Die Turnierdaten können nicht sicher gespeichert werden.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const result = request.result;
      if (!result.objectStoreNames.contains(VALUES)) result.createObjectStore(VALUES, { keyPath: 'key' });
      if (!result.objectStoreNames.contains(META)) result.createObjectStore(META);
      if (!result.objectStoreNames.contains(QUARANTINE)) result.createObjectStore(QUARANTINE, { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error ?? new Error('Turnierdatenbank nicht erreichbar.'));
    request.onblocked = () => reject(new Error('Die Turnierdatenbank wird von einem anderen Tab blockiert.'));
    request.onsuccess = () => resolve(request.result);
  });
  db.onversionchange = () => { db.close(); database = null; signalError('Die Datenbankversion wurde geändert. Bitte die Seite neu laden.'); };
  database = db;
  return db;
}

function transaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode,
  execute: (tx: IDBTransaction, complete: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let outcome: T;
    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error ?? new Error('Die Speichertransaktion ist fehlgeschlagen.'));
    tx.onabort = () => reject(tx.error ?? new Error('Die Speichertransaktion wurde abgebrochen.'));
    try { execute(tx, (value) => { outcome = value; }); }
    catch (error) { try { tx.abort(); } catch { /* transaction ended */ } reject(error); }
  });
}

async function readCanonical() {
  const db = await openDatabase();
  return transaction<{ entries: StoredValue[]; quarantined: CorruptLocalRecord[]; version: number }>(
    db, [VALUES, QUARANTINE, META], 'readonly', (tx, complete) => {
      const values = tx.objectStore(VALUES).getAll();
      const invalid = tx.objectStore(QUARANTINE).getAll();
      const version = tx.objectStore(META).get('revision');
      version.onsuccess = () => {
        // All three requests are issued synchronously into the same transaction.
        complete({ entries: values.result as StoredValue[], quarantined: invalid.result as CorruptLocalRecord[],
          version: (version.result as number | undefined) ?? 0 });
      };
    });
}

function validTournament(raw: string, id: string): boolean {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return false;
    const t = (data as { tournament?: Record<string, unknown>; sortOrder?: unknown }).tournament;
    const order = (data as { sortOrder?: unknown }).sortOrder;
    return typeof order === 'number' && Number.isFinite(order)
      && !!t && t.id === id && typeof t.name === 'string' && t.name.trim().length > 0
      && typeof t.tables === 'number' && Number.isInteger(t.tables) && t.tables >= 1
      && Array.isArray(t.participantNames) && t.participantNames.every((name) => typeof name === 'string')
      && !!t.participantIds && typeof t.participantIds === 'object' && !Array.isArray(t.participantIds)
      && Object.keys(t.participantIds).length === t.participantNames.length
      && t.participantNames.every((name: string) => {
        const participantId = (t.participantIds as Record<string, unknown>)[name];
        return typeof participantId === 'string' && participantId.length > 0;
      })
      && new Set(Object.values(t.participantIds)).size === t.participantNames.length
      && new Set(t.participantNames).size === t.participantNames.length
      && Array.isArray(t.stages) && t.stages.every((stage: unknown) =>
        Boolean(stage && typeof stage === 'object' && typeof (stage as { id?: unknown }).id === 'string'));
  } catch { return false; }
}
export function inspectSnapshot(entries: StoredValue[]): { valid: StoredValue[]; corrupt: CorruptLocalRecord[] } {
  const data = new Map(entries.filter((entry) => entry.key.startsWith(PREFIX)).map((entry) => [entry.key, entry.value]));
  const problems: CorruptLocalRecord[] = [];
  const quarantineKey = (key: string, reason: string) => {
    problems.push({ key, reason, raw: data.get(key) ?? null, detectedAt: new Date().toISOString() });
    data.delete(key);
  };
  let ids: string[] = [];
  if (data.has(INDEX)) {
    try {
      const value: unknown = JSON.parse(data.get(INDEX)!);
      if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')
        || new Set(value).size !== value.length) throw new Error('Invalid index');
      ids = value;
    } catch {
      quarantineKey(INDEX, 'Ungültiger Turnierindex; gültige Einzelturniere wurden rekonstruiert.');
    }
  }
  // Missing/damaged indexes may be rebuilt from current-format record keys.
  if (!data.has(INDEX)) ids = [...data.keys()].filter((key) => key.startsWith(RECORD_PREFIX)).map((key) => key.slice(RECORD_PREFIX.length));
  const good: string[] = [];
  for (const id of ids) {
    const key = RECORD_PREFIX + id;
    const raw = data.get(key);
    if (!raw || !validTournament(raw, id)) { quarantineKey(key, 'Fehlender oder beschädigter Turnierdatensatz.'); continue; }
    good.push(id);
  }
  for (const key of [...data.keys()]) {
    if (key.startsWith(RECORD_PREFIX) && !good.includes(key.slice(RECORD_PREFIX.length))) {
      quarantineKey(key, 'Turnierdatensatz ohne gültigen Indexeintrag.');
    }
  }
  // Validate current draw storage without accepting name-string slots.
  // A malformed draw is isolated; other tournaments remain available.
  const knownIds = new Map<string, Set<string>>();
  for (const id of good) {
    try {
      const record = JSON.parse(data.get(RECORD_PREFIX + id)!) as {
        tournament: { participantIds: Record<string, string> };
      };
      knownIds.set(id, new Set(Object.values(record.tournament.participantIds)));
    } catch { /* The tournament validator already handled this record. */ }
  }
  const drawKey = 'online-tournament:mock-draw-config:v1';
  const drawRaw = data.get(drawKey);
  if (drawRaw) {
    try {
      const configs: unknown = JSON.parse(drawRaw);
      const valid = Array.isArray(configs) && configs.every((value) => {
        if (!value || typeof value !== 'object') return false;
        const entry = value as { tournamentId?: unknown; groupAssignments?: unknown; swissOrder?: unknown; bracketSlots?: unknown };
        if (typeof entry.tournamentId !== 'string') return false;
        const ids = knownIds.get(entry.tournamentId);
        if (!ids) return false;
        if (entry.groupAssignments !== undefined && (!entry.groupAssignments
          || typeof entry.groupAssignments !== 'object' || Array.isArray(entry.groupAssignments)
          || !Object.entries(entry.groupAssignments).every(([id, group]) =>
            ids.has(id) && Number.isInteger(group) && (group as number) >= 0))) return false;
        if (entry.swissOrder !== undefined && (!Array.isArray(entry.swissOrder)
          || entry.swissOrder.some((id: unknown) => typeof id !== 'string' || !ids.has(id)))) return false;
        if (entry.bracketSlots !== undefined && (!Array.isArray(entry.bracketSlots)
          || !entry.bracketSlots.every((slot: unknown) => {
            if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return false;
            const typed = slot as { kind?: unknown; participantId?: unknown };
            return typed.kind === 'participant'
              ? typeof typed.participantId === 'string' && ids.has(typed.participantId)
              : ['bye', 'pending', 'unclaimed'].includes(String(typed.kind));
          }))) return false;
        return true;
      });
      if (!valid) quarantineKey(drawKey, 'Auslosungsdatensatz mit ungültigen Teilnehmer-IDs oder KO-Plätzen.');
    } catch { quarantineKey(drawKey, 'Beschädigter Auslosungsdatensatz.'); }
  }
  for (const key of ARRAY_KEYS) {
    const raw = data.get(key);
    if (!raw) continue;
    try {
      if (!Array.isArray(JSON.parse(raw))) quarantineKey(key, 'Beschädigte gemeinsame Turnierdaten.');
    } catch { quarantineKey(key, 'Beschädigte gemeinsame Turnierdaten.'); }
  }
  for (const key of OBJECT_KEYS) {
    const raw = data.get(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        quarantineKey(key, 'Beschädigter turnierbezogener Einstellungsdatensatz.');
      }
    } catch { quarantineKey(key, 'Beschädigter turnierbezogener Einstellungsdatensatz.'); }
  }
  data.set(INDEX, JSON.stringify(good));
  return { valid: [...data].map(([key, value]) => ({ key, value })), corrupt: problems };
}

async function quarantineInvalidEntries(entries: StoredValue[]) {
  const { valid, corrupt } = inspectSnapshot(entries);
  if (corrupt.length || !entries.some((entry) => entry.key === INDEX)) {
    const db = await openDatabase();
    revision = await transaction<number>(db, [VALUES, QUARANTINE, META], 'readwrite', (tx, complete) => {
      const stamp = tx.objectStore(META).get('revision');
      stamp.onsuccess = () => {
        const current = (stamp.result as number | undefined) ?? 0;
        if (current !== revision) { tx.abort(); return; }
        const values = tx.objectStore(VALUES);
        const invalid = tx.objectStore(QUARANTINE);
        const validByKey = new Map(valid.map((entry) => [entry.key, entry.value]));
        for (const entry of entries) if (!validByKey.has(entry.key)) values.delete(entry.key);
        for (const entry of valid) values.put(entry);
        for (const item of corrupt) invalid.put(item);
        tx.objectStore(META).put(current + 1, 'revision');
        complete(current + 1);
      };
    });
    quarantine = [...quarantine.filter((item) => !corrupt.some((other) => other.key === item.key)), ...corrupt];
    window.dispatchEvent(new Event('tournament-storage-integrity-change'));
  }
  return valid;
}

async function refreshCanonical(): Promise<void> {
  const canonical = await readCanonical();
  revision = canonical.version;
  quarantine = canonical.quarantined;
  const valid = await quarantineInvalidEntries(canonical.entries);
  replaceLocalSnapshot(valid);
  window.dispatchEvent(new Event('tournament-canonical-refresh'));
  window.dispatchEvent(new Event('mock-runtime-change'));
  window.dispatchEvent(new Event('mock-draw-change'));
  window.dispatchEvent(new Event('mock-phase-change'));
}

export async function initializeLocalTournamentStorage(): Promise<void> {
  if (ready) return;
  try { await refreshCanonical(); }
  catch {
    // A competing tab may have completed the first schema write concurrently.
    // Reload the authoritative revision once rather than importing stale data.
    await refreshCanonical();
  }
  ready = true;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('online-tournament:canonical-state');
    channel.onmessage = (event: MessageEvent<{ revision?: number }>) => {
      if ((event.data?.revision ?? 0) <= revision) return;
      if (pendingChanges.size > 0 || outstandingCommits > 0) {
        signalError('Ein anderer Tab hat den Turnierstand geändert. Bitte die Seite neu laden, bevor du weitere Änderungen vornimmst.');
        return;
      }
      void refreshCanonical().catch(() =>
        signalError('Der Turnierstand eines anderen Tabs konnte nicht eingelesen werden. Bitte neu laden.'));
    };
  }
}

async function commitChanges(snapshot: Array<{ key: string; value: string | null }>): Promise<void> {
  if (!snapshot.length) return;
  const db = await openDatabase();
  try {
    const nextVersion = await transaction<number>(db, [VALUES, META], 'readwrite', (tx, complete) => {
      const stamp = tx.objectStore(META).get('revision');
      stamp.onsuccess = () => {
        const storedVersion = (stamp.result as number | undefined) ?? 0;
        if (storedVersion !== revision) { tx.abort(); return; }
        const entries = tx.objectStore(VALUES);
        for (const item of snapshot) {
          if (item.value === null) entries.delete(item.key);
          else entries.put({ key: item.key, value: item.value } satisfies StoredValue);
        }
        tx.objectStore(META).put(storedVersion + 1, 'revision');
        complete(storedVersion + 1);
      };
    });
    revision = nextVersion;
    channel?.postMessage({ revision });
  } catch (error) {
    signalError('Die Änderungen konnten nicht sicher gespeichert werden. Bitte die Seite neu laden und den aktuellen Turnierstand prüfen.');
    throw error;
  }
}

export function flushPendingLocalTournamentWrites(): Promise<void> {
  if (!ready || pendingChanges.size === 0) return writeTail;
  // Capture each tab's own mutations. Sampling shared localStorage later could
  // accidentally commit a competing tab's uncommitted value instead.
  const snapshot = [...pendingChanges].map(([key, value]) => ({ key, value }));
  const target = remote;
  const captured = target ? new Map(workingValues) : null;
  pendingChanges.clear();
  outstandingCommits += 1;
  if (target) window.dispatchEvent(new Event('tournament-storage-integrity-change'));
  writeTail = writeTail.then(async () => {
    if (!target || !captured) return commitChanges(snapshot);
    if (currentError) throw new Error(currentError);
    try {
      const ids: unknown = JSON.parse(captured.get(INDEX) ?? '[]');
      if (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== target.id)
        throw new Error('Online-Turniere können hier nicht gelöscht oder ersetzt werden.');
      await target.save(captureFromStorage(target.id, (key) => captured.get(key) ?? null));
      if (!currentError) target.confirmed = captured;
    } catch (error) {
      if (!currentError) workingValues = new Map(target.confirmed);
      pendingChanges.clear();
      signalError('Online-Speicherung nicht bestätigt. Bitte neu laden und den Datenbankstand prüfen. ' +
        (error instanceof Error ? error.message : ''));
      throw error;
    }
  }).finally(() => {
    outstandingCommits -= 1;
    if (target) window.dispatchEvent(new Event('tournament-storage-integrity-change'));
  });
  void writeTail.catch(() => { /* An error banner is displayed; no silent success. */ });
  return writeTail;
}

function scheduleWrite(key: string, value: string | null): void {
  if (!ready || !key.startsWith(PREFIX)) return;
  if (currentError) throw new Error(currentError);
  pendingChanges.set(key, value);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flushPendingLocalTournamentWrites().catch(() => { /* Error banner already shown. */ });
  });
}

/** Existing synchronous consumers use an in-memory working view. The only
 * durable tournament state is committed transactionally to IndexedDB.
 * Before bootstrap, unit-test Storage shims continue to work unchanged. */
export const localTournamentStorage: Storage = {
  get length() { return ready ? workingValues.size : nativeStorage().length; },
  key(index: number) { return ready ? [...workingValues.keys()][index] ?? null : nativeStorage().key(index); },
  getItem(key: string) {
    return ready && key.startsWith(PREFIX) ? workingValues.get(key) ?? null : nativeStorage().getItem(key);
  },
  setItem(key: string, value: string) {
    if (ready && key.startsWith(PREFIX)) {
      if (currentError) throw new Error(currentError);
      workingValues.set(key, String(value));
      scheduleWrite(key, String(value));
    } else nativeStorage().setItem(key, value);
  },
  removeItem(key: string) {
    if (ready && key.startsWith(PREFIX)) {
      if (currentError) throw new Error(currentError);
      workingValues.delete(key);
      scheduleWrite(key, null);
    } else nativeStorage().removeItem(key);
  },
  clear() {
    if (!ready) { nativeStorage().clear(); return; }
    if (currentError) throw new Error(currentError);
    const keys = [...workingValues.keys()];
    workingValues.clear();
    for (const key of keys) scheduleWrite(key, null);
  },
};

export async function discardCorruptLocalRecord(key: string): Promise<void> {
  const db = await openDatabase();
  await transaction<void>(db, [QUARANTINE], 'readwrite', (tx, complete) => {
    tx.objectStore(QUARANTINE).delete(key);
    complete(undefined);
  });
  quarantine = quarantine.filter((item) => item.key !== key);
  window.dispatchEvent(new Event('tournament-storage-integrity-change'));
}


export interface TournamentBackup {
  version: 1;
  tournamentId: string;
  exportedAt: string;
  entries: Record<string, string>;
}

const MATCH_KEYS = new Set<string>([
  'online-tournament:mock-match-results:v2', 'online-tournament:mock-match-runtime:v1',
]);
const COMPOSITE_KEYS = new Set<string>([
  'online-tournament:swiss-cutoff-decisions:v1', 'online-tournament:swiss-round-robin-history:v1',
  'online-tournament:swiss-extra-rounds:v1',
]);
const recordObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function belongsToTournament(key: string, item: unknown, id: string): boolean {
  if (!recordObject(item)) return false;
  return MATCH_KEYS.has(key)
    ? typeof item.matchId === 'string' && item.matchId.startsWith(id + '-phase-')
    : item.tournamentId === id;
}
function belongsMapKey(key: string, entry: string, id: string): boolean {
  return COMPOSITE_KEYS.has(key) ? entry.startsWith(id + ':') : entry === id;
}
function parseArray(raw: string | null): unknown[] {
  const parsed: unknown = JSON.parse(raw ?? '[]');
  if (!Array.isArray(parsed) || !parsed.every(recordObject)) throw new Error('Ungültige Turnierliste.');
  return parsed;
}
function parseMap(raw: string | null): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw ?? '{}');
  if (!recordObject(parsed)) throw new Error('Ungültige Turniereinstellungen.');
  return parsed;
}
function requireHealthyStorage() {
  if (currentError || quarantine.length) throw new Error('Der Turnierspeicher muss vor dem Sichern oder Wiederherstellen geprüft werden.');
}
export function validateTournamentBackup(value: unknown): TournamentBackup {
  if (!recordObject(value) || value.version !== 1 || typeof value.tournamentId !== 'string'
    || !/^local-[a-zA-Z0-9-]{1,140}$/.test(value.tournamentId)
    || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))
    || !recordObject(value.entries)) throw new Error('Unbekanntes oder ungültiges Sicherungsformat.');
  const id = value.tournamentId;
  const entries = value.entries;
  const allowed = [RECORD_PREFIX + id, ...ARRAY_KEYS, ...OBJECT_KEYS];
  if (Object.keys(entries).length !== allowed.length || !allowed.every((k) => typeof entries[k] === 'string')
    || Object.keys(entries).some((k) => !allowed.includes(k))) throw new Error('Unvollständige oder fremde Sicherungsdaten.');
  const verified = entries as Record<string, string>;
  for (const k of ARRAY_KEYS) {
    if (!parseArray(verified[k]).every((item) => belongsToTournament(k, item, id))) throw new Error('Die Sicherung enthält fremde Turnierdaten.');
  }
  for (const k of OBJECT_KEYS) {
    if (!Object.keys(parseMap(verified[k])).every((entry) => belongsMapKey(k, entry, id))) throw new Error('Die Sicherung enthält fremde Turniereinstellungen.');
  }
  const report = inspectSnapshot([{ key: INDEX, value: JSON.stringify([id]) },
    ...Object.entries(verified).map(([key, value]) => ({ key, value }))]);
  if (report.corrupt.length || !validTournament(verified[RECORD_PREFIX + id], id)) throw new Error('Die Sicherung enthält beschädigte Turnierdaten.');
  return { version: 1, tournamentId: id, exportedAt: value.exportedAt, entries: verified };
}
/** Produce the initial scoped state without creating a local record. */
export function initialTournamentBackup(tournament: DemoTournament): TournamentBackup {
  const entries: Record<string, string> = {
    [RECORD_PREFIX + tournament.id]: JSON.stringify({ tournament, sortOrder: Date.now() }),
  };
  for (const key of ARRAY_KEYS) entries[key] = '[]';
  for (const key of OBJECT_KEYS) entries[key] = '{}';
  return validateTournamentBackup({ version: 1, tournamentId: tournament.id, exportedAt: new Date().toISOString(), entries });
}
export function backupTournamentName(backup: TournamentBackup): string {
  return JSON.parse(backup.entries[RECORD_PREFIX + backup.tournamentId]).tournament.name as string;
}
export async function captureTournamentBackup(id: string): Promise<TournamentBackup> {
  await flushPendingLocalTournamentWrites();
  requireHealthyStorage();
  return captureFromStorage(id, (key) => localTournamentStorage.getItem(key));
}
function captureFromStorage(id: string, get: (key: string) => string | null): TournamentBackup {
  const raw = get(RECORD_PREFIX + id);
  if (!raw) throw new Error('Turnier nicht gefunden.');
  const entries: Record<string, string> = { [RECORD_PREFIX + id]: raw };
  for (const k of ARRAY_KEYS) entries[k] = JSON.stringify(parseArray(get(k)).filter((item) => belongsToTournament(k, item, id)));
  for (const k of OBJECT_KEYS) entries[k] = JSON.stringify(Object.fromEntries(Object.entries(parseMap(get(k))).filter(([entry]) => belongsMapKey(k, entry, id))));
  return validateTournamentBackup({ version: 1, tournamentId: id, exportedAt: new Date().toISOString(), entries });
}

/** Isolated, one-event online workspace. No tournament IndexedDB reads/writes. */
export function initializeRemoteTournamentStorage(input: unknown, save: (snapshot: TournamentBackup) => Promise<void>): void {
  if (ready) throw new Error('Der Turnierspeicher wurde bereits initialisiert.');
  const backup = validateTournamentBackup(input);
  workingValues = new Map(Object.entries(backup.entries));
  workingValues.set(INDEX, JSON.stringify([backup.tournamentId]));
  remote = { id: backup.tournamentId, save, confirmed: new Map(workingValues) };
  ready = true;
  window.addEventListener('beforeunload', (event) => {
    if (hasPendingRemoteWrites()) { event.preventDefault(); event.returnValue = ''; }
  });
}
export function prestartRecoveryStorageKey(id: string): string {
  return 'online-tournament:' + (remote ? 'online-prestart-recovery:' : 'prestart-recovery:') + id;
}
export function hasPendingRemoteWrites(): boolean {
  return remote !== null && (pendingChanges.size > 0 || outstandingCommits > 0);
}
export function invalidateRemoteTournamentStorage(): void {
  if (!remote) return;
  workingValues.clear();
  pendingChanges.clear();
  remote.confirmed.clear();
  signalError('Die Anmeldung hat sich geändert. Bitte den Online-Arbeitsbereich schließen und erneut anmelden.');
}
/** Restore only into an empty tournament ID. No existing tournament is overwritten. */
export async function restoreTournamentBackup(input: unknown): Promise<string> {
  const backup = validateTournamentBackup(input);
  await flushPendingLocalTournamentWrites();
  requireHealthyStorage();
  const id = backup.tournamentId;
  const ids: unknown = JSON.parse(localTournamentStorage.getItem(INDEX) ?? '[]');
  if (!Array.isArray(ids) || !ids.every((v) => typeof v === 'string')) throw new Error('Ungültiger Turnierindex.');
  if (ids.includes(id) || localTournamentStorage.getItem(RECORD_PREFIX + id)) throw new Error('Dieses Turnier existiert bereits lokal. Es wird nicht überschrieben.');
  const changes: Record<string, string> = { [RECORD_PREFIX + id]: backup.entries[RECORD_PREFIX + id], [INDEX]: JSON.stringify([id, ...ids]) };
  for (const k of ARRAY_KEYS) changes[k] = JSON.stringify([
    ...parseArray(localTournamentStorage.getItem(k)).filter((item) => !belongsToTournament(k, item, id)), ...parseArray(backup.entries[k]),
  ]);
  for (const k of OBJECT_KEYS) changes[k] = JSON.stringify({
    ...Object.fromEntries(Object.entries(parseMap(localTournamentStorage.getItem(k))).filter(([entry]) => !belongsMapKey(k, entry, id))),
    ...parseMap(backup.entries[k]),
  });
  // Validate the merged state before scheduling any write.
  const merged = new Map<string, string>();
  for (let i = 0; i < localTournamentStorage.length; i++) {
    const key = localTournamentStorage.key(i);
    if (key?.startsWith(PREFIX)) { const value = localTournamentStorage.getItem(key); if (value !== null) merged.set(key, value); }
  }
  for (const [key, value] of Object.entries(changes)) merged.set(key, value);
  if (inspectSnapshot([...merged].map(([key, value]) => ({key, value}))).corrupt.length) throw new Error('Die Wiederherstellung würde ungültige Turnierdaten erzeugen.');
  // The existing IndexedDB commit batches this synchronous operation in one transaction.
  for (const [key, value] of Object.entries(changes)) localTournamentStorage.setItem(key, value);
  await flushPendingLocalTournamentWrites();
  window.dispatchEvent(new Event('mock-runtime-change'));
  window.dispatchEvent(new Event('mock-phase-change'));
  window.dispatchEvent(new Event('mock-draw-change'));
  return id;
}
