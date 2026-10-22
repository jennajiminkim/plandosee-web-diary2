import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {state} from '../api/experiment.js';

// These are sanitized actual read-only observations, not newly generated records.
const snapshot=JSON.parse(readFileSync(new URL('../evidence/task7-observation-values-2026-10-22.json',import.meta.url)));
test('recorded production five-day values agree with SQL/manual totals and UI rendering',async()=>{
 const e={metric_name:snapshot.metric_name,metric_unit:snapshot.metric_unit,question:'관찰',calculation_rule:'동일 계산 기준'};
 const change={changed_at:snapshot.change_time_seoul,old_rule:'실행 직전 계획',new_rule:'전날 저녁 계획',reason:'개인 사유 생략'};
 const db={async query(sql){return {rows:sql.includes('pds_experiments')?[e]:sql.includes('pds_daily_records')?snapshot.records:sql.includes('pds_rule_changes')?[change]:[{today:'2026-10-22'}]}}};
 const s=await state(db,'snapshot-no-real-id');
 for(const [key,value] of Object.entries(snapshot.expected))assert.equal(s.progress[key],value,key);
 assert.equal(s.progress.comparison_ready,true);
 assert.equal(new Set(s.records.map(x=>x.record_date)).size,5);
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',style:{},elements:{namedItem:name=>node(id+':'+name)},querySelector:selector=>node(id+':'+selector)});return nodes.get(id)}
 const source=readFileSync(new URL('../experiment-ui.js',import.meta.url),'utf8');
 // Execute the real UI's display function against a minimal DOM. No live login
 // or browser Network capture is claimed by this rendering regression test.
 vm.runInNewContext(source.slice(0,source.indexOf('function recordNotice'))+'\nshow(snapshotState);',{
  document:{getElementById:node},snapshotState:s
 });
 const html=node('history').innerHTML;
 for(const text of ['10 건','2 건 (5일','5 / 2.5','5 / 1.6667','5일 관찰 비교 완료'])assert.ok(html.includes(text),text);
 assert.equal(node('record').hidden,true);
});
