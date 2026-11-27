export interface PersonalRanking {phase:string;label:string;rank:number}
export interface OnlinePersonalContext {
 phaseStatus:string;placement:string|null;lastFinishedAt:number|null;breakUntil:number|null;rankings:PersonalRanking[];
}
export function personalRestMinutes(lastFinishedAt:number|null,now:number,active:boolean):number|null {
 if(active||lastFinishedAt===null||!Number.isSafeInteger(lastFinishedAt)||!Number.isFinite(now)||lastFinishedAt>now)return null;
 return Math.floor((now-lastFinishedAt)/60000);
}
export function formatPersonalRest(minutes:number|null):string {
 if(minutes===null)return '–';
 return minutes<60?minutes+' min':Math.floor(minutes/60)+' h '+String(minutes%60).padStart(2,'0')+' min';
}
