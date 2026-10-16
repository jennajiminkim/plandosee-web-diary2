const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null,busy=false;
async function call(action,data){
 const init={credentials:'same-origin',cache:'no-store'};
 if(action){init.method='POST';init.headers={'Content-Type':'application/json'};init.body=JSON.stringify({action,data})}
 const r=await fetch('/api/experiment',init);
 const payload=await r.json();
 if(!r.ok)throw Error(payload.error||'요청 실패');
 return payload;
}
function show(s){
 current=s;
 $('status').textContent='서울 기준 오늘: '+s.today+' · '+(s.experiment?'관찰 진행 중':'관찰 시작 전');
 $('setup').hidden=Boolean(s.experiment);
 $('dashboard').hidden=!s.experiment;
 if(!s.experiment)return;
 const n=s.records.length, revised=Boolean(s.change);
 const e=s.experiment;
 $('summary').innerHTML='<strong>'+escape(e.question)+'</strong><p>지표: '+escape(e.metric_name)+' ('+escape(e.metric_unit)+')</p><p>계산 방식: '+escape(e.calculation_rule)+'</p><p>진행: '+n+'/5일 · 규칙 변경: '+(revised?'완료':'대기')+'</p>';
 $('record').hidden=n>=5||(n>=2&&!revised)||s.records.some(r=>r.record_date===s.today);
 $('revision').hidden=n!==2||revised;
 const p=s.progress;
 $('history').innerHTML=(s.records.length?s.records.map((r,i)=>'<p><strong>Day '+(i+1)+' · '+escape(r.record_date)+'</strong> — '+escape(r.metric_value)+' '+escape(e.metric_unit)+'<span style="display:block">'+escape(r.note)+'</span></p>').join(''):'<p>아직 기록이 없습니다.</p>')+
 (s.change?'<hr><p><strong>규칙 변경 기록</strong> · '+escape(s.change.changed_at)+'</p><p>'+escape(s.change.old_rule)+' → '+escape(s.change.new_rule)+'</p><p>근거: '+escape(s.change.reason)+'</p>':'')+
 '<hr><p>Day 1–2 평균: '+(p.day1_day2_mean??'미완료')+' / Day 3–5 평균: '+(p.day3_day5_mean??'미완료')+'</p><p>'+(p.comparison_ready?'같은 지표의 5일 관찰 비교 완료':'비교는 5일 기록 후 표시합니다.')+'</p>';
}
async function perform(action,data){
 if(busy)return;
 busy=true;$('status').textContent='서버에 확인 중...';
 try{show(await call(action,data));}
 catch(e){$('status').textContent='요청 실패: '+e.message}
 finally{busy=false}
}
$('setup').onsubmit=e=>{e.preventDefault();perform('create',Object.fromEntries(new FormData(e.target)))};
$('record').onsubmit=e=>{e.preventDefault();if(!current)return;const data=Object.fromEntries(new FormData(e.target));data.metric_value=Number(data.metric_value);data.record_date=current.today;perform('record',data)};
$('revision').onsubmit=e=>{e.preventDefault();perform('revise',Object.fromEntries(new FormData(e.target)))};
call().then(show).catch(e=>$('status').textContent='로그인 또는 데이터 연결을 확인하세요: '+e.message);
