import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {prepareWorkbook,sameWorkbookContents} from '../lib/workbook.ts';
import {reconcile,type Reading} from '../lib/review.ts';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const textCell=(r:string,v:string,s='0')=>`<c r="${r}" s="${s}" t="inlineStr"><is><t>${v}</t></is></c>`;
function fixture(){return zipSync(Object.fromEntries(Object.entries({
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Лист1" sheetId="1" r:id="rId1"/><sheet name="Лист2" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}" xmlns:r="${rel}"><dimension ref="A1:G20"/><cols><col min="1" max="1" width="60" customWidth="1"/></cols><sheetData><row r="1">${['Наименование','Количество','УПД','Продавец','Дата поступления','Дата отправки','Куда'].map((v,i)=>textCell(String.fromCharCode(65+i)+'1',v)).join('')}</row><row r="2" ht="30" customHeight="1">${textCell('A2','Старый товар')}${textCell('B2','2шт')}${textCell('C2','OLD')}${textCell('D2','Поставщик')}<c r="E2" s="1"><v>46000</v></c>${textCell('F2','01.11.2026')}${textCell('G2','Москва')}</row><row r="20"><c r="A20" s="0"/></row></sheetData><tableParts count="1"><tablePart r:id="rIdTable"/></tableParts></worksheet>`,
  'xl/worksheets/sheet2.xml':`<worksheet xmlns="${ns}"><sheetData><row r="1">${textCell('A1','Сохранить этот лист')}</row></sheetData></worksheet>`,
  'xl/worksheets/_rels/sheet1.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdTable" Target="../tables/table1.xml"/></Relationships>',
  'xl/tables/table1.xml':`<table xmlns="${ns}" name="Таблица1" ref="A1:G2"><autoFilter ref="A1:G2"/><tableStyleInfo name="TableStyleLight19" showRowStripes="1"/></table>`,
  'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="1"><font><name val="Arial"/></font></fonts><cellXfs count="2"><xf numFmtId="0" fontId="0"/><xf numFmtId="14" fontId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  'customXml/item1.xml':'<retain>exact bytes untouched</retain>',
}).map(([k,v])=>[k,strToU8(v)])));}
const reading:Reading={document_number:'TEST-WRITE',seller:'Учебный поставщик',document_date:'2026-11-09',items:[{line_number:'1',name:'Саморез 250 шт в упаковке',quantity:2,unit:'уп'}]};
const draft=()=>reconcile(reading,reading);
const xml=(b:Uint8Array)=>new DOMParser().parseFromString(strFromU8(b),'application/xml');
test('append uses last populated row; retains other sheets, parts and original rows',()=>{
 const before=fixture(),a=unzipSync(before),result=prepareWorkbook(before,draft()),b=unzipSync(result.bytes);
 assert.equal(result.plan.firstRow,3);assert.equal(result.plan.added,1);
 for(const path of ['xl/worksheets/sheet2.xml','xl/workbook.xml','customXml/item1.xml'])assert.deepEqual(a[path],b[path]);
 const rows=Array.from(xml(b['xl/worksheets/sheet1.xml']).getElementsByTagNameNS(ns,'row'));
 assert.equal(rows.find(r=>r.getAttribute('r')==='2')!.textContent,'Старый товар2штOLDПоставщик4600001.11.2026Москва');
 assert.equal(rows.find(r=>r.getAttribute('r')==='3')!.textContent,'Саморез 250 шт в упаковке2упTEST-WRITEУчебный поставщик46335');
 assert.equal(xml(b['xl/tables/table1.xml']).documentElement!.getAttribute('ref'),'A1:G3');
 assert.equal(xml(b['xl/tables/table1.xml']).getElementsByTagNameNS(ns,'autoFilter')[0].getAttribute('ref'),'A1:G3');
 assert.equal(xml(b['xl/tables/table1.xml']).getElementsByTagNameNS(ns,'tableStyleInfo')[0].getAttribute('name'),'TableStyleLight19');
});
test('new cells centered; date style retained and shipment fields empty',()=>{
 const files=unzipSync(prepareWorkbook(fixture(),draft()).bytes),sheet=xml(files['xl/worksheets/sheet1.xml']),styles=xml(files['xl/styles.xml']);
 const cells=Array.from(sheet.getElementsByTagNameNS(ns,'c')).filter(c=>/^[A-G]3$/.test(c.getAttribute('r')||''));
 const xfs=Array.from(styles.getElementsByTagNameNS(ns,'cellXfs')[0].childNodes).filter(n=>n.nodeType===1) as any[];
 for(const c of cells){const xf=xfs[Number(c.getAttribute('s'))];assert.equal(xf.getElementsByTagNameNS(ns,'alignment')[0].getAttribute('horizontal'),'center');if(c.getAttribute('r')==='E3')assert.equal(xf.getAttribute('numFmtId'),'14');}
 assert.equal(cells.find(c=>c.getAttribute('r')==='F3')!.textContent,'');assert.equal(cells.find(c=>c.getAttribute('r')==='G3')!.textContent,'');
});
test('same document uploaded again adds nothing and leaves original bytes untouched',()=>{
 const first=prepareWorkbook(fixture(),draft()),second=prepareWorkbook(first.bytes,draft());assert.equal(second.plan.added,0);assert.equal(second.plan.skipped,1);assert.deepEqual(second.bytes,first.bytes);
});
test('next page adds new products while skipping exact existing occurrences',()=>{
 const first=prepareWorkbook(fixture(),draft()),d=draft();d.items.push({...structuredClone(d.items[0]),id:crypto.randomUUID(),number:'2',name:{...d.items[0].name,value:'Кабель ТЕСТ-02'}});
 const next=prepareWorkbook(first.bytes,d);assert.equal(next.plan.added,1);assert.equal(next.plan.skipped,1);assert.equal(next.plan.rows[0][0],'Кабель ТЕСТ-02');
});
test('changed quantity is a conflict, not a new receipt',()=>{
 const first=prepareWorkbook(fixture(),draft()),d=draft();d.items[0].quantity.value='3';assert.throws(()=>prepareWorkbook(first.bytes,d),/Неоднозначное/);
});
test('small OCR typo or a changed article requires review instead of approximate merging',()=>{
 const first=prepareWorkbook(fixture(),draft()),d=draft();d.items[0].name.value='Саморез 250 шт в упковке';assert.throws(()=>prepareWorkbook(first.bytes,d),/похожее название/);
});
test('identical lines in first document retain multiplicity on replay',()=>{
 const d=draft();d.items.push({...structuredClone(d.items[0]),id:crypto.randomUUID(),number:'2'});
 const first=prepareWorkbook(fixture(),d);assert.equal(first.plan.added,2);const second=prepareWorkbook(first.bytes,d);assert.equal(second.plan.skipped,2);assert.equal(second.plan.added,0);
 const third=structuredClone(d);third.items.push({...structuredClone(d.items[0]),id:crypto.randomUUID(),number:'3'});assert.throws(()=>prepareWorkbook(first.bytes,third),/Неоднозначное/);
});
test('seller/date are part of document identity',()=>{
 const first=prepareWorkbook(fixture(),draft());for(const field of ['seller','date'] as const){const d=draft();d[field].value=field==='seller'?'Другой поставщик':'2026-11-10';assert.equal(prepareWorkbook(first.bytes,d).plan.added,1);}
});
test('user text beginning with formula markers stays literal inline text',()=>{
 const d=draft();d.items[0].name.value='=HYPERLINK("bad")';const out=unzipSync(prepareWorkbook(fixture(),d).bytes);const s=xml(out['xl/worksheets/sheet1.xml']);assert.equal(s.getElementsByTagNameNS(ns,'f').length,0);
});
test('unexpected headers and unresolved fields stop preparation',()=>{
 const a=unzipSync(fixture());a['xl/worksheets/sheet1.xml']=strToU8(strFromU8(a['xl/worksheets/sheet1.xml']).replace('Количество','Сумма'));assert.throws(()=>prepareWorkbook(zipSync(a),draft()),/Заголовки/);
 const d=draft();d.date.value='2026-02-30';assert.throws(()=>prepareWorkbook(fixture(),d),/дату/);
});
test('verification accepts repacked ZIP with changed compression, order and timestamps',()=>{
 const bytes=prepareWorkbook(fixture(),draft()).bytes,parts=unzipSync(bytes);
 const repacked=zipSync(Object.fromEntries(Object.entries(parts).reverse()),{level:0,mtime:new Date('2020-01-01T00:00:00Z'),comment:'repacked container'});
 assert.notDeepEqual(bytes,repacked);assert(sameWorkbookContents(bytes,repacked));
});
test('verification rejects a changed quantity even when the new product is still present',()=>{
 const bytes=prepareWorkbook(fixture(),draft()).bytes,parts=unzipSync(bytes);
 parts['xl/worksheets/sheet1.xml']=strToU8(strFromU8(parts['xl/worksheets/sheet1.xml']).replace('2уп','3уп'));
 assert(!sameWorkbookContents(bytes,zipSync(parts)));
});
test('verification rejects a changed old row, styles, other sheets, properties, or file list',()=>{
 const bytes=prepareWorkbook(fixture(),draft()).bytes;
 for(const name of ['xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/styles.xml','customXml/item1.xml']){
  const parts=unzipSync(bytes);parts[name]=strToU8(strFromU8(parts[name]).replace(/>[^<]+</,'>changed<'));
  if(name==='xl/styles.xml')parts[name]=strToU8(strFromU8(parts[name]).replace('Arial','Calibri'));
  assert(!sameWorkbookContents(bytes,zipSync(parts)),name);
 }
 const missing=unzipSync(bytes);delete missing['xl/worksheets/sheet2.xml'];assert(!sameWorkbookContents(bytes,zipSync(missing)));
 const extra=unzipSync(bytes);extra['unexpected.xml']=strToU8('<extra/>');assert(!sameWorkbookContents(bytes,zipSync(extra)));
});
test('verification rejects malformed or non-workbook ZIP rather than reporting success',()=>{
 const bytes=fixture();assert(!sameWorkbookContents(bytes,new Uint8Array([1,2,3])));const other=zipSync({'a.txt':strToU8('hello')});assert(!sameWorkbookContents(other,other));
});
