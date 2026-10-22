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
