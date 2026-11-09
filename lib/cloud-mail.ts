export class CloudError extends Error {}
export const WORK_PATH='/Warehouse/Stock.xlsx';
export type CloudTarget = { account: string; password: string; path: '/Sklad_test.xlsx' | typeof WORK_PATH; profile?: 'test'|'work' };
export type CloudSettings={MAIL_ACTIVE_PROFILE?:string;MAIL_TEST_ACCOUNT?:string;MAIL_TEST_PASSWORD?:string;MAIL_TEST_PATH?:string;MAIL_WORK_ACCOUNT?:string;MAIL_WORK_PASSWORD?:string;MAIL_WORK_PATH?:string};
export function cloudTarget(env: CloudSettings): CloudTarget {
  const profile=env.MAIL_ACTIVE_PROFILE||'test';
  if(profile==='work'){
    if(!env.MAIL_WORK_ACCOUNT||!env.MAIL_WORK_PASSWORD||env.MAIL_WORK_PATH!==WORK_PATH)throw new CloudError('Рабочее облако не настроено на сервере');
    return {account:env.MAIL_WORK_ACCOUNT,password:env.MAIL_WORK_PASSWORD,path:WORK_PATH,profile};
  }
  if(profile!=='test')throw new CloudError('Неизвестное подключение облака');
  if (!env.MAIL_TEST_ACCOUNT || !env.MAIL_TEST_PASSWORD || env.MAIL_TEST_PATH !== '/Sklad_test.xlsx') throw new CloudError('Тестовое облако не настроено на сервере');
  return {account:env.MAIL_TEST_ACCOUNT,password:env.MAIL_TEST_PASSWORD,path:'/Sklad_test.xlsx',profile};
}
export async function cloudRequest(target: CloudTarget, method: 'GET'|'PUT', body?: Uint8Array): Promise<Uint8Array> {
  const credentials = new TextEncoder().encode(target.account+':'+target.password);
  const auth = btoa(Array.from(credentials, b=>String.fromCharCode(b)).join(''));
  const url=new URL('https://webdav.cloud.mail.ru'+target.path);
  // Cloud/edge caches may keep serving the pre-PUT object to a Worker. Each read
  // must address a fresh cache key as well as explicitly disabling caching.
  if(method==='GET')url.searchParams.set('intake_read',crypto.randomUUID());
  const response = await fetch(url.toString(), {
    method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(45000),
    headers:{Authorization:'Basic '+auth,'Cache-Control':'no-cache, no-store',Pragma:'no-cache',...(method==='PUT'?{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}:{})},
    body:body as Uint8Array<ArrayBuffer> | undefined,
  });
  if (!response.ok) { await response.body?.cancel(); throw new CloudError(`Облако Mail: HTTP ${response.status}. Запись не подтверждена`); }
  if (method==='PUT') {await response.body?.cancel();return new Uint8Array();}
  if (Number(response.headers.get('content-length'))>8*1024*1024) {await response.body?.cancel();throw new CloudError('Книга больше 8 МБ');}
  const reader=response.body?.getReader();if(!reader)throw new CloudError('Облако вернуло пустой ответ');
  const parts:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw new CloudError('Книга больше 8 МБ');}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
