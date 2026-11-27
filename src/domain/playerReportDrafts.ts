export interface ReportIdentity {matchId:string;startedAt:number;generation:number;side:'A'|'B';sideA:string;sideB:string;bestOf:number;requiresWinner:boolean}
export type ReportDraft=Array<[string,string]>;
export type ReportDrafts=Record<string,ReportDraft>;
export function reportDraftKey(r:ReportIdentity):string {
 return JSON.stringify([r.matchId,r.startedAt,r.generation,r.side,r.sideA,r.sideB,r.bestOf,r.requiresWinner]);
}
export function retainReportDrafts(drafts:ReportDrafts, reports:readonly ReportIdentity[], projectionCurrent:boolean):ReportDrafts {
 if(!projectionCurrent)return drafts;
 const keys=new Set(reports.map(reportDraftKey));
 return Object.fromEntries(Object.entries(drafts).filter(([k])=>keys.has(k)));
}
