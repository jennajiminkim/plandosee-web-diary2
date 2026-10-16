const root = document.getElementById('authGate');
const notice = root.querySelector('[data-message]');
const form = root.querySelector('form');
const heading = root.querySelector('[data-heading]');
const submit = root.querySelector('button[type=submit]');
const modeButton = root.querySelector('[data-toggle]');
let mode='login';
function message(s){ notice.textContent=s; }
function render(){heading.textContent=mode==='login'?'다시 만나 반가워요.':'작은 시작을 함께해요.';submit.textContent=mode==='login'?'로그인':'회원가입';modeButton.textContent=mode==='login'?'처음 오셨나요? 회원가입':'이미 계정이 있나요? 로그인';form.elements.name.parentElement.hidden=mode==='login';message('');}
modeButton.addEventListener('click',()=>{mode=mode==='login'?'signup':'login';render();});
form.addEventListener('submit',async(e)=>{
 e.preventDefault();submit.disabled=true;message('확인 중...');
 const body={email:form.elements.email.value.trim(),password:form.elements.password.value};
 if(mode==='signup')body.name=form.elements.name.value.trim();
 try{
  const r=await fetch('/api/auth?action='+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});
  const out=await r.json();
  form.elements.password.value='';
  if(!r.ok){message(out.error || '요청을 처리하지 못했습니다.');return;}
  message(mode==='signup'?'가입 요청이 완료되었습니다. 로그인해 주세요.':'로그인 요청이 완료되었습니다. 개인 기록 API 연결은 아직 개발 중입니다.');
  if(mode==='signup'){mode='login';render();message('가입 요청이 완료되었습니다. 로그인해 주세요.');}
 }catch{message('서버 연결을 확인해 주세요.');}
 finally{submit.disabled=false;}
});
render();
