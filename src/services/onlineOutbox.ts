import { validateTournamentBackup, type TournamentBackup } from '@/services/localTournamentStorage';

export interface PendingOnlineOperation {
  operationId: string;
  ownerId: string;
  tournamentId: string;
  expectedRevision: number;
  snapshot: TournamentBackup;
  createdAt: string;
}
const DB = 'online-tournament:online-outbox:v1';
const STORE = 'operations';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB,1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE,{keyPath:'operationId'});
      store.createIndex('ownerTournament',['ownerId','tournamentId']);
    };
    req.onerror = () => reject(req.error ?? new Error('Wiederherstellungsspeicher nicht verfügbar.'));
    req.onblocked = () => reject(new Error('Wiederherstellungsspeicher blockiert.'));
    req.onsuccess = () => resolve(req.result);
  });
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve,reject) => {
      const tx = db.transaction(STORE,mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? req.error ?? new Error('Wiederherstellungsspeicher nicht verfügbar.'));
    });
  } finally { db.close(); }
}
export async function persistOnlineOperation(op: PendingOnlineOperation): Promise<void> {
  if (op.expectedRevision!==0) {
    await transact('readwrite',store => store.put(op));
    return;
  }
  // Read and write in the same IndexedDB transaction, so concurrent tabs
  // cannot both reserve an unconfirmed creation for this account.
  const db=await open();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      let conflict=false;
      tx.oncomplete=()=>resolve();
      tx.onabort=tx.onerror=()=>reject(conflict
        ? new Error('Eine frühere Online-Erstellung ist ungeklärt. Bitte zuerst in der Online-Übersicht wiederherstellen.')
        : tx.error ?? new Error('Wiederherstellungsspeicher nicht verfügbar.'));
      const req=store.index('ownerTournament').getAll(IDBKeyRange.bound([op.ownerId],[op.ownerId,[]],false,true));
      req.onsuccess=()=>{
        if((req.result as PendingOnlineOperation[]).some(entry=>entry.expectedRevision===0 && entry.operationId!==op.operationId)){
          conflict=true;tx.abort();return;
        }
        store.put(op);
      };
    });
  } finally {db.close();}
}
export async function removeOnlineOperation(operationId: string): Promise<void> {
  await transact('readwrite',store => store.delete(operationId));
}
export async function listPendingOnlineOperations(ownerId: string,tournamentId?: string): Promise<PendingOnlineOperation[]> {
  const range = tournamentId ? IDBKeyRange.only([ownerId,tournamentId]) : IDBKeyRange.bound([ownerId],[ownerId,[]],false,true);
  const rows = await transact('readonly',store => store.index('ownerTournament').getAll(range));
  return (rows as PendingOnlineOperation[]).map(op => {
    if (op.ownerId !== ownerId || (tournamentId !== undefined && op.tournamentId !== tournamentId) || !Number.isInteger(op.expectedRevision)
      || op.expectedRevision < 0 || !/^[0-9a-f-]{36}$/i.test(op.operationId)
      || validateTournamentBackup(op.snapshot).tournamentId !== op.tournamentId) throw new Error('Ungültige Wiederherstellungsdaten. Bitte nicht überschreiben.');
    return op;
  }).sort((a,b) => a.expectedRevision-b.expectedRevision || a.createdAt.localeCompare(b.createdAt));
}
