import test from 'node:test';
import assert from 'node:assert/strict';
import {state,run} from '../api/experiment.js';
import {readFileSync} from 'node:fs';

const uid='fictional-test-user';
function fixture(values=[3,2],hasChange=false){
 const records=values.map((value,index)=>({
  id:'record-'+index,record_date:`2026-10-${String(index+17).padStart(2,'0')}`,
  metric_value:value,note:'mock-only'
 }));
 const experiment={id:'fictional-experiment',metric_name:'하루에 첫 행동을 실행한 할 일 수',
  metric_unit:'건',calculation_rule:'매일 시작하기 전에 MY FIRST STEP 기록',
  missing_rule:'누락값은 추정하지 않음'};
 let change=hasChange?{id:'mock-change',old_rule:'old',new_rule:'new',reason:'reason'}:null;
 const mutations=[];
 const db={async query(sql,params=[]){
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('FROM public.pds_experiments'))return {rows:[experiment]};
  if(sql.includes('FROM public.pds_daily_records'))return {rows:records};
  if(sql.includes('FROM public.pds_rule_changes'))return {rows:change?[change]:[]};
  if(sql.includes('AS today'))return {rows:[{today:'2026-10-18'}]};
  if(sql.startsWith('INSERT INTO public.pds_rule_changes')){
   mutations.push({sql,params});
   change={id:'new-change',old_rule:params[2],new_rule:params[3],reason:params[4]};
   return {rowCount:1,rows:[]};
  }
  if(sql.startsWith('UPDATE public.pds_experiments')){
   mutations.push({sql,params});
   return {rowCount:1,rows:[]};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 return {db,mutations,records};
}

test('after day 2 exactly one planning rule changes, without changing metric or calculation',async()=>{
 const f=fixture();
 const result=await run(f.db,uid,'revise',{rule_field:'plan_rule',new_rule:'전날 3개 할 일을 미리 고른다',reason:'1~2일차에 준비 시간이 길었음'});
 assert.match(result.change.old_rule,/\[계획 규칙\]/);
 assert.match(result.change.new_rule,/전날 3개 할 일을 미리 고른다/);
 assert.equal(f.mutations.length,1);
 assert.match(f.mutations[0].sql,/INSERT INTO public.pds_rule_changes/);
 assert.equal(result.experiment.metric_name,'하루에 첫 행동을 실행한 할 일 수');
 assert.equal(result.experiment.calculation_rule,'매일 시작하기 전에 MY FIRST STEP 기록');
 await assert.rejects(run(f.db,uid,'revise',{rule_field:'plan_rule',new_rule:'another',reason:'reason'}),/revision_requires_exactly_two_days/);
});

test('the summary reports observed five-day totals, both averages and unchanged unit',async()=>{
 const f=fixture([3,2,1,3,0],true);
 const result=await state(f.db,uid);
 assert.equal(result.progress.total_sum,9);
 assert.equal(result.progress.total_mean,1.8);
 assert.equal(result.progress.measured_days,5);
 assert.equal(result.progress.day1_day2_sum,5);
 assert.equal(result.progress.day1_day2_mean,2.5);
 assert.equal(result.progress.day3_day5_sum,4);
 assert.equal(result.progress.day3_day5_mean,1.3333);
 assert.equal(result.progress.comparison_ready,true);
 assert.equal(result.experiment.metric_unit,'건');
});

test('private export includes all observation entities along with diary tables',()=>{
 const src=readFileSync(new URL('../api/export.js',import.meta.url),'utf8');
 for(const name of ['experiments','dailyRecords','ruleChanges','dailyJournals'])
  assert.match(src,new RegExp(name));
 assert.match(src,/WHERE user_id=\$1/);
});
