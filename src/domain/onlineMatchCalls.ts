export interface OnlineMatchCall {
  matchId:string; callId:string; table:string; calledAt:string;
  sideA:string; sideB:string; revision:number;
}
export interface PlayerMatchCall extends OnlineMatchCall { acknowledged:boolean }
export interface DirectorMatchCall extends OnlineMatchCall { ackA:boolean; ackB:boolean }

export function callAgeMinutes(calledAt:string, now:number):number|null {
  const start=Date.parse(calledAt);
  if(!Number.isFinite(start)||!Number.isFinite(now)||start>now)return null;
  return Math.floor((now-start)/60000);
}
export function callLabel(minutes:number|null):string {
  return minutes===null?'–':minutes===0?'gerade eben':minutes+' min';
}
