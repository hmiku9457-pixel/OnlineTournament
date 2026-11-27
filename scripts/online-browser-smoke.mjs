import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// No hosted credentials or production data: exercise the real client and browser
// against a deliberately controlled HTTP contract. Actual SQL is tested separately.
const base = process.env.E2E_ONLINE_BASE_URL ?? 'http://127.0.0.1:4174';
const api = 'https://online-smoke.supabase.co';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated',
  role: 'authenticated', email: 'online-smoke@example.invalid', app_metadata: {}, user_metadata: {},
  created_at: '2026-01-01T00:00:00Z', is_anonymous: false };
const exp = Math.floor(Date.now()/1000)+3600;
const segment = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = segment({alg:'HS256',typ:'JWT'})+'.'+segment({sub:user.id,role:'authenticated',exp})+'.smoke';
const session = { access_token: accessToken, refresh_token:'smoke-refresh', token_type:'bearer', expires_in:3600, expires_at:exp, user };
const rows = new Map(), operations = new Map(), leases = new Map(), archives = new Map(), spectatorLinks = new Map(), detailSettings = new Set(), detailRows = new Map(), rankingRows = new Map(), calls = [];
let loseResponses = 0;
async function install(context) {
  await context.route(api+'/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
    const send = (body, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) });
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
    if(path==='/auth/v1/token') return send(session);
    if(path==='/auth/v1/user') return send(user);
    const body = req.method()==='POST' ? req.postDataJSON() : {};
    if(path.endsWith('/manage_online_spectator')) {
      assert.equal(req.headers()['authorization'],'Bearer '+accessToken,'only authenticated owner manages links');
      if(body.p_action==='disable'||body.p_action==='rotate'){spectatorLinks.delete(body.p_id);detailSettings.delete(body.p_id);detailRows.delete(body.p_id);rankingRows.delete(body.p_id);}
      if(body.p_action==='enable'&&!spectatorLinks.has(body.p_id)||body.p_action==='rotate') spectatorLinks.set(body.p_id,crypto.randomUUID());
      return send(spectatorLinks.get(body.p_id)??null);
    }
    if(path.endsWith('/online_spectator_detail_setting')) {
      assert.equal(req.headers()['authorization'],'Bearer '+accessToken);
      if(body.p_enabled===true)detailSettings.add(body.p_id);
      if(body.p_enabled===false){detailSettings.delete(body.p_id);detailRows.delete(body.p_id);rankingRows.delete(body.p_id);}
      return send(detailSettings.has(body.p_id));
    }
    if(path.endsWith('/publish_online_spectator_matches')) {
      if(!detailSettings.has(body.p_id))return send(false);
      assert.equal(leases.get(body.p_id),body.p_token);
      if(rows.get(body.p_id).revision!==body.p_revision)return send({code:'40001',message:'revision conflict'},409);
      for(const m of body.p_matches)assert.deepEqual(Object.keys(m).sort(),['phase','round','score','sets','sideA','sideB','status','table']);
      detailRows.set(body.p_id,{revision:body.p_revision,matches:body.p_matches,total:body.p_total});
      return send(true);
    }
    if(path.endsWith('/publish_online_spectator_rankings')) {
      if(!detailSettings.has(body.p_id))return send(false);
      assert.equal(leases.get(body.p_id),body.p_token);
      if(rows.get(body.p_id).revision!==body.p_revision)return send({code:'40001',message:'revision conflict'},409);
      rankingRows.set(body.p_id,{revision:body.p_revision,rankings:body.p_rankings});
      return send(true);
    }
    if(path.endsWith('/read_online_spectator_rankings')) {
      const id=[...spectatorLinks].find(([,token])=>token===body.p_token)?.[0];
      if(!id||!detailSettings.has(id)||archives.has(id))return send(null);
      const revision=rows.get(id).revision;
      return send(rankingRows.get(id)?.revision===revision?rankingRows.get(id):{revision,rankings:null});
    }
    if(path.endsWith('/read_online_spectator_details')) {
      const id=[...spectatorLinks].find(([,token])=>token===body.p_token)?.[0];
      if(!id||!detailSettings.has(id)||archives.has(id))return send(null);
      const revision=rows.get(id).revision;
      return send(detailRows.get(id)?.revision===revision?detailRows.get(id):{revision,matches:null,total:null});
    }
    if(path.endsWith('/read_online_spectator')) {
      const id=[...spectatorLinks].find(([,token])=>token===body.p_token)?.[0];
      if(!id || archives.has(id))return send(null);
      const row=rows.get(id);
      const t=JSON.parse(row.payload.entries['online-tournament:local-prototype-tournaments:v1:record:'+id]).tournament;
      return send({name:row.name,sport:t.sport,status:t.status,revision:row.revision,updatedAt:row.updated_at,participantCount:t.participantNames.length,tables:t.tables,recordedResults:0,occupiedTables:0,phases:t.stages.map(p=>({name:p.name,type:p.type,started:false,completed:false}))});
    }
    if(path.endsWith('/catalog_online_tournaments')) return send([...rows.values()].map(({payload,...row})=>({...row,status:JSON.parse(payload.entries['online-tournament:local-prototype-tournaments:v1:record:'+row.id]).tournament.status,archived_at:archives.get(row.id)??null,editing:leases.has(row.id)})));
    if(path.endsWith('/set_online_tournament_archive')) {
      if(rows.get(body.p_id)?.revision!==body.p_revision) return send({code:'40001',message:'revision conflict'},409);
      if(leases.has(body.p_id)) return send({code:'55P03',message:'workspace active'},409);
      if(body.p_archived) {archives.set(body.p_id,new Date().toISOString());spectatorLinks.delete(body.p_id);} else archives.delete(body.p_id);
      return send(true);
    }
    if(path.endsWith('/list_online_tournaments')) return send([...rows.values()].map(({payload,...row})=>row));
    if(path.endsWith('/load_online_tournament')) return send(rows.get(body.p_id) ?? {message:'Not found',code:'42501'},rows.has(body.p_id)?200:403);
    if(path.endsWith('/claim_online_workspace')) {
      const token=leases.get(body.p_id);
      if(body.p_renew && token!==body.p_token) return send(false);
      if(token && token!==body.p_token) return send(false);
      leases.set(body.p_id,body.p_token);
      return send(true);
    }
    if(path.endsWith('/release_online_workspace')) {
      if(leases.get(body.p_id)!==body.p_token) return send(false);
      leases.delete(body.p_id);return send(true);
    }
    if(path.endsWith('/commit_online_tournament') || path.endsWith('/commit_leased_online_tournament')) {
      if(body.p_expected_revision>0 && (!body.p_token || leases.get(body.p_id)!==body.p_token))
        return send({code:'55P03',message:'workspace lease missing or expired'},409);
      calls.push(structuredClone(body));
      const key=body.p_id+':'+body.p_operation_id;
      let rev;
      if(operations.has(key)) {
        const previous=operations.get(key);
        const {p_token: _currentToken,...request}=body;
        const {p_token: _previousToken,...original}=previous.body;
        assert.deepEqual(request,original,'retry must send identical sporting operation');
        rev=previous.rev;
      } else {
        const current=rows.get(body.p_id)?.revision ?? 0;
        if(current!==body.p_expected_revision) return send({code:'40001',message:'revision conflict'},409);
        rev=current+1;
        rows.set(body.p_id,{id:body.p_id,name:body.p_name,revision:rev,payload:body.p_payload,updated_at:new Date().toISOString()});
        operations.set(key,{body:structuredClone(body),rev});
      }
      if(loseResponses>0) { loseResponses--; return send({message:'gateway unavailable',code:''},503); }
      return send(rev);
    }
    if(path.endsWith('/tournament_health_check')) return send(true);
    throw new Error('Unexpected mock API path: '+path);
  });
}
async function login(page) {
  await page.goto(base+'/#/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('synthetic-test-password');
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await page.getByRole('heading',{name:'Mein Konto'}).waitFor();
}
const confirmed = page => page.getByText('Datenbankstand bestätigt',{exact:true}).waitFor();
try {
  const first = await browser.newContext(), second = await browser.newContext();
  await install(first); await install(second);
  const a=await first.newPage(), b=await second.newPage();
  await login(a);
  const id = await a.evaluate(async () => {
    const {prepareOnlineCreation,commitOnlineCreation}=await import('/src/services/onlineTournaments.ts');
    const {getAllMockTournaments}=await import('/src/services/mockTournamentStore.ts');
    const prepared=await prepareOnlineCreation({name:'Online Browser Abnahme',sport:'table_tennis',discipline:'SINGLES',
      tables:2,minimumMatches:1,estimatedDurationMinutes:60,participantNames:['Anna','Bernd','Clara','Dieter'],
      phases:[{type:'ROUND_ROBIN',label:'Liga',bestOf:1,entrantCount:4,groupCount:1,swissRounds:1,knockoutBestOf:[]}]});
    await commitOnlineCreation(prepared);
    if(getAllMockTournaments().some(t=>t.id===prepared.tournament.id)) throw new Error('Local record leaked');
    return prepared.tournament.id;
  });
  assert.equal(rows.get(id).revision,1);
  await a.goto(base+'/#/online');
  await a.getByRole('button',{name:'Archivieren',exact:true}).click();
  await a.getByRole('dialog',{name:'Turnier archivieren?'}).getByRole('button',{name:'Archivieren',exact:true}).click();
  await a.getByText('Keine passenden Online-Turniere vorhanden.').waitFor();
  await a.getByLabel('Anzeige',{exact:true}).selectOption('archived');
  await a.getByRole('button',{name:'Archivierung aufheben',exact:true}).click();
  await a.getByRole('dialog',{name:'Archivierung aufheben?'}).getByRole('button',{name:'Wieder anzeigen'}).click();
  await a.getByText('Keine passenden Online-Turniere vorhanden.').waitFor();
  await a.getByLabel('Anzeige',{exact:true}).selectOption('active');
  assert.equal(rows.get(id).revision,1);
  // A fresh anonymous browser sees only the allowlisted progress projection.
  const spectator=await browser.newContext();
  await install(spectator);
  const viewer=await spectator.newPage();
  await a.getByRole('button',{name:'Zuschauerlink',exact:true}).click();
  const share=a.getByRole('dialog',{name:/Zuschauerlink/});
  await share.getByRole('button',{name:'Zuschaueransicht freigeben'}).click();
  const viewerLink=await share.getByRole('link',{name:'Zuschaueransicht öffnen'}).getAttribute('href');
  assert.ok(viewerLink);
  await viewer.goto(viewerLink);
  await viewer.getByRole('heading',{name:'Online Browser Abnahme'}).waitFor();
  assert.equal(await viewer.getByText('Anna',{exact:true}).count(),0);
  assert.equal(await viewer.getByRole('button',{name:'Turnier starten'}).count(),0);
  await share.getByRole('button',{name:'Neuen Link erzeugen'}).click();
  await a.waitForFunction(old=>document.querySelector('a[href*="/watch/"]')?.getAttribute('href')!==old,viewerLink);
  await viewer.reload();
  await viewer.getByText('Dieser Zuschauerlink ist nicht mehr verfügbar.').waitFor();
  const newLink=await share.getByRole('link',{name:'Zuschaueransicht öffnen'}).getAttribute('href');
  await share.getByRole('checkbox',{name:'Teilnehmernamen und Spielergebnisse freigeben'}).click();
  await share.locator('input[type="checkbox"]:checked').waitFor();
  await viewer.goto(newLink);
  await viewer.getByText(/Die Detailansicht wird für die aktuelle Revision aktualisiert/).waitFor();
  await share.getByRole('button',{name:'Schließen'}).click();
  await a.getByRole('link',{name:'Online-Turnierleitung öffnen'}).click();
  await confirmed(a);
  await a.locator('#app-build-version').waitFor({state:'visible'});
  await a.getByRole('button',{name:'Turnier starten',exact:true}).click();
  await a.getByRole('button',{name:'Jetzt starten',exact:true}).click();
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await confirmed(a);
  // Explicit check publishes the latest confirmed fixture list.
  await a.getByRole('button',{name:'Datenbankstand prüfen',exact:true}).click();
  await a.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.includes('Prüfe …')));
  // The director's heartbeat retries automatically if a publication was busy.
  await viewer.reload();
  await viewer.getByRole('heading',{name:'Spielpaarungen und Ergebnisse'}).waitFor();
  await viewer.getByText(/Anna – | – Anna/).first().waitFor({timeout:45000});
  assert.ok(detailRows.get(id)?.matches.length>0);
  assert.equal(detailRows.get(id).revision,rows.get(id).revision);
  await viewer.getByRole('heading',{name:'Ranglisten und Platzierungen'}).waitFor();
  await viewer.getByRole('cell',{name:'Anna',exact:true}).waitFor({timeout:45000});
  assert.equal(rankingRows.get(id).revision,rows.get(id).revision);
  await spectator.close();
  // The server commits, but both automatic HTTP responses are lost.
  loseResponses=2;
  const before=rows.get(id).revision;
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).click();
  await a.getByRole('button',{name:'Speicherung erneut versuchen'}).waitFor({timeout:45000});
  assert.equal(rows.get(id).revision,before+1);
  const pauseCalls=calls.filter(c=>c.p_id===id && c.p_expected_revision===before);
  assert.ok(pauseCalls.length>=2);
  assert.equal(new Set(pauseCalls.map(c=>c.p_operation_id)).size,1);
  await a.getByRole('button',{name:'Speicherung erneut versuchen'}).click();
  await confirmed(a);
  await a.getByRole('button',{name:'Turnier fortsetzen',exact:true}).waitFor();
  assert.equal(rows.get(id).revision,before+1);
  // A second browser cannot edit until the first explicitly releases.
  await login(b);
  await b.goto(base+'/#/online');
  await b.getByRole('link',{name:'Online-Turnierleitung öffnen'}).click();
  await b.getByRole('heading',{name:'Turnier wird bereits bearbeitet'}).waitFor();
  await a.getByRole('button',{name:'Bearbeitung freigeben und zurück'}).click();
  await a.getByRole('heading',{name:'Online-Turniere',exact:true}).waitFor();
  await b.getByRole('button',{name:'Erneut versuchen'}).click();
  await confirmed(b);
  await b.getByRole('button',{name:'Turnier fortsetzen',exact:true}).click();
  await b.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await confirmed(b);
  await b.getByRole('button',{name:'Bearbeitung freigeben und zurück'}).click();
  await b.getByRole('heading',{name:'Online-Turniere',exact:true}).waitFor();
  await a.getByRole('link',{name:'Online-Turnierleitung öffnen'}).click();
  await confirmed(a);
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  // Lost response followed by reload: the original UUID must survive in IndexedDB.
  const crashRevision=rows.get(id).revision;
  loseResponses=2;
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).click();
  await a.getByRole('button',{name:'Speicherung erneut versuchen'}).waitFor({timeout:45000});
  // Simulate the server lease expiring after a crashed browser.
  leases.delete(id);
  await a.reload();
  await a.getByRole('heading',{name:'Unbestätigte Online-Speicherung'}).waitFor();
  await a.getByRole('button',{name:'Ursprüngliche Anfrage erneut senden'}).click();
  await confirmed(a);
  await a.getByRole('button',{name:'Turnier fortsetzen',exact:true}).waitFor();
  assert.equal(rows.get(id).revision,crashRevision+1,'recovery must not commit twice');
  // Initial creation can be recovered after a lost response and page reload.
  await a.goto(base+'/#/online');
  loseResponses=2;
  const created=await a.evaluate(async()=>{
    const {prepareOnlineCreation,commitOnlineCreation}=await import('/src/services/onlineTournaments.ts');
    const attempt=await prepareOnlineCreation({name:'Erstellung Wiederaufnahme',sport:'table_tennis',discipline:'SINGLES',
      tables:2,minimumMatches:1,estimatedDurationMinutes:60,participantNames:['A','B','C','D'],
      phases:[{type:'ROUND_ROBIN',label:'Liga',bestOf:1,entrantCount:4,groupCount:1,swissRounds:1,knockoutBestOf:[]}]});
    try {await commitOnlineCreation(attempt);throw new Error('Expected lost response');} catch(e) {
      if(!String(e).includes('Speicherbestätigung')) throw e;
    }
    return attempt.tournament.id;
  });
  await a.reload();
  await a.getByRole('link',{name:'Erstellung wiederherstellen'}).click();
  await a.getByRole('heading',{name:'Unbestätigte Online-Speicherung'}).waitFor();
  await a.getByRole('button',{name:'Ursprüngliche Anfrage erneut senden'}).click();
  await confirmed(a);
  assert.equal(rows.get(created).revision,1);
  // Simulate lease expiry and takeover; the old workspace must freeze.
  leases.delete(created);
  await b.goto(base+'/?online='+encodeURIComponent(created)+'#/tournaments/'+created+'/control');
  await confirmed(b);
  await b.getByRole('button',{name:'Turnier starten',exact:true}).click();
  await b.getByRole('button',{name:'Jetzt starten',exact:true}).click();
  await b.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await confirmed(b);
  const writesBeforeCheck=calls.length;
  const staleLabel=a.getByText('Bearbeitungssperre verloren oder neuer Datenbankstand',{exact:true});
  if(!(await staleLabel.isVisible())) await a.getByRole('button',{name:'Datenbankstand prüfen',exact:true}).click();
  await staleLabel.waitFor();
  assert.equal(calls.length,writesBeforeCheck);
  assert.equal(await a.locator('[inert]').count()>0,true);
  await b.getByRole('button',{name:'Bearbeitung freigeben und zurück'}).click();
  await b.getByRole('heading',{name:'Online-Turniere',exact:true}).waitFor();
  await a.getByRole('button',{name:'Datenbankstand neu laden',exact:true}).click();
  await confirmed(a);
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await first.close(); await second.close();
  process.stdout.write('Online browser smoke passed: login, cloud creation, start, lost response, retry, second browser and stale revision.\n');
} finally { await browser.close(); }
