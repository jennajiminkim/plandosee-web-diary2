import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {perform} from '../api/actions.js';
import {inUserTransaction} from '../api/db.js';

const uid='123e4567-e89b-42d3-a456-426614174000';
const pid='123e4567-e89b-42d3-a456-426614174001';
const tid='123e4567-e89b-42d3-a456-426614174002';
const rid='123e4567-e89b-42d3-a456-426614174003';
function fixture(respond=()=>({rows:[],rowCount:0})){
 const calls=[];
 const db={async query(sql,args=[]){calls.push({sql,args});return respond(sql,args)}};
 return {db,calls};
}
function inserted(sql,args){
 const columns=sql.match(/\(([^)]+)\)/)[1].split(',').map(x=>x.replaceAll('"','').trim());
 return {id:tid,...Object.fromEntries(columns.map((x,i)=>[x,args[i]]))};
}
test('unlinked tasks retain null plan and use the verified owner, ignoring injected user_id',async()=>{
 const f=fixture((s,a)=>({rows:s.startsWith('INSERT')?[inserted(s,a)]:[]}));
 const task=await perform(f.db,uid,'task.create',{title:'테스트',user_id:'intruder',plan_id:''});
 assert.equal(task.plan_id,null);assert.equal(task.user_id,uid);
 assert.ok(f.calls.every(c=>c.args.includes(uid)));
});
test('linked tasks inherit plan priority; an unowned plan cannot be referenced',async()=>{
 const f=fixture((s,a)=>({rows:s.startsWith('SELECT')?[{id:pid,priority:2}]:[inserted(s,a)]}));
 const task=await perform(f.db,uid,'task.create',{title:'테스트',plan_id:pid,priority:99});
 assert.equal(task.priority,2);
 assert.deepEqual(f.calls[0].args,[pid,uid]);
 await assert.rejects(perform(fixture().db,uid,'task.create',{title:'테스트',plan_id:pid}),e=>e.status===404);
});
test('plan edits lock the owned plan and snapshot its previous value before changing it',async()=>{
 const prior={id:pid,title:'before',priority:1};
 const f=fixture((s,a)=>({rows:s.startsWith('SELECT')?[prior]:s.startsWith('INSERT')?[inserted(s,a)]:[{id:pid}]}));
 await perform(f.db,uid,'plan.update',{id:pid,title:'after',start_date:'2026-10-19',end_date:'2026-10-25'});
 const snap=f.calls.find(c=>c.sql.includes('INSERT INTO public.pds_plan_versions'));
 assert.deepEqual(JSON.parse(snap.args.at(-1)),prior);
 assert.ok(f.calls.some(c=>c.sql.includes('FOR UPDATE')&&c.args[1]===uid));
 assert.ok(f.calls.indexOf(snap)<f.calls.findIndex(c=>c.sql.startsWith('UPDATE')));
});
test('completion retries do not issue a second update or completion event',async()=>{
 const f=fixture(()=>({rows:[{id:tid,status:'done'}]}));
 for(let i=0;i<2;i++)assert.equal((await perform(f.db,uid,'task.complete',{id:tid})).status,'done');
 assert.ok(f.calls.every(c=>c.sql.startsWith('SELECT')&&c.sql.includes('FOR UPDATE')));
});
test('log duration is calculated from instants and never mutates plans',async()=>{
 const f=fixture((s,a)=>({rows:s.startsWith('SELECT')?[{id:tid}]:[inserted(s,a)]}));
 const log=await perform(f.db,uid,'log.create',{task_id:tid,started_at:'2026-10-11T09:00:00+09:00',ended_at:'2026-10-11T09:35:00+09:00',actual_minutes:999});
 assert.equal(log.actual_minutes,35);assert.equal(log.user_id,uid);
 assert.ok(f.calls.every(c=>!c.sql.includes('pds_plans')));
});
test('next-plan retries return the existing owned plan',async()=>{
 const f=fixture(s=>({rows:s.includes('pds_reflections')?[{id:rid,next_plan_id:pid}]:[{id:pid}]}));
 assert.equal((await perform(f.db,uid,'reflection.next',{id:rid})).id,pid);
 assert.ok(f.calls.every(c=>c.sql.startsWith('SELECT')&&c.args[1]===uid));
});
test('deleting a plan soft-deletes only that owned plan',async()=>{
 const f=fixture(()=>({rows:[{id:pid,deleted_at:null}]}));
 await perform(f.db,uid,'plan.delete',{id:pid});
 assert.equal(f.calls.length,2);assert.match(f.calls[1].sql,/UPDATE public.pds_plans/);
 assert.match(f.calls[1].sql,/user_id=/);assert.ok(f.calls[1].args.includes(uid));
});
test('weekly review rejects non-Mondays and keeps theme fields in an owner-scoped upsert',async()=>{
 const f=fixture(()=>({rows:[{id:rid}]}));
 await assert.rejects(perform(f.db,uid,'journal.save',{week_start:'2026-10-20'}));
 await perform(f.db,uid,'journal.save',{week_start:'2026-10-19',discovery:'test',next_action:'small',bg_color:'#FAFAFA',date_color:'#1E4099'});
 assert.match(f.calls[0].sql,/ON CONFLICT\(user_id,week_start\)/);
 assert.deepEqual(f.calls[0].args,[uid,'2026-10-19',null,'','test','small','#FAFAFA','#1E4099']);
});
test('transactions serialize by owner, check identity, then restrict SQL role before committing',async()=>{
 const f=fixture(s=>({rows:s.includes('AS present')?[{present:true}]:[]}));
 assert.equal(await inUserTransaction(f.db,uid,async()=>{await f.db.query('APP_WORK');return 'ok'}),'ok');
 assert.match(f.calls[1].sql,/pg_advisory_xact_lock/);assert.deepEqual(f.calls[1].args,[uid]);
 assert.match(f.calls[2].sql,/neon_auth/);assert.equal(f.calls[3].sql,'SET LOCAL ROLE pds_runtime');
 assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('stale authenticated requests cannot recreate records after identity deletion',async()=>{
 const f=fixture(()=>({rows:[{present:false}]}));let ran=false;
 await assert.rejects(inUserTransaction(f.db,uid,async()=>{ran=true}),e=>e.status===401);
 assert.equal(ran,false);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 assert.ok(!f.calls.some(c=>c.sql==='COMMIT'));
});
test('an application failure rolls back the transaction',async()=>{
 const f=fixture(()=>({rows:[{present:true}]}));
 await assert.rejects(inUserTransaction(f.db,uid,async()=>{throw Error('test failure')}),/test failure/);
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('HTML escaping and CSP protect script-shaped content',()=>{
 assert.match(readFileSync(new URL('../app.js',import.meta.url),'utf8'),/const esc=s=>String/);
 assert.match(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'),/script-src 'self'/);
});
