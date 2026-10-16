import {requireUser,asUser,tables,error} from './db.js';
import {perform} from './actions.js';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 try {
   const uid=await requireUser(req);
   if(req.method==='GET') {
     const result=await asUser(uid,async client=>{
       // One database round trip instead of nine sequential SELECT calls.
       // Table names are a compile-time whitelist, never browser input.
       // Each relation is filtered by the verified user as well as FORCE RLS.
       const parts=Object.entries(tables).map(([key,table])=>
         "'"+key+"', COALESCE((SELECT json_agg(r) FROM "+
         "(SELECT * FROM public."+table+" WHERE user_id=$1 LIMIT 3000) AS r), '[]'::json)"
       );
       const result=await client.query(
         "SELECT json_build_object("+parts.join(',')+") AS state",
         [uid]
       );
       return result.rows[0].state;
     });
     return res.status(200).json(result);
   }
   if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
   const host=req.headers.host;
   if(!host || req.headers.origin!=='https://'+host)return res.status(403).json({error:'forbidden_origin'});
   const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
   if(Buffer.byteLength(raw)>24000)return res.status(413).json({error:'request_too_large'});
   let payload;
   try{payload=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{throw error('invalid_json')}
   if(!payload||typeof payload!=='object'||typeof payload.action!=='string'||!payload.data||typeof payload.data!=='object'||Array.isArray(payload.data))throw error('invalid_input');
   const result=await asUser(uid,client=>perform(client,uid,payload.action,payload.data));
   return res.status(200).json({ok:true,result});
 } catch(err) {
   if(err.status)return res.status(err.status).json({error:err.message});
   if(err.code==='23505')return res.status(409).json({error:'duplicate_record'});
   if(['23503','23514','22P02','22007','22008','22001'].includes(err.code))return res.status(400).json({error:'invalid_data'});
   console.error('Private diary transaction failed',err.code||'unknown');
   return res.status(503).json({error:'data_unavailable'});
 }
}
