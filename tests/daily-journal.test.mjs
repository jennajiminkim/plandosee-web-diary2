import test from 'node:test';
import assert from 'node:assert/strict';
import {perform} from '../api/actions.js';
import {preview} from '../api/import-preview.js';

const USER='test-user';
const CARD='48993f4e-1c05-4e64-812b-d830e33a1f74';
const OLD={app:'plan.do.see',plans:[],versions:[],tasks:[],cells:[],logs:[],completions:[],reflections:[],journals:[],colors:[]};

function mockDB(day='2026-10-17') {
 const calls=[];
 const db={async query(sql,params=[]) {
  calls.push({sql,params});
  if(sql.includes('AS today'))return {rows:[{today:day}]};
  if(sql.includes('INSERT INTO public.pds_daily_journals'))return {
   rows:[{id:CARD,user_id:USER,entry_date:params[1],discovery:params[4],next_action:params[5]}]
  };
  if(sql.includes('FROM public.pds_daily_journals WHERE id='))return {rows:[]};
  return {rows:[]};
 }};
 return {db,calls};
}

test('a daily card is dated by the server in Asia/Seoul, not browser input',async()=>{
 const {db,calls}=mockDB();
 const result=await perform(db,USER,'dailyJournal.save',{
   entry_date:'2020-01-01',discovery:'오늘의 발견',next_action:''
 });
 assert.equal(result.entry_date,'2026-10-17');
 assert.ok(calls.some(c=>c.sql.includes('ON CONFLICT(user_id,entry_date)')));
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO public.pds_daily_journals')).length,1);
});

test('empty drafts never produce a daily card',async()=>{
 const {db,calls}=mockDB();
 await assert.rejects(perform(db,USER,'dailyJournal.save',{discovery:'   ',next_action:'  '}));
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO public.pds_daily_journals')).length,0);
});

test('editing a card requires its ID to belong to the signed-in user',async()=>{
 const {db,calls}=mockDB();
 await assert.rejects(perform(db,USER,'dailyJournal.update',{id:CARD,discovery:'x'}),/not_found/);
 assert.ok(calls.some(c=>c.sql.includes('WHERE id=$1 AND user_id=$2')));
 assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE public.pds_daily_journals')));
});

test('old backups without dailyJournals stay valid',()=>{
 const result=preview(OLD);
 assert.equal(result.valid,true);
 assert.equal(result.counts.dailyJournals,0);
});

test('new daily-card backups reject a duplicate calendar date',()=>{
 const first={id:CARD,entry_date:'2026-10-17',discovery:'기록',next_action:''};
 const second={id:'48993f4e-1c05-4e64-812b-d830e33a1f75',entry_date:'2026-10-17',discovery:'다른 기록',next_action:''};
 const result=preview({...OLD,dailyJournals:[first,second]});
 assert.equal(result.valid,false);
 assert.ok(result.issues.some(x=>x.includes('duplicate_date')));
});
