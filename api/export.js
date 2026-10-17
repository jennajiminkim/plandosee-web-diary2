import {requireUser,asUser,tables} from './db.js';
const ordered=['plans','versions','tasks','cells','logs','completions','reflections','journals','dailyJournals','colors'];
// Observational data is separate from the planner tables, but is private user data too.
const observationTables={
 experiments:'pds_experiments',dailyRecords:'pds_daily_records',ruleChanges:'pds_rule_changes'
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Content-Disposition','attachment; filename="plan-do-see-private-backup.json"');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const uid=await requireUser(req);
  const snapshot=await asUser(uid,async client=>{
   const data={};
   for(const key of ordered){
    // FORCE RLS + tenant filter: never export another account's records.
    const rows=await client.query('SELECT * FROM public.'+tables[key]+' WHERE user_id=$1 ORDER BY '+(key==='colors'?'color':key==='completions'?'task_id':'id')+' LIMIT 10001',[uid]);
    if(rows.rows.length>10000)throw Object.assign(new Error('export_limit_exceeded'),{status:413});
    data[key]=rows.rows.map(row=>{
     const {user_id,...safe}=row;
     return safe;
    });
   }
   // The five-day observation belongs in the same private backup.
   for(const [key,table] of Object.entries(observationTables)){
    const rows=await client.query('SELECT * FROM public.'+table+' WHERE user_id=$1 ORDER BY id LIMIT 10001',[uid]);
    if(rows.rows.length>10000)throw Object.assign(new Error('export_limit_exceeded'),{status:413});
    data[key]=rows.rows.map(({user_id,...safe})=>safe);
   }
   return data;
  });
  return res.status(200).json({
   app:'plan.do.see',
   format:'pds-private-v1',
   exported_at:new Date().toISOString(),
   timezone_for_overdue:'Asia/Seoul',
   ...snapshot
  });
 }catch(e){
  res.removeHeader('Content-Disposition');
  if(e.status)return res.status(e.status).json({error:e.message});
  console.error('Private backup export failed',e.code||'unknown');
  return res.status(503).json({error:'export_unavailable'});
 }
}
