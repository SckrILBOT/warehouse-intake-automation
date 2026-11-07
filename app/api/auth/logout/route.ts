import { session, sameOrigin, sessionCookie, signOut } from '@/lib/auth';
import { json } from '@/lib/server';
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Недопустимый источник запроса'},403);
  const current=await session();if(current)await signOut(current.tokenHash);
  return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie('',true),'Cache-Control':'no-store'}});
}
