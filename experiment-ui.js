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
// Proposed observational protocol is a voluntary preset; nothing is saved until the user submits.
const firstStepProtocol={
 question:'2분 안에 할 수 있는 첫 행동을 미리 정하면, 하루에 몇 개의 계획을 실제 행동으로 옮길 수 있을까?',
 metric_name:'하루에 첫 행동을 실행한 할 일 수',
 metric_unit:'건',
 calculation_rule:'매일 실행 전에 핵심 할 일 최대 3개를 고르고, 각 할 일의 MY FIRST STEP에 2분 안에 할 수 있는 구체적인 첫 행동을 적는다. 그날 그 행동을 실제로 수행한 할 일마다 1건으로 센다(0~3건). 전체 할 일을 끝내지 않아도 인정하며 같은 할 일은 하루 최대 1건으로 계산한다. 2분은 행동의 크기를 정하는 기준이지 타이머 측정이나 2분 지속 의무가 아니다.',
 missing_rule:'관찰하지 못한 날은 0건으로 추정하지 않고 기록을 건너뛴다. 실제로 선정한 할 일을 관찰했지만 첫 행동을 전혀 수행하지 못한 경우에만 0건을 기록하며 그 이유를 메모한다.',
 duplicate_rule:'하나의 할 일을 여러 번 시작하거나 첫 행동을 반복해도 하루에는 1건만 인정한다. 다른 날짜에 다시 시작했다면 해당 날짜에서 1건으로 계산한다.',
 outlier_rule:'관찰 대상은 하루 최대 3개이므로 값이 3건을 초과하면 중복 또는 할 일 선정 기준을 확인한다. 실제 관찰된 0~3건의 값은 임의로 제외하지 않는다.',
 rounding_rule:'횟수는 0·1·2·3의 정수로 기록한다. 소수점을 사용하거나 반올림하지 않는다.'
};
$('firstStepPreset').onclick=()=>{
 const form=$('setup');
 for(const [key,value] of Object.entries(firstStepProtocol)){
  const input=form.elements.namedItem(key);
  if(input)input.value=value;
 }
 $('status').textContent='MY FIRST STEP 관찰 규칙을 채웠습니다. 내용을 확인한 뒤 아래의 「관찰 규칙 저장」 버튼을 눌러 주세요.';
};
$('setup').onsubmit=e=>{e.preventDefault();perform('create',Object.fromEntries(new FormData(e.target)))};
$('record').onsubmit=e=>{e.preventDefault();if(!current)return;const data=Object.fromEntries(new FormData(e.target));data.metric_value=Number(data.metric_value);data.record_date=current.today;perform('record',data)};
$('revision').onsubmit=e=>{e.preventDefault();perform('revise',Object.fromEntries(new FormData(e.target)))};
call().then(show).catch(e=>$('status').textContent='로그인 또는 데이터 연결을 확인하세요: '+e.message);
