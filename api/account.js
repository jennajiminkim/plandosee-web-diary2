// Task 7: account deletion flow. Disabled by default until managed-auth support is verified.
// NEVER accept a user_id from the browser. All rows are scoped to a verified session.
import {neonAuth,sessionInfo,forwardCookies} from './auth.js';
import {asUser,error} from './db.js';

export const privateCollections=[
 ['importBatches','pds_import_batches'],
 ['ruleChanges','pds_rule_changes'],['dailyRecords','pds_daily_records'],['experiments','pds_experiments'],
 ['dailyJournals','pds_daily_journals'],['journals','pds_weekly_reviews'],
 ['completions','pds_completion_events'],['logs','pds_logs'],['cells','pds_cells'],
 ['versions','pds_plan_versions'],['reflections','pds_reflections'],
 ['tasks','pds_tasks'],['plans','pds_plans'],['colors','pds_color_swatches']
];
const JSON_HEADERS={'Cache-Control':'private, no-store','Content-Type':'application/json; charset=utf-8'};
export function deletionEnabledFor(userId,env=process.env){
 if(env.ACCOUNT_DELETION_ENABLED!=='true')return false;
 // Preview branches may contain copied identities. Enable destructive testing
 // for one newly created fixture only, never every copied account.
 if(env.VERCEL_ENV==='preview')return Boolean(env.ACCOUNT_DELETION_TEST_USER_ID)&&env.ACCOUNT_DELETION_TEST_USER_ID===userId;
 return true;
}
function respond(res,code,data){
 for(const [key,value] of Object.entries(JSON_HEADERS))res.setHeader(key,value);
 return res.status(code).json(data);
}
function originOk(req){
 const host=req.headers.host;
 return typeof host==='string'&&/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)&&req.headers.origin==='https://'+host;
}
export async function countOwnedData(db,userId){
 const counts={};let total=0;
 for(const [key,table] of privateCollections){
  const result=await db.query('SELECT count(*)::int AS n FROM public.'+table+' WHERE user_id=$1',[userId]);
  const n=Number(result.rows[0]?.n||0);
  counts[key]=n;total+=n;
 }
 return {counts,total};
}
export async function clearOwnedData(db,userId){
 const removed={};let total=0;
 for(const [key,table] of privateCollections){
  // Explicit ownership filter AND PostgreSQL FORCE RLS, in one transaction.
  const result=await db.query('DELETE FROM public.'+table+' WHERE user_id=$1',[userId]);
  removed[key]=result.rowCount;total+=result.rowCount;
 }
 return {removed,total};
}
export function validateDeletionConfirmation({body,email}){
 if(!body||typeof body!=='object'||Array.isArray(body))throw error('invalid_confirmation',400);
 if(typeof email!=='string'||!email.includes('@'))throw error('authenticated_email_unavailable',409);
 if(typeof body.email!=='string'||body.email.trim().toLowerCase()!==email.toLowerCase())
  throw error('account_email_mismatch',400);
 if(body.confirm!=='계정 삭제')throw error('explicit_confirmation_required',400);
 if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)
  throw error('password_confirmation_required',400);
 // The password is used ONLY by managed auth. It is never stored or logged.
 return {password:body.password};
}
export async function runAccountDeletion({db,userId,managedDelete}){
 // asUser holds a SQL transaction; this staged deletion rolls back all
 // Postgres removals when managed auth rejects/does not support /delete-user.
 const before=await countOwnedData(db,userId);
 const wiped=await clearOwnedData(db,userId);
 if(wiped.total!==before.total)throw error('data_delete_count_mismatch',503);
 // Perform every SQL check before issuing the irreversible external
 // auth deletion, minimizing the chance of an orphaned data transaction.
 const remaining=await countOwnedData(db,userId);
 if(remaining.total!==0)throw error('data_delete_incomplete',503);
 const response=await managedDelete();
 if(!response?.ok){
  // Keep provider bodies private; log only fixed diagnostic categories.
  // This distinguishes an unsupported provider setting from a wrong password.
  const failure=await response?.json?.().catch(()=>null);
  const message=String(failure?.message||failure?.error?.message||'');
  const code=String(failure?.code||failure?.error?.code||'');
  const reason=/deletion.*disabled/i.test(message)||['USER_DELETION_DISABLED','USER_DELETION_IS_DISABLED'].includes(code)
   ?'deletion_disabled':/invalid password|incorrect password|password.*incorrect/i.test(message)||code==='INVALID_PASSWORD'
   ?'invalid_password':/session.*fresh/i.test(message)||['SESSION_IS_NOT_FRESH','SESSION_NOT_FRESH'].includes(code)
   ?'session_not_fresh':code==='INVALID_ORIGIN'?'invalid_origin':'unclassified';
  console.error('Managed Auth deletion rejected',Number(response?.status)||0,reason);
  throw error('auth_delete_unavailable_or_rejected',409);
 }
 let payload;
 try{payload=await response.json()}catch{throw error('auth_delete_unverified',503)}
 // Better Auth may return HTTP 200 for "Verification email sent". That is
 // NOT a deletion and must not commit the planner data deletion.
 if(payload?.success!==true||payload?.message!=='User deleted')
  throw error('auth_delete_not_completed',409);
 return {deleted:true,record_count:wiped.total};
}
export default async function handler(req,res){
 try{
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'method_not_allowed'});
  const sessionResponse=await neonAuth(req,'session');
  if(!sessionResponse.ok)throw error('authentication_required',401);
  const session=sessionInfo(await sessionResponse.json().catch(()=>null));
  if(!session.authenticated)throw error('authentication_required',401);
  const userId=session.user.id,email=session.user.email;
  if(req.method==='GET'){
   const preview=await asUser(userId,db=>countOwnedData(db,userId));
   return respond(res,200,{account_email:email,record_count:preview.total,collections:preview.counts,deletion_enabled:deletionEnabledFor(userId)});
  }
  if(!originOk(req))throw error('forbidden_origin',403);
  if(!deletionEnabledFor(userId))throw error('account_deletion_not_enabled',409);
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(Buffer.byteLength(raw)>2048)throw error('request_too_large',413);
  let body;
  try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{throw error('invalid_json',400)}
  const {password}=validateDeletionConfirmation({body,email});
  // This is a distributed operation; if the auth provider deletes the identity
  // but the final database commit fails, an operator must reconcile orphaned
  // rows. Do NOT claim cross-system atomicity.
  let deletionResponse;
  const outcome=await asUser(userId,db=>runAccountDeletion({
   db,userId,managedDelete:async()=>{
    deletionResponse=await neonAuth(req,'deleteSelf',{password});
    return deletionResponse;
   }
  }));
  forwardCookies(res,deletionResponse);
  return respond(res,200,{deleted:outcome.deleted,deleted_records:outcome.record_count});
 }catch(e){
  if(e?.status)return respond(res,e.status,{error:e.message});
  // Never print user email, password, token, cookie or provider response.
  console.error('Account deletion flow failed',e?.code||'unknown');
  return respond(res,503,{error:'account_deletion_unavailable'});
 }
}
