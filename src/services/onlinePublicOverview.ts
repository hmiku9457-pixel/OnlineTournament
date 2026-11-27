import type { DemoTournament } from '@/data/demoTournaments';
import type { MockRuntimeMatch } from '@/services/mockRuntime';
import { getPhaseLifecycle,getNextCompetitionStage } from '@/services/mockPhaseLifecycle';
import { buildMockGroups,buildRoundRobinStandings,buildSwissStandings } from '@/services/mockCompetitionViews';
import { getStageWithdrawalLabel } from '@/services/mockWithdrawals';
import { getGroupQualificationHints } from '@/domain/groupQualification';
import { provisionalCutoff,type PublicMatchOverview } from '@/domain/publicMatchOverview';
export function buildPublicMatchOverview(t:DemoTournament,rows:readonly MockRuntimeMatch[],finished:ReadonlyMap<string,number>):PublicMatchOverview {
 const roster=new Set(t.participantNames??[]),state=getPhaseLifecycle(t);
 const recent=rows.flatMap((m,index)=>m.status==='FINISHED'&&finished.has(m.id)?[{index,finishedAt:finished.get(m.id)!}]:[]).sort((a,b)=>b.finishedAt-a.finishedAt).slice(0,20);
 const qualification:PublicMatchOverview['qualification']=[];
 for(const stage of t.stages){
  if(!state.startedStageIds.includes(stage.id)||!['GROUPS','SWISS','ROUND_ROBIN'].includes(stage.type))continue;
  const next=getNextCompetitionStage(t,stage);if(!next)continue;
  const target=stage.advancement.type==='top_n'&&stage.advancement.value>0?stage.advancement.value:Math.max(1,Number(next.settings.entrants)||1);
  const confirmed=state.completedStageIds.includes(stage.id)&&state.stageEntrants?.[next.id]?state.stageEntrants[next.id].filter(n=>roster.has(n)):null;
  const eligible=(name:string)=>roster.has(name)&&!getStageWithdrawalLabel(t,name,stage.id);
  let projected:string[]=[],possible:string[]=[];
  if(confirmed===null){
   if(stage.type==='GROUPS'){
    const groups=buildMockGroups(t,stage);
    const excluded=new Set(groups.flatMap(g=>g.standings.filter(r=>!eligible(r.name)).map(r=>r.name)));
    const hints=getGroupQualificationHints(groups,target,excluded);
    projected=[...hints.projected];possible=[...hints.possible];
    // A shared rank at a group's boundary is provisional for the entire tie.
    for(const g of groups)for(const row of g.standings){
     if(!eligible(row.name)||!projected.includes(row.name))continue;
     const tied=g.standings.filter(r=>eligible(r.name)&&r.rank===row.rank);
     if(tied.some(r=>!projected.includes(r.name))){
      const names=tied.map(r=>r.name);projected=projected.filter(n=>!names.includes(n));possible.push(...names);
     }
    }
   }else{
    const ranked=(stage.type==='SWISS'?buildSwissStandings(t,stage):buildRoundRobinStandings(t,stage)).filter(r=>eligible(r.name));
    ({projected,possible}=provisionalCutoff(ranked,target));
   }
  }
  qualification.push({phase:stage.name,target,projected:[...new Set(projected)],possible:[...new Set(possible)],confirmed});
 }
 return {recent,qualification:qualification.slice(0,100)};
}
