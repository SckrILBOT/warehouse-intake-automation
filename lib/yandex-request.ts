/** HTTP transport shared with the actual workerd regression test. */
export async function requestYandex(path:string,body:unknown,headers:Record<string,string>,ocr=false){
 let response:Response;
 try{
  // Workers supports manual/follow. redirect:error throws before a request is sent.
  response=await fetch('https://ai.api.cloud.yandex.net'+path,{method:'POST',headers,body:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(ocr?30000:90000)});
 }catch(e){
  const name=e instanceof Error?e.name:'UnknownError';
  console.error('Yandex transport failed',{name});
  if(['AbortError','TimeoutError'].includes(name))throw new Error(`Яндекс не ответил за ${ocr?30:90} с. Повтор не запускался.`);
  throw new Error('Не удалось отправить запрос с сервера к Яндексу. Повтор не запускался.');
 }
 if(!response.ok){await response.body?.cancel();throw new Error(`Яндекс вернул HTTP ${response.status}. Повторных запросов не было.`);}
 try{return await response.json() as any;}
 catch(e){console.error('Yandex response incomplete',{name:e instanceof Error?e.name:'UnknownError'});throw new Error('Ответ Яндекса пришёл не полностью. Повтор не запускался.');}
}
