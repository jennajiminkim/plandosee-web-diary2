// Task 7: five real observation days, one pre/post rule revision.
import {requireUser,asUser,error,validId,validDate} from './db.js';
const rules={missing_rule:'누락값 처리',duplicate_rule:'중복값 처리',outlier_rule:'이상값 처리',rounding_rule:'반올림 처리'};
const bounded=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max;
function validateMetric(e,value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000000)throw error('invalid_metric_value');
 if(e.metric_name==='하루에 첫 행동을 실행한 할 일 수'&&e.metric_unit==='건'&&(!Number.isInteger(value)||value>3))throw error('first_step_value_must_be_0_to_3');
 return Math.round(value*10000)/10000;
}
function send(res,status,body){res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(status).json(body)}
async function state(db,uid){
 const [one,rows,changes,clock]=await Promise.all([
  db.query('SELECT * FROM public.pds_experiments WHERE user_id=$1 ORDER BY created_at ASC LIMIT 1',[uid]),
  db.query('SELECT * FROM public.pds_daily_records WHERE user_id=$1 ORDER BY record_date ASC LIMIT 6',[uid]),
  db.query('SELECT * FROM public.pds_rule_changes WHERE user_id=$1 ORDER BY changed_at ASC LIMIT 2',[uid]),
  db.query("SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS today")
 ]);
 const data=rows.rows,change=changes.rows[0]||null;
 const nums=part=>part.filter(x=>x.metric_value!==null).map(x=>Number(x.metric_value));
 const average=a=>a.length?Math.round((a.reduce((s,x)=>s+x,0)/a.length)*10000)/10000:null;
 const before=nums(data.slice(0,2)),after=nums(data.slice(2,5));
 return {experiment:one.rows[0]||null,records:data,change,today:clock.rows[0].today,
  progress:{observed_days:data.length,rule_changes:changes.rows.length,day1_day2_mean:before.length===2?average(before):null,
  day3_day5_mean:after.length===3?average(after):null,
  comparison_ready:data.length===5&&Boolean(change)&&before.length===2&&after.length===3}};
}
export async function run(db,uid,action,data){
 // Serializes concurrent duplicate daily-record/revision writes for this user.
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,20261016))',[uid]);
 const current=await state(db,uid);
 const e=current.experiment,rows=current.records;
 if(action==='create'){
  if(e)throw error('experiment_already_exists',409);
  if(!bounded(data.question,500)||!bounded(data.metric_name,120)||!bounded(data.metric_unit,40)||!bounded(data.calculation_rule,1000))throw error('required_fields_missing');
  for(const key of Object.keys(rules))if(!bounded(data[key],500))throw error('required_rule_missing');
  await db.query(
   'INSERT INTO public.pds_experiments(user_id,question,metric_name,metric_unit,calculation_rule,missing_rule,duplicate_rule,outlier_rule,rounding_rule) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [uid,data.question.trim(),data.metric_name.trim(),data.metric_unit.trim(),data.calculation_rule.trim(),
    ...Object.keys(rules).map(k=>data[k].trim())]);
 }else if(action==='record'){
  if(!e)throw error('experiment_required',409);
  if(rows.length>=5)throw error('five_days_complete',409);
  if(rows.length>=2&&!current.change)throw error('revise_one_rule_before_day3',409);
  if(data.record_date!==current.today||!validDate(data.record_date))throw error('record_only_current_seoul_day');
  if(rows.some(row=>row.record_date===data.record_date))throw error('already_recorded_today',409);
  // A distinct real Korean calendar day per observation; no retroactive day data.
  const value=validateMetric(e,data.metric_value);
  if(!bounded(data.note,1500))throw error('record_note_required');
  await db.query(
    'INSERT INTO public.pds_daily_records(user_id,experiment_id,record_date,metric_value,note) VALUES ($1,$2,$3,$4,$5)',
    [uid,e.id,current.today,value,data.note.trim()]);
 }else if(action==='record.update'){
  // Correction is allowed only for an EXISTING entry on the current Seoul day.
  // This does not create another day or let the client backdate observation data.
  if(!e)throw error('experiment_required',409);
  if(data.record_date!==current.today||!validDate(data.record_date))throw error('record_only_current_seoul_day');
  const todayIndex=rows.findIndex(row=>row.record_date===current.today);
  if(todayIndex<0)throw error('today_record_not_found',404);
  const existing=rows[todayIndex];
  if(!validId(data.record_id)||data.record_id!==existing.id)throw error('not_found',404);
  // Once Day 1–2 are used as evidence for the one-time rule revision, lock them.
  if(current.change&&todayIndex<2)throw error('record_locked_after_revision',409);
  const value=validateMetric(e,data.metric_value);
  if(!bounded(data.note,1500))throw error('record_note_required');
  const updated=await db.query(
   'UPDATE public.pds_daily_records SET metric_value=$1,note=$2 WHERE id=$3 AND user_id=$4 AND experiment_id=$5 AND record_date=$6 RETURNING id',
   [value,data.note.trim(),existing.id,uid,e.id,current.today]
  );
  if(updated.rowCount!==1)throw error('today_record_not_found',404);
 }else if(action==='revise'){
  if(!e||rows.length!==2||current.change)throw error('revision_requires_exactly_two_days',409);
  const field=data.rule_field;
  if(!Object.hasOwn(rules,field))throw error('unsupported_rule');
  if(!bounded(data.new_rule,500)||!bounded(data.reason,1500))throw error('revision_details_required');
  if(e[field]===data.new_rule.trim())throw error('rule_must_change');
  const old='['+rules[field]+'] '+e[field],now='['+rules[field]+'] '+data.new_rule.trim();
  await db.query(
    'INSERT INTO public.pds_rule_changes(user_id,experiment_id,old_rule,new_rule,reason,day1_record_id,day2_record_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uid,e.id,old,now,data.reason.trim(),rows[0].id,rows[1].id]);
  // Exactly one handling rule may change; metric & calculation definition stay immutable.
  await db.query('UPDATE public.pds_experiments SET '+field+'=$1 WHERE id=$2 AND user_id=$3',[data.new_rule.trim(),e.id,uid]);
 }else throw error('unsupported_action');
 return state(db,uid);
}
export default async function handler(req,res){
 try{
  const uid=await requireUser(req);
  if(req.method==='GET')return send(res,200,await asUser(uid,db=>state(db,uid)));
  if(req.method!=='POST')return send(res,405,{error:'method_not_allowed'});
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)return send(res,403,{error:'forbidden_origin'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(Buffer.byteLength(raw)>9000)return send(res,413,{error:'request_too_large'});
  let body;
  try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{throw error('invalid_json')}
  if(!body||typeof body!=='object'||Array.isArray(body)||!body.data||typeof body.data!=='object')throw error('invalid_input');
  const result=await asUser(uid,db=>run(db,uid,body.action,body.data));
  return send(res,200,result);
 }catch(e){
  if(e.status)return send(res,e.status,{error:e.message});
  if(e.code==='23505')return send(res,409,{error:'duplicate_record'});
  if(['23503','23514','23502','22P02','22003'].includes(e.code))return send(res,422,{error:'invalid_record'});
  console.error('Task7 observation error',e.code||'unknown');
  return send(res,503,{error:'observation_unavailable'});
 }
}
