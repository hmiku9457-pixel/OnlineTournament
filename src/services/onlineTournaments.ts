import { persistOnlineOperation, removeOnlineOperation, listPendingOnlineOperations, type PendingOnlineOperation } from '@/services/onlineOutbox';
import { supabase } from '@/lib/supabase';
import { backupTournamentName, captureTournamentBackup, validateTournamentBackup,
  initializeRemoteTournamentStorage, invalidateRemoteTournamentStorage, initialTournamentBackup, RemoteWriteUnavailableError, type TournamentBackup } from '@/services/localTournamentStorage';

import { buildNewTournament, type CreateMockTournamentInput } from '@/services/mockTournamentStore';
import type { DemoTournament } from '@/data/demoTournaments';

export interface OnlineTournamentSummary { id: string; name: string; revision: number; updated_at: string }
interface OnlineTournament extends OnlineTournamentSummary { payload: TournamentBackup }
async function account() {
  if (!supabase) throw new Error('Supabase ist nicht eingerichtet.');
  const { data, error } = await supabase.auth.getUser();
  if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status ?? 0) >= 500)) throw new RemoteWriteUnavailableError('Verbindung zur Anmeldung unterbrochen.');
  if (error || !data.user || data.user.is_anonymous) throw new Error('Bitte zuerst anmelden.');
  return { client: supabase, userId: data.user.id };
}
export async function listOnlineTournaments(): Promise<OnlineTournamentSummary[]> {
  const { client } = await account();
  const { data, error } = await client.rpc('list_online_tournaments');
  if (error) throw new Error('Online-Turniere konnten nicht geladen werden: ' + error.message);
  return (data ?? []) as OnlineTournamentSummary[];
}
async function load(id: string): Promise<OnlineTournament> {
  const { client } = await account();
  const { data, error } = await client.rpc('load_online_tournament', { p_id: id });
  if (error || !data || data.id !== id || !Number.isInteger(data.revision) || data.revision < 1) throw new Error('Online-Turnier nicht verfügbar.');
  const payload = validateTournamentBackup(data.payload);
  if (payload.tournamentId !== id) throw new Error('Falsche Turnierkennung.');
  return { ...data, payload } as OnlineTournament;
}
async function commit(backup: TournamentBackup, expected: number, ownerId: string, operationId: string = crypto.randomUUID()): Promise<number> {
  const args = { p_id: backup.tournamentId, p_name: backupTournamentName(backup),
    p_expected_revision: expected, p_operation_id: operationId, p_payload: backup };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { client, userId } = await account();
    if (userId !== ownerId) throw new Error('Die Anmeldung hat sich geändert.');
    const { data, error, status } = await client.rpc('commit_online_tournament', args).abortSignal(AbortSignal.timeout(12000));
    if (!error) {
      if (data !== expected + 1) throw new Error('Unerwartete Datenbankrevision.');
      return data as number;
    }
    if (error.code === '40001') throw new Error('Ein anderer Arbeitsbereich hat das Turnier geändert.');
    if (status === 0 || status >= 500 || !error.code) {
      if (attempt === 0) continue;
      throw new RemoteWriteUnavailableError('Keine eindeutige Speicherbestätigung erhalten.');
    }
    throw new Error(error.message || 'Verbindungsfehler.');
  }
  throw new Error('Speicherung nicht bestätigt.');
}
export interface OnlineCreationAttempt {
  tournament: DemoTournament;
  backup: TournamentBackup;
  operationId: string;
  inputFingerprint: string;
  ownerId: string;
}
/** An ambiguous creation can be retried with the original identity and exact payload. */
export async function prepareOnlineCreation(input: CreateMockTournamentInput): Promise<OnlineCreationAttempt> {
  const { userId } = await account();
  if (input.overwriteTournamentId) throw new Error('Online-Turniere werden nicht automatisch überschrieben.');
  if ((await listPendingOnlineOperations(userId)).some(op => op.expectedRevision === 0)) throw new Error('Eine frühere Online-Erstellung ist ungeklärt. Bitte zuerst in der Online-Übersicht wiederherstellen.');
  const tournament = buildNewTournament(input);
  return { tournament, backup: initialTournamentBackup(tournament), operationId: crypto.randomUUID(),
    inputFingerprint: JSON.stringify(input), ownerId: userId };
}
export async function commitOnlineCreation(attempt: OnlineCreationAttempt): Promise<DemoTournament> {
  await commitCreationJournal({ snapshot: attempt.backup, ownerId: attempt.ownerId, tournamentId: attempt.tournament.id,
    expectedRevision: 0, operationId: attempt.operationId, createdAt: new Date().toISOString() });
  return attempt.tournament;
}
async function commitCreationJournal(op: PendingOnlineOperation): Promise<void> {
  const { userId } = await account();
  if (op.ownerId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  const pending = await listPendingOnlineOperations(userId);
  if (pending.some(entry => entry.expectedRevision === 0 && entry.operationId !== op.operationId))
    throw new Error('Eine frühere Online-Erstellung ist ungeklärt. Bitte zuerst in der Online-Übersicht wiederherstellen.');
  await persistOnlineOperation(op);
  await commit(op.snapshot,0,userId,op.operationId);
  await removeOnlineOperation(op.operationId);
}
export async function listPendingOnlineCreations(): Promise<PendingOnlineOperation[]> {
  const { userId } = await account();
  return (await listPendingOnlineOperations(userId)).filter(op=>op.expectedRevision===0);
}
export async function createOnlineTournamentFromLocal(id: string): Promise<void> {
  const { userId } = await account();
  const backup = await captureTournamentBackup(id);
  const record = JSON.parse(backup.entries['online-tournament:local-prototype-tournaments:v1:record:' + id]);
  if (record.tournament.hasStarted || !['DRAFT','REGISTRATION','READY'].includes(record.tournament.status))
    throw new Error('Nur noch nicht gestartete Turniere können als Online-Testturnier übernommen werden.');
  await commitCreationJournal({snapshot:backup, ownerId:userId,tournamentId:id,expectedRevision:0,operationId:crypto.randomUUID(),createdAt:new Date().toISOString()});
}
export function onlineWorkspaceUrl(id: string): string {
  const url = new URL(window.location.href);
  url.search = ''; url.searchParams.set('online', id); url.hash = '/tournaments/' + id + '/control';
  return url.href;
}
export function localOverviewUrl(): string {
  const url = new URL(window.location.href);
  url.search = ''; url.hash = '/online';
  return url.href;
}
export interface OnlineCheckpoint { revision: number; name: string; created_at: string }
export async function listOnlineCheckpoints(id: string): Promise<OnlineCheckpoint[]> {
  const { client } = await account();
  const { data,error } = await client.rpc('list_online_checkpoints',{p_id:id});
  if(error) throw new Error(error.message);
  return (data ?? []) as OnlineCheckpoint[];
}
export async function loadOnlineCheckpoint(id: string, revision: number): Promise<TournamentBackup> {
  const { client } = await account();
  const { data,error } = await client.rpc('load_online_checkpoint',{p_id:id,p_revision:revision});
  if(error) throw new Error(error.message);
  const backup = validateTournamentBackup(data);
  if(backup.tournamentId !== id) throw new Error('Falsche Turnierkennung.');
  return backup;
}
export async function resolvePendingOnlineOperation(op: PendingOnlineOperation, discard = false): Promise<void> {
  const { userId } = await account();
  if (op.ownerId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  if (!discard) await commit(op.snapshot,op.expectedRevision,userId,op.operationId);
  await removeOnlineOperation(op.operationId);
}
export async function initializeOnlineWorkspace(id: string): Promise<PendingOnlineOperation[]> {
  const { client, userId } = await account();
  const unresolved = await listPendingOnlineOperations(userId,id);
  if ((await account()).userId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  if (unresolved.length) return unresolved;
  const loaded = await load(id);
  let revision = loaded.revision;
  if ((await account()).userId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  let pending: PendingOnlineOperation | undefined;
  initializeRemoteTournamentStorage(loaded.payload, async (snapshot) => {
    if (pending && pending.snapshot !== snapshot) throw new Error('Eine frühere Speicheranfrage ist noch ungeklärt.');
    pending ??= { snapshot, operationId: crypto.randomUUID(), ownerId: userId, tournamentId: id,
      expectedRevision: revision, createdAt: new Date().toISOString() };
    // Durable journal must be committed BEFORE the network request.
    await persistOnlineOperation(pending);
    const confirmedRevision = await commit(snapshot, pending.expectedRevision, userId, pending.operationId);
    try { await removeOnlineOperation(pending.operationId); }
    catch { throw new RemoteWriteUnavailableError('Datenbankstand bestätigt, aber Wiederherstellungseintrag konnte nicht entfernt werden.'); }
    revision = confirmedRevision;
    pending = undefined;
  });
  client.auth.onAuthStateChange((_event, session) => {
    if (!session || session.user.id !== userId) invalidateRemoteTournamentStorage();
  });
  return [];
}
