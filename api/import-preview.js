import {requireUser,error,validId,validDate} from './db.js';

const keys=['plans','versions','tasks','cells','logs','completions','reflections','journals','dailyJournals','colors'];
const uuid=validId;
const accept=(row)=>row&&typeof row==='object'&&!Array.isArray(row);
const validColor=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const bounded=(s,n)=>typeof s==='string'&&s.length<=n;
const point=(errors,msg)=>{if(errors.length<50)errors.push(msg)};
export function preview(body){
 if(!accept(body)||body.app!=='plan.do.see')throw error('not_a_plan_do_see_backup');
 const collections={},issues=[];
 let total=0;
 for(const key of keys){
  // Older backups have no dailyJournals collection.
  if(key==='dailyJournals'&&body[key]===undefined){collections[key]=[];continue}
  if(!Array.isArray(body[key])){point(issues,key+': missing_array');collections[key]=[];continue}
  if(body[key].length>3000)throw error('import_collection_too_large',413);
  collections[key]=body[key];
  total+=body[key].length;
  for(const [i,row] of body[key].entries()){
   if(!accept(row))point(issues,key+'['+i+']: invalid_record');
   if(accept(row)&&('user_id' in row||'password' in row||'session' in row))
    point(issues,key+'['+i+']: forbidden_identity_field');
  }
 }
 if(total>10000)throw error('import_too_large',413);
 const {plans,versions,tasks,cells,logs,completions,reflections,journals,dailyJournals,colors}=collections;
 const ids={};
 for(const key of ['plans','versions','tasks','cells','logs','reflections','journals','dailyJournals']){
  ids[key]=new Set();
  for(const [i,row] of collections[key].entries()){
   if(!accept(row))continue;
   if(!uuid(row.id))point(issues,key+'['+i+']: invalid_id');
   if(ids[key].has(row.id))point(issues,key+'['+i+']: duplicate_id');
   ids[key].add(row.id);
  }
 }
 const owns=(key,id)=>uuid(id)&&ids[key].has(id);
 for(const [i,p] of plans.entries()){
  if(!accept(p))continue;
  if(!bounded(p.title,180)||!p.title?.trim())point(issues,'plans['+i+']: invalid_title');
  if(!validDate(p.start_date)||!validDate(p.end_date)||p.end_date<p.start_date)point(issues,'plans['+i+']: invalid_date_range');
  if(p.from_reflection_id&&!owns('reflections',p.from_reflection_id))point(issues,'plans['+i+']: unknown_reflection');
 }
 for(const [i,t] of tasks.entries()){
  if(!accept(t))continue;
  if(!bounded(t.title,180)||!t.title?.trim())point(issues,'tasks['+i+']: invalid_title');
  if(t.plan_id&&!owns('plans',t.plan_id))point(issues,'tasks['+i+']: unknown_plan');
  for(const f of ['start_date','end_date','due_date'])if(t[f]&&!validDate(t[f]))point(issues,'tasks['+i+']: invalid_'+f);
 }
 const relations=[['versions','plan_id','plans'],['cells','task_id','tasks'],['logs','task_id','tasks'],['completions','task_id','tasks'],['reflections','plan_id','plans']];
 for(const [key,field,target] of relations)for(const [i,row] of collections[key].entries()){
  if(accept(row)&&!owns(target,row[field]))point(issues,key+'['+i+']: unknown_'+target);
 }
 for(const [i,r] of reflections.entries()){
  if(accept(r)&&r.next_plan_id&&!owns('plans',r.next_plan_id))point(issues,'reflections['+i+']: unknown_next_plan');
 }
 for(const [i,j] of journals.entries()){
  if(!accept(j))continue;
  if(!validDate(j.week_start)||new Date(j.week_start+'T12:00:00Z').getUTCDay()!==1)point(issues,'journals['+i+']: invalid_week_start');
  if(j.plan_id&&!owns('plans',j.plan_id))point(issues,'journals['+i+']: unknown_plan');
 }
 const dailyDates=new Set();
 for(const [i,j] of dailyJournals.entries()){
  if(!accept(j))continue;
  if(!validDate(j.entry_date))point(issues,'dailyJournals['+i+']: invalid_entry_date');
  if(j.plan_id&&!owns('plans',j.plan_id))point(issues,'dailyJournals['+i+']: unknown_plan');
  if(!bounded(j.discovery,5000)||!bounded(j.next_action,2000))point(issues,'dailyJournals['+i+']: invalid_text_length');
  if(!(j.discovery?.trim()||j.next_action?.trim()))point(issues,'dailyJournals['+i+']: empty_card');
  if(dailyDates.has(j.entry_date))point(issues,'dailyJournals['+i+']: duplicate_date');
  dailyDates.add(j.entry_date);
 }
 const swatches=new Set(),cellsSeen=new Set(),journalWeeks=new Set(),reflectionsSeen=new Set();
 for(const [i,c] of cells.entries()){
  if(!accept(c))continue;
  if(!validDate(c.day))point(issues,'cells['+i+']: invalid_day');
  const unique=c.task_id+'|'+c.day;if(cellsSeen.has(unique))point(issues,'cells['+i+']: duplicate_cell');cellsSeen.add(unique);
 }
 for(const [i,c] of colors.entries()){
  if(!accept(c))continue;
  if(!validColor(c.color))point(issues,'colors['+i+']: invalid_color');
  if(swatches.has(c.color))point(issues,'colors['+i+']: duplicate_color');swatches.add(c.color);
 }
 for(const [i,j] of journals.entries())if(accept(j)){if(journalWeeks.has(j.week_start))point(issues,'journals['+i+']: duplicate_week');journalWeeks.add(j.week_start)}
 for(const [i,r] of reflections.entries())if(accept(r)){if(reflectionsSeen.has(r.plan_id))point(issues,'reflections['+i+']: duplicate_plan');reflectionsSeen.add(r.plan_id)}
 return {valid:issues.length===0,can_import_now:false,counts:Object.fromEntries(keys.map(k=>[k,collections[k].length])),
  total_records:total,issues,requires_confirmation:'현재 미리보기만 지원합니다. 실제 가져오기는 원본 JSON 검증 후 구현합니다.'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 try{
  await requireUser(req);
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'forbidden_origin'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(Buffer.byteLength(raw)>750000)return res.status(413).json({error:'import_file_too_large'});
  let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{throw error('invalid_json')}
  return res.status(200).json(preview(data));
 }catch(e){
  if(e.status)return res.status(e.status).json({error:e.message});
  console.error('Private import preview failed',e.code||'unknown');
  return res.status(503).json({error:'preview_unavailable'});
 }
}
