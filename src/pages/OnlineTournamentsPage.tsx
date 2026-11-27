import type { PendingOnlineOperation } from '@/services/onlineOutbox';
import { backupTournamentName, type TournamentBackup } from '@/services/localTournamentStorage';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { useAccount } from '@/lib/useAccount';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { createOnlineTournamentFromLocal, listPendingOnlineCreations, listOnlineCatalog, setOnlineArchive, loadConfirmedOnlineBackup, onlineWorkspaceUrl, listOnlineCheckpoints, loadOnlineCheckpoint, manageOnlineSpectator, onlineSpectatorUrl, spectatorDetailSetting, listOnlinePlayerAccess, manageOnlinePlayerAccess, batchOnlinePlayerAccess, onlinePlayerUrl, type OnlinePlayerAccess, type OnlineCheckpoint, type OnlineCatalogItem } from '@/services/onlineTournaments';

const statuses: Record<string,string> = {DRAFT:'Entwurf',REGISTRATION:'Anmeldung',READY:'Bereit',RUNNING:'Läuft',PAUSED:'Pausiert',FINISHED:'Abgeschlossen',ABORTED:'Abgebrochen'};
function download(backup:TournamentBackup,revision:number) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='turnier-'+backup.tournamentId+'-r'+revision+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function OnlineTournamentsPage() {
  const {session,loading}=useAccount();
  if(loading) return <p>Konto wird geladen …</p>;
  return <div className="tournament-dashboard">
    <header className="dashboard-page-hero"><div><h1>Online-Turniere</h1><p className="muted">Experimenteller Entwicklungsmodus – noch nicht für echte Veranstaltungen freigegeben.</p></div><Link className="btn" to="/">Lokale Turniere</Link></header>
    {session?.user.id ? <OnlineCatalog key={session.user.id}/> : <div className="card"><p>Bitte melde dich an, um Online-Turniere anzulegen.</p><Link className="btn primary" to="/login">Anmelden</Link></div>}
  </div>;
}
function OnlineCatalog() {
  const [items,setItems]=useState<OnlineCatalogItem[]>([]);
  const [pendingCreations,setPendingCreations]=useState<PendingOnlineOperation[]>([]);
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [history,setHistory]=useState<{id:string;rows:OnlineCheckpoint[]}|null>(null);
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('active');
  const [confirm,setConfirm]=useState<OnlineCatalogItem|null>(null);
  const [share,setShare]=useState<{item:OnlineCatalogItem;token:string|null;details:boolean}|null>(null);
  const [players,setPlayers]=useState<{item:OnlineCatalogItem;rows:OnlinePlayerAccess[]}|null>(null);
  const [playerSearch,setPlayerSearch]=useState('');
  const [playerFilter,setPlayerFilter]=useState('all');
  const [playerBatch,setPlayerBatch]=useState<'enable'|'disable'|null>(null);
  const [qrParticipant,setQrParticipant]=useState('');
  const [spectatorQr,setSpectatorQr]=useState(false);
  const alive=useRef(true);
  const running=useRef(false);
  const local=getAllMockTournaments().filter(t=>!t.hasStarted && ['DRAFT','REGISTRATION','READY'].includes(t.status));
  async function refresh() {
    const [rows,pending]=await Promise.all([listOnlineCatalog(),listPendingOnlineCreations()]);
    if(alive.current){setItems(rows);setPendingCreations(pending);setLoaded(true);}
  }
  useEffect(()=>{
    let current=true;
    alive.current=true;
    Promise.all([listOnlineCatalog(),listPendingOnlineCreations()]).then(([rows,pending])=>{
      if(current){setItems(rows);setPendingCreations(pending);setLoaded(true);}
    }).catch((e:unknown)=>{if(current)setMessage(e instanceof Error?e.message:'Laden fehlgeschlagen.');});
    return ()=>{current=false;alive.current=false;};
  },[]);
  async function run(action:()=>Promise<void>) {
    if(running.current)return;
    running.current=true;setBusy(true);setMessage('');
    try{await action();}
    catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Aktion fehlgeschlagen.');}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  const visible=items.filter(item=>(filter==='all'||(filter==='active'?!item.archived_at:filter==='archived'?!!item.archived_at:!item.archived_at&&item.status===filter))&&item.name.toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE')));
  return <>
    {message && <p className="callout" role="status">{message}</p>}
    {pendingCreations.length>0 && <section className="card"><h2>Unbestätigte Turniererstellungen</h2><p>Bitte kläre diese Anfragen vor einer weiteren Online-Erstellung.</p>{pendingCreations.map(op=><div className="actions" key={op.operationId}><strong>{backupTournamentName(op.snapshot)}</strong><a className="btn primary" href={onlineWorkspaceUrl(op.tournamentId)}>Erstellung wiederherstellen</a></div>)}</section>}
    <section className="card"><h2>Meine Online-Testturniere</h2>
      <p className="muted">Online-Turniere sind unabhängig vom lokalen Browserspeicher. Eine exklusive Bearbeitungssperre verhindert parallele Änderungen.</p>
      <div className="control-match-filter-fields">
        <label>Turnier suchen<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name eingeben …"/></label>
        <label htmlFor="online-catalog-filter">Anzeige<select id="online-catalog-filter" aria-label="Anzeige" value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Nicht archiviert</option><option value="archived">Archiviert</option><option value="all">Alle Turniere</option>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button className="btn small" disabled={busy} onClick={()=>void run(refresh)}>Aktualisieren</button>
      </div>
      <p className="muted">{loaded?visible.length+' von '+items.length+' Turnieren':'Turnierliste wird geladen oder ist nicht verfügbar.'}</p>
      {loaded&&!visible.length && <p>Keine passenden Online-Turniere vorhanden.</p>}
      {visible.map(item=><article className="online-catalog-row" key={item.id}>
        <div className="actions"><strong>{item.name}</strong><span className="badge">{statuses[item.status]??item.status}</span>{item.archived_at&&<span className="badge">Archiviert</span>}{item.editing&&<span className="badge live">In Bearbeitung</span>}</div>
        <p className="muted">Revision {item.revision} · Zuletzt geändert: {new Date(item.updated_at).toLocaleString('de-DE')}</p>
        <div className="actions">
          {!item.archived_at&&<a className="btn primary" href={onlineWorkspaceUrl(item.id)}>Online-Turnierleitung öffnen</a>}
          <button className="btn small" disabled={busy} onClick={()=>void run(async()=>{const result=await loadConfirmedOnlineBackup(item.id);if(alive.current)download(result.backup,result.revision);})}>JSON sichern</button>
          <button className="btn small" disabled={busy} onClick={()=>void run(async()=>{const rows=await listOnlineCheckpoints(item.id);if(alive.current)setHistory({id:item.id,rows});})}>Wiederherstellungspunkte</button>
          <button className="btn small" disabled={busy||!!item.archived_at} onClick={()=>void run(async()=>{const token=await manageOnlineSpectator(item.id,'read');const details=token?await spectatorDetailSetting(item.id):false;if(alive.current)setShare({item,token,details});})}>Zuschauerlink</button>
          <button className="btn small" disabled={busy||!!item.archived_at} onClick={()=>void run(async()=>{const rows=await listOnlinePlayerAccess(item.id);if(alive.current){setPlayerSearch('');setPlayerFilter('all');setPlayerBatch(null);setPlayers({item,rows});}})}>Spielerzugänge</button>
          <button className="btn small" disabled={busy||item.editing||(!item.archived_at&&!['DRAFT','REGISTRATION','READY','FINISHED','ABORTED'].includes(item.status))} onClick={()=>setConfirm(item)}>{item.archived_at?'Archivierung aufheben':'Archivieren'}</button>
        </div>
      </article>)}
      {history&&<div className="card" style={{marginTop:12}}><div className="actions"><h3>Wiederherstellungspunkte</h3><button className="btn small" onClick={()=>setHistory(null)}>Schließen</button></div>
        <p className="muted">Bis zu 20 Revisionen (maximal 16 MiB je Turnier). Der aktive Datenbankstand bleibt unverändert.</p>
        {history.rows.map(row=><div className="actions" key={row.revision}><strong>Revision {row.revision}</strong><span>{new Date(row.created_at).toLocaleString('de-DE')}</span><button className="btn small" disabled={busy} onClick={()=>void run(async()=>{const backup=await loadOnlineCheckpoint(history.id,row.revision);if(alive.current)download(backup,row.revision);})}>JSON herunterladen</button></div>)}
      </div>}
    </section>
    <section className="card"><h2>Online-Testturnier vorbereiten</h2><p className="muted">Neues Online-Turnier erstellen oder ungestartetes lokales Turnier als unabhängige Kopie übernehmen.</p>
      <Link className="btn primary" to="/tournaments/new?mode=online">Neues Online-Turnier erstellen</Link>
      {local.map(t=><div key={t.id} className="actions" style={{marginTop:12}}><strong>{t.name}</strong><button className="btn small primary" disabled={busy||!loaded||pendingCreations.length>0||items.some(i=>i.id===t.id)} onClick={()=>void run(async()=>{try{await createOnlineTournamentFromLocal(t.id);if(alive.current)setMessage('Online-Testturnier angelegt. Lokale und Online-Version sind unabhängig.');}finally{await refresh();}})}>Als Online-Testturnier anlegen</button></div>)}
    </section>
    {players&&<div className="prototype-modal-backdrop" onMouseDown={()=>!busy&&setPlayers(null)}><section className="prototype-modal online-player-access-modal" role="dialog" aria-modal="true" aria-labelledby="players-title" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setPlayers(null);}}>
      <h2 id="players-title">Spielerzugänge · {players.item.name}</h2>
      <p>Ein persönlicher Link erlaubt das Lesen eigener Begegnungen sowie die Meldung und gegenseitige Bestätigung regulärer Endergebnisse. Die Turnierleitung übernimmt das verbindliche Ergebnis. Kein Benutzerkonto erforderlich. Links vertraulich an die jeweiligen Teilnehmer weitergeben. Die öffentliche Zuschauerfreigabe ist unabhängig.</p>
      <div className="actions"><span className="badge">{players.rows.filter(r=>r.token).length} / {players.rows.length} freigegeben</span><button className="btn small primary" disabled={busy||players.rows.every(r=>r.token)} onClick={()=>setPlayerBatch('enable')}>Alle fehlenden Zugänge erstellen</button><button className="btn small danger" disabled={busy||players.rows.every(r=>!r.token)} onClick={()=>setPlayerBatch('disable')}>Alle Zugänge widerrufen</button></div>
      {playerBatch&&<div className="card" role="dialog" aria-label="Sammeländerung Spielerzugänge"><p>{playerBatch==='enable'?'Für alle Teilnehmer ohne Zugang einen persönlichen Link erstellen? Bestehende Links bleiben gültig.':'Alle Spielerlinks widerrufen? Bereits gemeldete Ergebnisse bleiben erhalten.'}</p><div className="actions"><button className="btn" disabled={busy} onClick={()=>setPlayerBatch(null)}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={()=>void run(async()=>{const ids=players.rows.filter(r=>playerBatch==='enable'?!r.token:!!r.token).map(r=>r.participant_id);await batchOnlinePlayerAccess(players.item.id,ids,playerBatch);const rows=await listOnlinePlayerAccess(players.item.id);if(alive.current){setPlayers({...players,rows});setPlayerBatch(null);}})}>Sammeländerung bestätigen</button></div></div>}
      <div className="actions"><label>Teilnehmer suchen<input type="search" value={playerSearch} onChange={e=>setPlayerSearch(e.target.value)}/></label><label>Spielerzugänge<select aria-label="Zugangsstatus" value={playerFilter} onChange={e=>setPlayerFilter(e.target.value)}><option value="all">Alle</option><option value="enabled">Freigegeben</option><option value="disabled">Gesperrt</option></select></label></div>
      <div className="online-player-access-list">{players.rows.filter(r=>(playerFilter==='all'||(playerFilter==='enabled'?!!r.token:!r.token))&&r.name.toLocaleLowerCase('de-DE').includes(playerSearch.trim().toLocaleLowerCase('de-DE'))).map(r=><article key={r.participant_id} className="online-catalog-row"><div className="actions"><strong>{r.name}</strong><span className="badge">{r.token?'Freigegeben':'Gesperrt'}</span></div>
      {r.token&&<label>Persönlicher Link<input readOnly aria-label={'Link für '+r.name} value={onlinePlayerUrl(r.token)} onFocus={e=>e.target.select()}/></label>}
      {r.token&&qrParticipant===r.participant_id&&<div className="online-qr"><QRCodeSVG value={onlinePlayerUrl(r.token)} size={196} marginSize={4} title={'Persönlicher QR-Code für '+r.name}/><p className="muted">Nur an diesen Teilnehmer weitergeben.</p></div>}
      <div className="actions">{r.token&&<><button className="btn small" onClick={()=>setQrParticipant(current=>current===r.participant_id?'':r.participant_id)}>{qrParticipant===r.participant_id?'QR-Code ausblenden':'QR-Code anzeigen'}</button><a className="btn small" href={onlinePlayerUrl(r.token)} target="_blank" rel="noopener noreferrer">Öffnen</a><button className="btn small" disabled={busy} onClick={()=>void run(async()=>{if(!navigator.clipboard)throw new Error('Bitte den persönlichen Link manuell kopieren.');await navigator.clipboard.writeText(onlinePlayerUrl(r.token!));if(alive.current)setMessage('Persönlicher Link kopiert.');})}>Link kopieren</button></>}
      {(r.token?['rotate','disable']:['enable']).map(action=><button key={action} className="btn small" disabled={busy} onClick={()=>void run(async()=>{await manageOnlinePlayerAccess(players.item.id,r.participant_id,action as 'enable'|'rotate'|'disable');const rows=await listOnlinePlayerAccess(players.item.id);if(alive.current)setPlayers({...players,rows});})}>{action==='enable'?'Zugang erstellen':action==='rotate'?'Neuer Link':'Widerrufen'}</button>)}</div></article>)}</div>
      <div className="online-player-access-footer">{message&&<p role="status">{message}</p>}<button className="btn" disabled={busy} onClick={()=>setPlayers(null)}>Schließen</button></div>
    </section></div>}
    {share&&<div className="prototype-modal-backdrop" onMouseDown={()=>!busy&&setShare(null)}><section className="prototype-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setShare(null);}}>
      <h2 id="share-title">Zuschauerlink · {share.item.name}</h2>
      <p>Jeder mit dem Link kann ohne Anmeldung den Turnierfortschritt sehen. Standardmäßig werden nur Turnier- und Phasennamen, Status und aggregierte Spielzahlen veröffentlicht. Codes und interne Sicherungen bleiben privat. Verwende nur öffentlich geeignete Bezeichnungen.</p>
      {share.token?<>{spectatorQr&&<div className="online-qr"><QRCodeSVG value={onlineSpectatorUrl(share.token)} size={196} marginSize={4} title="QR-Code für die Zuschaueransicht"/></div>}<button className="btn small" onClick={()=>setSpectatorQr(v=>!v)}>{spectatorQr?'QR-Code ausblenden':'QR-Code anzeigen'}</button><label>Freigabelink<input readOnly value={onlineSpectatorUrl(share.token)} onFocus={e=>e.target.select()}/></label><div className="actions"><a className="btn" href={onlineSpectatorUrl(share.token)} target="_blank" rel="noopener noreferrer">Zuschaueransicht öffnen</a><button className="btn" disabled={busy} onClick={()=>void run(async()=>{const token=await manageOnlineSpectator(share.item.id,'rotate');if(alive.current)setShare({...share,token,details:false});})}>Neuen Link erzeugen</button><button className="btn danger" disabled={busy} onClick={()=>void run(async()=>{await manageOnlineSpectator(share.item.id,'disable');if(alive.current)setShare({...share,token:null,details:false});})}>Freigabe beenden</button></div></>:<button className="btn primary" disabled={busy} onClick={()=>void run(async()=>{const token=await manageOnlineSpectator(share.item.id,'enable');if(alive.current)setShare({...share,token});})}>Zuschaueransicht freigeben</button>}
      {share.token&&<div className="card"><h3>Spielpaarungen und Ergebnisse</h3><p>Optional: Teilnehmernamen, Paarungen, Spielorte, Ergebnisse und Ranglisten werden für jeden mit diesem Link sichtbar. Aktiviere dies nur, wenn diese Daten veröffentlicht werden dürfen. Die Turnierleitung muss zum Aktualisieren geöffnet sein.</p><label><input type="checkbox" checked={share.details} disabled={busy} onChange={e=>{const enabled=e.target.checked;void run(async()=>{const details=await spectatorDetailSetting(share.item.id,enabled);if(alive.current)setShare({...share,details});});}}/> Teilnehmernamen und Spielergebnisse freigeben</label></div>}
      {message&&<p role="alert">{message}</p>}<button className="btn" disabled={busy} onClick={()=>setShare(null)}>Schließen</button>
    </section></div>}
    {confirm&&<div className="prototype-modal-backdrop" onMouseDown={()=>!busy&&setConfirm(null)}><section className="prototype-modal" role="dialog" aria-modal="true" aria-labelledby="archive-title" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setConfirm(null);}}>
      <h2 id="archive-title">{confirm.archived_at?'Archivierung aufheben?':'Turnier archivieren?'}</h2><p><strong>{confirm.name}</strong></p><p>{confirm.archived_at?'Das Turnier erscheint wieder in der aktiven Übersicht.':'Das Turnier wird ausgeblendet und kann nicht bearbeitet werden. Ergebnisse und Sicherungen bleiben vollständig erhalten.'}</p>
      <div className="actions"><button className="btn" autoFocus disabled={busy} onClick={()=>setConfirm(null)}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={()=>void run(async()=>{await setOnlineArchive(confirm,!confirm.archived_at);if(alive.current)setConfirm(null);await refresh();})}>{confirm.archived_at?'Wieder anzeigen':'Archivieren'}</button></div>
    </section></div>}
  </>;
}
