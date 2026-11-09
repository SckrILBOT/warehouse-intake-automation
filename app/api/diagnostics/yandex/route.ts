import {identity,json,failure} from '@/lib/server';
import {requestYandex} from '@/lib/yandex-request';
// Reachability only: deliberately no API key, image, model or user data.
export async function POST(request:Request){
 try{
  await identity(request,true);
  const results=await Promise.all(['/v1/chat/completions','/ocr/v1/recognizeText'].map(async path=>{
   try{await requestYandex(path,{}, {'Content-Type':'application/json'},true);return {service:path.includes('/ocr/')?'OCR':'AI Studio',reachable:true,status:200};}
   catch(e){const message=e instanceof Error?e.message:'Не удалось проверить связь';const status=/HTTP (\d{3})/.exec(message);return {service:path.includes('/ocr/')?'OCR':'AI Studio',reachable:!!status,status:status?Number(status[1]):null,...(!status?{error:message}:{})};}
  }));
  return json({results,apiKeySent:false,recognitionStarted:false});
 }catch(e){return failure(e);}
}
