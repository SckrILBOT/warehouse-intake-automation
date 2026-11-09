import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recognizeWith,type Caller,type Reporter} from '../lib/recognition-pipeline.ts';
import {readingFromTable} from '../lib/ocr-table.ts';
import {problems} from '../lib/review.ts';
const cells=[['№','Наименование товара','Ед.','Количество'],['1','Саморез 4,2×32 упаковка 200 шт','уп','3']].flatMap((row,rowIndex)=>row.map((text,columnIndex)=>({rowIndex,columnIndex,text})));
const annotation={fullText:'Номер документа: TEST-9002\nДата документа: 09.11.2026\nПродавец: ООО Учебный склад\nПокупатель: Объект',tables:[{cells}]};
const reading={document_number:'TEST-9002',document_date:'2026-11-09',seller:'ООО Учебный склад',items:[{line_number:'1',name:'Саморез 4,2×32 упаковка 200 шт',quantity:3,unit:'уп'}]};
const response={choices:[{finish_reason:'stop',message:{content:JSON.stringify(reading)}}]};
const ocr=(body:any)=>({result:{textAnnotation:body.model==='table'?annotation:{fullText:annotation.fullText}}});
test('literal OCR uses the quantity column, retains pack size only in name and requires review',()=>{
 const r=readingFromTable(annotation);assert.equal(r.items.length,1);assert.equal(r.items[0].quantity,3);assert.equal(r.items[0].unit,'уп');assert.equal(r.document_date,'2026-11-09');assert(r.items[0].needs_review);assert(r.items[0].name!.includes('200 шт'));
});
test('merged or missing quantity is never assigned from a name or adjacent row',()=>{
 const merged=structuredClone(annotation);merged.tables[0].cells[7]={...merged.tables[0].cells[7],rowSpan:2} as any;assert.equal(readingFromTable(merged).items[0].quantity,null);
 const absent=structuredClone(annotation);absent.tables[0].cells.pop();assert.equal(readingFromTable(absent).items[0].quantity,null);
 const noHeaders=structuredClone(annotation);noHeaders.tables[0].cells[3].text='Цена';assert.equal(readingFromTable(noHeaders).items.length,0);
});
test('grouped headers are not treated as flat quantity columns',()=>{
 const grouped=structuredClone(annotation);grouped.tables[0].cells[3]={...grouped.tables[0].cells[3],rowIndex:1,columnSpan:2} as any;assert.equal(readingFromTable(grouped).items.length,0);
});
test('Russian totals and numbered subheaders never become goods',()=>{
 const rows=[['№','Наименование товара','Ед.','Количество'],['1','2','3','4'],['1','Тестовый товар','шт','2'],['','Итого','шт','2'],['','Всего наименований: 1','','1']];
 const source={tables:[{cells:rows.flatMap((row,rowIndex)=>row.map((text,columnIndex)=>({text,rowIndex,columnIndex})))}]};
 const result=readingFromTable(source);assert.equal(result.items.length,1);assert.equal(result.items[0].name,'Тестовый товар');
});
test('clear OCR completes its checkpoint before a slow image model and makes no second model call',async()=>{
 let resolveImage!:(v:unknown)=>void,modelCalls=0,done!:(v?:unknown)=>void;
 const image=new Promise(resolve=>{resolveImage=resolve;}),structuredDone=new Promise(resolve=>{done=resolve;});
 const call:Caller=async(path,body:any)=>{if(path.includes('/ocr/'))return ocr(body);modelCalls++;return image;};
 const report:Reporter=async(stage,progress,data)=>{if(stage==='structured'&&progress.state==='done'){assert.equal((data as any).items[0].quantity,3);done();}};
 const job=recognizeWith(new ArrayBuffer(1),'image/png','test-model',call,report);
 await structuredDone;assert.equal(modelCalls,1);resolveImage(response);const result=await job;assert.equal(result.draft.items.length,1);assert.equal(result.draft.items[0].quantity.value,'3');assert(problems(result.draft).length>0);
});
test('image HTTP 524 does not discard usable OCR and never retries the model',async()=>{
 let modelCalls=0;const call:Caller=async(path,body:any)=>{if(path.includes('/ocr/'))return ocr(body);modelCalls++;throw new Error('Яндекс вернул HTTP 524');};
 const result=await recognizeWith(new ArrayBuffer(1),'image/png','test-model',call);assert.equal(modelCalls,1);assert.equal(result.draft.items.length,1);assert.equal(result.draft.items[0].quantity.value,'3');assert(result.draft.notices.some(n=>n.includes('524')));assert(result.draft.items[0].quantity.reasons.length>0);
});
test('complex OCR structuring starts without waiting for the image request',async()=>{
 let resolveImage!:(v:unknown)=>void,started!:(v?:unknown)=>void;
 const image=new Promise(resolve=>{resolveImage=resolve;}),structureStarted=new Promise(resolve=>{started=resolve;});
 const call:Caller=async(path,body:any)=>{if(path.includes('/ocr/'))return {result:{textAnnotation:{fullText:'Неструктурированный текст'}}};if(Array.isArray(body.messages[0].content))return image;started();return response;};
 const job=recognizeWith(new ArrayBuffer(1),'image/png','test-model',call);await structureStarted;resolveImage(response);const result=await job;assert(result.draft.items.length>0);
});
test('a stopped attempt cannot start a paid step after its checkpoint claim is rejected',async()=>{
 let calls=0;const call:Caller=async()=>{calls++;return response;};
 const report:Reporter=async()=>{throw new Error('superseded');};await assert.rejects(recognizeWith(new ArrayBuffer(1),'image/png','test-model',call,report));assert.equal(calls,0);
});
