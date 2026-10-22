import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {privateCollections,countOwnedData,runAccountDeletion} from '../api/account.js';
import {inUserTransaction} from '../api/db.js';

const A='123e4567-e89b-42d3-a456-426614174001';
const B='123e4567-e89b-42d3-a456-426614174002';
test('real PostgreSQL constraints/RLS: refusal rolls back; success erases every owned table and preserves B',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY); CREATE ROLE pds_runtime NOLOGIN NOBYPASSRLS;');
  for(const file of readdirSync(new URL('../neon/',import.meta.url)).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
   await db.exec(readFileSync(new URL('../neon/'+file,import.meta.url),'utf8'));
  }
  // 001 documents base-role provisioning as a separate deployment step.
  const baseTables=privateCollections.map(([,name])=>name).filter(name=>!['pds_import_batches','pds_daily_journals'].includes(name));
  await db.exec('GRANT USAGE ON SCHEMA public TO pds_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON '+baseTables.join(',')+' TO pds_runtime;');
  await db.query('INSERT INTO neon_auth."user" VALUES ($1),($2)',[A,B]);
  // Real rows in all 14 current user-owned tables, including the import ledger.
  for(const uid of [A,B]){
   await inUserTransaction(db,uid,async client=>{
    const plan=(await client.query("INSERT INTO pds_plans(user_id,title,start_date,end_date) VALUES($1,'fixture','2026-10-19','2026-10-25') RETURNING id",[uid])).rows[0].id;
    const task=(await client.query("INSERT INTO pds_tasks(user_id,plan_id,title) VALUES($1,$2,'fixture') RETURNING id",[uid,plan])).rows[0].id;
    await client.query("INSERT INTO pds_plan_versions(user_id,plan_id,snapshot) VALUES($1,$2,'{}')",[uid,plan]);
    await client.query("INSERT INTO pds_cells(user_id,task_id,day) VALUES($1,$2,'2026-10-19')",[uid,task]);
    await client.query("INSERT INTO pds_logs(user_id,task_id,started_at,ended_at,actual_minutes) VALUES($1,$2,'2026-10-19T00:00Z','2026-10-19T00:10Z',10)",[uid,task]);
    await client.query('INSERT INTO pds_completion_events(user_id,task_id) VALUES($1,$2)',[uid,task]);
    await client.query('INSERT INTO pds_reflections(user_id,plan_id) VALUES($1,$2)',[uid,plan]);
    await client.query("INSERT INTO pds_weekly_reviews(user_id,week_start,entry_date,plan_id) VALUES($1,'2026-10-19','2026-10-19',$2)",[uid,plan]);
    await client.query("INSERT INTO pds_daily_journals(user_id,entry_date,discovery) VALUES($1,'2026-10-19','fixture')",[uid]);
    await client.query("INSERT INTO pds_color_swatches(user_id,color) VALUES($1,'#ffffff')",[uid]);
    await client.query("INSERT INTO pds_import_batches(user_id,fingerprint,record_counts) VALUES($1,$2,'{}')",[uid,'a'.repeat(64)]);
    const exp=(await client.query("INSERT INTO pds_experiments(user_id,question,metric_name,metric_unit,calculation_rule) VALUES($1,'fixture','fixture','count','fixture') RETURNING id",[uid])).rows[0].id;
    const days=[];
    for(const day of ['2026-10-19','2026-10-20'])days.push((await client.query('INSERT INTO pds_daily_records(user_id,experiment_id,record_date) VALUES($1,$2,$3) RETURNING id',[uid,exp,day])).rows[0].id);
    await client.query("INSERT INTO pds_rule_changes(user_id,experiment_id,old_rule,new_rule,reason,day1_record_id,day2_record_id) VALUES($1,$2,'old','new','fixture',$3,$4)",[uid,exp,...days]);
   });
  }
  const beforeA=await inUserTransaction(db,A,c=>countOwnedData(c,A));
  const beforeB=await inUserTransaction(db,B,c=>countOwnedData(c,B));
  assert.equal(beforeA.total,15);assert.ok(Object.values(beforeA.counts).every(n=>n>0));
  const actualTables=(await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id'")).rows.map(x=>x.table_name).sort();
  assert.deepEqual(privateCollections.map(([,name])=>name).sort(),actualTables);
  assert.equal((await inUserTransaction(db,A,c=>countOwnedData(c,B))).total,0);
  // Both provider rejection and verification-email-only responses preserve data.
  for(const response of [new Response('{}',{status:409}),Response.json({success:true,message:'Verification email sent'})]){
   await assert.rejects(inUserTransaction(db,A,c=>runAccountDeletion({db:c,userId:A,managedDelete:async()=>response})));
   assert.deepEqual(await inUserTransaction(db,A,c=>countOwnedData(c,A)),beforeA);
   assert.deepEqual(await inUserTransaction(db,B,c=>countOwnedData(c,B)),beforeB);
  }
  const result=await inUserTransaction(db,A,c=>runAccountDeletion({db:c,userId:A,managedDelete:async()=>Response.json({success:true,message:'User deleted'})}));
  assert.equal(result.record_count,15);
  assert.equal((await inUserTransaction(db,A,c=>countOwnedData(c,A))).total,0);
  assert.deepEqual(await inUserTransaction(db,B,c=>countOwnedData(c,B)),beforeB);
  // Identity removal is local-only simulation, never a managed-service claim.
  await db.query('DELETE FROM neon_auth."user" WHERE id=$1',[A]);
  await assert.rejects(inUserTransaction(db,A,()=>assert.fail('stale request ran')),e=>e.status===401);
 }finally{await db.close()}
});
