import { env } from 'cloudflare:workers';
import {recognizeWith,type Reporter} from './recognition-pipeline';
import {requestYandex} from './yandex-request';

function headers(ocr = false): Record<string, string> {
  if (!env.YANDEX_API_KEY || !env.YANDEX_FOLDER_ID) throw new Error('Ключ Яндекса ещё не подключён на сервере');
  return { 'Content-Type': 'application/json', Authorization: `Api-Key ${env.YANDEX_API_KEY}`, [ocr ? 'x-folder-id' : 'OpenAI-Project']: env.YANDEX_FOLDER_ID, 'x-data-logging-enabled': 'false' };
}
async function call(path: string, body: unknown, ocr = false) {
  return requestYandex(path,body,headers(ocr),ocr);
}
export async function recognize(image:ArrayBuffer,mime:string,report?:Reporter){return recognizeWith(image,mime,`gpt://${env.YANDEX_FOLDER_ID}/deepseek-v4.1-flash`,call,report);}
