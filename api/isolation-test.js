import {requireUser,asUser,error,validId} from './db.js';
const MARK='[T07_ISOLATION_TEST]';
function send(res,status,obj){res.setHeader('Cache-Control','no-store');return res.status(status).json(obj)}
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 try{
  const uid=await requireUser(req);
  if(req.method==='GET'){
   const items=await asUser(uid,async db=>(await db.query('SELECT id,title,start_date,end_date FROM public.pds_plans WHERE title LIKE $1 ORDER BY created_at DESC LIMIT 20',[MARK+'%'])).rows);
   return send(res,200,{items});
  }
  if(req.method!=='POST')return send(res,405,{error:'method_not_allowed'});
  if(req.headers.origin!=='https://'+req.headers.host)return send(res,403,{error:'forbidden_origin'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(Buffer.byteLength(raw)>2048)return send(res,413,{error:'request_too_large'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(body.action==='create'){
   const entry=await asUser(uid,async db=>(await db.query("INSERT INTO public.pds_plans(user_id,title,start_date,end_date,priority) VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,1) RETURNING id,title",[uid,MARK+' private test'])).rows[0]);
   return send(res,200,{entry});
  }
  if(body.action==='delete'){
   if(!validId(body.id))throw error('invalid_id');
   const result=await asUser(uid,async db=>(await db.query('DELETE FROM public.pds_plans WHERE id=$1 AND title=$2 RETURNING id',[body.id,MARK+' private test'])).rows);
   if(!result.length)return send(res,404,{error:'not_found'});
   return send(res,200,{deleted:true});
  }
  return send(res,400,{error:'unsupported_action'});
 }catch(e){
  if(e.status)return send(res,e.status,{error:e.message});
  console.error('Isolation test failure',e.code||'unknown');
  return send(res,503,{error:'test_unavailable'});
 }
}
