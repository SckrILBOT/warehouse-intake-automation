import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
const transport=ts.transpileModule(readFileSync(new URL('../lib/yandex-request.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
async function runtime(outboundService,source=transport){return new Miniflare({compatibilityDate:'2026-05-15',modulesRoot:process.cwd(),outboundService,modules:[
 {type:'ESModule',path:'worker.js',contents:`import {requestYandex} from './transport.js';export default {async fetch(request){try{const ocr=new URL(request.url).searchParams.has('ocr');return Response.json(await requestYandex(ocr?'/ocr/v1/recognizeText':'/v1/chat/completions',{test:true},{'Content-Type':'application/json',Authorization:'Api-Key test-only'},ocr));}catch(e){return Response.json({error:e.message}, {status:502});}}};`},
 {type:'ESModule',path:'transport.js',contents:source},
 ]});}
test('actual Workers runtime sends both image and OCR POST with supported request options',async()=>{
 const seen=[];const mock=async(request)=>{const url=new URL(request.url);assert.equal(url.origin,'https://ai.api.cloud.yandex.net');assert.equal(request.method,'POST');assert.equal(await request.text(),'{"test":true}');seen.push(url.pathname);return Response.json({received:true});};
 const worker=await runtime(mock);
 try{for(const suffix of ['', '?ocr=1']){const response=await worker.dispatchFetch('https://test.invalid/'+suffix);assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true});}assert.deepEqual(seen,['/v1/chat/completions','/ocr/v1/recognizeText']);}
 finally{await worker.dispose();}
});
test('regression: unsupported redirect:error fails before any request leaves workerd',async()=>{
 let calls=0;const outbound=async()=>{calls++;return Response.json({received:true});};
 const broken=transport.replace('redirect: \'manual\'','redirect: \'error\'');assert.notEqual(broken,transport);
 const worker=await runtime(outbound,broken);try{const response=await worker.dispatchFetch('https://test.invalid/');assert.equal(response.status,502);assert.equal(calls,0);}finally{await worker.dispose();}
});
test('actual Workers runtime rejects a redirect and never follows it with an API key',async()=>{
 let calls=0;const mock=async(request)=>{calls++;assert.equal(new URL(request.url).origin,'https://ai.api.cloud.yandex.net');return new Response('',{status:302,headers:{Location:'https://unexpected.invalid/steal'}});};
 const worker=await runtime(mock);try{const response=await worker.dispatchFetch('https://test.invalid/');assert.equal(response.status,502);assert.match((await response.json()).error,/HTTP 302/);assert.equal(calls,1);}finally{await worker.dispose();}
});
