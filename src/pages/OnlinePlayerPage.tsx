import { sportScoring,validateCompleteResult } from '@/domain/sportScoring';
import type { MatchSet } from '@/domain/types';
import { useEffect,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { displayVenueMessage } from '@/domain/venueTerminology';
interface Match {sideA:string;sideB:string;phase:string;round:string;status:string;table:string;score:string;sets:Array<{sideAScore:number;sideBScore:number}>}
interface Report {matchId:string;side:'A'|'B';sideA:string;sideB:string;bestOf:number;requiresWinner:boolean;revision:number;aSets:MatchSet[]|null;bSets:MatchSet[]|null}
interface PlayerView {name:string;participant:string;sport:string;status:string;revision:number;updatedAt:string;complete:boolean|null;matches:Match[]|null}
const active=(status:string)=>['LIVE','READY','CONFIRMATION'].includes(status);
const statuses:Record<string,string>={WAITING:'Wartend',LIVE:'Läuft',READY:'Zugewiesen',CONFIRMATION:'Bestätigung offen',FINISHED:'Beendet',CANCELLED:'Abgebrochen'};
export function OnlinePlayerPage({token}:{token:string}) {
 const [data,setData]=useState<PlayerView|null>(null);
 const [message,setMessage]=useState('Persönliche Spielübersicht wird geladen …');
 const [reports,setReports]=useState<Report[]>([]);
 const [refreshVersion,setRefreshVersion]=useState(0);
 const [filter,setFilter]=useState('all');
 const [page,setPage]=useState(0);
 useEffect(()=>{
  let alive=true,running=false;
  async function refresh(){
   if(!alive||running)return;
   if(!supabase||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setReports([]);setMessage('Spielerlink ungültig.');return;}
   running=true;
   try{
    const [result,reportResult]=await Promise.all([supabase.rpc('read_online_player_access',{p_token:token}).abortSignal(AbortSignal.timeout(8000)),supabase.rpc('read_online_player_reports',{p_token:token}).abortSignal(AbortSignal.timeout(8000))]);
    if(!alive)return;
    if(result.error)throw new Error(result.error.message);
    setReports(result.data&&!reportResult.error&&Array.isArray(reportResult.data)?reportResult.data.filter((r:Report)=>r.revision===result.data.revision):[]);
    setData(result.data as PlayerView|null);setMessage(result.data?'':'Dieser Spielerlink ist nicht mehr verfügbar.');
   }catch{if(alive){setData(null);setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
   finally{running=false;}
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),15000);
  const focus=()=>void refresh();
  window.addEventListener('focus',focus);window.addEventListener('online',focus);
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
 },[token,refreshVersion]);
 const rows=(data?.matches??[]).filter(m=>filter==='all'||(filter==='active'?active(m.status):m.status===filter));
 const lastPage=Math.max(0,Math.ceil(rows.length/25)-1),currentPage=Math.min(lastPage,page);
 return <main className="main online-spectator">
 {!data?<section className="card"><h1>Persönliche Spielübersicht</h1><p role="status">{message}</p></section>:<>
 <header className="dashboard-page-hero"><div><h1>{data.participant}</h1><p>{data.name} · {data.sport}</p></div><span className="badge">Spieleransicht</span></header>
 {reports.length>0&&<section className="card"><h2>Ergebnis melden</h2><p>Beide Seiten müssen denselben Endstand melden. Erst die Turnierleitung übernimmt das verbindliche Ergebnis.</p>{reports.map(r=><ReportForm key={r.matchId+'-'+r.revision} report={r} sport={data.sport} token={token} onSaved={()=>setRefreshVersion(v=>v+1)}/>)}</section>}
 <section className="card"><h2>Meine Spiele</h2>
 {data.matches===null?<p role="status">Die Spielübersicht wird für die aktuelle Revision aktualisiert. Bitte warte auf die Turnierleitung.</p>:<>
 <div className="control-metrics-grid"><div><span>Laufend / zugewiesen</span><strong>{data.matches.filter(m=>active(m.status)).length}</strong></div><div><span>Wartend</span><strong>{data.matches.filter(m=>m.status==='WAITING').length}</strong></div><div><span>Beendet</span><strong>{data.matches.filter(m=>m.status==='FINISHED').length}</strong></div></div>
 {data.complete===false&&<p role="status">Die Übersicht enthält einen begrenzten Auszug des Spielplans.</p>}
 <label>Spielstatus<select aria-label="Spielstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">Alle Spiele</option><option value="active">Laufend / zugewiesen</option><option value="WAITING">Wartend</option><option value="FINISHED">Beendet</option></select></label>
 {!rows.length&&<p>Keine passenden Begegnungen vorhanden.</p>}
 {rows.slice(currentPage*25,(currentPage+1)*25).map((m,i)=>{
  const sideA=m.sideA===data.participant;
  const score=sideA?m.score:m.score.replace(/^(\d+)\s*:\s*(\d+)$/,'$2:$1');
  return <article className="online-catalog-row" key={i}><div className="actions"><strong>gegen {sideA?m.sideB:m.sideA}</strong><strong>{score}</strong><span className="badge">{statuses[m.status]??m.status}</span></div>
  <p>{m.phase} · {m.round} · {displayVenueMessage(data.sport,m.table)}</p>
  {m.sets.length>0&&<p className="muted">{m.sets.map(s=>sideA?s.sideAScore+':'+s.sideBScore:s.sideBScore+':'+s.sideAScore).join(', ')}</p>}</article>;
 })}
 {lastPage>0&&<div className="actions"><button className="btn" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Zurück</button><span>Seite {currentPage+1}/{lastPage+1}</span><button className="btn" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Weiter</button></div>}
 </>}
 </section>
 <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung alle 15 Sekunden. Gib diesen persönlichen Link nicht weiter.</p>
 </>}
 </main>;
}

function ReportForm({report:r,sport,token,onSaved}:{report:Report;sport:string;token:string;onSaved:()=>void}) {
 const own=r.side==='A'?r.aSets:r.bSets,other=r.side==='A'?r.bSets:r.aSets;
 const orient=(sets:MatchSet[])=>sets.map(s=>({number:s.number,sideAScore:r.side==='A'?s.sideAScore:s.sideBScore,sideBScore:r.side==='A'?s.sideBScore:s.sideAScore}));
 const [values,setValues]=useState<Array<[string,string]>>([['','']]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [confirm,setConfirm]=useState<MatchSet[]|null>(null);
 const mode=sportScoring(sport).mode;
 const limit=mode==='score'?1:r.bestOf;
 const print=(sets:MatchSet[])=>orient(sets).map(s=>s.sideAScore+':'+s.sideBScore).join(' · ');
 function prepare(){
  setError('');
  if(values.some(v=>v.some(s=>!/^\d{1,12}$/.test(s)))){setError('Bitte vollständige nichtnegative Zahlen eintragen.');return;}
  const sets=orient(values.map(([a,b],i)=>({number:i+1,sideAScore:Number(a),sideBScore:Number(b)})));
  const invalid=validateCompleteResult(sport,r.bestOf,sets,r.requiresWinner);
  if(invalid){setError(invalid+' Sonderentscheidungen bitte der Turnierleitung melden.');return;}
  setConfirm(sets);
 }
 async function submit(){
  if(!confirm||busy||!supabase)return;setBusy(true);setError('');
  try{
   const {data,error}=await supabase.rpc('submit_online_player_report',{p_token:token,p_match_id:r.matchId,p_revision:r.revision,p_sets:confirm}).abortSignal(AbortSignal.timeout(8000));
   if(error||data!==true)throw new Error(error?.message??'Meldung nicht bestätigt.');
   setConfirm(null);onSaved();
  }catch{setError('Meldung nicht bestätigt. Bitte erneut prüfen oder Turnierleitung kontaktieren.');}
  finally{setBusy(false);}
 }
 return <article className="online-catalog-row"><h3>gegen {r.side==='A'?r.sideB:r.sideA}</h3>
 {own?<><p>Deine Meldung: <strong>{print(own)}</strong></p><p>{other?print(own)===print(other)?'Beide Meldungen stimmen überein – wartet auf Turnierleitung.':'Meldungen weichen ab – bitte Turnierleitung kontaktieren.':'Wartet auf Meldung des Gegners.'}</p></>:<>
 {other&&<div className="actions"><span>Gegner meldet: <strong>{print(other)}</strong></span><button className="btn small" disabled={busy} onClick={()=>setConfirm(other)}>Diesen Stand bestätigen</button></div>}
 <p className="muted">Dein Ergebnis zuerst, Gegner danach.</p>
 {values.map(([a,b],i)=><div className="actions online-report-score" key={i}><span>{mode==='score'?'Endstand':'Satz '+(i+1)}</span><input aria-label={'Eigene Punkte '+(i+1)} inputMode="numeric" value={a} disabled={busy} onChange={e=>setValues(old=>old.map((v,j)=>i===j?[e.target.value,v[1]]:v))}/><span>:</span><input aria-label={'Gegnerpunkte '+(i+1)} inputMode="numeric" value={b} disabled={busy} onChange={e=>setValues(old=>old.map((v,j)=>i===j?[v[0],e.target.value]:v))}/></div>)}
 <div className="actions">{values.length<limit&&<button className="btn small" disabled={busy} onClick={()=>setValues(v=>[...v,['','']])}>Satz hinzufügen</button>}{values.length>1&&<button className="btn small" disabled={busy} onClick={()=>setValues(v=>v.slice(0,-1))}>Letzten Satz entfernen</button>}<button className="btn primary" disabled={busy} onClick={prepare}>Ergebnis prüfen</button></div>
 {confirm&&<div role="dialog" aria-label="Spielermeldung bestätigen"><p>Verbindliche Meldung: <strong>{print(confirm)}</strong>. Änderungen sind nur über die Turnierleitung möglich.</p><div className="actions"><button className="btn" disabled={busy} onClick={()=>setConfirm(null)}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={()=>void submit()}>Ergebnis melden</button></div></div>}
 </>}
 {error&&<p role="alert">{error}</p>}
 </article>;
}
