import type { MatchSet } from '@/domain/types';
import { validateCompleteResult } from '@/domain/sportScoring';
import { decodeMatchSlot } from '@/domain/matchSlots';
import { buildMockBracket, buildMockGroups, buildRoundRobinStandings, buildSwissStandings, type MockStanding } from '@/services/mockCompetitionViews';
import { getMockConfirmedFinalStandings } from '@/services/mockParticipantProgress';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { getMockStageMatches, getSwissRoundRobinMatches, getSwissCutoffSetMatches, getMockRuntimeMatches, canEditMockMatch, completeMockMatch } from '@/services/mockRuntime';
import { isStageStarted } from '@/services/mockPhaseLifecycle';
import { persistOnlineOperation, removeOnlineOperation, listPendingOnlineOperations, type PendingOnlineOperation } from '@/services/onlineOutbox';
import { supabase } from '@/lib/supabase';
import { backupTournamentName, captureTournamentBackup, validateTournamentBackup,
  initializeRemoteTournamentStorage, runRemoteTournamentBatch, invalidateRemoteTournamentStorage, initialTournamentBackup, hasPendingRemoteWrites, getTournamentStorageError, markRemoteWorkspaceStale, RemoteWriteUnavailableError, type TournamentBackup } from '@/services/localTournamentStorage';

import { buildNewTournament, type CreateMockTournamentInput } from '@/services/mockTournamentStore';
import type { DemoTournament } from '@/data/demoTournaments';

export interface OnlineTournamentSummary { id: string; name: string; revision: number; updated_at: string }
export interface OnlineCatalogItem extends OnlineTournamentSummary { status: string; archived_at: string | null; editing: boolean }
export async function listOnlineCatalog(): Promise<OnlineCatalogItem[]> {
  const {client,userId}=await account();
  const {data,error}=await client.rpc('catalog_online_tournaments');
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if(error) throw new Error(error.message);
  return (data ?? []) as OnlineCatalogItem[];
}
export async function setOnlineArchive(item: OnlineCatalogItem, archived: boolean): Promise<void> {
  const {client,userId}=await account();
  if((await listPendingOnlineOperations(userId,item.id)).length) throw new Error('Bitte zuerst die unbestätigte Speicherung klären.');
  const {data,error}=await client.rpc('set_online_tournament_archive',{p_id:item.id,p_revision:item.revision,p_archived:archived});
  if(error?.code==='40001') throw new Error('Turnierstand geändert. Bitte Übersicht aktualisieren.');
  if(error?.code==='55P03') throw new Error('Bitte zuerst die Bearbeitungssperre freigeben.');
  if(error || data!==true) throw new Error(error?.message ?? 'Archivierung nicht bestätigt.');
}
export async function loadConfirmedOnlineBackup(id: string): Promise<{ backup: TournamentBackup; revision: number }> {
  const result=await load(id);
  return {backup:result.payload,revision:result.revision};
}
interface OnlineTournament extends OnlineTournamentSummary { payload: TournamentBackup }
async function account() {
  if (!supabase) throw new Error('Supabase ist nicht eingerichtet.');
  const { data, error } = await supabase.auth.getUser();
  if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status ?? 0) >= 500)) throw new RemoteWriteUnavailableError('Verbindung zur Anmeldung unterbrochen.');
  if (error || !data.user || data.user.is_anonymous) throw new Error('Bitte zuerst anmelden.');
  return { client: supabase, userId: data.user.id };
}
export async function listOnlineTournaments(): Promise<OnlineTournamentSummary[]> {
  const {client,userId}=await account();
  const { data, error } = await client.rpc('list_online_tournaments');
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if (error) throw new Error('Online-Turniere konnten nicht geladen werden: ' + error.message);
  return (data ?? []) as OnlineTournamentSummary[];
}
async function load(id: string): Promise<OnlineTournament> {
  const {client,userId}=await account();
  const { data, error } = await client.rpc('load_online_tournament', { p_id: id });
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if (error || !data || data.id !== id || !Number.isInteger(data.revision) || data.revision < 1) throw new Error('Online-Turnier nicht verfügbar.');
  const payload = validateTournamentBackup(data.payload);
  if (payload.tournamentId !== id) throw new Error('Falsche Turnierkennung.');
  return { ...data, payload } as OnlineTournament;
}
async function commit(backup: TournamentBackup, expected: number, ownerId: string, operationId: string = crypto.randomUUID(), token?: string): Promise<number> {
  const args = { p_id: backup.tournamentId, p_name: backupTournamentName(backup),
    p_expected_revision: expected, p_operation_id: operationId, p_payload: backup };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { client, userId } = await account();
    if (userId !== ownerId) throw new Error('Die Anmeldung hat sich geändert.');
    const request = expected===0 ? client.rpc('commit_online_tournament', args) : client.rpc('commit_leased_online_tournament', {...args,p_token:token});
    const { data, error, status } = await request.abortSignal(AbortSignal.timeout(12000));
    if (!error) {
      if (data !== expected + 1) throw new Error('Unerwartete Datenbankrevision.');
      return data as number;
    }
    if (error.code === '55P03') throw new Error('Bearbeitungssperre abgelaufen oder von einem anderen Arbeitsbereich belegt.');
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
  const {client,userId}=await account();
  const { data,error } = await client.rpc('list_online_checkpoints',{p_id:id});
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if(error) throw new Error(error.message);
  return (data ?? []) as OnlineCheckpoint[];
}
export async function loadOnlineCheckpoint(id: string, revision: number): Promise<TournamentBackup> {
  const {client,userId}=await account();
  const { data,error } = await client.rpc('load_online_checkpoint',{p_id:id,p_revision:revision});
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if(error) throw new Error(error.message);
  const backup = validateTournamentBackup(data);
  if(backup.tournamentId !== id) throw new Error('Falsche Turnierkennung.');
  return backup;
}
export class WorkspaceBusyError extends Error {}
async function claimWorkspace(id: string, token: string, renew: boolean): Promise<boolean> {
  if (!supabase) throw new Error('Supabase ist nicht eingerichtet.');
  const {data,error}=await supabase.rpc('claim_online_workspace',{p_id:id,p_token:token,p_renew:renew}).abortSignal(AbortSignal.timeout(8000));
  if(error) throw new Error(error.message);
  return data===true;
}
async function releaseWorkspace(id:string,token:string): Promise<void> {
  if(!supabase) return;
  const {error}=await supabase.rpc('release_online_workspace',{p_id:id,p_token:token}).abortSignal(AbortSignal.timeout(8000));
  if(error) throw new Error(error.message);
}
export async function releaseCurrentOnlineWorkspace(): Promise<void> {
  const workspace=workspaceRevision;
  if(!workspace || hasPendingRemoteWrites()) throw new Error('Eine Speicherung läuft noch.');
  markRemoteWorkspaceStale();
  workspaceRevision=undefined;
  await releaseWorkspace(workspace.id,workspace.token);
}
export async function resolvePendingOnlineOperation(op: PendingOnlineOperation, discard = false): Promise<void> {
  const { userId } = await account();
  if (op.ownerId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  if(op.expectedRevision===0){
    if(!discard)await commit(op.snapshot,0,userId,op.operationId);
    await removeOnlineOperation(op.operationId);
    return;
  }
  // Even discarding a local journal entry is forbidden while another editor
  // holds the lease: its still-running request may need this recovery record.
  // Archived events cannot acquire leases; a confirmed archived catalog row
  // is sufficient for explicitly discarding only the local recovery copy.
  if(discard){
    const catalog=await listOnlineCatalog();
    const row=catalog.find(item=>item.id===op.tournamentId);
    if(row?.archived_at&&!row.editing){await removeOnlineOperation(op.operationId);return;}
  }
  const token=crypto.randomUUID();
  if(!await claimWorkspace(op.tournamentId,token,false))throw new WorkspaceBusyError('Ein anderer Arbeitsbereich besitzt noch die Bearbeitungssperre. Bitte zuerst freigeben oder Ablauf abwarten.');
  try {
    if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
    if(!discard)await commit(op.snapshot,op.expectedRevision,userId,op.operationId,token);
    await removeOnlineOperation(op.operationId);
  } finally {await releaseWorkspace(op.tournamentId,token).catch(()=>{});}
}
let workspaceRevision: {id: string; revision: number; ownerId: string; token: string} | undefined;
/** Only metadata is loaded. Never replace the director state automatically. */
export async function checkOnlineWorkspaceRevision(id: string): Promise<'current' | 'stale' | 'unknown'> {
  const start = workspaceRevision;
  if (!start || start.id !== id || hasPendingRemoteWrites() || getTournamentStorageError() || !supabase) return 'unknown';
  const renewed=await claimWorkspace(id,start.token,true);
  if(workspaceRevision!==start || hasPendingRemoteWrites() || getTournamentStorageError()) return 'unknown';
  if(!renewed) return markRemoteWorkspaceStale() ? 'stale' : 'unknown';
  const { data, error } = await supabase.rpc('list_online_tournaments').abortSignal(AbortSignal.timeout(8000));
  if (error || workspaceRevision !== start || hasPendingRemoteWrites() || getTournamentStorageError()) return 'unknown';
  const row = (data as OnlineTournamentSummary[] | null)?.find(t => t.id === id);
  if (row?.revision === start.revision) { void publishSpectatorDetails(start).catch(()=>{}); return 'current'; }
  return markRemoteWorkspaceStale() ? 'stale' : 'unknown';
}
export async function initializeOnlineWorkspace(id: string): Promise<PendingOnlineOperation[]> {
  const { client, userId } = await account();
  const unresolved = await listPendingOnlineOperations(userId,id);
  if ((await account()).userId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  if (unresolved.length) return unresolved;
  const token=crypto.randomUUID();
  if(!await claimWorkspace(id,token,false)) throw new WorkspaceBusyError('Dieses Turnier wird bereits in einem anderen Arbeitsbereich bearbeitet.');
  let loaded: OnlineTournament;
  try {
    loaded=await load(id);
    if ((await account()).userId !== userId) throw new Error('Die Anmeldung hat sich geändert.');
  } catch(error) {await releaseWorkspace(id,token).catch(()=>{});throw error;}
  let revision = loaded.revision;
  workspaceRevision = {id,revision,ownerId:userId,token};
  let pending: PendingOnlineOperation | undefined;
  initializeRemoteTournamentStorage(loaded.payload, async (snapshot) => {
    if (pending && pending.snapshot !== snapshot) throw new Error('Eine frühere Speicheranfrage ist noch ungeklärt.');
    pending ??= { snapshot, operationId: crypto.randomUUID(), ownerId: userId, tournamentId: id,
      expectedRevision: revision, createdAt: new Date().toISOString() };
    // Durable journal must be committed BEFORE the network request.
    await persistOnlineOperation(pending);
    const confirmedRevision = await commit(snapshot, pending.expectedRevision, userId, pending.operationId,token);
    try { await removeOnlineOperation(pending.operationId); }
    catch { throw new RemoteWriteUnavailableError('Datenbankstand bestätigt, aber Wiederherstellungseintrag konnte nicht entfernt werden.'); }
    revision = confirmedRevision;
    if (workspaceRevision?.ownerId === userId) workspaceRevision = {id,revision,ownerId:userId,token};
    pending = undefined;
  });
  client.auth.onAuthStateChange((_event, session) => {
    if (!session || session.user.id !== userId) { workspaceRevision = undefined; invalidateRemoteTournamentStorage(); }
  });
  void publishSpectatorDetails(workspaceRevision).catch(()=>{});
  return [];
}

export async function manageOnlineSpectator(id:string, action:'read'|'enable'|'disable'|'rotate'):Promise<string|null> {
  const {client,userId}=await account();
  const {data,error}=await client.rpc('manage_online_spectator',{p_id:id,p_action:action});
  if(error)throw new Error(error.message);
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if(data!==null && typeof data!=='string')throw new Error('Ungültige Zuschauerfreigabe.');
  return data as string|null;
}
export function onlineSpectatorUrl(token:string):string {
  const url=new URL(window.location.href);
  url.search='';url.hash='/watch/'+token;
  return url.href;
}

export async function spectatorDetailSetting(id:string, enabled:boolean|null=null):Promise<boolean> {
  const {client,userId}=await account();
  const {data,error}=await client.rpc('online_spectator_detail_setting',{p_id:id,p_enabled:enabled});
  if(error)throw new Error(error.message);
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  return data===true;
}
// Only calculate from a quiescent confirmed director state. The database
// compares the exact revision and current lease again before publishing.
let publishing=false;
let queuedProjection:NonNullable<typeof workspaceRevision>|undefined;
export function refreshConfirmedOnlineProjection():void {
  if(workspaceRevision&&!hasPendingRemoteWrites()&&!getTournamentStorageError())void publishSpectatorDetails(workspaceRevision).catch(()=>{});
}
async function publishSpectatorDetails(start:NonNullable<typeof workspaceRevision>):Promise<void> {
  if(!supabase||workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
  if(publishing){queuedProjection=start;return;}
  publishing=true;
  try {
    const {data:plan,error:planError}=await supabase.rpc('online_projection_plan',{p_id:start.id,p_revision:start.revision}).abortSignal(AbortSignal.timeout(8000));
    if(planError)throw new Error(planError.message);
    if(!plan||!['player','matches','rankings','brackets'].some(key=>plan[key]===true))return;
    if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
    const tournament=getAllMockTournaments().find(t=>t.id===start.id);
    if(!tournament)return;
    const roster=new Set(tournament.participantNames);
    if(plan.player||plan.matches) {
    const rows=tournament.stages.filter(s=>isStageStarted(tournament,s)).flatMap(s=>[
      ...getMockStageMatches(tournament,s),
      ...(s.type==='SWISS'?[...getSwissRoundRobinMatches(tournament,s),...getSwissCutoffSetMatches(tournament,s)]:[])
    ]).filter(m=>roster.has(m.sideA)&&roster.has(m.sideB)&&m.sideA!==m.sideB);
    const rank=(status:string)=>['LIVE','READY','CONFIRMATION'].includes(status)?0:status==='FINISHED'?1:2;
    rows.sort((a,b)=>rank(a.status)-rank(b.status));
    const matches=rows.slice(0,5000).map(m=>({sideA:m.sideA,sideB:m.sideB,phase:m.phase,round:m.round,status:m.status,
      table:m.table,score:m.score,sets:(m.sets??[]).map(s=>({sideAScore:s.sideAScore,sideBScore:s.sideBScore}))}));
    if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
    if(plan.player===true) {
      const fixtures=getMockRuntimeMatches(tournament).filter(m=>['LIVE','READY'].includes(m.status)&&m.startedAt&&m.table.startsWith('Tisch ')&&!m.sets?.length&&!m.extraTimeProgress&&canEditMockMatch(tournament,m.id)&&roster.has(m.sideA)&&roster.has(m.sideB)&&tournament.participantIds?.[m.sideA]&&tournament.participantIds?.[m.sideB]).map(m=>({matchId:m.id,aId:tournament.participantIds![m.sideA],bId:tournament.participantIds![m.sideB],startedAt:m.startedAt,bestOf:m.bestOf,requiresWinner:m.requiresWinner}));
      const reportResult=await supabase.rpc('publish_online_report_fixtures',{p_id:start.id,p_token:start.token,p_revision:start.revision,p_fixtures:fixtures}).abortSignal(AbortSignal.timeout(8000));
      if(reportResult.error)throw new Error(reportResult.error.message);
      // The server filters the projection by the capability's stable roster identity.
      const playerResult=await supabase.rpc('publish_online_player_projection',{p_id:start.id,p_token:start.token,p_revision:start.revision,p_matches:matches,p_total:rows.length}).abortSignal(AbortSignal.timeout(8000));
      if(playerResult.error)throw new Error(playerResult.error.message);
    }
    if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
    if(plan.matches===true){
    const {error}=await supabase.rpc('publish_online_spectator_matches',{p_id:start.id,p_token:start.token,p_revision:start.revision,p_matches:matches.slice(0,1000),p_total:rows.length}).abortSignal(AbortSignal.timeout(8000));
    if(error)throw new Error(error.message);
    }
    }
    if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
    if(plan.rankings===true){
    const rankings:Array<{phase:string;label:string;kind:string;rows:Array<MockStanding|{rank:number;name:string;placement:string;status:string}>}>=[];
    for(const stage of tournament.stages.filter(s=>isStageStarted(tournament,s))) {
      if(stage.type==='GROUPS') for(const group of buildMockGroups(tournament,stage)) rankings.push({phase:stage.name,label:group.label,kind:'GROUPS',rows:group.standings.filter(r=>roster.has(r.name))});
      if(stage.type==='SWISS') rankings.push({phase:stage.name,label:'Schweizer System',kind:'SWISS',rows:buildSwissStandings(tournament,stage).filter(r=>roster.has(r.name))});
      if(stage.type==='ROUND_ROBIN') rankings.push({phase:stage.name,label:'Tabelle',kind:'ROUND_ROBIN',rows:buildRoundRobinStandings(tournament,stage).filter(r=>roster.has(r.name))});
    }
    const final=getMockConfirmedFinalStandings(tournament).filter(r=>roster.has(r.name)&&Number.isSafeInteger(r.placementNumber)&&r.placementNumber>0);
    if(final.length) rankings.push({phase:'Gesamtwertung',label:'Bestätigte Endplatzierungen',kind:'FINAL',rows:final.map(r=>({rank:r.placementNumber,name:r.name,placement:r.placement??'Platz '+r.placementNumber,status:r.status}))});
    if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
    const result=await supabase.rpc('publish_online_spectator_rankings',{p_id:start.id,p_token:start.token,p_revision:start.revision,p_rankings:rankings}).abortSignal(AbortSignal.timeout(8000));
    if(result.error)throw new Error(result.error.message);
    }
    if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())return;
    if(plan.brackets===true){
    const brackets=tournament.stages.filter(s=>isStageStarted(tournament,s)&&['KNOCKOUT','DOUBLE_ELIMINATION','PLACEMENT'].includes(s.type)).map(stage=>({
      phase:stage.name,rounds:buildMockBracket(tournament,stage).map(round=>({label:round.label,matches:round.matches.map(m=>({
        a:decodeMatchSlot(m.sideA),b:decodeMatchSlot(m.sideB),score:m.score??'–',
        winner:m.winner&&roster.has(m.winner)?m.winner===m.sideA?'A':m.winner===m.sideB?'B':'NONE':'NONE',
        status:m.status??'WAITING',sets:(m.sets??[]).map(s=>({sideAScore:s.sideAScore,sideBScore:s.sideBScore}))
      }))}))
    }));
    const bracketResult=await supabase.rpc('publish_online_spectator_brackets',{p_id:start.id,p_token:start.token,p_revision:start.revision,p_brackets:brackets}).abortSignal(AbortSignal.timeout(8000));
    if(bracketResult.error)throw new Error(bracketResult.error.message);
    }
  } finally {
    publishing=false;
    const queued=queuedProjection;queuedProjection=undefined;
    if(queued&&workspaceRevision===queued&&!hasPendingRemoteWrites()&&!getTournamentStorageError())void publishSpectatorDetails(queued).catch(()=>{});
  }
}

export interface OnlinePlayerAccess {participant_id:string;name:string;token:string|null}
export async function listOnlinePlayerAccess(id:string):Promise<OnlinePlayerAccess[]> {
  const {client,userId}=await account();
  const {data,error}=await client.rpc('list_online_player_access',{p_id:id});
  if(error)throw new Error(error.message);
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  return (data??[]) as OnlinePlayerAccess[];
}
export async function manageOnlinePlayerAccess(id:string,participantId:string,action:'enable'|'rotate'|'disable'):Promise<string|null> {
  const {client,userId}=await account();
  const {data,error}=await client.rpc('manage_online_player_access',{p_id:id,p_participant_id:participantId,p_action:action});
  if(error)throw new Error(error.message);
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  return typeof data==='string'?data:null;
}
export function onlinePlayerUrl(token:string):string {
  const url=new URL(window.location.href);url.search='';url.hash='/my-games/'+token;return url.href;
}

export interface OnlineResultReport {matchId:string;aId:string;bId:string;startedAt:number;generation:number;bestOf:number;requiresWinner:boolean;revision:number;aSets:MatchSet[]|null;bSets:MatchSet[]|null}
export function matchingReports(row:Pick<OnlineResultReport,'aSets'|'bSets'>):boolean {
  return !!row.aSets&&!!row.bSets&&row.aSets.length===row.bSets.length&&row.aSets.every((s,i)=>s.number===row.bSets![i].number&&s.sideAScore===row.bSets![i].sideAScore&&s.sideBScore===row.bSets![i].sideBScore);
}
export async function listOnlineResultReports(id:string):Promise<OnlineResultReport[]> {
  const {client,userId}=await account();const {data,error}=await client.rpc('list_online_result_reports',{p_id:id}).abortSignal(AbortSignal.timeout(8000));
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if(error)throw new Error(error.message);return (data??[]) as OnlineResultReport[];
}
export function reportMatchNames(row:OnlineResultReport):{a:string;b:string}|null {
  const tournament=getAllMockTournaments().find(t=>t.id===workspaceRevision?.id);
  const match=tournament&&getMockRuntimeMatches(tournament).find(m=>m.id===row.matchId);
  return match?{a:match.sideA,b:match.sideB}:null;
}
export async function adoptOnlineResultReport(row:OnlineResultReport):Promise<void> {
  await adoptOnlineResultReports([row]);
}
export async function adoptOnlineResultReports(requested:readonly OnlineResultReport[]):Promise<number> {
  const start=workspaceRevision;
  if(!start||!requested.length||requested.length>500||new Set(requested.map(r=>r.matchId)).size!==requested.length||hasPendingRemoteWrites()||getTournamentStorageError()||requested.some(r=>r.revision!==start.revision||!matchingReports(r)))throw new Error('Die Meldungen sind nicht mehr aktuell oder nicht übereinstimmend.');
  const fresh=new Map((await listOnlineResultReports(start.id)).map(r=>[r.matchId,r]));
  if(workspaceRevision!==start||hasPendingRemoteWrites()||getTournamentStorageError())throw new Error('Die Meldungen haben sich geändert.');
  function check(row:OnlineResultReport) {
    const actual=fresh.get(row.matchId);
    if(!actual||actual.revision!==row.revision||actual.aId!==row.aId||actual.bId!==row.bId||actual.startedAt!==row.startedAt||actual.generation!==row.generation||actual.bestOf!==row.bestOf||actual.requiresWinner!==row.requiresWinner||!matchingReports(actual)||!matchingReports({aSets:actual.aSets,bSets:row.aSets}))throw new Error('Eine Meldung hat sich geändert. Bitte aktualisieren.');
    const tournament=getAllMockTournaments().find(t=>t.id===start!.id);
    const match=tournament&&getMockRuntimeMatches(tournament).find(m=>m.id===row.matchId);
    if(!tournament||!match||!['RUNNING','PAUSED'].includes(tournament.status)||!['LIVE','READY'].includes(match.status)||!match.table.startsWith('Tisch ')||match.sets?.length||match.extraTimeProgress||!canEditMockMatch(tournament,match.id)||match.startedAt!==row.startedAt||match.bestOf!==row.bestOf||match.requiresWinner!==row.requiresWinner||tournament.participantIds?.[match.sideA]!==row.aId||tournament.participantIds?.[match.sideB]!==row.bId)throw new Error('Eine Begegnung ist nicht mehr unverändert zugewiesen.');
    const invalid=validateCompleteResult(tournament.sport,match.bestOf,row.aSets!,match.requiresWinner);
    if(invalid)throw new Error(invalid);
  }
  requested.forEach(check);
  return runRemoteTournamentBatch(()=>{
    for(const row of requested){
      check(row);
      completeMockMatch(row.matchId,row.aSets!,'FINISHED',true);
    }
    return requested.length;
  });
}
export async function resetOnlineResultReports(row:OnlineResultReport):Promise<void> {
  const start=workspaceRevision;
  if(!start||start.revision!==row.revision||hasPendingRemoteWrites()||getTournamentStorageError()||!supabase)throw new Error('Bitte aktuellen Datenbankstand prüfen.');
  const {data,error}=await supabase.rpc('reset_online_result_reports',{p_id:start.id,p_token:start.token,p_match_id:row.matchId,p_revision:start.revision});
  if(error||data!==true)throw new Error(error?.message??'Zurücksetzen nicht bestätigt.');
}

export async function batchOnlinePlayerAccess(id:string, ids:string[], action:'enable'|'disable'):Promise<number> {
  const {client,userId}=await account();
  if(!ids.length)return 0;
  const {data,error}=await client.rpc('batch_online_player_access',{p_id:id,p_ids:ids,p_action:action}).abortSignal(AbortSignal.timeout(15000));
  if(error)throw new Error(error.message);
  if((await account()).userId!==userId)throw new Error('Die Anmeldung hat sich geändert.');
  if(data!==ids.length)throw new Error('Änderung der Spielerzugänge nicht vollständig bestätigt.');
  return data;
}
