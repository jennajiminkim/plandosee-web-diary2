import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sessionIds={
 A:'aaaa0000-0000-4000-8000-000000000001',
 B:'bbbb0000-0000-4000-8000-000000000002'
};
const PREFIX='[T07 계정격리 검사]';
function loadOwnership(mock){
 const code=read('../api/ownership-test.js')
  .replace(/^import .*?;\s*$/m,'')
  .replace('export default async function handler','async function handler');
 return new Function('requireUser','asUser','validId',code+'\nreturn handler;')(
  async req=>req._sessionUid,
  async(uid,callback)=>callback(mock.db(uid)),
  value=>typeof value==='string'&&/^[a-z0-9]{8}-[0-9a-z-]{27}$/i.test(value)
 );
}
function createMock(){
 const rows=[
  {id:sessionIds.A,user_id:'A',title:PREFIX+' A-only',success_criteria:''},
  {id:sessionIds.B,user_id:'B',title:PREFIX+' B-only',success_criteria:''}
 ];
 const db=uid=>({query:async(sql,args)=>{
  // A mock for user-scoped SQL, not a substitute for a live PostgreSQL/RLS test.
  if(sql.includes('SELECT count(*)')){
   assert.equal(args[0],uid);
   return {rows:[{n:rows.filter(r=>r.user_id===uid).length}]};
  }
  if(sql.startsWith('SELECT ')&&sql.includes('ORDER BY')){
   assert.equal(args[0],uid);
   return {rows:rows.filter(r=>r.user_id===uid&&r.title.startsWith(PREFIX))};
  }
  if(sql.startsWith('SELECT ')&&sql.includes('WHERE id=$1')){
   assert.equal(args[1],uid);
   return {rows:rows.filter(r=>r.id===args[0]&&r.user_id===uid)};
  }
  if(sql.startsWith('INSERT INTO')){
   assert.equal(args[0],uid);
   const record={id:'00000000-0000-4000-8000-0000000000ff',user_id:uid,title:PREFIX+' generated',success_criteria:''};
   rows.push(record);return {rows:[record],rowCount:1};
  }
  if(sql.startsWith('UPDATE ')){
   assert.equal(args[1],uid); // id, authenticated user id, prefix
   const found=rows.find(r=>r.id===args[0]&&r.user_id===uid);
   if(!found)return {rows:[],rowCount:0};
   if(sql.includes('SET deleted_at')){rows.splice(rows.indexOf(found),1);return {rows:[{id:found.id}],rowCount:1}};
   found.success_criteria='본인 수정 검증 완료';
   return {rows:[found],rowCount:1};
  }
  throw Error('Unknown SQL in mock: '+sql);
 }});
 return {rows,db};
}
function res(){
 return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};
}
async function request(handler,uid,method,body={},query={},extraHeaders={}){
 const response=res();
 const req={_sessionUid:uid,method,query,body,headers:{host:'plandosee-web-diary2.vercel.app',origin:'https://plandosee-web-diary2.vercel.app',...extraHeaders}};
 await handler(req,response);
 return response;
}
test('T07-C125: A and B each receive only their own records in the list (mocked)',async()=>{
 const fake=createMock(),handler=loadOwnership(fake);
 const a=await request(handler,'A','GET');
 const b=await request(handler,'B','GET');
 assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);
 assert.deepEqual(a.body.records.map(r=>r.id),[sessionIds.A]);
 assert.deepEqual(b.body.records.map(r=>r.id),[sessionIds.B]);
});
test('T07-C123: query and forged account header cannot change the verified list owner (mocked)',async()=>{
 const fake=createMock(),handler=loadOwnership(fake);
 const response=await request(handler,'A','GET',{user_id:'B'}, {user_id:'B',account_id:'B'}, {'x-user-id':'B','x-account-id':'B'});
 assert.equal(response.statusCode,200);
 assert.deepEqual(response.body.records.map(r=>r.id),[sessionIds.A]);
});
test('T07-C123: forged owner in write body cannot create a B record from A session (mocked)',async()=>{
 const fake=createMock(),handler=loadOwnership(fake);
 const beforeB=fake.rows.filter(r=>r.user_id==='B').length;
 const response=await request(handler,'A','POST',{user_id:'B',owner:'B',account_id:'B'});
 assert.equal(response.statusCode,201);
 assert.equal(fake.rows.at(-1).user_id,'A');
 assert.equal(fake.rows.filter(r=>r.user_id==='B').length,beforeB);
});
test('T07-C122: denied foreign writes preserve both owners data and counts (mocked)',async()=>{
 const fake=createMock(),handler=loadOwnership(fake);
 for(const [uid,other] of [['A',sessionIds.B],['B',sessionIds.A]]){
  const snapshot=JSON.stringify(fake.rows);
  for(const method of ['PATCH','DELETE']){
   const response=await request(handler,uid,method,{id:other,user_id:uid});
   assert.equal(response.statusCode,404);
   assert.deepEqual(response.body,{error:'not_found'});
   assert.equal(JSON.stringify(fake.rows),snapshot,'denied write must not alter mock rows');
  }
 }
});

function loadAuth(){
 const code=read('../api/auth.js')
  .replace(/^import .*?;\s*$/m,'')
  .replace('export default async function handler','async function handler')
  .replaceAll('export function ','function ')
  .replaceAll('export async function ','async function ');
 const fakeProcess={env:{NEON_AUTH_BASE_URL:'https://fake-branch.neon.tech',NEON_AUTH_COOKIE_SECRET:'UNIT_TEST_NOT_A_SECRET'}};
 const handleAuthRequest=async()=>new Response(JSON.stringify({error:'invalid_credentials'}),{status:401,headers:{'Content-Type':'application/json'}});
 const handleAuthResponse=async upstream=>upstream;
 return new Function('handleAuthRequest','handleAuthResponse','process',code+'\nreturn handler;')(handleAuthRequest,handleAuthResponse,fakeProcess);
}
test('T07-C99: unknown email and incorrect password return identical 401 and error text (mocked upstream)',async()=>{
 const handler=loadAuth();
 const call=async(email,password)=>{
  const response=res();
  await handler({method:'POST',query:{action:'login'},headers:{host:'plandosee-web-diary2.vercel.app',origin:'https://plandosee-web-diary2.vercel.app'},body:{email,password}},response);
  return response;
 };
 const missing=await call('not-existing@example.invalid','dummy-not-real-123');
 const incorrect=await call('test@example.invalid','dummy-not-real-456');
 assert.equal(missing.statusCode,401);assert.equal(incorrect.statusCode,401);
 assert.deepEqual(missing.body,incorrect.body);
 assert.equal(missing.body.error,'이메일 또는 비밀번호를 확인해 주세요.');
 assert.doesNotMatch(JSON.stringify(missing.body),/dummy-not-real|test@example.invalid|not-existing@example.invalid/);
});
