import { session, sameOrigin, sessionCookie, rotate, authenticate } from '@/lib/auth';
import { json } from '@/lib/server';
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Недопустимый источник запроса'},403);
  if(!await session())return json({error:'Войди в приложение'},401);
  try {
    const body:any=await request.json();
    // Apply the same rate limit to the current-password check as at login.
    const check=await authenticate(request,body.currentPassword);
    if(!check.ok)return json({error:check.limited?'Слишком много попыток. Подожди 15 минут.':'Текущий пароль неверен'},check.limited?429:401);
    const password=await rotate(body.currentPassword);
    if(!password)return json({error:'Текущий пароль изменился. Войди заново.'},409);
    return Response.json({password},{headers:{'Set-Cookie':sessionCookie('',true),'Cache-Control':'no-store'}});
  }catch{return json({error:'Не удалось сменить пароль'},500);}
}
