import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../api/experiment.js';

const uid='test-user',day='2026-10-17';
const recordId='b3a387cb-3d4c-4e40-b0c1-b180ae3b5011';
const exp={id:'exp-a',metric_name:'하루에 첫 행동을 실행한 할 일 수',metric_unit:'건'};

function dbFixture({today=day,records=[{id:recordId,user_id:uid,record_date:day,metric_value:2,note:'기존 근거'}],revision=null}={}){
 const saved=records.map(x=>({...x})),writes=[];
 return {
  writes,records:saved,
  db:{async query(sql,params=[]){
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
   if(sql.includes('FROM public.pds_experiments'))return {rows:[exp]};
   if(sql.includes('FROM public.pds_daily_records'))return {rows:saved};
   if(sql.includes('FROM public.pds_rule_changes'))return {rows:revision?[revision]:[]};
   if(sql.includes('AS today'))return {rows:[{today}]};
   if(sql.startsWith('UPDATE public.pds_daily_records')){
    writes.push({sql,params});
    const row=saved.find(x=>x.id===params[2]&&x.user_id===params[3]&&x.record_date===params[5]);
    if(!row)return {rowCount:0,rows:[]};
    row.metric_value=params[0];row.note=params[1];
    return {rowCount:1,rows:[{id:row.id}]};
   }
   throw Error('Unexpected SQL: '+sql);
  }}
 };
}
const input={record_id:recordId,record_date:day,metric_value:3,note:'정정된 측정 근거'};

test('same-day observation correction updates 2 to 3 without inserting a second row',async()=>{
 const f=dbFixture();
 const result=await run(f.db,uid,'record.update',input);
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].metric_value,3);
 assert.equal(result.records[0].note,input.note);
 assert.equal(f.writes.length,1);
 assert.match(f.writes[0].sql,/user_id=\$4 AND experiment_id=\$5 AND record_date=\$6/);
});

test('observation corrections reject an expired Seoul day and leave records alone',async()=>{
 const f=dbFixture({today:'2026-10-18'});
 await assert.rejects(run(f.db,uid,'record.update',input),/record_only_current_seoul_day/);
 assert.equal(f.writes.length,0);
 assert.equal(f.records[0].metric_value,2);
});

test('observation corrections require the exact existing record ID',async()=>{
 const f=dbFixture();
 await assert.rejects(run(f.db,uid,'record.update',{...input,record_id:'22a387cb-3d4c-4e40-b0c1-b180ae3b5011'}),/not_found/);
 assert.equal(f.writes.length,0);
});

test('first-action measurement cannot exceed three or be fractional',async()=>{
 const f=dbFixture();
 await assert.rejects(run(f.db,uid,'record.update',{...input,metric_value:4}),/first_step_value_must_be_0_to_3/);
 await assert.rejects(run(f.db,uid,'record.update',{...input,metric_value:2.5}),/first_step_value_must_be_0_to_3/);
 assert.equal(f.writes.length,0);
});

test('record correction is denied when the first two days already anchor a rule change',async()=>{
 const f=dbFixture({revision:{id:'revision',day1_record_id:recordId}});
 await assert.rejects(run(f.db,uid,'record.update',input),/record_locked_after_revision/);
 assert.equal(f.writes.length,0);
});

test('record correction rejects a blank note',async()=>{
 const f=dbFixture();
 await assert.rejects(run(f.db,uid,'record.update',{...input,note:' '}),/record_note_required/);
 assert.equal(f.writes.length,0);
});
