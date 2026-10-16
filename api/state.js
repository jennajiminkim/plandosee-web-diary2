import {requireUser,asUser,tables} from './db.js';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 try {
   const uid=await requireUser(req);
   if(req.method!=='GET') return res.status(405).json({error:'writes_not_enabled'});
   const result=await asUser(uid,async client=>{
     const state={};
     for(const [key,table] of Object.entries(tables)) {
       const rows=await client.query('SELECT * FROM public.'+table+' LIMIT 3000');
       state[key]=rows.rows;
     }
     return state;
   });
   return res.status(200).json(result);
 } catch(err) {
   if(err.status)return res.status(err.status).json({error:err.message});
   console.error('Private diary read failed',err.code||'unknown');
   return res.status(503).json({error:'data_unavailable'});
 }
}
