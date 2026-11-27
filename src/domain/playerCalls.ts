export interface PlayerCallMatch {
 sideA:string;sideB:string;phase:string;round:string;status:string;table:string;
}
export interface PlayerCall {key:string;opponent:string;table:string;phase:string;round:string}
export function getPlayerCalls(matches:readonly PlayerCallMatch[],participant:string):PlayerCall[] {
 const unique=new Map<string,PlayerCall>();
 for(const match of matches){
  if(!['LIVE','READY'].includes(match.status)||!/^Tisch [1-9]\d*$/.test(match.table)||![match.sideA,match.sideB].includes(participant))continue;
  const opponent=match.sideA===participant?match.sideB:match.sideA;
  const key=JSON.stringify([match.phase,match.round,opponent,match.table]);
  unique.set(key,{key,opponent,table:match.table,phase:match.phase,round:match.round});
 }
 return [...unique.values()];
}
export function newPlayerCalls(previous:readonly string[]|null,current:readonly PlayerCall[]):PlayerCall[] {
 if(previous===null)return [];
 const known=new Set(previous);
 return current.filter(call=>!known.has(call.key));
}
export function playerRefreshDelay(visible:boolean,failures:number):number {
 if(failures>0)return Math.min(60000,Math.max(5000,5000*2**Math.min(failures-1,4)));
 return visible?4000:30000;
}
