import { validDraft, type CreationDraft, type SavedCreationDraft } from '@/domain/creationDraft';

/** Each saved draft exists only in the current IndexedDB schema.
 * Development-era localStorage draft lists are intentionally not imported. */
const DATABASE = 'online-tournament:named-creation-drafts:v2';
const STORE = 'drafts';
const INVALID = 'damaged-drafts';

export interface IsolatedCreationDraft {
  id: string;
  original: unknown;
  detectedAt: string;
  reason: string;
}
function isSavedDraft(value: unknown): value is SavedCreationDraft {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SavedCreationDraft>;
  return typeof record.id === 'string' && record.id.length > 0
    && typeof record.savedAt === 'string' && !Number.isNaN(Date.parse(record.savedAt))
    && Number.isSafeInteger(record.revision) && (record.revision ?? 0) >= 1
    && validDraft(record.draft);
}

/** Remove only current malformed entries after re-reading them in a write
 * transaction, so a simultaneous repair is never overwritten. */
async function isolateInvalidDrafts(items: unknown[]): Promise<void> {
  if (!items.length) return;
  await withDatabase((db) => runTransaction<void>(db, 'readwrite', [STORE, INVALID], (tx, done) => {
    const store = tx.objectStore(STORE);
    const invalid = tx.objectStore(INVALID);
    for (const item of items) {
      const id = (item as { id?: unknown })?.id;
      if (typeof id !== 'string') continue;
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result && !isSavedDraft(request.result)) {
          invalid.put({ id, original: request.result, detectedAt: new Date().toISOString(),
            reason: 'Aktueller Entwurf enthält beschädigte oder unvollständige Angaben.' } satisfies IsolatedCreationDraft);
          store.delete(id);
        }
      };
    }
    done(undefined);
  }));
  window.dispatchEvent(new Event('draft-integrity-change'));
}

export async function listIsolatedCreationDraftsAtomic(): Promise<IsolatedCreationDraft[]> {
  return withDatabase((db) => runTransaction<IsolatedCreationDraft[]>(db, 'readonly', [INVALID], (tx, done) => {
    const request = tx.objectStore(INVALID).getAll();
    request.onsuccess = () => done(request.result as IsolatedCreationDraft[]);
  }));
}
export async function discardIsolatedCreationDraftAtomic(id: string): Promise<void> {
  await withDatabase((db) => runTransaction<void>(db, 'readwrite', [INVALID], (tx, done) => {
    tx.objectStore(INVALID).delete(id);
    done(undefined);
  }));
  window.dispatchEvent(new Event('draft-integrity-change'));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.')); return; }
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(INVALID)) database.createObjectStore(INVALID, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error ?? new Error('Die Entwurfsdatenbank konnte nicht geöffnet werden.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(
  database: IDBDatabase, mode: IDBTransactionMode,
  stores: string[], perform: (transaction: IDBTransaction, done: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? new Error('Der Entwurf konnte nicht gespeichert werden.'));
    tx.onabort = () => reject(tx.error ?? new DOMException('Die Entwurfsänderung wurde abgebrochen.', 'AbortError'));
    try {
      perform(tx, (result) => { value = result; });
    } catch (error) {
      try { tx.abort(); } catch { /* already completed */ }
      reject(error);
    }
  });
}

async function withDatabase<T>(action: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try { return await action(db); }
  finally { db.close(); }
}

function emitDraftChange(): void {
  window.dispatchEvent(new Event('creation-drafts-change'));
}

export async function listSavedCreationDraftsAtomic(): Promise<SavedCreationDraft[]> {
  return withDatabase(async (db) => {
    const drafts = await runTransaction<SavedCreationDraft[]>(db, 'readonly', [STORE], (tx, done) => {
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => done(request.result as SavedCreationDraft[]);
    });
    const valid = drafts.filter((draft) => isSavedDraft(draft));
    await isolateInvalidDrafts(drafts.filter((draft) => !isSavedDraft(draft)));
    return valid.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  });
}

export async function getSavedCreationDraftAtomic(id: string): Promise<SavedCreationDraft | null> {
  const entry = await withDatabase((db) => runTransaction<unknown>(db, 'readonly', [STORE], (tx, done) => {
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => done(request.result ?? null);
  }));
  if (entry === null) return null;
  if (isSavedDraft(entry)) return entry;
  await isolateInvalidDrafts([entry]);
  return null;
}

function freshId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Atomic compare-and-swap: the revision check and put execute inside ONE
 * IndexedDB readwrite transaction, serialized across all browser tabs. */
export async function saveNamedCreationDraftAtomic(
  draft: CreationDraft, existingId?: string | null, expectedRevision?: number,
): Promise<SavedCreationDraft> {
  // Reuse the existing, strictly validated draft serializer without writing a
  // localStorage entry. Invalid drafts are rejected before a transaction opens.
  if (!validDraft(draft)) throw new Error('Der Entwurf enthält ungültige Angaben.');
  const normalized = JSON.parse(JSON.stringify(draft)) as CreationDraft;
  const candidate = await withDatabase((db) => runTransaction<SavedCreationDraft>(db, 'readwrite', [STORE], (tx, done) => {
    const store = tx.objectStore(STORE);
    const request = existingId ? store.get(existingId) : null;
    const apply = (previous: SavedCreationDraft | null) => {
      if (existingId && (!previous || expectedRevision === undefined
        || previous.revision !== expectedRevision)) {
        tx.abort();
        return;
      }
      const entry: SavedCreationDraft = {
        id: previous?.id ?? freshId(), savedAt: new Date().toISOString(),
        revision: previous ? previous.revision + 1 : 1, draft: normalized,
      };
      store.put(entry);
      done(entry);
    };
    if (request) request.onsuccess = () => apply((request.result as SavedCreationDraft | undefined) ?? null);
    else apply(null);
  })).catch((error) => {
    if (existingId && error instanceof DOMException && error.name === 'AbortError') throw new Error('DRAFT_CONFLICT');
    throw error;
  });
  emitDraftChange();
  return candidate;
}

/** Deletion checks the revision too, so a stale tab cannot discard newer work. */
export async function removeSavedCreationDraftAtomic(id: string, expectedRevision?: number): Promise<void> {
  await withDatabase((db) => runTransaction<void>(db, 'readwrite', [STORE], (tx, done) => {
    const store = tx.objectStore(STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const existing = request.result as SavedCreationDraft | undefined;
      if (existing && expectedRevision !== undefined && existing.revision !== expectedRevision) {
        tx.abort();
        return;
      }
      store.delete(id);
      done(undefined);
    };
  })).catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('DRAFT_CONFLICT');
    throw error;
  });
  emitDraftChange();
}

