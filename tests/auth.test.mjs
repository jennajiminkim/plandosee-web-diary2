import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{neonAuth,forwardCookies} from '../api/auth.js';
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(v){this.body=v;return this}}}
test('sensitive session checks bypass provider cookie caching',async t=>{
 const old=globalThis.fetch,base=process.env.NEON_AUTH_BASE_URL;
 process.env.NEON_AUTH_BASE_URL='https://example.neon.tech/auth';
 t.after(()=>{globalThis.fetch=old;if(base===undefined)delete process.env.NEON_AUTH_BASE_URL;else process.env.NEON_AUTH_BASE_URL=base});
 let requested;
 globalThis.fetch=async url=>{requested=new URL(url);return Response.json(null)};
 await neonAuth({headers:{host:'test.example',cookie:''}},'session');
 assert.equal(requested.pathname,'/auth/get-session');
 assert.equal(requested.searchParams.get('disableCookieCache'),'true');
});
test('public proxy rejects direct deletion and cross-origin login before calling provider',async()=>{
 const direct=response();await handler({method:'POST',query:{action:'deleteSelf'},headers:{}},direct);
 assert.equal(direct.statusCode,404);
 const cross=response();await handler({method:'POST',query:{action:'login'},headers:{host:'test.example',origin:'https://other.example'}},cross);
 assert.equal(cross.statusCode,403);
});
test('cookie expirations retain Max-Age=0 and become same-origin HttpOnly cookies',()=>{
 const res=response();
 forwardCookies(res,new Response(null,{headers:{'Set-Cookie':'__Secure-neon-auth.session_token=; Max-Age=0; Path=/auth; Domain=example.neon.tech; Secure; SameSite=None'}}));
 const cookie=res.headers['Set-Cookie'][0];
 assert.match(cookie,/Max-Age=0/);assert.match(cookie,/Path=\//);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 assert.doesNotMatch(cookie,/Domain=/i);
});

test('auth responses and application logs never echo upstream credentials or thrown secrets',async t=>{
 const oldFetch=globalThis.fetch,oldError=console.error;
 const env={base:process.env.NEON_AUTH_BASE_URL,secret:process.env.NEON_AUTH_COOKIE_SECRET};
 process.env.NEON_AUTH_BASE_URL='https://example.neon.tech/auth';
 process.env.NEON_AUTH_COOKIE_SECRET='test-only-not-real-cookie-secret-32-chars';
 const logs=[];console.error=(...args)=>logs.push(args.join(' '));
 t.after(()=>{globalThis.fetch=oldFetch;console.error=oldError;
  for(const [key,value] of [['NEON_AUTH_BASE_URL',env.base],['NEON_AUTH_COOKIE_SECRET',env.secret]])if(value===undefined)delete process.env[key];else process.env[key]=value;
 });
 const sentinel='SENSITIVE_TEST_SENTINEL_NOT_A_REAL_SECRET';
 const request={method:'POST',query:{action:'login'},headers:{host:'test.example',origin:'https://test.example'},body:{email:'test@example.invalid',password:sentinel}};
 for(const scenario of ['provider-rejection','provider-success','transport-error']){
  globalThis.fetch=async()=>{
   if(scenario==='transport-error')throw Error(sentinel);
   return Response.json({password:sentinel,token:sentinel,session:{token:sentinel}},{status:scenario==='provider-rejection'?401:200});
  };
  const res=response();await handler(request,res);
  assert.doesNotMatch(JSON.stringify(res.body)+JSON.stringify(logs),new RegExp(sentinel));
  assert.equal(res.statusCode,scenario==='provider-success'?200:401);
 }
});
