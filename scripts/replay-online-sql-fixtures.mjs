import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const path=process.env.ONLINE_SQL_FIXTURES;
if(!path || !process.env.DATABASE_URL) throw new Error('Fixture path and test database URL required');
const snapshots=readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const ids=new Map(), tokens=new Map();
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
let sql="begin;\ninsert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000c3','fixture@example.invalid');\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c3',true);\n";
for(const snapshot of snapshots){
  const id=snapshot.tournamentId;
  const revision=ids.get(id) ?? 0;
  const tournament=JSON.parse(snapshot.entries['online-tournament:local-prototype-tournaments:v1:record:'+id]).tournament;
  const op=crypto.randomUUID();
  if(revision===0) {
    sql+="select public.commit_online_tournament("+q(id)+","+q(tournament.name)+","+revision+","+q(op)+"::uuid,"+q(JSON.stringify(snapshot))+"::jsonb);\n";
    const token=crypto.randomUUID();tokens.set(id,token);
    sql+="select public.claim_online_workspace("+q(id)+","+q(token)+"::uuid,false);\n";
  } else sql+="select public.commit_leased_online_tournament("+q(id)+","+q(tournament.name)+","+revision+","+q(op)+"::uuid,"+q(JSON.stringify(snapshot))+"::jsonb,"+q(tokens.get(id))+"::uuid);\n";
  ids.set(id,revision+1);
  // Large fixture runs may exceed the real 90-second workspace lease.
  // Renew explicitly as the actual director would, never bypass the guard.
  if(revision>0&&revision%10===0)sql+="select public.claim_online_workspace("+q(id)+","+q(tokens.get(id))+"::uuid,true);\n";
}
assert.ok(ids.size>=3,'Expected round-robin, Swiss and group/KO fixtures');
assert.ok(snapshots.length>=20,'Expected complete runtime sequences');
for(const [id,revision] of ids)sql+="do $check$ begin if (public.load_online_tournament("+q(id)+")->>'revision')::int is distinct from "+revision+" then raise exception 'unexpected final revision'; end if; end $check$;\n";
sql+="rollback;\n";
const result=spawnSync('psql',[process.env.DATABASE_URL,'-X','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:4*1024*1024});
if(result.status!==0){console.error(result.stderr);process.exit(result.status??1);}
console.log('Replayed '+snapshots.length+' genuine client snapshots across '+ids.size+' tournaments through the PostgreSQL RPC.');
