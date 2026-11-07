import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
const SESSION_COOKIE = '__Host-intake-session';
const MAX_AGE = 30 * 24 * 60 * 60;
export const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
export function randomKey() {
  // A uniformly random 128-bit access key, not a human-selected low-entropy password.
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function randomSession() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join(''); }
function db() { if(!env.DB) throw new Error('Хранилище входа ещё не подключено'); return env.DB; }
function constantEqual(a:string,b:string) { if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0; }
async function state() {
  const existing=await db().prepare('SELECT key_hash,version FROM auth_state WHERE id=1').first<{key_hash:string;version:number}>();
  if(existing)return existing;
  if(!env.OWNER_ACCESS_KEY_HASH||!/^[a-f0-9]{64}$/.test(env.OWNER_ACCESS_KEY_HASH))throw new Error('Пароль владельца ещё не настроен');
  await db().prepare('INSERT OR IGNORE INTO auth_state (id,key_hash,version) VALUES (1,?,1)').bind(env.OWNER_ACCESS_KEY_HASH).run();
  return (await db().prepare('SELECT key_hash,version FROM auth_state WHERE id=1').first<{key_hash:string;version:number}>())!;
}
export async function session() {
  const cookie=(await headers()).get('cookie')||'';
  const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  if(!env.DB)return null;
  const saved=await db().prepare('SELECT s.token_hash FROM auth_sessions s JOIN auth_state a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),Date.now()).first();
  return saved?{owner:'owner',tokenHash:await hash(token)}:null;
}
export function sameOrigin(request:Request) { return request.headers.get('origin')===new URL(request.url).origin; }
export function sessionCookie(token:string,clear=false) { return `${SESSION_COOKIE}=${clear?'':token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear?0:MAX_AGE}`; }
export async function authenticate(request:Request,password:unknown) {
  const key=await hash(request.headers.get('cf-connecting-ip')||'unknown');
  const windowStart=Date.now()-15*60*1000;
  await db().prepare('DELETE FROM auth_attempts WHERE started_at < ?').bind(windowStart).run();
  const attempt=await db().prepare('SELECT attempts FROM auth_attempts WHERE id=?').bind(key).first<{attempts:number}>();
  if(attempt&&attempt.attempts>=5)return {ok:false,limited:true} as const;
  const config=await state();
  const valid=typeof password==='string'&&/^[A-Za-z0-9_-]{22}$/.test(password)&&constantEqual(await hash(password),config.key_hash);
  if(!valid) {
    await db().prepare('INSERT INTO auth_attempts (id,attempts,started_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=auth_attempts.attempts+1').bind(key,Date.now()).run();
    return {ok:false,limited:false} as const;
  }
  await db().prepare('DELETE FROM auth_attempts WHERE id=?').bind(key).run();
  const token=randomSession();
  await db().batch([db().prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(Date.now()),db().prepare('INSERT INTO auth_sessions (token_hash,version,expires_at) VALUES (?,?,?)').bind(await hash(token),config.version,Date.now()+MAX_AGE*1000)]);
  return {ok:true,token} as const;
}
export async function signOut(tokenHash:string) { await db().prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(tokenHash).run(); }
export async function rotate(password:unknown) {
  const config=await state();
  if(typeof password!=='string'||password.length>128||!constantEqual(await hash(password),config.key_hash))return null;
  const newPassword=randomKey();
  await db().batch([db().prepare('UPDATE auth_state SET key_hash=?,version=version+1 WHERE id=1').bind(await hash(newPassword)),db().prepare('DELETE FROM auth_sessions')]);
  return newPassword;
}
