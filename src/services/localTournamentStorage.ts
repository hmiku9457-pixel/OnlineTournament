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
let quarantine: CorruptLocalRecord[] = [];
const changedKeys = new Set<string>();
let flushScheduled = false;
let writeTail: Promise<void> = Promise.resolve();
let channel: BroadcastChannel | null = null;

function nativeStorage(): Storage { return window.localStorage; }
function allLocalKeys(): string[] {
  const store = nativeStorage();
  return Array.from({ length: store.length }, (_, i) => store.key(i))
    .filter((key): key is string => Boolean(key && key.startsWith(PREFIX)));
}
function replaceLocalSnapshot(entries: StoredValue[]): void {
  const store = nativeStorage();
  for (const key of allLocalKeys()) store.removeItem(key);
  for (const entry of entries) store.setItem(entry.key, entry.value);
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
      && Array.isArray(t.stages) && t.stages.every((stage: unknown) =>
        Boolean(stage && typeof stage === 'object' && typeof (stage as { id?: unknown }).id === 'string'));
  } catch { return false; }
}
function inspectSnapshot(entries: StoredValue[]): { valid: StoredValue[]; corrupt: CorruptLocalRecord[] } {
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
  for (const key of ARRAY_KEYS) {
    const raw = data.get(key);
    if (!raw) continue;
    try {
      if (!Array.isArray(JSON.parse(raw))) quarantineKey(key, 'Beschädigte gemeinsame Turnierdaten.');
    } catch { quarantineKey(key, 'Beschädigte gemeinsame Turnierdaten.'); }
  }
  data.set(INDEX, JSON.stringify(good));
  return { valid: [...data].map(([key, value]) => ({ key, value })), corrupt: problems };
}

async function quarantineInvalidEntries(entries: StoredValue[]) {
  const { valid, corrupt } = inspectSnapshot(entries);
  if (corrupt.length || !entries.some((entry) => entry.key === INDEX)) {
    const db = await openDatabase();
    revision = await transaction<number>(db, [VALUES, QUARANTINE, META], 'readwrite', (tx, complete) => {
      const values = tx.objectStore(VALUES);
      const invalid = tx.objectStore(QUARANTINE);
      const validByKey = new Map(valid.map((entry) => [entry.key, entry.value]));
      for (const entry of entries) if (!validByKey.has(entry.key)) values.delete(entry.key);
      for (const entry of valid) values.put(entry);
      for (const item of corrupt) invalid.put(item);
      tx.objectStore(META).put(revision + 1, 'revision');
      complete(revision + 1);
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
  window.dispatchEvent(new Event('mock-runtime-change'));
  window.dispatchEvent(new Event('mock-draw-change'));
  window.dispatchEvent(new Event('mock-phase-change'));
}

export async function initializeLocalTournamentStorage(): Promise<void> {
  if (ready) return;
  await refreshCanonical();
  ready = true;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('online-tournament:canonical-state');
    channel.onmessage = (event: MessageEvent<{ revision?: number }>) => {
      if ((event.data?.revision ?? 0) <= revision) return;
      if (changedKeys.size > 0) {
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
  if (!ready || changedKeys.size === 0) return writeTail;
  const snapshot = [...changedKeys].map((key) => ({ key, value: nativeStorage().getItem(key) }));
  changedKeys.clear();
  writeTail = writeTail.then(() => commitChanges(snapshot));
  void writeTail.catch(() => { /* An error banner is displayed; no silent success. */ });
  return writeTail;
}

function scheduleWrite(key: string): void {
  if (!ready || !key.startsWith(PREFIX)) return;
  if (currentError) throw new Error(currentError);
  changedKeys.add(key);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flushPendingLocalTournamentWrites().catch(() => { /* Error banner already shown. */ });
  });
}

/** Existing synchronous consumers continue to use the native storage cache.
 * Browser storage is never the durability boundary after bootstrap. */
export const localTournamentStorage: Storage = {
  get length() { return nativeStorage().length; },
  key(index: number) { return nativeStorage().key(index); },
  getItem(key: string) { return nativeStorage().getItem(key); },
  setItem(key: string, value: string) {
    if (ready && currentError && key.startsWith(PREFIX)) throw new Error(currentError);
    nativeStorage().setItem(key, value);
    scheduleWrite(key);
  },
  removeItem(key: string) {
    if (ready && currentError && key.startsWith(PREFIX)) throw new Error(currentError);
    nativeStorage().removeItem(key);
    scheduleWrite(key);
  },
  clear() {
    const keys = allLocalKeys();
    nativeStorage().clear();
    for (const key of keys) scheduleWrite(key);
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
