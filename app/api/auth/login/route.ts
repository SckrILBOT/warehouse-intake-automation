import { authenticate, sameOrigin, sessionCookie } from '@/lib/auth';
import { json } from '@/lib/server';
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Недопустимый источник запроса'},403);
  try {
    if(Number(request.headers.get('content-length'))>2000)return json({error:'Некорректный запрос'},400);
    const body:any=await request.json();
    const result=await authenticate(request,body.password);
    if(!result.ok)return json({error:result.limited?'Слишком много попыток. Подожди 15 минут.':'Неверный пароль'},result.limited?429:401);
    return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(result.token),'Cache-Control':'no-store'}});
  }catch{return json({error:'Вход пока недоступен. Проверь настройку сервера.'},503);}
}
