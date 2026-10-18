import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// These tests run the actual local auth proxy handler with a synthetic managed
// auth response. They NEVER contact Neon or change a real user/password/session.
const src=readFileSync(new URL('../api/auth.js',import.meta.url),'utf8')
 .replace(/^import .*?;\s*$/m,'')
 .replaceAll('export async function ','async function ')
 .replaceAll('export function ','function ')
 .replace('export default async function handler','async function handler');

const CURRENT='LOCAL_FAKE_CURRENT_PASSWORD_1234';
const NEW='LOCAL_FAKE_NEW_PASSWORD_4321';
const COOKIE='LOCAL_FAKE_SESSION_COOKIE_7777';
function result(){
 return {
  statusCode:200,headers:{},
  setHeader(k,v){this.headers[k]=v;return this},
  status(k){this.statusCode=k;return this},
  json(x){this.body=x;return this}
 };
}
function make({enabled=true,validSession=true,allowTestUid=true,upstreamStatus=200,throwWithSecret=false}={}){
 const paths=[];
 const logs=[];
 const env={NEON_AUTH_BASE_URL:'https://test-placeholder.neon.tech/auth',NEON_AUTH_COOKIE_SECRET:'LOCAL_DUMMY_ONLY'};
 if(enabled)env.PASSWORD_CHANGE_TEST_ENABLED='true';
 if(allowTestUid)env.PASSWORD_CHANGE_TEST_USER_ID='user-local-test';
 const proxy=async(_base,request,path)=>{
  const body=await request.json().catch(()=>null);
  paths.push({path,body});
  if(throwWithSecret && path==='change-password')throw Error('simulated: '+CURRENT);
  if(path==='get-session'){
   return new Response(validSession?JSON.stringify({user:{id:'user-local-test'},session:{id:'session-local-test'}}):'{}',
     {status:validSession?200:401,headers:{'Content-Type':'application/json'}});
  }
  return new Response(upstreamStatus===200?'{}':JSON.stringify({error:'server error with fake marker '+CURRENT}),
   {status:upstreamStatus,headers:{'Content-Type':'application/json'}});
 };
 const handler=new Function('handleAuthRequest','handleAuthResponse','process','console',src+'\nreturn handler;')(
  proxy,async upstream=>upstream,{env},{error:(...args)=>logs.push(args.join(' '))}
 );
 return {handler,paths,logs};
}
async function invoke(x,body={currentPassword:CURRENT,newPassword:NEW,revokeOtherSessions:false},origin='https://planner.example.test'){
 const res=result();
 await x.handler({
  query:{action:'changePassword'},method:'POST',
  headers:{host:'planner.example.test',origin,cookie:'session_token='+COOKIE},
  body
 },res);
 return res;
}
test('opt-in flag absent: change-password cannot be invoked',async()=>{
 const m=make({enabled:false});
 const r=await invoke(m);
 assert.equal(r.statusCode,404);
 assert.deepEqual(r.body,{error:'not_found'});
 assert.equal(m.paths.length,0);
});
test('rejects cross-origin request without contacting auth provider',async()=>{
 const m=make();
 const r=await invoke(m,undefined,'https://untrusted.example.test');
 assert.equal(r.statusCode,403);
 assert.equal(m.paths.length,0);
});
test('rejects absent session before forwarding passwords',async()=>{
 const m=make({validSession:false});
 const r=await invoke(m);
 assert.equal(r.statusCode,401);
 assert.deepEqual(r.body,{error:'authentication_required'});
 assert.deepEqual(m.paths.map(x=>x.path),['get-session']);
});
test('feature flag alone cannot change a password without test-account allowlist',async()=>{
 const m=make({allowTestUid:false});
 const r=await invoke(m);
 assert.equal(r.statusCode,403);
 assert.deepEqual(r.body,{error:'test_account_only'});
 assert.deepEqual(m.paths.map(x=>x.path),['get-session']);
});
test('rejects invalid passwords and avoids forwarding secret values',async()=>{
 for(const bad of [{currentPassword:CURRENT,newPassword:'short'},
                   {currentPassword:CURRENT,newPassword:CURRENT},
                   {currentPassword:'short',newPassword:NEW}]){
  const m=make();
  const r=await invoke(m,bad);
  assert.equal(r.statusCode,400);
  assert.equal(m.paths.length,0);
 }
});
test('authorized change forces revokeOtherSessions=true and never echoes passwords',async()=>{
 const m=make();
 const r=await invoke(m);
 assert.equal(r.statusCode,200);
 assert.deepEqual(m.paths.map(x=>x.path),['get-session','change-password']);
 assert.deepEqual(m.paths[1].body,{currentPassword:CURRENT,newPassword:NEW,revokeOtherSessions:true});
 assert.equal(r.body.ok,true);
 assert.doesNotMatch(JSON.stringify(r.body),/LOCAL_FAKE_(CURRENT|NEW|SESSION)/);
 assert.equal(m.logs.length,0);
});
test('provider refusal returns a generic status and no credential detail',async()=>{
 const m=make({upstreamStatus:401});
 const r=await invoke(m);
 assert.equal(r.statusCode,401);
 assert.deepEqual(r.body,{error:'password_change_rejected'});
 assert.doesNotMatch(JSON.stringify(r.body),/LOCAL_FAKE_/);
});
test('provider exception containing a fake secret is sanitized in response and server log',async()=>{
 const m=make({throwWithSecret:true});
 const r=await invoke(m);
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.body,{error:'auth_unavailable'});
 assert.equal(m.logs.length,1);
 assert.doesNotMatch(JSON.stringify(r.body)+m.logs.join(' '),/LOCAL_FAKE_/);
});
test('invalid /api/auth?action=changePassword GET is rejected',async()=>{
 const m=make();
 const r=result();
 await m.handler({query:{action:'changePassword'},method:'GET',headers:{host:'planner.example.test'}},r);
 assert.equal(r.statusCode,404);
 assert.equal(m.paths.length,0);
});
