export interface QualificationOverview {
  phase:string;target:number;projected:string[];possible:string[];confirmed:string[]|null;
}
export interface PublicMatchOverview {
  recent:Array<{index:number;finishedAt:number}>;
  qualification:QualificationOverview[];
}
/** Keep exact ties together, never claim a provisional tie winner. */
export function provisionalCutoff(rows:readonly {name:string;rank:number}[],target:number) {
 const projected:string[]=[],possible:string[]=[];
 for(let i=0;i<rows.length&&i<target;){
  const rank=rows[i].rank;let end=i+1;
  while(end<rows.length&&rows[end].rank===rank)end++;
  (end<=target?projected:possible).push(...rows.slice(i,end).map(r=>r.name));i=end;
 }
 return {projected,possible};
}
