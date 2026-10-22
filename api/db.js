import pg from 'pg';
import { neonAuth, sessionInfo } from './auth.js';

const { Pool } = pg;
// Serverless instance-local pool: reuses TLS connections across warm invocations.
const pool = new Pool({connectionString:process.env.DATABASE_URL, max:3, idleTimeoutMillis:15000, connectionTimeoutMillis:6000, query_timeout:10000, statement_timeout:10000, ssl:{rejectUnauthorized:true}});
// Preserve PostgreSQL DATE values as YYYY-MM-DD for the Task 6 calendar UI.
pg.types.setTypeParser(1082, 'text', value => value);
export const tables = {
  plans:'pds_plans', versions:'pds_plan_versions', tasks:'pds_tasks', cells:'pds_cells',
  logs:'pds_logs', completions:'pds_completion_events', reflections:'pds_reflections',
  journals:'pds_weekly_reviews', dailyJournals:'pds_daily_journals', colors:'pds_color_swatches'
};
export function error(message, status=400) {
  return Object.assign(new Error(message),{status});
}
export async function requireUser(req) {
  const response=await neonAuth(req,'session');
  if(!response.ok) throw error('authentication_required',401);
  const payload=await response.json().catch(()=>null);
  const user=sessionInfo(payload);
  if(!user.authenticated || !user.user.id) throw error('authentication_required',401);
  return user.user.id;
}
export async function asUser(userId,callback) {
  if(!process.env.DATABASE_URL) throw error('database_not_configured',503);
  const client=await pool.connect();
  try { return await inUserTransaction(client,userId,callback); }
  finally { client.release(); }
}
export async function inUserTransaction(client,userId,callback) {
  try {
    await client.query('BEGIN');
    // Serialize all app data operations with account deletion. A request that
    // authenticated before deletion must not recreate rows after it commits.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[userId]);
    const identity=await client.query('SELECT EXISTS (SELECT 1 FROM neon_auth."user" WHERE id::text=$1) AS present',[userId]);
    if(identity.rows[0]?.present!==true)throw error('authentication_required',401);
    // Connection role can be Neon owner, but EVERY data query is executed under
    // a non-login, non-BYPASSRLS PostgreSQL role inside this transaction.
    await client.query('SET LOCAL ROLE pds_runtime');
    await client.query("SELECT set_config('app.user_id',$1,true)",[userId]);
    const result=await callback(client);
    await client.query('COMMIT');
    return result;
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    throw e;
  }
}
export const validId=x=>typeof x==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export const validDate=x=>typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export const text=(s,max=1000)=>String(s??'').slice(0,max);
export const number=(s,max=100000)=>Math.min(max,Math.max(0,Math.round(Number(s)||0)));
export async function owned(client,table,id) {
  if(!validId(id)) throw error('invalid_id');
  const name=tables[table];
  if(!name || table==='colors'||table==='completions') throw error('invalid_table');
  const r=await client.query('SELECT * FROM public.'+name+' WHERE id=$1 LIMIT 1',[id]);
  if(!r.rows[0]) throw error('not_found',404);
  return r.rows[0];
}
export async function insert(client,table,values) {
  const columns=Object.keys(values);
  const sql='INSERT INTO public.'+tables[table]+' ('+columns.map(c=>'"'+c+'"').join(',')+') VALUES ('+columns.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *';
  return (await client.query(sql,Object.values(values))).rows[0];
}
export async function update(client,table,id,values) {
  const keys=Object.keys(values);
  if(!keys.length) throw error('empty_update');
  const sql='UPDATE public.'+tables[table]+' SET '+keys.map((c,i)=>'"'+c+'"=$'+(i+1)).join(',')+' WHERE id=$'+(keys.length+1)+' RETURNING *';
  const r=await client.query(sql,[...Object.values(values),id]);
  if(!r.rows[0]) throw error('not_found',404);
  return r.rows[0];
}
