import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudTarget,cloudRequest} from '../lib/cloud-mail.ts';
const WORK_PATH='/Warehouse/Stock.xlsx';
test('runtime configuration accepts only the explicit test workbook',()=>{
 assert.throws(()=>cloudTarget({}),/не настроено/);
 assert.throws(()=>cloudTarget({MAIL_TEST_ACCOUNT:'test@example.test',MAIL_TEST_PASSWORD:'test-only',MAIL_TEST_PATH:'/Sklad.xlsx'}),/не настроено/);
 assert.equal(cloudTarget({MAIL_TEST_ACCOUNT:'test@example.test',MAIL_TEST_PASSWORD:'test-only',MAIL_TEST_PATH:'/Sklad_test.xlsx'}).path,'/Sklad_test.xlsx');
});
test('work profile uses its separate credentials and only the confirmed path',()=>{
 const env={MAIL_ACTIVE_PROFILE:'work',MAIL_WORK_ACCOUNT:'work@example.test',MAIL_WORK_PASSWORD:'work-only',MAIL_WORK_PATH:WORK_PATH,MAIL_TEST_ACCOUNT:'personal@example.test',MAIL_TEST_PASSWORD:'personal-only',MAIL_TEST_PATH:'/Sklad_test.xlsx'};
 const target=cloudTarget(env);assert.equal(target.account,'work@example.test');assert.equal(target.password,'work-only');assert.equal(target.path,WORK_PATH);assert.equal(target.profile,'work');
 assert.throws(()=>cloudTarget({...env,MAIL_WORK_PATH:'/Sklad.xlsx'}),/не настроено/);
 assert.throws(()=>cloudTarget({...env,MAIL_WORK_PASSWORD:undefined}),/не настроено/);
 assert.equal(cloudTarget({...env,MAIL_ACTIVE_PROFILE:'test'}).account,'personal@example.test');
 assert.throws(()=>cloudTarget({...env,MAIL_ACTIVE_PROFILE:'typo'}),/Неизвестное/);
});
test('redirect is rejected without following it or sending credentials to another host',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,options)=>{calls++;const url=new URL(String(input));assert.equal(url.origin,'https://webdav.cloud.mail.ru');assert.equal(url.pathname,'/Sklad_test.xlsx');assert(url.searchParams.get('intake_read'));assert.equal(options?.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://example.invalid'}});};
 try{await assert.rejects(cloudRequest({account:'test@example.test',password:'test-only',path:'/Sklad_test.xlsx'},'GET'),/HTTP 302/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('failed PUT is never retried automatically',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_input,options)=>{calls++;assert.equal(options?.method,'PUT');throw new Error('Simulated lost response');};
 try{await assert.rejects(cloudRequest({account:'test@example.test',password:'test-only',path:'/Sklad_test.xlsx'},'PUT',new Uint8Array([1,2])),/lost response/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('every GET bypasses stale cache with no-store and a unique cache key',async()=>{
 const original=globalThis.fetch,urls:string[]=[];
 globalThis.fetch=async(input,options)=>{urls.push(String(input));assert.equal(options?.cache,'no-store');const headers=new Headers(options?.headers);assert.equal(headers.get('Cache-Control'),'no-cache, no-store');assert.equal(headers.get('Pragma'),'no-cache');return new Response(new Uint8Array([4,5,6]));};
 try{const target={account:'test@example.test',password:'test-only',path:'/Sklad_test.xlsx' as const};assert.deepEqual(await cloudRequest(target,'GET'),new Uint8Array([4,5,6]));await cloudRequest(target,'GET');assert.notEqual(urls[0],urls[1]);}finally{globalThis.fetch=original;}
});
