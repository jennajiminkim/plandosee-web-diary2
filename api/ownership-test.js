import { requireUser, asUser, validId } from './db.js';

const PREFIX = '[T07 계정격리 검사]';
const columns = 'id,title,success_criteria';
function response(res,status,data) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(data);
}
function safe(row) {
  return {id:row.id,title:row.title,verified:row.success_criteria==='본인 수정 검증 완료'};
}

export default async function handler(req,res) {
  try {
    const userId=await requireUser(req);
    if(!['GET','POST','PATCH','DELETE'].includes(req.method)) {
      return response(res,405,{error:'method_not_allowed'});
    }
    if(req.method!=='GET') {
      const host=req.headers.host;
      if(!host || req.headers.origin!=='https://'+host) {
        return response(res,403,{error:'forbidden_origin'});
      }
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
      if(Buffer.byteLength(raw)>1024) return response(res,413,{error:'request_too_large'});
    }
    const outcome=await asUser(userId,async db=>{
      if(req.method==='GET') {
        const id=req.query?.id;
        if(id!==undefined) {
          if(typeof id!=='string'||!validId(id)) return {status:400,error:'invalid_id'};
          const q=await db.query(
            'SELECT '+columns+' FROM public.pds_plans WHERE id=$1 AND user_id=$2 AND title LIKE $3 AND deleted_at IS NULL',
            [id,userId,PREFIX+'%']
          );
          return q.rows.length?{status:200,record:safe(q.rows[0])}:{status:404,error:'not_found'};
        }
        const q=await db.query(
          'SELECT '+columns+' FROM public.pds_plans WHERE user_id=$1 AND title LIKE $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10',
          [userId,PREFIX+'%']
        );
        return {status:200,records:q.rows.map(safe)};
      }
      if(req.method==='POST') {
        const q=await db.query(
          'SELECT count(*)::int AS n FROM public.pds_plans WHERE user_id=$1 AND title LIKE $2 AND deleted_at IS NULL',
          [userId,PREFIX+'%']
        );
        if(q.rows[0].n>=5) return {status:409,error:'test_record_limit'};
        const saved=await db.query(
          "INSERT INTO public.pds_plans(user_id,title,start_date,end_date,priority,success_criteria) VALUES ($1,$2,date_trunc('week',now() AT TIME ZONE 'Asia/Seoul')::date,(date_trunc('week',now() AT TIME ZONE 'Asia/Seoul')::date+6),1,'') RETURNING "+columns,
          [userId,PREFIX+' 테스트 계획']
        );
        return {status:201,record:safe(saved.rows[0])};
      }
      let data;
      try {data=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}
      catch {return {status:400,error:'invalid_json'};}
      if(!validId(data?.id)) return {status:400,error:'invalid_id'};
      if(req.method==='PATCH') {
        const result=await db.query(
          "UPDATE public.pds_plans SET success_criteria='본인 수정 검증 완료',updated_at=now() WHERE id=$1 AND user_id=$2 AND title LIKE $3 AND deleted_at IS NULL RETURNING "+columns,
          [data.id,userId,PREFIX+'%']
        );
        return result.rows.length?{status:200,record:safe(result.rows[0])}:{status:404,error:'not_found'};
      }
      const result=await db.query(
        'UPDATE public.pds_plans SET deleted_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND title LIKE $3 AND deleted_at IS NULL RETURNING id',
        [data.id,userId,PREFIX+'%']
      );
      return result.rows.length?{status:200,deleted:true}:{status:404,error:'not_found'};
    });
    const {status,...payload}=outcome;
    return response(res,status,payload);
  } catch(e) {
    if(e.status) return response(res,e.status,{error:e.message});
    console.error('Ownership test request failed',e.code||'unknown');
    return response(res,503,{error:'test_unavailable'});
  }
}
