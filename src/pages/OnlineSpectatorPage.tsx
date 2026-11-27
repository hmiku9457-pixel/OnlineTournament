import { BracketRoundViewport } from '@/components/BracketRoundViewport';
import type { MatchSlot } from '@/domain/matchSlots';
import { sportScoring } from '@/domain/sportScoring';
import type { MockStanding } from '@/services/mockCompetitionViews';
import { playerRefreshDelay } from '@/domain/playerCalls';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { startOnlinePolling } from '@/domain/onlinePolling';
import { publicHallAssignments, type OnlineMatchView } from '@/domain/onlineMatchViews';
import { displayVenueName, getVenueTerminology } from '@/domain/venueTerminology';

interface Progress {
  name:string; sport:string; status:string; revision:number; updatedAt:string;
  participantCount:number; tables:number; recordedResults:number; occupiedTables:number;
  phases:Array<{name:string|null;type:string;started:boolean;completed:boolean}>;
}
type MatchDetail=OnlineMatchView;
interface Details {revision:number;matches:MatchDetail[]|null;total:number|null}
type RankingRow=MockStanding|{rank:number;name:string;placement:string;status:string};
interface RankingTable {phase:string;label:string;kind:string;rows:RankingRow[]}
interface Rankings {revision:number;rankings:RankingTable[]|null}
interface PublicBracketMatch {a:MatchSlot;b:MatchSlot;score:string;winner:'A'|'B'|'NONE';status:string;sets:Array<{sideAScore:number;sideBScore:number}>}
interface Brackets {revision:number;brackets:Array<{phase:string;rounds:Array<{label:string;matches:PublicBracketMatch[]}>}>|null}
function slotLabel(slot:MatchSlot):string {return slot.kind==='participant'?slot.name:slot.kind==='bye'?'Freilos':slot.kind==='pending'?'Noch offen':'Kein Sieger';}
const matchStatuses:Record<string,string>={WAITING:'Wartend',LIVE:'Läuft',READY:'Zugewiesen',CONFIRMATION:'Bestätigung offen',FINISHED:'Beendet',CANCELLED:'Abgebrochen'};
const statuses:Record<string,string>={DRAFT:'Entwurf',REGISTRATION:'Anmeldung',READY:'Bereit',RUNNING:'Läuft',PAUSED:'Pausiert',FINISHED:'Abgeschlossen',ABORTED:'Abgebrochen'};
export function OnlineSpectatorPage({token}:{token:string}) {
  const [data,setData]=useState<Progress|null>(null);
  const [details,setDetails]=useState<Details|null>(null);
  const [rankings,setRankings]=useState<Rankings|null>(null);
  const [brackets,setBrackets]=useState<Brackets|null>(null);
  const [participant,setParticipant]=useState('');
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [pageIndex,setPageIndex]=useState(0);
  const [message,setMessage]=useState('Turnier wird geladen …');
  const [hallOnly,setHallOnly]=useState(false);
  useEffect(()=>{
    let active=true, failures=0;
    const client=supabase;
    if(!client||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setDetails(null);setRankings(null);setBrackets(null);setMessage('Zuschauerlink ungültig oder nicht verfügbar.');return;}
    async function refresh(signal:AbortSignal) {
      if(!active)return;
      try {
        const result=await client!.rpc('read_online_spectator_bundle',{p_token:token}).abortSignal(signal);
        if(!active)return;
        if(result.error)throw new Error(result.error.message);
        const progress=result.data?.progress as Progress|null;
        const current=<T extends {revision:number}>(value:T|null|undefined):T|null=>progress&&value?.revision===progress.revision?value:null;
        failures=0;
        setData(progress);
        setDetails(current<Details>(result.data?.details));
        setRankings(current<Rankings>(result.data?.rankings));
        setBrackets(current<Brackets>(result.data?.brackets));
        setMessage(progress?'':'Dieser Zuschauerlink ist nicht mehr verfügbar.');
      } catch {if(active){failures++;setData(null);setDetails(null);setRankings(null);setBrackets(null);setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
    }
    const polling=startOnlinePolling(refresh,()=>failures?playerRefreshDelay(true,failures):document.visibilityState==='visible'?10000:30000);
    const focus=()=>{if(document.visibilityState==='visible')polling.refresh();};
    window.addEventListener('focus',focus);window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);
    return()=>{active=false;polling.stop();window.removeEventListener('focus',focus);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',focus);};
  },[token]);
  const names=[...new Set([...(details?.matches??[]).flatMap(m=>[m.sideA,m.sideB]),...(rankings?.rankings??[]).flatMap(t=>t.rows.map(r=>r.name))])].sort((a,b)=>a.localeCompare(b,'de'));
  const selected=names.includes(participant)?participant:'';
  const matches=(details?.matches??[]).filter(m=>(!selected||m.sideA===selected||m.sideB===selected)&&(filter==='all'||(filter==='live'?['LIVE','READY','CONFIRMATION'].includes(m.status):m.status===filter))&&[m.sideA,m.sideB,m.phase,m.round].some(v=>v.toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'))));
  const maxPage=Math.max(0,Math.ceil(matches.length/25)-1);
  const currentPage=Math.min(pageIndex,maxPage);
  const hall=publicHallAssignments(details?.matches??[],data?.tables??0);
  const venue=getVenueTerminology(data?.sport??'');
  return <main className={`main online-spectator${hallOnly?' online-hall-mode':''}`}>
    {!data?<section className="card"><h1>Zuschaueransicht</h1><p role="status">{message}</p></section>:<>
      <header className="dashboard-page-hero"><div><h1>{data.name}</h1><p className="muted">{data.sport} · Zuschaueransicht</p></div><div className="actions"><span className="badge">{statuses[data.status]??data.status}</span>{details&&<button className="btn small" onClick={()=>setHallOnly(v=>!v)}>{hallOnly?'Gesamtübersicht':'Hallenanzeige'}</button>}</div></header>
      <section className="card"><h2>Turnier auf einen Blick</h2><div className="control-metrics-grid">
        <div><span className="muted">Teilnehmer</span><strong>{data.participantCount}</strong></div>
        <div><span className="muted">Belegte Spielflächen</span><strong>{data.occupiedTables}/{data.tables}</strong></div>
        <div><span className="muted">Erfasste Endergebnisse</span><strong>{data.recordedResults}</strong></div>
        <div><span className="muted">Abgeschlossene Phasen</span><strong>{data.phases.filter(p=>p.completed).length}/{data.phases.length}</strong></div>
      </div></section>
      {details&&<section className="card online-hall"><h2>Aktuelle Hallenbelegung</h2>
        {details.matches===null?<p role="status">Belegung wird aktualisiert.</p>:<>
          <p className="muted">{hall.length} veröffentlichte belegte {venue.plural} · {data.tables} insgesamt. Nicht aufgeführte {venue.plural} sind nicht zwingend frei.</p>
          {!hall.length&&<p>Keine laufenden oder zugewiesenen Spiele veröffentlicht.</p>}
          <div className="online-hall-grid">{hall.map(item=><article className="online-hall-tile" key={item.number}>
            <strong className="online-hall-venue">{displayVenueName(data.sport,'Tisch '+item.number)}</strong>
            {item.matches.length>1&&<p role="status">Mehrere Zuordnungen veröffentlicht</p>}
            {item.matches.map((m,i)=><div className="online-hall-match" key={i}><strong>{m.sideA} – {m.sideB}</strong><span className="online-hall-score">{m.score}</span><span className="badge">{matchStatuses[m.status]??m.status}</span><small>{m.phase} · {m.round}</small></div>)}
          </article>)}</div>
        </>}
      </section>}
      {(!hallOnly||!details)&&<>
      <section className="card"><h2>Turnierverlauf</h2>{data.phases.map((phase,index)=><div className="online-catalog-row actions" key={index}><strong>{phase.name||'Phase '+(index+1)}</strong><span className="badge">{phase.completed?'Abgeschlossen':phase.started?'Gestartet':'Ausstehend'}</span></div>)}</section>
      {names.length>0&&<section className="card"><h2>Persönliche Spielübersicht</h2><p className="muted">Filtert die bereits freigegebenen Spiele nach einem Teilnehmer. Keine Anmeldung oder private Spielerberechtigung.</p><label>Teilnehmer auswählen<select aria-label="Teilnehmer auswählen" value={selected} onChange={e=>{setParticipant(e.target.value);setSearch('');setFilter('all');setPageIndex(0);}}><option value="">Alle Teilnehmer</option>{names.map(n=><option key={n} value={n}>{n}</option>)}</select></label>{selected&&<p>Aktuelle und kommende Spiele von <strong>{selected}</strong> findest du unten in der gefilterten Spielübersicht.</p>}</section>}
      {details&&<section className="card"><h2>Spielpaarungen und Ergebnisse</h2>
        {details.matches===null?<p role="status">Die Detailansicht wird für die aktuelle Revision aktualisiert. Bitte die Turnierleitung geöffnet lassen.</p>:<>
          <div className="control-match-filter-fields"><label>Teilnehmer suchen<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPageIndex(0);}} placeholder="Name oder Phase"/></label><label>Status<select aria-label="Spielstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPageIndex(0);}}><option value="all">Alle</option><option value="live">Laufend</option><option value="FINISHED">Beendet</option><option value="WAITING">Wartend</option></select></label></div>
          {(details.total??0)>details.matches.length&&<p className="muted">Auszug: {details.matches.length} von {details.total} Partien.</p>}
          {!matches.length&&<p>Keine passenden Spiele.</p>}
          {matches.slice(currentPage*25,(currentPage+1)*25).map((m,i)=><article className="online-catalog-row" key={currentPage*25+i}>
            <div className="actions"><strong>{m.sideA} – {m.sideB}</strong><strong>{m.score}</strong><span className="badge">{matchStatuses[m.status]??m.status}</span></div>
            <p className="muted">{m.phase} · {m.round}{m.table!=='Noch offen'?' · '+displayVenueName(data.sport,m.table):''}{m.sets.length?' · '+m.sets.map(s=>s.sideAScore+':'+s.sideBScore).join(', '):''}</p>
          </article>)}
          {maxPage>0&&<div className="actions"><button className="btn small" disabled={!currentPage} onClick={()=>setPageIndex(currentPage-1)}>Zurück</button><span>Seite {currentPage+1} / {maxPage+1}</span><button className="btn small" disabled={currentPage===maxPage} onClick={()=>setPageIndex(currentPage+1)}>Weiter</button></div>}
        </>}
      </section>}
      {rankings&&<section className="card"><h2>Ranglisten und Platzierungen</h2>
        {rankings.rankings===null?<p>Ranglisten werden aktualisiert.</p>:rankings.rankings.length===0?<p>Noch keine Ranglisten vorhanden.</p>:rankings.rankings.map((table,index)=>{
          const scoreSport=sportScoring(data.sport).mode==='score';
          return <section className="online-catalog-row" key={index}><h3>{table.phase} · {table.label}</h3>
            <div className="table-wrap"><table className="compact-table spectator-rankings"><thead><tr><th>#</th><th>Teilnehmer</th>
              {table.kind==='FINAL'?<><th>Platzierung</th><th>Status</th></>:<><th>Sp.</th><th>S</th>{scoreSport&&<th>U</th>}<th>N</th>{table.kind==='SWISS'&&<th title="Sonneborn-Berger">SB</th>}{scoreSport?<><th>{sportScoring(data.sport).plural}</th><th>±</th><th>Pkt.</th></>:<><th>Sätze</th><th>±</th><th>Bälle</th><th>±</th></>}</>}
            </tr></thead><tbody>{table.rows.map(r=><tr key={r.name}><td>{r.rank}</td><td><strong>{r.name}</strong></td>
              {'placement' in r?<><td>{r.placement}</td><td>{r.status}</td></>:<><td>{r.played}</td><td>{r.wins}</td>{scoreSport&&<td>{r.draws}</td>}<td>{r.losses}</td>{table.kind==='SWISS'&&<td>{r.buchholz.toLocaleString('de-DE',{maximumFractionDigits:2})}</td>}{scoreSport?<><td>{r.balls}</td><td>{r.ballDifference}</td><td>{r.points}</td></>:<><td>{r.sets}</td><td>{r.setDifference}</td><td>{r.balls}</td><td>{r.ballDifference}</td></>}</>}
            </tr>)}</tbody></table></div>
          </section>;
        })}
      </section>}
      {brackets?.brackets?.map((bracket,bi)=><section className="card" key={bi}><h2>{bracket.phase} · KO-Baum</h2>
        <BracketRoundViewport rounds={bracket.rounds.map((round,ri)=>({...round,matches:round.matches.map((m,mi)=>({...m,id:ri+'-'+mi,live:['LIVE','READY','CONFIRMATION'].includes(m.status)}))}))}
          renderRound={(round,ri)=><div className="bracket-round" key={ri}><h3>{round.label}</h3><div className="bracket-round-matches">{round.matches.map(m=><article className="bracket-match" key={m.id}>
            <span className="muted">{matchStatuses[m.status]??m.status} · {m.score}</span>
            <div className={m.winner==='A'?'winner':''}><strong>{slotLabel(m.a)}</strong></div>
            <div className={m.winner==='B'?'winner':''}><strong>{slotLabel(m.b)}</strong></div>
            {m.sets.length>0&&<small>{m.sets.map(s=>s.sideAScore+':'+s.sideBScore).join(', ')}</small>}
          </article>)}</div></div>}/>
      </section>)}
      </>}
      <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung alle 10 Sekunden. Nur Lesezugriff.</p>
    </>}
  </main>;
}
