// Task 7: Neon Auth entry screen. Session validity is always checked server-side.
const root=document.getElementById('authGate');
const notice=root.querySelector('[data-message]');
const form=root.querySelector('form');
const heading=root.querySelector('[data-heading]');
const submit=root.querySelector('button[type=submit]');
const modeButton=root.querySelector('[data-toggle]');
const password=form.elements.password;
const nameInput=form.elements.name;
let mode='login';
let currentUser=null;
let plannerBooted=false;
function unlockPlanner(){
 if(!currentUser || plannerBooted)return;
 plannerBooted=true;
 document.body.classList.remove('auth-locked');
 root.hidden=true;
 const script=document.createElement('script');
 script.src='/app.js';
 script.onerror=()=>{
  plannerBooted=false;
  document.body.classList.add('auth-locked');
  root.hidden=false;
  message('다이어리 화면을 불러오지 못했습니다. 새로고침해 주세요.');
 };
 document.body.appendChild(script);
}
const logout=document.createElement('button');
logout.type='button';
logout.className='auth-toggle';
logout.textContent='로그아웃';
logout.hidden=true;
root.querySelector('.auth-panel').appendChild(logout);
function message(value){notice.textContent=value;}
async function call(action,data) {
 const init={credentials:'same-origin',cache:'no-store'};
 if(data!==undefined){init.method='POST';init.headers={'Content-Type':'application/json'};init.body=JSON.stringify(data);}
 const response=await fetch('/api/auth?action='+encodeURIComponent(action),init);
 let json={};try{json=await response.json();}catch{}
 return {response,json};
}
function render(){
 const authenticated=Boolean(currentUser);
 form.hidden=authenticated;
 modeButton.hidden=authenticated;
 logout.hidden=!authenticated;
 if(authenticated){
  notice.textContent='';
  heading.textContent='반가워요, '+(currentUser.name||'기록자')+'님.';
  message('로그인 세션을 확인했습니다. 개인 다이어리를 불러오는 중입니다.');
  unlockPlanner();
 }else{
  heading.textContent=mode==='login'?'다시 만나 반가워요.':'작은 시작을 함께해요.';
  submit.textContent=mode==='login'?'로그인':'회원가입';
  modeButton.textContent=mode==='login'?'처음 오셨나요? 회원가입':'이미 계정이 있나요? 로그인';
  nameInput.parentElement.hidden=mode==='login';
  nameInput.required=mode==='signup';
  password.autocomplete=mode==='login'?'current-password':'new-password';
  message('');
 }
}
async function refreshSession(){
 const {response,json}=await call('session');
 currentUser=response.ok&&json.authenticated&&json.user?json.user:null;
 render();
 return Boolean(currentUser);
}
modeButton.addEventListener('click',()=>{mode=mode==='login'?'signup':'login';render();});
form.addEventListener('submit',async e=>{
 e.preventDefault();submit.disabled=true;message('확인 중...');
 const body={email:form.elements.email.value.trim(),password:password.value};
 if(mode==='signup')body.name=nameInput.value.trim();
 try{
  const {response,json}=await call(mode,body);
  password.value='';
  if(!response.ok){message(json.error||'요청을 처리하지 못했습니다.');return;}
  if(await refreshSession()){return;}
  if(mode==='signup'){mode='login';render();message('가입 요청이 완료되었습니다. 로그인해 주세요.');}
  else message('로그인 응답은 받았으나 세션을 확인하지 못했습니다. 다시 시도해 주세요.');
 }catch{message('서버 연결을 확인해 주세요.');}
 finally{submit.disabled=false;}
});
logout.addEventListener('click',async()=>{
 logout.disabled=true;message('로그아웃하는 중...');
 try{
  const {response}=await call('logout',{});
  if(!response.ok){message('로그아웃을 확인하지 못했습니다. 다시 시도해 주세요.');return;}
  if(await refreshSession()){message('세션이 아직 유지되고 있습니다. 관리자에게 알려 주세요.');return;}
  password.value='';
  // Clear previously rendered private content instead of keeping it in the DOM.
  window.location.replace('/');
 }catch{message('서버 연결을 확인해 주세요.');}
 finally{logout.disabled=false;}
});
render();
refreshSession().catch(()=>message('인증 서버 연결을 확인해 주세요.'));
