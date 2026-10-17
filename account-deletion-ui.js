// Account deletion UI is available only behind the authenticated planner screen.
// Production deletion is intentionally OFF until the managed auth capability
// and a dedicated test account have been confirmed.
{
 const previewButton=document.getElementById('accountDeletionPreview');
 const form=document.getElementById('accountDeletionForm');
 const summary=document.getElementById('accountDeletionSummary');
 const result=document.getElementById('accountDeletionResult');
 let active=false,expectedEmail='',busy=false;
 previewButton.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;
  previewButton.disabled=true;
  form.hidden=true;
  result.textContent='';
  summary.textContent='본인 계정의 삭제 대상 개수를 확인하고 있습니다...';
  try{
   const response=await fetch('/api/account',{credentials:'same-origin',cache:'no-store'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error||'삭제 대상 조회 실패');
   expectedEmail=payload.account_email||'';
   summary.textContent='본인 기록 '+payload.record_count+'건 (총 13개 자료 종류 포함). '+(
    payload.deletion_enabled?'비밀번호와 확인 문구를 입력해야 삭제할 수 있습니다.':
    '현재 실제 계정 삭제는 비활성화되어 있습니다. 관리자 검증이 끝난 뒤 사용할 수 있습니다.'
   );
   active=Boolean(payload.deletion_enabled);
   form.hidden=!active;
  }catch{
   summary.textContent='삭제 대상 조회에 실패했습니다. 로그인 및 데이터 연결을 확인해 주세요.';
   active=false;
  }finally{busy=false;previewButton.disabled=false}
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!active||busy)return;
  const email=form.elements.namedItem('email').value.trim();
  const passwordInput=form.elements.namedItem('password');
  const confirm=form.elements.namedItem('confirm').value;
  const consent=form.elements.namedItem('acknowledge').checked;
  if(!consent||email.toLowerCase()!==expectedEmail.toLowerCase()||confirm!=='계정 삭제'){
   result.textContent='로그인 이메일, 확인 문구, 영구 삭제 동의를 다시 확인해 주세요.';
   return;
  }
  if(!window.confirm('정말로 이 계정과 연결된 모든 기록을 영구 삭제하시겠습니까? 복구할 수 없습니다.'))return;
  busy=true;
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  result.textContent='계정 및 기록을 삭제하는 중입니다. 페이지를 닫지 마세요.';
  const password=passwordInput.value;
  passwordInput.value='';
  try{
   const response=await fetch('/api/account',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,confirm,password})});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error||'account_deletion_failed');
   if(payload.deleted!==true)throw Error('account_deletion_not_verified');
   form.reset();
   form.hidden=true;
   active=false;
   result.textContent='계정 및 개인 기록 삭제가 완료되었습니다. 로그인 화면으로 이동합니다.';
   window.location.replace('/');
  }catch(e){
   result.textContent='계정 삭제가 완료되지 않았습니다. 오류: '+e.message+'. 기록 보존 여부를 관리자에게 확인해 주세요.';
  }finally{busy=false;button.disabled=false}
 });
}
