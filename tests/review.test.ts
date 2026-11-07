import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, pending, problems, realDate, validateDraft, type Reading } from '../lib/review.ts';
const base:Reading={document_number:'TEST-1',seller:'Учебный поставщик',document_date:'2026-11-07',items:[{line_number:'1',name:'Кабель ТЕСТ-01',quantity:8,unit:'шт'}]};
test('quantity mismatch remains visible and blocks completion',()=>{
  const draft=reconcile(base,{...base,items:[{...base.items[0],quantity:2,unit:'sht'}]});
  assert.equal(draft.items[0].quantity.value,'8');
  assert(pending(draft.items[0].quantity));assert(!pending(draft.items[0].unit));
  assert.deepEqual(draft.items[0].quantity.alternatives.map(x=>x.value),['8','2']);assert(problems(draft).length>0);
});
test('merged OCR name cell forces review even if quantities agree',()=>{
  const source:Reading={...base,items:[{...base.items[0],line_number:'1'},{...base.items[0],line_number:'2'}]};
  const other={...source,items:source.items.map(x=>({...x,source_table_index:0,source_name_row:7,source_name_column:1}))};
  const draft=reconcile(source,other);assert(draft.items.every(x=>pending(x.quantity)));
});
test('unmatched rows are preserved separately instead of silently merged',()=>{
  const draft=reconcile(base,{...base,items:[{...base.items[0],line_number:'9'}]});assert.equal(draft.items.length,2);assert(draft.items.every(x=>pending(x.name)));
});
test('manual correction resolves disagreement but cannot validate empty quantity',()=>{
  const d=reconcile(base,{...base,items:[{...base.items[0],quantity:2}]});d.items[0].quantity.reviewed=true;assert.equal(problems(d).length,0);
  d.items[0].quantity.value='';assert(problems(d).some(x=>x.includes('количество')));
});
test('impossible dates are rejected and missing year is not supplied',()=>{
  assert(!realDate('2026-02-30'));assert(!realDate('02.11.2'));assert(realDate('2024-02-29'));assert(!realDate('2026-02-29'));
  const d=reconcile({...base,document_date:null},{...base,document_date:null});assert.equal(d.date.value,'');assert(problems(d).length>0);
});
test('article differences are not normalized away',()=>{
  const d=reconcile(base,{...base,items:[{...base.items[0],name:'Кабель ТЕСТ-02'}]});assert(pending(d.items[0].name));
});
test('duplicate item identifiers are rejected at the save boundary',()=>{
  const d=reconcile(base,base);d.items.push({...d.items[0]});assert.throws(()=>validateDraft(d));
});
