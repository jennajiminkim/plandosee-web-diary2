const $=id=>document.getElementById(id);
const btns=['createTest','listTest','readTest','editTest','deleteTest'];
const base='/api/ownership-test';
const render=(status,data)=>{$('result').textContent='HTTP '+status+'\n'+JSON.stringify(data,null,2)};
async function run(method,uuid){
 for(const k of btns)$(k).disabled=true;
 try{
  const url=base+(method==='GET'&&uuid?'?id='+encodeURIComponent(uuid):'');
  const r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:method==='PATCH'||method==='DELETE'?JSON.stringify({id:uuid}):method==='POST'?'{}':undefined});
  const data=await r.json();
  render(r.status,data);
  if(data.record?.id)$('recordId').value=data.record.id;
 }catch(e){$('result').textContent='요청을 완료하지 못했습니다.'}
 finally{for(const k of btns)$(k).disabled=false}
}
async function start(){
 try{
  const r=await fetch('/api/auth?action=session',{credentials:'same-origin',cache:'no-store'});
  const info=await r.json();
  if(!r.ok||!info.authenticated){$('identity').textContent='로그인이 필요합니다. 먼저 메인 화면에서 로그인하세요.';return}
  $('identity').textContent='로그인 확인: '+(info.user.name||'사용자')+' (본인 계정만 조회)';
  for(const k of btns)$(k).disabled=false;
 }catch{$('identity').textContent='세션을 확인할 수 없습니다.'}
}
$('createTest').onclick=()=>run('POST');
$('listTest').onclick=()=>run('GET');
$('readTest').onclick=()=>run('GET',$('recordId').value.trim());
$('editTest').onclick=()=>run('PATCH',$('recordId').value.trim());
$('deleteTest').onclick=()=>{if(confirm('해당 테스트 계획의 삭제를 시도할까요?'))run('DELETE',$('recordId').value.trim())};
start();
