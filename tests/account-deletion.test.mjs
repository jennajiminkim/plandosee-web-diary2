import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 privateCollections,countOwnedData,clearOwnedData,
 validateDeletionConfirmation,runAccountDeletion,deletionEnabledFor
} from '../api/account.js';

const UID='not-a-real-account';
function fixture(n=1){
 const rows=new Map(privateCollections.map(([,name])=>[name,n]));
 const queries=[];
 const db={async query(sql,args){
  queries.push({sql,args});
  assert.deepEqual(args,[UID]);
  assert.match(sql,/WHERE user_id=\$1/);
  const table=sql.match(/public\.(pds_[a-z_]+)/)?.[1];
  assert.ok(rows.has(table));
  if(sql.startsWith('SELECT'))return {rows:[{n:rows.get(table)}]};
  assert.match(sql,/^DELETE FROM public\./);
  const count=rows.get(table);
  rows.set(table,0);
  return {rowCount:count};
 }};
 return {db,rows,queries};
}
test('account deletion requires exact session email, phrase and password',()=>{
 const confirmation={email:'test@example.invalid',confirm:'계정 삭제',password:'dummy_pw_never_used'};
 assert.equal(validateDeletionConfirmation({body:confirmation,email:'test@example.invalid'}).password,confirmation.password);
 for(const patch of [
  {email:'someone-else@example.invalid'},
  {confirm:'not the phrase'},
  {password:'short'}
 ]){
  assert.throws(()=>validateDeletionConfirmation({body:{...confirmation,...patch},email:confirmation.email}));
 }
});
test('preview lists 14 tables, only within session-scoped user ID',async()=>{
 const f=fixture(2);
 const result=await countOwnedData(f.db,UID);
 assert.equal(privateCollections.length,14);
 assert.equal(result.total,28);
 assert.equal(f.queries.length,14);
});
test('actual deletion removes all 14 datasets by owner and confirms provider completion',async()=>{
 const f=fixture(2);
 let invoked=0;
 const result=await runAccountDeletion({db:f.db,userId:UID,managedDelete:async()=>{
  invoked++;return {ok:true,json:async()=>({success:true,message:'User deleted'})};
 }});
 assert.equal(invoked,1);
 assert.equal(result.deleted,true);
 assert.equal(result.record_count,28);
 assert.equal(f.queries.length,42);
 assert.ok([...f.rows.values()].every(n=>n===0));
});
test('rejected managed authentication deletion is not reported successful',async()=>{
 for(const provider of [
  {ok:false,json:async()=>({error:'feature disabled'})},
  {ok:true,json:async()=>({success:true,message:'Verification email sent'})},
  {ok:true,json:async()=>({success:false})}
 ]){
  const f=fixture();
  await assert.rejects(runAccountDeletion({db:f.db,userId:UID,managedDelete:async()=>provider}));
 }
});
test('auth delete endpoint is server-only and actual deletion opt-in is off by default',()=>{
 const auth=readFileSync(new URL('../api/auth.js',import.meta.url),'utf8');
 const account=readFileSync(new URL('../api/account.js',import.meta.url),'utf8');
 assert.match(auth,/action === 'deleteSelf'/);
 assert.match(account,/ACCOUNT_DELETION_ENABLED!=='true'/);
 assert.match(account,/forbidden_origin/);
 assert.match(account,/password_confirmation_required/);
});
test('Preview deletion enables only one explicitly selected disposable account',()=>{
 const env={VERCEL_ENV:'preview',ACCOUNT_DELETION_ENABLED:'true'};
 assert.equal(deletionEnabledFor(UID,env),false);
 env.ACCOUNT_DELETION_TEST_USER_ID=UID;
 assert.equal(deletionEnabledFor(UID,env),true);
 assert.equal(deletionEnabledFor('other-user',env),false);
 assert.equal(deletionEnabledFor(UID,{...env,ACCOUNT_DELETION_ENABLED:'false'}),false);
});
