// TEST ACCOUNT ONLY. Never print or persist password values or session cookies.
const statusEl=document.getElementById('status');
const form=document.getElementById('testForm');
const submit=document.getElementById('submit');
const checkbox=document.getElementById('consent');
async function jsonResponse(response){
 try{return await response.json()}catch{return {}}
}
async function checkLoggedIn(){
 try{
  const response=await fetch('/api/auth?action=session',{credentials:'same-origin',cache:'no-store'});
  const data=await jsonResponse(response);
  if(!response.ok||!data.authenticated){
   statusEl.textContent='로그인이 필요합니다. 시험용 계정으로 로그인해 주세요.';
   return;
  }
  form.hidden=false;
  statusEl.textContent='인증된 세션이 확인됐습니다. 서버가 시험용 계정 허용 여부를 다시 검사합니다.';
 }catch{statusEl.textContent='세션을 확인하지 못했습니다.'}
}
checkbox.addEventListener('change',()=>{submit.disabled=!checkbox.checked});
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!checkbox.checked||submit.disabled)return;
 submit.disabled=true;
 statusEl.textContent='시험용 계정의 비밀번호 변경 요청 중…';
 const current=form.elements.currentPassword.value;
 const next=form.elements.newPassword.value;
 // Clear UI fields before awaiting the network. Never log request/response secrets.
 form.elements.currentPassword.value='';
 form.elements.newPassword.value='';
 if(current===next){
  statusEl.textContent='현재 비밀번호와 새 비밀번호는 서로 달라야 합니다.';
  submit.disabled=false;return;
 }
 try{
  const res=await fetch('/api/auth?action=changePassword',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({currentPassword:current,newPassword:next})
  });
  const data=await jsonResponse(res);
  if(res.ok&&data.ok){
   statusEl.textContent='변경 성공 응답을 받았습니다. 다른 브라우저 세션에서 GET /api/state가 401인지 확인하세요.';
   form.hidden=true;
  }else if(res.status===404){
   statusEl.textContent='테스트 기능이 비활성화돼 있습니다. 계정 비밀번호는 변경되지 않았습니다.';
  }else if(res.status===403){
   statusEl.textContent='이 계정은 테스트 허용 목록에 없습니다. 변경되지 않았습니다.';
  }else if(res.status===401){
   statusEl.textContent='로그인 세션 또는 현재 비밀번호 확인에 실패했습니다. 변경 성공으로 처리하지 않습니다.';
  }else{
   statusEl.textContent='변경이 완료됐는지 확인할 수 없습니다. 상태 코드 '+res.status+'. 재실행 전에 관리자에게 문의하세요.';
  }
 }catch{
  statusEl.textContent='네트워크 오류입니다. 요청이 서버에 전달됐을 수도 있으므로 자동 재시도하지 마세요.';
 }finally{
  submit.disabled=true;checkbox.checked=false;
 }
});
checkLoggedIn();
