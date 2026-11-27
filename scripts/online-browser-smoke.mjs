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
const rows = new Map(), operations = new Map(), calls = [];
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
    if(path.endsWith('/list_online_tournaments')) return send([...rows.values()].map(({payload,...row})=>row));
    if(path.endsWith('/load_online_tournament')) return send(rows.get(body.p_id) ?? {message:'Not found',code:'42501'},rows.has(body.p_id)?200:403);
    if(path.endsWith('/commit_online_tournament')) {
      calls.push(structuredClone(body));
      const key=body.p_id+':'+body.p_operation_id;
      let rev;
      if(operations.has(key)) {
        const previous=operations.get(key);
        assert.deepEqual(body,previous.body,'retry must send identical RPC arguments');
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
  await a.getByRole('link',{name:'Online-Turnierleitung öffnen'}).click();
  await confirmed(a);
  await a.locator('#app-build-version').waitFor({state:'visible'});
  await a.getByRole('button',{name:'Turnier starten',exact:true}).click();
  await a.getByRole('button',{name:'Jetzt starten',exact:true}).click();
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await confirmed(a);
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
  // A separate browser context logs in and opens the stored event.
  await login(b);
  await b.goto(base+'/#/online');
  await b.getByRole('link',{name:'Online-Turnierleitung öffnen'}).click();
  await confirmed(b);
  await b.getByRole('button',{name:'Turnier fortsetzen',exact:true}).waitFor();
  await b.getByRole('button',{name:'Turnier fortsetzen',exact:true}).click();
  await b.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await confirmed(b);
  // The stale first browser is not allowed to overwrite the newer revision.
  await a.getByRole('button',{name:'Turnier fortsetzen',exact:true}).click();
  await a.getByText(/Ein anderer Arbeitsbereich hat das Turnier geändert/).waitFor();
  assert.equal(await a.getByRole('button',{name:'Speicherung erneut versuchen'}).count(),0);
  assert.equal(await a.getByRole('button',{name:'Unbestätigten Stand als JSON sichern'}).count(),1);
  // A previously rejected write survives page reload in its own IndexedDB journal.
  await a.reload();
  await a.getByRole('heading',{name:'Unbestätigte Online-Speicherung'}).waitFor();
  await a.getByRole('button',{name:'Ursprüngliche Anfrage erneut senden'}).click();
  await a.getByText(/Ein anderer Arbeitsbereich hat das Turnier geändert/).waitFor();
  await a.getByRole('button',{name:'Verwerfen …'}).click();
  await a.getByRole('button',{name:'Unbestätigten Eintrag verwerfen'}).click();
  await confirmed(a);
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  // Lost response followed by reload: the original UUID must survive in IndexedDB.
  const crashRevision=rows.get(id).revision;
  loseResponses=2;
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).click();
  await a.getByRole('button',{name:'Speicherung erneut versuchen'}).waitFor({timeout:45000});
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
  // Explicit freshness check must block stale editing before any write.
  await b.goto(base+'/?online='+encodeURIComponent(created)+'#/tournaments/'+created+'/control');
  await confirmed(b);
  await b.getByRole('button',{name:'Turnier starten',exact:true}).click();
  await b.getByRole('button',{name:'Jetzt starten',exact:true}).click();
  await b.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await confirmed(b);
  const writesBeforeCheck=calls.length;
  const staleLabel=a.getByText('Neuerer Datenbankstand vorhanden',{exact:true});
  if(!(await staleLabel.isVisible())) await a.getByRole('button',{name:'Datenbankstand prüfen',exact:true}).click();
  await staleLabel.waitFor();
  assert.equal(calls.length,writesBeforeCheck);
  assert.equal(await a.locator('[inert]').count()>0,true);
  await a.getByRole('button',{name:'Datenbankstand neu laden',exact:true}).click();
  await confirmed(a);
  await a.getByRole('button',{name:'Turnier pausieren',exact:true}).waitFor();
  await first.close(); await second.close();
  process.stdout.write('Online browser smoke passed: login, cloud creation, start, lost response, retry, second browser and stale revision.\n');
} finally { await browser.close(); }
