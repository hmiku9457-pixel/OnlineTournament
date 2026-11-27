import { BracketRoundViewport } from '@/components/BracketRoundViewport';
import type { MatchSlot } from '@/domain/matchSlots';
import { sportScoring } from '@/domain/sportScoring';
import type { MockStanding } from '@/services/mockCompetitionViews';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Progress {
  name:string; sport:string; status:string; revision:number; updatedAt:string;
  participantCount:number; tables:number; recordedResults:number; occupiedTables:number;
  phases:Array<{name:string|null;type:string;started:boolean;completed:boolean}>;
}
interface MatchDetail {sideA:string;sideB:string;phase:string;round:string;status:string;table:string;score:string;sets:Array<{sideAScore:number;sideBScore:number}>}
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
  useEffect(()=>{
    let active=true, running=false;
    async function refresh() {
      if(running||!active)return;
      if(!supabase||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)){setData(null);setDetails(null);setRankings(null);setBrackets(null);setMessage('Zuschauerlink ungültig oder nicht verfügbar.');return;}
      running=true;
      try {
        const [result,detailResult,rankingResult,bracketResult]=await Promise.all([supabase.rpc('read_online_spectator',{p_token:token}).abortSignal(AbortSignal.timeout(8000)),supabase.rpc('read_online_spectator_details',{p_token:token}).abortSignal(AbortSignal.timeout(8000)),supabase.rpc('read_online_spectator_rankings',{p_token:token}).abortSignal(AbortSignal.timeout(8000)),supabase.rpc('read_online_spectator_brackets',{p_token:token}).abortSignal(AbortSignal.timeout(8000))]);
        if(!active)return;
        if(result.error)throw new Error(result.error.message);
        setData(result.data as Progress|null);
        setDetails(!detailResult.error&&result.data&&detailResult.data?.revision===result.data.revision?detailResult.data as Details:null);
        setRankings(!rankingResult.error&&result.data&&rankingResult.data?.revision===result.data.revision?rankingResult.data as Rankings:null);
        setBrackets(!bracketResult.error&&result.data&&bracketResult.data?.revision===result.data.revision?bracketResult.data as Brackets:null);
        setMessage(result.data?'':'Dieser Zuschauerlink ist nicht mehr verfügbar.');
      } catch {if(active){setData(null);setDetails(null);setRankings(null);setBrackets(null);setMessage('Verbindung unterbrochen. Erneuter Versuch erfolgt automatisch.');}}
      finally{running=false;}
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),10000);
    const focus=()=>void refresh();
    window.addEventListener('focus',focus);window.addEventListener('online',focus);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
  },[token]);
  const names=[...new Set([...(details?.matches??[]).flatMap(m=>[m.sideA,m.sideB]),...(rankings?.rankings??[]).flatMap(t=>t.rows.map(r=>r.name))])].sort((a,b)=>a.localeCompare(b,'de'));
  const selected=names.includes(participant)?participant:'';
  const matches=(details?.matches??[]).filter(m=>(!selected||m.sideA===selected||m.sideB===selected)&&(filter==='all'||(filter==='live'?['LIVE','READY','CONFIRMATION'].includes(m.status):m.status===filter))&&[m.sideA,m.sideB,m.phase,m.round].some(v=>v.toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'))));
  const maxPage=Math.max(0,Math.ceil(matches.length/25)-1);
  const currentPage=Math.min(pageIndex,maxPage);
  return <main className="main online-spectator">
    {!data?<section className="card"><h1>Zuschaueransicht</h1><p role="status">{message}</p></section>:<>
      <header className="dashboard-page-hero"><div><h1>{data.name}</h1><p className="muted">{data.sport} · Zuschaueransicht</p></div><span className="badge">{statuses[data.status]??data.status}</span></header>
      <section className="card"><h2>Turnier auf einen Blick</h2><div className="control-metrics-grid">
        <div><span className="muted">Teilnehmer</span><strong>{data.participantCount}</strong></div>
        <div><span className="muted">Belegte Spielflächen</span><strong>{data.occupiedTables}/{data.tables}</strong></div>
        <div><span className="muted">Erfasste Endergebnisse</span><strong>{data.recordedResults}</strong></div>
        <div><span className="muted">Abgeschlossene Phasen</span><strong>{data.phases.filter(p=>p.completed).length}/{data.phases.length}</strong></div>
      </div></section>
      <section className="card"><h2>Turnierverlauf</h2>{data.phases.map((phase,index)=><div className="online-catalog-row actions" key={index}><strong>{phase.name||'Phase '+(index+1)}</strong><span className="badge">{phase.completed?'Abgeschlossen':phase.started?'Gestartet':'Ausstehend'}</span></div>)}</section>
      {names.length>0&&<section className="card"><h2>Persönliche Spielübersicht</h2><p className="muted">Filtert die bereits freigegebenen Spiele nach einem Teilnehmer. Keine Anmeldung oder private Spielerberechtigung.</p><label>Teilnehmer auswählen<select aria-label="Teilnehmer auswählen" value={selected} onChange={e=>{setParticipant(e.target.value);setSearch('');setFilter('all');setPageIndex(0);}}><option value="">Alle Teilnehmer</option>{names.map(n=><option key={n} value={n}>{n}</option>)}</select></label>{selected&&<p>Aktuelle und kommende Spiele von <strong>{selected}</strong> findest du unten in der gefilterten Spielübersicht.</p>}</section>}
      {details&&<section className="card"><h2>Spielpaarungen und Ergebnisse</h2>
        {details.matches===null?<p role="status">Die Detailansicht wird für die aktuelle Revision aktualisiert. Bitte die Turnierleitung geöffnet lassen.</p>:<>
          <div className="control-match-filter-fields"><label>Teilnehmer suchen<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPageIndex(0);}} placeholder="Name oder Phase"/></label><label>Status<select aria-label="Spielstatus" value={filter} onChange={e=>{setFilter(e.target.value);setPageIndex(0);}}><option value="all">Alle</option><option value="live">Laufend</option><option value="FINISHED">Beendet</option><option value="WAITING">Wartend</option></select></label></div>
          {(details.total??0)>details.matches.length&&<p className="muted">Auszug: {details.matches.length} von {details.total} Partien.</p>}
          {!matches.length&&<p>Keine passenden Spiele.</p>}
          {matches.slice(currentPage*25,(currentPage+1)*25).map((m,i)=><article className="online-catalog-row" key={currentPage*25+i}>
            <div className="actions"><strong>{m.sideA} – {m.sideB}</strong><strong>{m.score}</strong><span className="badge">{matchStatuses[m.status]??m.status}</span></div>
            <p className="muted">{m.phase} · {m.round}{m.table!=='Noch offen'?' · '+m.table:''}{m.sets.length?' · '+m.sets.map(s=>s.sideAScore+':'+s.sideBScore).join(', '):''}</p>
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
      <p className="muted">Bestätigter Stand: {new Date(data.updatedAt).toLocaleString('de-DE')} · Revision {data.revision} · Aktualisierung alle 10 Sekunden. Nur Lesezugriff.</p>
    </>}
  </main>;
}
