import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Uses the actual requireUser() and state handler source, with fake provider
// replies. No real cookies, Neon sessions, user data or DB writes are used.
const authSrc=readFileSync(new URL('../api/auth.js',import.meta.url),'utf8');
const dbSrc=readFileSync(new URL('../api/db.js',import.meta.url),'utf8');
const stateSrc=readFileSync(new URL('../api/state.js',import.meta.url),'utf8');

const sessionInfoCode=authSrc.match(/export function sessionInfo\(data\) \{[\s\S]*?\n\}/)?.[0];
const requireUserCode=dbSrc.match(/export async function requireUser\(req\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(sessionInfoCode&&requireUserCode,'real source functions must exist');
function makeAuthentication(responseOk,payload){
 const neonAuth=async()=>({ok:responseOk,json:async()=>payload});
 const error=(message,status)=>Object.assign(new Error(message),{status});
 return new Function('neonAuth','error',
   sessionInfoCode.replace('export function','function')+'\n'+
   requireUserCode.replace('export async function','async function')+'\nreturn requireUser;'
 )(neonAuth,error);
}
function res(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
function makeState(requireUser){
 let dbCalls=0;
 const source=stateSrc.replace(/^import .*?;\s*$/m,'')
   .replace('export default async function handler','async function handler');
 const fn=new Function('requireUser','asUser','tables','error','perform',source+'\nreturn handler;')(
  requireUser,
  async()=>{dbCalls++;throw Error('DB must not be accessed')},
  {},(message,status=400)=>Object.assign(new Error(message),{status}),()=>{}
 );
 return{fn,calls:()=>dbCalls};
}
async function expectBlocked(auth){
 const api=makeState(auth);const response=res();
 await api.fn({method:'GET',headers:{cookie:'LOCAL_FAKE_ONLY'}},response);
 assert.equal(response.statusCode,401);
 assert.deepEqual(response.body,{error:'authentication_required'});
 assert.equal(api.calls(),0,'no private database read after invalid session');
}
test('T07-C111 mocked: managed auth rejects expired session -> diary HTTP 401',async()=>{
 await expectBlocked(makeAuthentication(false,null));
});
test('T07-C111 mocked: provider returns no session -> diary HTTP 401',async()=>{
 await expectBlocked(makeAuthentication(true,null));
});
test('T07-C111 mocked: user exists but session absent -> diary HTTP 401',async()=>{
 await expectBlocked(makeAuthentication(true,{user:{id:'uid-example-only'}}));
});
test('T07-C111 mocked: no authenticated ID -> diary HTTP 401',async()=>{
 await expectBlocked(makeAuthentication(true,{user:{name:'fake'},session:{id:'fake'}}));
});
test('T07-C111 mocked: valid user and session produce user ID only',async()=>{
 const fn=makeAuthentication(true,{user:{id:'uid-example-only'},session:{id:'nonsecret-fake'}});
 assert.equal(await fn({}), 'uid-example-only');
});
