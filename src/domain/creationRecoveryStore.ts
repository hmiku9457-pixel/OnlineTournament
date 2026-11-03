import { validDraft, type CreationDraft } from '@/domain/creationDraft';

const DATABASE = 'online-tournament:creation-recovery:v1';
const STORE = 'recovery';
const TAB_KEY = 'online-tournament:creation-tab-id';

function freshId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Store only a tiny tab identifier in sessionStorage, never the roster JSON.
 * A named draft and the unfinished new tournament have independent snapshots. */
export function creationRecoveryKey(draftId?: string | null): string {
  let tab = '';
  try {
    tab = window.sessionStorage.getItem(TAB_KEY) ?? '';
    if (!tab) {
      tab = freshId();
      window.sessionStorage.setItem(TAB_KEY, tab);
    }
  } catch { tab = 'session-unavailable'; }
  return `${tab}:${draftId ?? 'new'}`;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB ist für die automatische Wiederherstellung nicht verfügbar.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error ?? new Error('Entwurfswiederherstellung konnte nicht geöffnet werden.'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode, perform: (store: IDBObjectStore, finish: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result!: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error('Wiederherstellung konnte nicht gespeichert werden.'));
      tx.onabort = () => reject(tx.error ?? new Error('Wiederherstellung wurde abgebrochen.'));
      try { perform(tx.objectStore(STORE), (value) => { result = value; }); }
      catch (error) { try { tx.abort(); } catch { /* aborted */ } reject(error); }
    });
  } finally { db.close(); }
}

const pending = new Map<string, Promise<unknown>>();
function serialize<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  pending.set(key, next);
  void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => undefined);
  return next;
}

export function readCreationRecoveryAtomic(id: string): Promise<CreationDraft | null> {
  return serialize(id, () => transaction('readonly', (store, finish) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const draft = (request.result as { draft?: unknown } | undefined)?.draft;
      finish(validDraft(draft) ? draft : null);
    };
  }));
}

export function saveCreationRecoveryAtomic(id: string, draft: CreationDraft): Promise<void> {
  if (!validDraft(draft)) return Promise.reject(new Error('Ungültige automatische Wiederherstellung.'));
  // IndexedDB structured cloning avoids expensive JSON stringification.
  return serialize(id, () => transaction<void>('readwrite', (store, finish) => {
    store.put({ id, draft });
    finish(undefined);
  }));
}

export function clearCreationRecoveryAtomic(id: string): Promise<void> {
  // The delete runs after any queued writes, so a late keystroke cannot
  // recreate a deliberately discarded recovery snapshot.
  return serialize(id, () => transaction<void>('readwrite', (store, finish) => {
    store.delete(id);
    finish(undefined);
  }));
}
