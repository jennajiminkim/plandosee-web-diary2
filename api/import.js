import {randomUUID,createHash} from 'node:crypto';
import {requireUser,asUser,error} from './db.js';
import {preview} from './import-preview.js';

const keys=['plans','versions','tasks','cells','logs','completions','reflections','journals','colors'];
const tables={plans:'pds_plans',versions:'pds_plan_versions',tasks:'pds_tasks',
 cells:'pds_cells',logs:'pds_logs',completions:'pds_completion_events',
 reflections:'pds_reflections',journals:'pds_weekly_reviews',colors:'pds_color_swatches'};
const fields={
 plans:['title','start_date','end_date','priority','success_criteria','estimated_minutes','deleted_at','created_at','updated_at'],
 versions:['snapshot','changed_at'],
 tasks:['title','priority','tag','color','due_date','start_date','end_date','mode','estimated_minutes','estimate_basis','status','completed_at','deleted_at','created_at'],
 cells:['day','state','progress','note'],
 logs:['started_at','ended_at','actual_minutes','progress','blocker','created_at'],
 completions:['completed_at'],
 reflections:['question','answer','improvement','updated_at'],
 journals:['week_start','entry_date','question','discovery','next_action','bg_color','date_color','created_at','updated_at'],
 colors:['color','usage_count','last_used']
};
const defaults={
 plans:{priority:1,success_criteria:'',estimated_minutes:0},
 tasks:{priority:1,tag:'생활',color:'#dce9dc',mode:'single',status:'active',estimate_basis:'total',estimated_minutes:0},
 cells:{state:'planned',progress:'',note:''},logs:{progress:'',blocker:''},
 reflections:{question:'',answer:'',improvement:''},
 journals:{question:'',discovery:'',next_action:'',bg_color:'#FAFAFA',date_color:'#1E4099'},
 colors:{usage_count:1}
};
function pick(row,key){
 const out={...defaults[key]};
 for(const name of fields[key])if(row[name]!==undefined&&row[name]!==null)out[name]=row[name];
 // nullable time/date fields should not be silently dropped when null.
 for(const name of fields[key])if(row[name]===null)out[name]=null;
 return out;
}
async function insert(client,key,uid,fields) {
 const entries=Object.entries({user_id:uid,...fields});
 const cols=entries.map(([c])=>'"'+c+'"').join(',');
 const vals=entries.map((_,i)=>'$'+(i+1)).join(',');
 await client.query('INSERT INTO public.'+tables[key]+' ('+cols+') VALUES('+vals+')',entries.map(([,v])=>v));
}
async function migrate(db,uid,body,counts,fingerprint){
 // The unique fingerprint guard and the contents commit as ONE transaction.
 const guard=await db.query('INSERT INTO public.pds_import_batches(user_id,fingerprint,record_counts) VALUES($1,$2,$3) ON CONFLICT(user_id,fingerprint) DO NOTHING RETURNING id',[uid,fingerprint,JSON.stringify(counts)]);
 if(!guard.rowCount)throw error('already_imported',409);
 const maps={};
 for(const key of ['plans','versions','tasks','cells','logs','reflections','journals']){
  maps[key]=new Map(body[key].map(row=>[row.id,randomUUID()]));
 }
 const get=(key,id)=>id==null?null:maps[key].get(id);
 // All records receive new IDs. No existing private record is replaced.
 for(const row of body.plans)await insert(db,'plans',uid,{id:get('plans',row.id),...pick(row,'plans'),from_reflection_id:null});
 for(const row of body.tasks)await insert(db,'tasks',uid,{id:get('tasks',row.id),...pick(row,'tasks'),plan_id:get('plans',row.plan_id)});
 for(const row of body.versions){
  const snapshot=row.snapshot&&typeof row.snapshot==='object'?structuredClone(row.snapshot):{};
  if(snapshot.id)snapshot.id=get('plans',snapshot.id)||snapshot.id;
  if(snapshot.plan_id)snapshot.plan_id=get('plans',snapshot.plan_id)||snapshot.plan_id;
  if(snapshot.from_reflection_id)snapshot.from_reflection_id=get('reflections',snapshot.from_reflection_id)||null;
  delete snapshot.user_id;
  await insert(db,'versions',uid,{id:get('versions',row.id),plan_id:get('plans',row.plan_id),snapshot:JSON.stringify(snapshot),changed_at:row.changed_at||new Date().toISOString()});
 }
 for(const row of body.cells)await insert(db,'cells',uid,{id:get('cells',row.id),task_id:get('tasks',row.task_id),...pick(row,'cells')});
 for(const row of body.logs)await insert(db,'logs',uid,{id:get('logs',row.id),task_id:get('tasks',row.task_id),...pick(row,'logs')});
 for(const row of body.completions)await insert(db,'completions',uid,{task_id:get('tasks',row.task_id),...pick(row,'completions')});
 for(const row of body.reflections)await insert(db,'reflections',uid,{id:get('reflections',row.id),plan_id:get('plans',row.plan_id),next_plan_id:get('plans',row.next_plan_id),...pick(row,'reflections')});
 for(const row of body.plans)if(row.from_reflection_id){
  await db.query('UPDATE public.pds_plans SET from_reflection_id=$1 WHERE id=$2 AND user_id=$3',[get('reflections',row.from_reflection_id),get('plans',row.id),uid]);
 }
 for(const row of body.journals)await insert(db,'journals',uid,{id:get('journals',row.id),plan_id:get('plans',row.plan_id),...pick(row,'journals')});
 for(const row of body.colors){
  const value=pick(row,'colors');
  await db.query('INSERT INTO public.pds_color_swatches(user_id,color,usage_count,last_used) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,color) DO NOTHING',
   [uid,value.color,value.usage_count??1,value.last_used||new Date().toISOString()]);
 }
 return {imported:true,count:keys.reduce((n,k)=>n+body[k].length,0),counts};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 try {
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const uid=await requireUser(req);
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'forbidden_origin'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(Buffer.byteLength(raw)>750000)return res.status(413).json({error:'import_file_too_large'});
  let envelope;
  try{envelope=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{throw error('invalid_json')}
  if(!envelope||envelope.confirm!=='IMPORT'||!envelope.data||typeof envelope.data!=='object')throw error('explicit_confirmation_required');
  const body=envelope.data;
  const check=preview(body);
  if(!check.valid)return res.status(422).json({error:'invalid_import',issues:check.issues});
  // Stable across export_at timestamps and object wrapper metadata.
  const fingerprint=createHash('sha256').update(JSON.stringify(keys.map(key=>body[key]))).digest('hex');
  const result=await asUser(uid,async db=>{
   const weekDates=body.journals.map(row=>row.week_start);
   if(weekDates.length){
    const r=await db.query('SELECT week_start::text FROM public.pds_weekly_reviews WHERE user_id=$1 AND week_start=ANY($2::date[])',[uid,weekDates]);
    if(r.rowCount)throw error('existing_weekly_review_conflict',409);
   }
   // Strict cross-entity checks beyond the structural preview.
   for(const row of body.logs){
    const a=Date.parse(row.started_at),b=Date.parse(row.ended_at);
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||Math.round((b-a)/60000)!==row.actual_minutes)throw error('invalid_log_duration');
   }
   return migrate(db,uid,body,check.counts,fingerprint);
  });
  return res.status(200).json(result);
 }catch(e){
  if(e.status)return res.status(e.status).json({error:e.message});
  if(e.code==='23505')return res.status(409).json({error:'import_conflict'});
  if(['23503','23514','22P02','22007','22008','22001','23502'].includes(e.code))return res.status(422).json({error:'invalid_import_data'});
  console.error('Legacy import failed',e.code||'unknown');
  return res.status(503).json({error:'import_unavailable'});
 }
}
