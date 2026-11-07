'use client';
import { useState } from 'react';
export default function Login() {
  const [password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
  return <main className="login-page"><section><img src="/icon.svg" alt="" width="52" height="52"/><h1>Приёмка склада</h1><p className="muted">Личный вход владельца</p><form onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError('');
    try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const result:any=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось войти');window.location.assign('/');}catch(e){setError((e as Error).message);setBusy(false);}
  }}><label htmlFor="owner-password">Пароль</label><input id="owner-password" type={show?'text':'password'} autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={password} onChange={e=>setPassword(e.target.value)} required/><label className="show-password"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Показать пароль</label>{error&&<p className="error-message" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Проверяю…':'Войти'}</button></form><p className="caption">Без регистрации и стороннего аккаунта. Доступ сохраняется на этом устройстве до 30 дней или до смены пароля.</p></section></main>;
}
