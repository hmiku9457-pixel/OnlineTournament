import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn,spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// Never point this workload at hosted infrastructure. Only CI's disposable
// PostgreSQL with synthetic auth users and exact local database name.
const url=process.env.DATABASE_URL;
if(process.env.CI!=='true'||!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/tournament_ci')throw new Error('Disposable CI PostgreSQL required');
const path=process.env.ONLINE_SQL_FIXTURES;
const fixture=JSON.parse(readFileSync(path+'.read-load.json','utf8'));
const snapshots=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse).filter(s=>s.tournamentId===fixture.id);
assert.ok(snapshots.length>10);assert.equal(fixture.matches.length,64);assert.equal(Object.keys(fixture.contexts).length,32);
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const json=x=>q(JSON.stringify(x))+'::jsonb';
const owner='00000000-0000-4000-8000-0000000000d4',lease=crypto.randomUUID();
const args=[url,'-X','-Atq','-v','ON_ERROR_STOP=1'];
function run(sql){
 const p=spawnSync('psql',args,{input:sql,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 if(p.status!==0)throw new Error(p.stderr||String(p.error));return p.stdout.trim();
}
function parallel(sql){
 return new Promise((resolve,reject)=>{
  const p=spawn('psql',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
  p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>err+=s);
  p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));
  p.stdin.end(sql);
 });
}
const id=q(fixture.id), token=q(lease)+'::uuid';
const asOwner="set role authenticated; select set_config('request.jwt.claim.sub',"+q(owner)+",false);\n";
let sql="begin; insert into auth.users(id,email) values ("+q(owner)+",'read-load@example.invalid');\n"+asOwner;
for(let i=0;i<snapshots.length;i++){
 const s=snapshots[i],t=JSON.parse(s.entries['online-tournament:local-prototype-tournaments:v1:record:'+fixture.id]).tournament;
 const values=[id,q(t.name),i,q(crypto.randomUUID())+'::uuid',json(s)].join(',');
 sql+='select public.'+(i===0?'commit_online_tournament('+values+')':'commit_leased_online_tournament('+values+','+token+')')+';\n';
 if(i===0)sql+='select public.claim_online_workspace('+id+','+token+',false);\n';
}
const rev=snapshots.length;
sql+='select public.batch_online_player_access('+id+','+json(Object.keys(fixture.contexts))+",'enable');\n";
sql+="select set_config('load.spectator',public.manage_online_spectator("+id+",'enable')::text,false);\n";
sql+='select public.online_spectator_detail_setting('+id+',true);\n';
sql+='select public.publish_online_player_projection_v2('+[id,token,rev,json(fixture.matches),fixture.matches.length,json(fixture.contexts)].join(',')+');\n';
sql+='select public.publish_online_spectator_matches_v2('+[id,token,rev,json(fixture.matches),fixture.matches.length,json(fixture.overview)].join(',')+');\n';
sql+="select jsonb_build_object('spectator',current_setting('load.spectator'),'players',(select jsonb_agg(jsonb_build_object('name',name,'token',token)) from public.list_online_player_access("+id+")));\ncommit;";
const auth=JSON.parse(run(sql).split('\n').at(-1));
assert.equal(auth.players.length,32);assert.ok(auth.players.every(p=>p.token));
const start=performance.now();
const tasks=Array.from({length:8},(_,worker)=>{
 const players=auth.players.slice(worker*4,worker*4+4);
 return parallel("set statement_timeout='30s'; set role anon;\n"+players.map(p=>`do $read$ declare spectator jsonb; player jsonb; s_tag text; p_tag text; i integer; begin
 spectator:=public.read_online_spectator_bundle_v2(${q(auth.spectator)}::uuid,null);
 player:=public.read_online_player_bundle_v2(${q(p.token)}::uuid,null);
 if jsonb_array_length(spectator->'details'->'matches') is distinct from 64 or player->'view'->>'participant' is distinct from ${q(p.name)} or player->'context' is null or player->'context'='null'::jsonb then raise exception 'full read mismatch'; end if;
 if exists(select 1 from jsonb_array_elements(player->'view'->'matches') m where not (${q(p.name)} in (m->>'sideA',m->>'sideB'))) then raise exception 'foreign match'; end if;
 s_tag:=spectator->>'tag';p_tag:=player->>'tag';
 for i in 1..10 loop
  if public.read_online_spectator_bundle_v2(${q(auth.spectator)}::uuid,s_tag)->'unchanged' is distinct from 'true'::jsonb then raise exception 'spectator tag';end if;
  if public.read_online_player_bundle_v2(${q(p.token)}::uuid,p_tag)->'unchanged' is distinct from 'true'::jsonb then raise exception 'player tag';end if;
 end loop;
 end $read$;`).join('\n'));
});
await Promise.all(tasks);
console.log('8 concurrent SQL clients; 32 distinct player capabilities; 704 full/conditional bundle calls in '+Math.round(performance.now()-start)+' ms (disposable PostgreSQL, not hosted load).');
const old=auth.players[0];
run(asOwner+"select public.manage_online_spectator("+id+",'disable'); select public.batch_online_player_access("+id+","+json(Object.keys(fixture.contexts))+",'disable'); reset role; set role anon; do $revoke$ begin if public.read_online_spectator_bundle_v2("+q(auth.spectator)+"::uuid,null)->'progress' is distinct from 'null'::jsonb or public.read_online_player_bundle_v2("+q(old.token)+"::uuid,null)->'view' is distinct from 'null'::jsonb then raise exception 'revoked capability survived'; end if; end $revoke$;");
console.log('All capability reads and subsequent revocation verified.');
