// TEST ACCOUNT ONLY. Never print or persist password values or session cookies.
// Fail-closed UI: only insert the form into the live DOM after verified login.
const statusEl=document.getElementById('status');
const formMount=document.getElementById('passwordFormMount');
const formTemplate=document.getElementById('passwordFormTemplate');

async function jsonResponse(response){
 try{return await response.json()}catch{return {}}
}

function renderVerifiedForm(){
 // The <template> is inert even if shared CSS sets "form { display:grid }".
 formMount.replaceChildren(formTemplate.content.cloneNode(true));
 const form=formMount.querySelector('#testForm');
 const submit=form.querySelector('#submit');
 const checkbox=form.querySelector('#consent');
 checkbox.addEventListener('change',()=>{submit.disabled=!checkbox.checked});
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!checkbox.checked||submit.disabled)return;
  submit.disabled=true;
  statusEl.textContent='시험용 계정의 비밀번호 변경 요청 중…';
  const current=form.elements.currentPassword.value;
  const next=form.elements.newPassword.value;
  // Clear UI fields immediately and never print either secret.
  form.elements.currentPassword.value='';
  form.elements.newPassword.value='';
  if(current===next){
   statusEl.textContent='현재 비밀번호와 새 비밀번호는 서로 달라야 합니다.';
   submit.disabled=!checkbox.checked;return;
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
    formMount.replaceChildren();
   }else if(res.status===404){
    statusEl.textContent='테스트 기능이 비활성화돼 있습니다. 서버는 변경 요청을 처리하지 않았습니다.';
   }else if(res.status===403){
    statusEl.textContent='이 계정은 테스트 허용 목록에 없습니다. 서버는 변경 요청을 거절했습니다.';
   }else if(res.status===401){
    statusEl.textContent='세션 또는 현재 비밀번호 확인에 실패했습니다. 변경 성공으로 처리하지 않습니다.';
   }else{
    statusEl.textContent='변경 완료 여부를 확인할 수 없습니다 (HTTP '+res.status+'). 재실행 전에 확인하세요.';
   }
  }catch{
   statusEl.textContent='네트워크 오류입니다. 자동 재시도하지 마세요. 서버 처리 여부를 먼저 확인해야 합니다.';
  }finally{
   submit.disabled=true;checkbox.checked=false;
  }
 });
}

async function checkLoggedIn(){
 // No form is present in the live DOM until after this check.
 formMount.replaceChildren();
 try{
  const response=await fetch('/api/auth?action=session',{credentials:'same-origin',cache:'no-store'});
  const data=await jsonResponse(response);
  if(!response.ok||!data.authenticated||!data.user?.id){
   statusEl.textContent='로그인이 필요합니다. 시험용 계정으로 로그인해 주세요.';
   return;
  }
  statusEl.textContent='인증된 세션이 확인됐습니다. 서버에서 시험 계정 허용 여부를 다시 확인합니다.';
  renderVerifiedForm();
 }catch{
  formMount.replaceChildren();
  statusEl.textContent='세션을 확인하지 못했습니다.';
 }
}
checkLoggedIn();
