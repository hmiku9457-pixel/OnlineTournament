import { sportScoring,validateCompleteResult } from '@/domain/sportScoring';
import type { MatchSet } from '@/domain/types';
import { useEffect,useRef,useState } from 'react';
import { reportDraftKey,retainReportDrafts,type ReportDraft,type ReportDrafts } from '@/domain/playerReportDrafts';
import { playerRefreshDelay } from '@/domain/playerCalls';
import { supabase } from '@/lib/supabase';
import { startOnlinePolling } from '@/domain/onlinePolling';
import { onlinePlayerSummary, orientOnlineScore, onlineMatchOutcome, filterPlayerMatches, type OnlineMatchView } from '@/domain/onlineMatchViews';
import { personalRestMinutes,formatPersonalRest,type OnlinePersonalContext } from '@/domain/onlinePersonalContext';
import { callAgeMinutes,callLabel,type PlayerMatchCall } from '@/domain/onlineMatchCalls';
import { displayVenueMessage } from '@/domain/venueTerminology';
type Match=OnlineMatchView;
interface Report {matchId:string;startedAt:number;generation:number;side:'A'|'B';sideA:string;sideB:string;bestOf:number;requiresWinner:boolean;revision:number;aSets:MatchSet[]|null;bSets:MatchSet[]|null}
interface PlayerView {name:string;participant:string;sport:string;status:string;revision:number;updatedAt:string;complete:boolean|null;matches:Match[]|null}
const active=(status:string)=>['LIVE','READY','CONFIRMATION'].includes(status);
const statuses:Record<string,string>={WAITING:'Wartend',LIVE:'Läuft',READY:'Zugewiesen',CONFIRMATION:'Bestätigung offen',FINISHED:'Beendet',CANCELLED:'Abgebrochen'};
export function OnlinePlayerPage({token}:{token:string}) {
 const [data,setData]=useState<PlayerView|null>(null);
 const [context,setContext]=useState<OnlinePersonalContext|null>(null);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),15000);return()=>window.clearInterval(timer);},[]);
 const [message,setMessage]=useState('Persönliche Spielübersicht wird geladen …');
 const [reports,setReports]=useState<Report[]>([]);
 const [drafts,setDrafts]=useState<ReportDrafts>({});
 const [refreshVersion,setRefreshVersion]=useState(0);
 const [filter,setFilter]=useState('all');
 const [phase,setPhase]=useState('');
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(0);
 const [lastChecked,setLastChecked]=useState<number|null>(null);
 const [refreshing,setRefreshing]=useState(false);
 const [vibration,setVibration]=useState(false);
 const vibrationRef=useRef(false);
 const previousCalls=useRef<string[]|null>(null);
 const [calls,setCalls]=useState<PlayerMatchCall[]>([]);
 const [ackBusy,setAckBusy]=useState(false);
 const [ackError,setAckError]=useState('');
 const [newCallText,setNewCallText]=useState('');
 useEffect(()=>{
  let alive=true,failures=0,knownTag:string|null=null;
  const client=supabase;
  if(!client||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setReports([]);setDrafts({});setMessage('Spielerlink ungültig.');return;}
  async function refresh(signal:AbortSignal){
   if(!alive)return;
   setRefreshing(true);
   try{
    const result=await client!.rpc('read_online_player_bundle_v2',{p_token:token,p_known_tag:knownTag}).abortSignal(signal);
    if(!alive)return;
    if(result.error)throw new Error(result.error.message);
    if(result.data?.unchanged===true&&knownTag!==null){failures=0;setLastChecked(Date.now());return;}
    knownTag=typeof result.data?.tag==='string'?result.data.tag:null;
    const view=result.data?.view as PlayerView|null;
    const raw=result.data?.reports;
    const currentReports:Report[]=view&&Array.isArray(raw)?raw.filter((r:Report)=>r.revision===view.revision):[];
    setReports(currentReports);
    setDrafts(old=>!view?{}:retainReportDrafts(old,currentReports,view.matches!==null&&Array.isArray(raw)));
    setData(view);setContext(view&&result.data?.context?result.data.context as OnlinePersonalContext:null);setLastChecked(Date.now());failures=0;
    setMessage(view?'':'Dieser Spielerlink ist nicht mehr verfügbar.');
    const currentCalls:PlayerMatchCall[]=view&&Array.isArray(result.data?.calls)?result.data.calls.filter((c:PlayerMatchCall)=>c.revision===view.revision):[];
    setCalls(currentCalls);
    if(!view){previousCalls.current=null;setNewCallText('');setAckError('');}
    else if(view.matches===null){setNewCallText('');}
    else {
      const added=previousCalls.current===null?[]:currentCalls.filter(c=>!previousCalls.current!.includes(c.callId)&&!c.acknowledged);
      previousCalls.current=currentCalls.map(c=>c.callId);
      if(added.length){
        setNewCallText('Neuer Spielaufruf: '+added.map(c=>displayVenueMessage(view.sport,c.table)+' gegen '+(c.sideA===view.participant?c.sideB:c.sideA)).join(' · '));
        if(vibrationRef.current&&document.visibilityState==='visible'&&typeof navigator.vibrate==='function')navigator.vibrate([180,100,180]);
      } else if(!currentCalls.some(c=>!c.acknowledged))setNewCallText('');
    }
   }catch{if(alive){knownTag=null;failures++;setData(null);setContext(null);setReports([]);setCalls([]);setNewCallText('');setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
   finally{if(alive)setRefreshing(false);}
  }
  const polling=startOnlinePolling(refresh,()=>playerRefreshDelay(document.visibilityState==='visible',failures));
  const focus=()=>{if(document.visibilityState==='visible')polling.refresh();};
  window.addEventListener('focus',focus);window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);
  return()=>{alive=false;polling.stop();window.removeEventListener('focus',focus);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',focus);};
 },[token,refreshVersion]);
 async function acknowledge(call:PlayerMatchCall){
  if(ackBusy||!supabase)return;setAckBusy(true);setAckError('');
  try{const {data:ok,error}=await supabase.rpc('ack_online_match_call',{p_token:token,p_call_id:call.callId}).abortSignal(AbortSignal.timeout(8000));
   if(error||ok!==true)throw new Error(error?.code==='PT429'?'Zu viele Änderungen. Bitte eine Minute warten.':'Aufruf konnte nicht bestätigt werden. Bitte aktualisieren.');
   setCalls(old=>old.map(c=>c.callId===call.callId?{...c,acknowledged:true}:c));setNewCallText('');setRefreshVersion(v=>v+1);
  }catch(e){setAckError(e instanceof Error?e.message:'Bestätigung fehlgeschlagen.');}
  finally{setAckBusy(false);}
 }
 const summary=data?.matches?onlinePlayerSummary(data.matches,data.participant):null;
 const phases=[...new Set((data?.matches??[]).map(m=>m.phase))];
 const rows=filterPlayerMatches(data?.matches??[],data?.participant??'',phase,query,filter);
 const lastPage=Math.max(0,Math.ceil(rows.length/25)-1),currentPage=Math.min(lastPage,page);
 return <main className="main online-spectator">
 {!data?<section className="card"><h1>Persönliche Spielübersicht</h1><p role="status">{message}</p></section>:<>
 <header className="dashboard-page-hero"><div><h1>{data.participant}</h1><p>{data.name} · {data.sport}</p></div><span className="badge">Spieleransicht</span></header>
 <nav className="actions online-player-nav" aria-label="Spieler-Navigation"><a href="#" onClick={e=>{e.preventDefault();document.getElementById('my-calls')?.scrollIntoView();}}>Aufrufe</a><a href="#" onClick={e=>{e.preventDefault();document.getElementById('my-results')?.scrollIntoView();}}>Statistik</a><a href="#" onClick={e=>{e.preventDefault();document.getElementById('my-games')?.scrollIntoView();}}>Spiele</a></nav>
 {context&&<section className="card" aria-label="Persönlicher Turnierstatus"><h2>Mein Turnierstatus</h2><strong>{context.phaseStatus}</strong>
 {context.placement&&<p>Bestätigte Platzierung: <strong>{context.placement}</strong></p>}
 {context.breakUntil!==null&&<p>Geplante Fortsetzung: <strong>{new Date(context.breakUntil).toLocaleString('de-DE')}</strong>{context.breakUntil<=now?' · Freigabe durch die Turnierleitung abwarten.':''}</p>}
 {data.status==='PAUSED'&&context.breakUntil===null&&<p>Turnier pausiert. Auf Freigabe der Turnierleitung warten.</p>}
 {data.status==='RUNNING'&&data.matches!==null&&summary?.waiting!==0&&<p>Pause seit letztem erfassten Spiel: <strong>{formatPersonalRest(personalRestMinutes(context.lastFinishedAt,now,!!summary?.active))}</strong></p>}
 {context.rankings.length>0&&<div className="online-personal-ranks">{context.rankings.map((r,i)=><div key={i}><span>{r.phase} · {r.label}</span><strong>Platz {r.rank}</strong></div>)}</div>}
 </section>}
 <section className="card player-call-panel" id="my-calls"><div className="actions"><h2>Meine Spielaufrufe</h2><button className="btn small" disabled={refreshing} onClick={()=>setRefreshVersion(v=>v+1)}>{refreshing?'Aktualisiere …':'Jetzt aktualisieren'}</button></div>
 {newCallText&&<p role="status" className="player-call-notice">{newCallText}</p>}
 {ackError&&<p role="alert">{ackError}</p>}
 {data.matches===null?<p className="muted">Spielaufrufe werden für den aktuellen Stand aktualisiert.</p>:calls.length===0?<p>Momentan kein offener Spielaufruf. Laufende Spiele findest du unter Meine Spiele.</p>:calls.map(call=><article className="player-call-card" key={call.callId}><span className="muted">Bitte zur Spielfläche · Aufruf: {callLabel(callAgeMinutes(call.calledAt,lastChecked??Date.now()))}</span><strong className="player-call-table">{displayVenueMessage(data.sport,call.table)}</strong><strong>gegen {call.sideA===data.participant?call.sideB:call.sideA}</strong><button className="btn small" disabled={ackBusy||call.acknowledged} onClick={()=>void acknowledge(call)}>{call.acknowledged?'Gesehen':'Aufruf gesehen'}</button><small className="muted">{call.acknowledged?'In der Datenbank bestätigt.':'Bestätigung wird an die Turnierleitung übermittelt.'}</small></article>)}
 {typeof navigator.vibrate==='function'&&<label><input type="checkbox" checked={vibration} onChange={e=>{vibrationRef.current=e.target.checked;setVibration(e.target.checked);if(e.target.checked)navigator.vibrate(80);}}/> Vibration bei neuen Spielaufrufen (geöffnete Ansicht)</label>}
 <p className="muted">{lastChecked?'Zuletzt geprüft: '+new Date(lastChecked).toLocaleTimeString('de-DE'):'Noch nicht geprüft'}. Bitte halte die Ansicht geöffnet. Keine Hintergrund-Push-Nachrichten.</p></section>
 {reports.length>0&&<section className="card"><h2>Ergebnis melden</h2><p>Beide Seiten müssen denselben Endstand melden. Erst die Turnierleitung übernimmt das verbindliche Ergebnis.</p>{reports.map(r=>{const key=reportDraftKey(r);return <ReportForm key={key} report={r} sport={data.sport} token={token} values={drafts[key]??[['','']]} setValues={update=>setDrafts(old=>({...old,[key]:update(old[key]??[['','']])}))} onSaved={()=>setRefreshVersion(v=>v+1)}/>;})}</section>}
 {summary&&<section className="card" aria-label="Weitere geplante Begegnungen"><h2>Weitere geplante Begegnungen</h2>
 {summary.upcoming.length?<><p className="muted">Auszug aus den bereits feststehenden Paarungen, keine verbindliche Aufrufreihenfolge.</p>{summary.upcoming.map((m,i)=><article className="online-catalog-row" key={i}><strong>gegen {m.sideA===data.participant?m.sideB:m.sideA}</strong><p>{m.phase} · {m.round}</p></article>)}</>:<p>Keine weiteren wartenden Paarungen im veröffentlichten Spielplan.</p>}
 </section>}
 {summary&&<section className="card" id="my-results"><h2>Meine Ergebnisübersicht</h2><p className="muted">Aus den veröffentlichten Endständen; Sonderwertungen ohne eindeutigen Sieger werden separat ausgewiesen.{data.complete===false?' Unvollständiger Auszug.':''}</p>
 <div className="online-summary-grid"><div><span>Siege</span><strong>{summary.wins}</strong></div><div><span>Niederlagen</span><strong>{summary.losses}</strong></div><div><span>Unentschieden</span><strong>{summary.draws}</strong></div><div><span>Sonderwertungen / unklar</span><strong>{summary.other}</strong></div></div></section>}
 <section className="card" aria-label="Meine Spiele" id="my-games"><h2>Meine Spiele</h2>
 {data.matches===null?<p role="status">Die Spielübersicht wird für die aktuelle Revision aktualisiert. Bitte warte auf die Turnierleitung.</p>:<>
 <div className="control-metrics-grid"><div><span>Laufend / zugewiesen</span><strong>{data.matches.filter(m=>active(m.status)).length}</strong></div><div><span>Wartend</span><strong>{data.matches.filter(m=>m.status==='WAITING').length}</strong></div><div><span>Beendet</span><strong>{data.matches.filter(m=>m.status==='FINISHED').length}</strong></div></div>
 {data.complete===false&&<p role="status">Die Übersicht enthält einen begrenzten Auszug des Spielplans.</p>}
 <div className="control-match-filter-fields"><label>Gegner suchen<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Name"/></label><label>Phase<select aria-label="Phase" value={phase} onChange={e=>{setPhase(e.target.value);setPage(0);}}><option value="">Alle Phasen</option>{phases.map(p=><option key={p}>{p}</option>)}</select></label><label>Spielstatus<select aria-label="Spielstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">Alle Spiele</option><option value="active">Laufend / zugewiesen</option><option value="WAITING">Wartend</option><option value="FINISHED">Beendet</option><option value="CANCELLED">Abgebrochen</option></select></label></div><p className="muted">{rows.length} passende Begegnungen</p>
 {!rows.length&&<p>Keine passenden Begegnungen vorhanden.</p>}
 {rows.slice(currentPage*25,(currentPage+1)*25).map((m,i)=>{
  const sideA=m.sideA===data.participant;
  const score=orientOnlineScore(m.score,sideA);
  return <article className="online-catalog-row" key={i}><div className="actions"><strong>gegen {sideA?m.sideB:m.sideA}</strong><strong className={'online-result-'+onlineMatchOutcome(m,data.participant)}>{score}</strong><span className="badge">{statuses[m.status]??m.status}</span></div>
  <p>{m.phase} · {m.round} · {displayVenueMessage(data.sport,m.table)}</p>
  {m.sets.length>0&&<p className="muted">{m.sets.map(s=>sideA?s.sideAScore+':'+s.sideBScore:s.sideBScore+':'+s.sideAScore).join(', ')}</p>}</article>;
 })}
 {lastPage>0&&<div className="actions"><button className="btn" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Zurück</button><span>Seite {currentPage+1}/{lastPage+1}</span><button className="btn" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Weiter</button></div>}
 </>}
 </section>
 <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung bei sichtbarer Ansicht etwa alle 4 Sekunden. Gib diesen persönlichen Link nicht weiter.</p>
 </>}
 </main>;
}

function ReportForm({report:r,sport,token,onSaved,values,setValues}:{report:Report;sport:string;token:string;onSaved:()=>void;values:ReportDraft;setValues:(update:(old:ReportDraft)=>ReportDraft)=>void}) {
 const own=r.side==='A'?r.aSets:r.bSets,other=r.side==='A'?r.bSets:r.aSets;
 const orient=(sets:MatchSet[])=>sets.map(s=>({number:s.number,sideAScore:r.side==='A'?s.sideAScore:s.sideBScore,sideBScore:r.side==='A'?s.sideBScore:s.sideAScore}));
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
   const {data,error}=await supabase.rpc('submit_online_player_report_v2',{p_token:token,p_match_id:r.matchId,p_revision:r.revision,p_sets:confirm,p_generation:r.generation}).abortSignal(AbortSignal.timeout(8000));
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
