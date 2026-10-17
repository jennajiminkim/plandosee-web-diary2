// Authenticated Task 7 diary mutations. All statements execute inside asUser()
// with SET LOCAL ROLE pds_runtime, the verified session UID, and FORCE RLS.
import { error, validId, validDate, text, number } from './db.js';

const tags=new Set(['업무','공부','취미','약속','생활','기타']);
const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#dce9dc';
const date=v=>validDate(v)?v:null;
const uuid=(v,label='ID')=>{if(!validId(v))throw error('잘못된 '+label);return v};
const stamp=v=>{const t=Date.parse(v);if(!v||!Number.isFinite(t))throw error('잘못된 날짜 또는 시각');return new Date(t).toISOString()};
const positive=(v,max=999)=>Math.max(1,number(v,max));
const mandatory=(v,name)=>{const s=text(v,180).trim();if(!s)throw error(name+'을 입력하세요.');return s};
const dateRange=(d,label='기간')=>{const start=date(d.start_date),end=date(d.end_date);if(!start||!end||end<start)throw error(label+'을 확인하세요.');return {start,end}};
const palette=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#FAFAFA';

// Table names & columns below are compile-time constants, never request-derived.
async function own(db,table,id,uid,{lock=false}={}) {
 uuid(id);
 const r=await db.query('SELECT * FROM public.'+table+' WHERE id=$1 AND user_id=$2'+(lock?' FOR UPDATE':''),[id,uid]);
 if(!r.rows[0])throw error('not_found',404);
 return r.rows[0];
}
async function add(db,table,values) {
 const keys=Object.keys(values);
 const q=await db.query(
   'INSERT INTO public.'+table+' ('+keys.map(k=>'"'+k+'"').join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',
   Object.values(values)
 );
 return q.rows[0];
}
async function patch(db,table,id,uid,fields) {
 const keys=Object.keys(fields);
 if(!keys.length)throw error('empty_update');
 const q=await db.query(
  'UPDATE public.'+table+' SET '+keys.map((k,i)=>'"'+k+'"=$'+(i+1)).join(',')+' WHERE id=$'+(keys.length+1)+' AND user_id=$'+(keys.length+2)+' RETURNING *',
  [...Object.values(fields),id,uid]
 );
 if(!q.rows[0])throw error('not_found',404);
 return q.rows[0];
}
async function active(db,table,id,uid) {
 const value=await own(db,table,id,uid);
 if(value.deleted_at)throw error('not_found',404);
 return value;
}
async function activePlan(db,id,uid) {return active(db,'pds_plans',id,uid)}
async function activeTask(db,id,uid) {return active(db,'pds_tasks',id,uid)}
async function fieldsForTask(db,uid,data,prior) {
 const pid=data.plan_id||null;
 if(pid&&!validId(pid))throw error('invalid_plan_id');
 let priority=positive(data.priority);
 if(pid){
  const plan=await own(db,'pds_plans',pid,uid);
  if(plan.deleted_at && pid!==prior?.plan_id)throw error('not_found',404);
  priority=plan.priority;
 }
 const start=date(data.start_date),end=date(data.end_date);
 if(start&&end&&end<start)throw error('할 일 기간을 확인하세요.');
 return {
  plan_id:pid,title:mandatory(data.title,'할 일 이름'),first_step:text(data.first_step,300).trim(),priority,
  tag:tags.has(data.tag)?data.tag:'기타',color:color(data.color),
  due_date:date(data.due_date),start_date:start,end_date:end,
  mode:['single','range','repeat'].includes(data.mode)?data.mode:'single',
  estimated_minutes:number(data.estimated_minutes),estimate_basis:['total','per_session'].includes(data.estimate_basis)?data.estimate_basis:'total',
  status:data.status==='done'?'done':'active'
 };
}
async function rememberColor(db,uid,value) {
 await db.query(
 'INSERT INTO public.pds_color_swatches(user_id,color,usage_count,last_used) VALUES ($1,$2,1,now()) ON CONFLICT(user_id,color) DO UPDATE SET usage_count=pds_color_swatches.usage_count+1,last_used=now()',
 [uid,value]);
}
export async function perform(db,uid,action,data) {
 let plan,task,fields,result,span;
 switch(action){
 case 'plan.create':
  span=dateRange(data,'계획 기간');
  if(data.from_reflection_id)await own(db,'pds_reflections',uuid(data.from_reflection_id),uid);
  return add(db,'pds_plans',{user_id:uid,title:mandatory(data.title,'계획 이름'),start_date:span.start,end_date:span.end,
   priority:positive(data.priority),success_criteria:text(data.success_criteria),estimated_minutes:number(data.estimated_minutes),
   from_reflection_id:data.from_reflection_id||null});
 case 'plan.update':
  plan=await activePlan(db,uuid(data.id,'계획 ID'),uid);
  // Serializing updates avoids lost version snapshots under concurrent requests.
  plan=await own(db,'pds_plans',plan.id,uid,{lock:true});
  if(plan.deleted_at)throw error('not_found',404);
  span=dateRange(data,'계획 기간');
  await add(db,'pds_plan_versions',{user_id:uid,plan_id:plan.id,snapshot:JSON.stringify(plan)});
  fields={title:mandatory(data.title,'계획 이름'),start_date:span.start,end_date:span.end,
   priority:positive(data.priority),success_criteria:text(data.success_criteria),estimated_minutes:number(data.estimated_minutes),
   updated_at:new Date().toISOString()};
  result=await patch(db,'pds_plans',plan.id,uid,fields);
  await db.query('UPDATE public.pds_tasks SET priority=$1 WHERE plan_id=$2 AND user_id=$3 AND deleted_at IS NULL',[fields.priority,plan.id,uid]);
  return result;
 case 'plan.delete':
  plan=await own(db,'pds_plans',uuid(data.id),uid);
  return plan.deleted_at?plan:patch(db,'pds_plans',plan.id,uid,{deleted_at:new Date().toISOString()});
 case 'task.create':
  fields=await fieldsForTask(db,uid,data,null);
  result=await add(db,'pds_tasks',{user_id:uid,...fields});
  await rememberColor(db,uid,result.color);
  return result;
 case 'task.update':
  task=await activeTask(db,uuid(data.id),uid);
  fields=await fieldsForTask(db,uid,{...task,...data},task);
  result=await patch(db,'pds_tasks',task.id,uid,fields);
  await rememberColor(db,uid,result.color);
  return result;
 case 'task.delete':
  task=await activeTask(db,data.id,uid);
  return patch(db,'pds_tasks',task.id,uid,{deleted_at:new Date().toISOString()});
 case 'task.complete':
  task=await own(db,'pds_tasks',uuid(data.id),uid,{lock:true});
  if(task.deleted_at)throw error('not_found',404);
  if(task.status==='done')return task;
  result=await patch(db,'pds_tasks',task.id,uid,{status:'done',completed_at:new Date().toISOString()});
  await db.query('INSERT INTO public.pds_completion_events(task_id,user_id,completed_at) VALUES($1,$2,$3) ON CONFLICT(task_id) DO NOTHING',[task.id,uid,result.completed_at]);
  return result;
 case 'task.reopen':
  task=await activeTask(db,data.id,uid);
  return patch(db,'pds_tasks',task.id,uid,{status:'active',completed_at:null});
 case 'cell.save':
  if(!date(data.day))throw error('날짜를 확인하세요.');
  task=await activeTask(db,uuid(data.task_id,'할 일 ID'),uid);
  fields={state:['planned','progress','done'].includes(data.state)?data.state:'planned',
   progress:text(data.progress,90),note:text(data.note,1000)};
  result=await db.query(
   'INSERT INTO public.pds_cells(user_id,task_id,day,state,progress,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,task_id,day) DO UPDATE SET state=excluded.state,progress=excluded.progress,note=excluded.note RETURNING *',
   [uid,task.id,data.day,fields.state,fields.progress,fields.note]);
  return result.rows[0];
 case 'cell.record':
  // One request/transaction saves the daily cell and optional timed record.
  // Existing logs are never replaced implicitly; explicit log_id updates only.
  if(!date(data.day))throw error('날짜를 확인하세요.');
  task=await activeTask(db,uuid(data.task_id,'할 일 ID'),uid);
  fields={state:['planned','progress','done'].includes(data.state)?data.state:'planned',
   progress:text(data.progress,90),note:text(data.note,1000),blocker:text(data.blocker,1000)};
  result=await db.query(
   'INSERT INTO public.pds_cells(user_id,task_id,day,state,progress,note,blocker) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,task_id,day) DO UPDATE SET state=excluded.state,progress=excluded.progress,note=excluded.note,blocker=excluded.blocker RETURNING *',
   [uid,task.id,data.day,fields.state,fields.progress,fields.note,fields.blocker]);
  const hasStart=!!data.started_at,hasEnd=!!data.ended_at;
  if(hasStart!==hasEnd)throw error('실행 시각은 시작과 종료를 모두 입력하세요.');
  let log=null;
  if(hasStart){
   const begin=stamp(data.started_at),finish=stamp(data.ended_at);
   const minutes=Math.round((Date.parse(finish)-Date.parse(begin))/60000);
   if(minutes<0||minutes>1440)throw error('실행 시간은 0~1440분이어야 합니다.');
   const values={started_at:begin,ended_at:finish,actual_minutes:minutes,progress:text(data.progress,200),blocker:fields.blocker};
   if(data.log_id){
    const old=await own(db,'pds_logs',uuid(data.log_id,'실행 기록 ID'),uid,{lock:true});
    if(old.task_id!==task.id)throw error('not_found',404);
    log=await patch(db,'pds_logs',old.id,uid,values);
   }else{
    log=await add(db,'pds_logs',{user_id:uid,task_id:task.id,...values});
   }
  }else if(data.log_id)throw error('기존 실행 기록 수정 시에는 시작과 종료 시각이 필요합니다.');
  return {cell:result.rows[0],log};
 case 'log.create':
  task=await activeTask(db,uuid(data.task_id,'할 일 ID'),uid);
  span={start:stamp(data.started_at),end:stamp(data.ended_at)};
  fields={actual_minutes:Math.round((Date.parse(span.end)-Date.parse(span.start))/60000)};
  if(fields.actual_minutes<0||fields.actual_minutes>1440)throw error('실행 시간은 0~1440분이어야 합니다.');
  return add(db,'pds_logs',{user_id:uid,task_id:task.id,started_at:span.start,ended_at:span.end,
   actual_minutes:fields.actual_minutes,progress:text(data.progress,200),blocker:text(data.blocker)});
 case 'log.delete':
  await own(db,'pds_logs',uuid(data.id,'실행 기록 ID'),uid);
  result=await db.query('DELETE FROM public.pds_logs WHERE id=$1 AND user_id=$2 RETURNING id',[data.id,uid]);
  return {deleted:result.rowCount===1};
 case 'journal.save':
  if(!date(data.week_start)||new Date(data.week_start+'T12:00:00Z').getUTCDay()!==1)throw error('주간 시작일은 월요일이어야 합니다.');
  if(data.plan_id)await activePlan(db,uuid(data.plan_id),uid);
  fields={plan_id:data.plan_id||null,question:text(data.question,350),discovery:text(data.discovery,5000),
   next_action:text(data.next_action,2000),bg_color:palette(data.bg_color),
   date_color:/^#[0-9a-f]{6}$/i.test(data.date_color||'')?data.date_color:'#1E4099'};
  result=await db.query(
   `INSERT INTO public.pds_weekly_reviews(user_id,week_start,entry_date,plan_id,question,discovery,next_action,bg_color,date_color)
    VALUES($1,$2,(now() AT TIME ZONE 'Asia/Seoul')::date,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(user_id,week_start) DO UPDATE SET
    // A weekly card shows the most recent save day in Seoul, not the day the week was first saved.
     entry_date=excluded.entry_date,
     plan_id=excluded.plan_id,question=excluded.question,discovery=excluded.discovery,next_action=excluded.next_action,
    bg_color=excluded.bg_color,date_color=excluded.date_color,updated_at=now() RETURNING *`,
   [uid,data.week_start,fields.plan_id,fields.question,fields.discovery,fields.next_action,fields.bg_color,fields.date_color]);
  if(fields.plan_id) {
   await db.query(
    `INSERT INTO public.pds_reflections(user_id,plan_id,question,answer,improvement,updated_at)
     VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(user_id,plan_id) DO UPDATE SET
     question=excluded.question,answer=excluded.answer,improvement=excluded.improvement,updated_at=now()`,
    [uid,fields.plan_id,fields.question,fields.discovery,fields.next_action]);
  }
  return result.rows[0];
 case 'reflection.save':
  await activePlan(db,uuid(data.plan_id),uid);
  result=await db.query(
   `INSERT INTO public.pds_reflections(user_id,plan_id,question,answer,improvement,updated_at)
    VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(user_id,plan_id) DO UPDATE SET
    question=excluded.question,answer=excluded.answer,improvement=excluded.improvement,updated_at=now() RETURNING *`,
   [uid,data.plan_id,text(data.question,350),text(data.answer,5000),text(data.improvement,2000)]);
  return result.rows[0];
 case 'reflection.next':
  result=await own(db,'pds_reflections',uuid(data.id,'돌아보기 ID'),uid,{lock:true});
  if(result.next_plan_id)return own(db,'pds_plans',result.next_plan_id,uid);
  if(!result.improvement?.trim())throw error('다음 주에 다르게 해볼 내용을 입력하세요.');
  span=dateRange(data,'다음 계획 기간');
  plan=await own(db,'pds_plans',result.plan_id,uid);
  task=await add(db,'pds_plans',{user_id:uid,title:result.improvement.slice(0,180),
   start_date:span.start,end_date:span.end,priority:plan.priority,
   success_criteria:result.improvement,estimated_minutes:0,from_reflection_id:result.id});
  await patch(db,'pds_reflections',result.id,uid,{next_plan_id:task.id});
  return task;
 default:throw error('unsupported_action');
 }
}
