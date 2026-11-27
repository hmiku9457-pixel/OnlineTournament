import { decodeMatchSlot } from '@/domain/matchSlots';
import type { DemoTournament } from '@/data/demoTournaments';
import type { OnlinePersonalContext,PersonalRanking } from '@/domain/onlinePersonalContext';
import { buildMockGroups,buildRoundRobinStandings,buildSwissStandings,buildMockBracket } from '@/services/mockCompetitionViews';
import { getMockConfirmedFinalStandings } from '@/services/mockParticipantProgress';
import { getMockPlayedFinishTimes,type MockRuntimeMatch } from '@/services/mockRuntime';
import { getPhaseLifecycle,getActiveStage,getBreakResumeAt } from '@/services/mockPhaseLifecycle';
import { getInlineBreakStatus } from '@/services/mockInlineBreak';
import { readWithdrawnParticipants } from '@/services/mockWithdrawals';

/** Build once per confirmed revision, not once per personal page request.
 * The database validates the allowlist and returns only the capability's row. */
export function buildOnlinePersonalContexts(t:DemoTournament,matches:readonly MockRuntimeMatch[]):Record<string,OnlinePersonalContext>{
 const state=getPhaseLifecycle(t);
 const roster=t.participantNames;
 const withdrawn=new Set(readWithdrawnParticipants()[t.id]??[]);
 const times=getMockPlayedFinishTimes(matches);
 const final=new Map(getMockConfirmedFinalStandings(t).map(row=>[row.name,row]));
 const rankings=new Map<string,PersonalRanking[]>();
 const add=(name:string,row:PersonalRanking)=>{const current=rankings.get(name)??[];current.push(row);rankings.set(name,current);};
 const started=t.stages.filter(s=>state.startedStageIds.includes(s.id)&&s.type!=='BREAK');
 const latest=started.at(-1);
 const latestEntrants=latest?new Set(state.stageEntrants?.[latest.id]??[]):null;
 const next=latest&&state.completedStageIds.includes(latest.id)?t.stages.slice(t.stages.indexOf(latest)+1).find(s=>s.type!=='BREAK'):undefined;
 const qualified=next&&state.stageEntrants?.[next.id]?new Set(state.stageEntrants[next.id]):null;
 for(const stage of started){
  if(stage.type==='GROUPS')for(const group of buildMockGroups(t,stage))for(const row of group.standings)add(row.name,{phase:stage.name,label:group.label,rank:row.rank});
  if(stage.type==='SWISS')for(const row of buildSwissStandings(t,stage))add(row.name,{phase:stage.name,label:'Schweizer System',rank:row.rank});
  if(stage.type==='ROUND_ROBIN')for(const row of buildRoundRobinStandings(t,stage))add(row.name,{phase:stage.name,label:'Tabelle',rank:row.rank});
 }
 const eliminated=new Set<string>();
 if(latest?.type==='KNOCKOUT'){
  const rounds=buildMockBracket(t,latest);
  const bronze=rounds.find(r=>r.label==='Spiel um Platz 3');
  for(const round of rounds)for(const m of round.matches){
   if(!m.winner||m.status!=='FINISHED'||decodeMatchSlot(m.sideA).kind!=='participant'||decodeMatchSlot(m.sideB).kind!=='participant')continue;
   const loser=m.winner===m.sideA?m.sideB:m.sideA;
   if(round.label==='Halbfinale'&&bronze?.matches.some(b=>b.status!=='FINISHED'&&(b.sideA===loser||b.sideB===loser)))continue;
   eliminated.add(loser);
  }
 }
 const active=getActiveStage(t);
 const inline=active&&active.type!=='BREAK'?getInlineBreakStatus(t,active,matches.filter(m=>m.stageId===active.id)):null;
 const resume=active?.type==='BREAK'?getBreakResumeAt(t,active):inline?.state==='running'?inline.resumeAt:null;
 const breakUntil=resume&&Number.isFinite(resume.getTime())?resume.getTime():null;
 return Object.fromEntries(roster.flatMap(name=>{
  const id=t.participantIds?.[name];if(!id)return [];
  const confirmed=final.get(name);
  const phaseStatus=withdrawn.has(name)?'Zurückgezogen':t.status==='ABORTED'?'Turnier abgebrochen':t.status==='FINISHED'?'Turnier beendet':
   confirmed?'Ausgeschieden':qualified?(qualified.has(name)?'Für '+next!.name+' qualifiziert':'Nicht für '+next!.name+' qualifiziert'):
   latest&&latestEntrants?.size&&!latestEntrants.has(name)?'Nicht im Teilnehmerfeld: '+latest.name:eliminated.has(name)?'Aus der aktuellen KO-Phase ausgeschieden':latest?'Teilnehmerfeld: '+latest.name:'Vor Turnierstart';
  return [[id,{phaseStatus,placement:confirmed?.placement??null,lastFinishedAt:times.get(name)??null,breakUntil,rankings:(rankings.get(name)??[]).slice(-100)} satisfies OnlinePersonalContext]];
 }));
}
