import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DOMParser, XMLSerializer, onWarningStopParsing, type Element, type Document } from '@xmldom/xmldom';
import { problems, validateDraft, type Draft } from './review.ts';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const headers = ['Наименование','Количество','УПД','Продавец','Дата поступления','Дата отправки','Куда'];
const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
function resembles(a:string,b:string) {
  if(Math.min(a.length,b.length)<8||Math.abs(a.length-b.length)>Math.max(a.length,b.length)*.15)return false;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return row[b.length]<=Math.max(1,Math.floor(Math.max(a.length,b.length)*.15));
}
const children = (e: Element, name: string) => Array.from(e.childNodes).filter(n => n.nodeType === 1 && n.localName === name) as Element[];
const descendants = (d: Document | Element, name: string) => Array.from(d.getElementsByTagNameNS(NS, name));
function parse(bytes: Uint8Array) {
  const xml = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Книга содержит неподдерживаемый XML');
  return new DOMParser({ onError: onWarningStopParsing }).parseFromString(xml, 'application/xml');
}
const serialize = (d: Document) => strToU8(new XMLSerializer().serializeToString(d));
function entryPath(parent: string, target: string) {
  const parts = (target.startsWith('/') ? target.slice(1) : parent.slice(0,parent.lastIndexOf('/')+1)+target).split('/');
  const result: string[] = [];
  for (const p of parts) { if (p === '..') result.pop(); else if (p && p !== '.') result.push(p); }
  return result.join('/');
}
export async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export type WorkbookPlan = { sheet: string; added: number; skipped: number; firstRow: number; lastRow: number; rows: string[][]; warnings: string[] };

function workbookEntries(bytes:Uint8Array) {
  if(bytes.length>8*1024*1024)throw new Error('Книга больше 8 МБ: нужна отдельная проверка');
  let total=0,count=0;
  return unzipSync(bytes,{filter:file=>{
    total+=file.originalSize;count++;
    if(total>32*1024*1024||file.originalSize>16*1024*1024||count>4096)throw new Error('Слишком большая распакованная книга');
    return true;
  }});
}

/** ZIP timestamps, order and compression can change without changing any workbook part.
 * Compare every file's exact bytes, including styles, other sheets and properties.
 * Do not normalize XML, discard metadata files or merely look for the new rows.
 */
export function sameWorkbookContents(expected:Uint8Array,actual:Uint8Array):boolean {
  try {
    const a=workbookEntries(expected),b=workbookEntries(actual);
    const namesA=Object.keys(a).filter(n=>!n.endsWith('/')).sort(),namesB=Object.keys(b).filter(n=>!n.endsWith('/')).sort();
    if(!a['xl/workbook.xml']||namesA.length!==namesB.length)return false;
    for(let i=0;i<namesA.length;i++){
      const name=namesA[i];if(name!==namesB[i])return false;
      const left=a[name],right=b[name];if(left.length!==right.length)return false;
      for(let j=0;j<left.length;j++)if(left[j]!==right[j])return false;
    }
    return true;
  }catch{return false;}
}

/** Edit only the sheet, table range and added styles; preserve all other ZIP entries. */
export function prepareWorkbook(bytes: Uint8Array, draft: Draft): { bytes: Uint8Array; plan: WorkbookPlan } {
  validateDraft(draft);
  const issues = problems(draft);
  if (issues.length) throw new Error(issues.join('. '));
  const files = workbookEntries(bytes);
  if (Object.keys(files).some(x => /vbaProject|_xmlsignatures|externalLinks/i.test(x))) throw new Error('Макросы, подписи и внешние связи требуют отдельной проверки');
  const read = (path: string) => { if (!files[path]) throw new Error('Не найдена часть книги: '+path); return parse(files[path]); };
  const workbook = read('xl/workbook.xml');
  if (descendants(workbook,'workbookPr').some(x=>x.getAttribute('date1904')==='1'||x.getAttribute('date1904')==='true')) throw new Error('Календарь Excel 1904 пока не поддерживается');
  const sheet = descendants(workbook,'sheet').find(s=>s.getAttribute('name')==='Лист1');
  if (!sheet) throw new Error('В книге нет листа «Лист1»');
  const rels = read('xl/_rels/workbook.xml.rels');
  const rel = Array.from(rels.documentElement!.childNodes).find(n=>n.nodeType===1&&(n as Element).getAttribute('Id')===sheet.getAttributeNS(REL,'id')) as Element | undefined;
  if (!rel || rel.getAttribute('TargetMode')==='External') throw new Error('Не удалось найти лист в книге');
  const sheetPath = entryPath('xl/workbook.xml',rel.getAttribute('Target')!);
  const xml = read(sheetPath), data = descendants(xml,'sheetData')[0];
  if (!data || descendants(xml,'sheetProtection').length || descendants(xml,'mergeCell').length) throw new Error('Защита или объединённые ячейки требуют отдельной проверки');
  const shared = files['xl/sharedStrings.xml'] ? descendants(read('xl/sharedStrings.xml'),'si').map(s=>descendants(s,'t').map(t=>t.textContent).join('')) : [];
  function value(cell: Element | undefined) {
    if (!cell) return '';
    if (children(cell,'f').length) throw new Error('Формулы в товарных строках требуют отдельной проверки');
    const v = children(cell,'v')[0]?.textContent || '';
    if (cell.getAttribute('t')==='s') return shared[Number(v)] ?? '';
    if (cell.getAttribute('t')==='inlineStr') return descendants(cell,'t').map(t=>t.textContent).join('');
    return v;
  }
  const allRows = children(data,'row');
  const cells = (row: Element) => Object.fromEntries(children(row,'c').map(c=>[c.getAttribute('r')!.replace(/\d+$/,''),c]));
  const first = allRows.find(r=>r.getAttribute('r')==='1');
  if (!first || headers.some((h,i)=>normalize(value(cells(first)[String.fromCharCode(65+i)]))!==normalize(h))) throw new Error('Заголовки A:G отличаются от согласованной структуры. Запись остановлена');
  const populated = allRows.filter(r=>Number(r.getAttribute('r'))>1&&children(r,'c').some(c=>value(c).trim()));
  if (populated.some(r=>children(r,'c').some(c=>!/^[A-G]\d+$/.test(c.getAttribute('r')!)&&value(c).trim()))) throw new Error('На листе есть данные вне A:G: нужна проверка структуры');
  const last = Math.max(1,...populated.map(r=>Number(r.getAttribute('r'))));
  if (last + draft.items.length > 100000) throw new Error('Слишком много строк для этой версии');
  const quantity = (s:string) => normalize(s).replace(/\s+/g,'').replace(',','.');
  const serial = (date:string) => String(Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000));
  const dateValue = (s:string) => {
    if (/^\d+(\.0+)?$/.test(s)) return new Date(Date.UTC(1899,11,30)+Number(s)*86400000).toISOString().slice(0,10);
    const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s); return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : s;
  };
  const sameDocument = populated.filter(r=>{ const c=cells(r); return normalize(value(c.C))===normalize(draft.number.value)&&normalize(value(c.D))===normalize(draft.seller.value)&&dateValue(value(c.E))===draft.date.value; });
  const existing = new Map<string,number>(), nameQuantities = new Map<string,Set<string>>();
  for (const row of sameDocument) {
    const c=cells(row), name=normalize(value(c.A)), q=quantity(value(c.B)), key=name+'\u0000'+q;
    existing.set(key,(existing.get(key)||0)+1);
    const quantities=nameQuantities.get(name)||new Set();quantities.add(q);nameQuantities.set(name,quantities);
  }
  let skipped=0;
  const additions: string[][]=[];
  for (const item of draft.items) {
    const name=item.name.value.trim(), q=quantity(item.quantity.value)+normalize(item.unit.value).replace(/\s+/g,''), key=normalize(name)+'\u0000'+q;
    const count=existing.get(key)||0;
    if (count) {existing.set(key,count-1); skipped++; continue;}
    if (nameQuantities.has(normalize(name))) throw new Error('Неоднозначное совпадение товара «'+name+'»: другая величина или дополнительная одинаковая строка. Проверь книгу вручную');
    if(Array.from(nameQuantities.keys()).some(existingName=>resembles(existingName,normalize(name)))) throw new Error('В этом документе уже есть похожее название на «'+name+'». Проверь артикулы и возможный повтор вручную');
    additions.push([name, q, draft.number.value.trim(),draft.seller.value.trim(),draft.date.value,'','']);
  }
  const plan: WorkbookPlan={sheet:'Лист1',added:additions.length,skipped,firstRow:last+1,lastRow:last+additions.length,rows:additions,warnings:skipped?['Точные совпадения пропущены. Если это новая страница с отдельными одинаковыми товарами, остановись и проверь её вручную.']:[]};
  if (!additions.length) return {bytes,plan};
  const template=populated.at(-1);
  if (!template) throw new Error('Нет заполненной товарной строки для образца оформления');
  const styles=read('xl/styles.xml'), xfs=descendants(styles,'cellXfs')[0];
  if (!xfs) throw new Error('Не найдены стили книги');
  const styleMap=new Map<string,string>();
  function centered(styleId:string) {
    if (styleMap.has(styleId)) return styleMap.get(styleId)!;
    const xf=children(xfs,'xf')[Number(styleId)];if(!xf)throw new Error('Не найден стиль строки-образца');
    const copy=xf.cloneNode(true) as Element;
    let alignment=children(copy,'alignment')[0];
    if (!alignment) {alignment=styles.createElementNS(NS,'alignment');const protection=children(copy,'protection')[0];copy.insertBefore(alignment,protection||null);}
    alignment.setAttribute('horizontal','center');alignment.setAttribute('vertical','center');copy.setAttribute('applyAlignment','1');
    const id=String(children(xfs,'xf').length);xfs.appendChild(copy);xfs.setAttribute('count',String(children(xfs,'xf').length));styleMap.set(styleId,id);return id;
  }
  const sample=cells(template);
  for (let i=0;i<additions.length;i++) {
    const number=last+i+1, old=allRows.find(r=>Number(r.getAttribute('r'))===number);
    const row=xml.createElementNS(NS,'row');row.setAttribute('r',String(number));
    for (const attr of ['ht','customHeight']) if(template.hasAttribute(attr))row.setAttribute(attr,template.getAttribute(attr)!);
    additions[i].forEach((text,j)=>{
      const col=String.fromCharCode(65+j), cell=xml.createElementNS(NS,'c');cell.setAttribute('r',col+number);cell.setAttribute('s',centered(sample[col]?.getAttribute('s')||'0'));
      if (j===4) {const v=xml.createElementNS(NS,'v');v.textContent=serial(text);cell.appendChild(v);}
      else if(text) {cell.setAttribute('t','inlineStr');const is=xml.createElementNS(NS,'is'),t=xml.createElementNS(NS,'t');t.setAttribute('xml:space','preserve');t.textContent=text;is.appendChild(t);cell.appendChild(is);}
      row.appendChild(cell);
    });
    if(old)data.replaceChild(row,old);else {const next=children(data,'row').find(r=>Number(r.getAttribute('r'))>number);data.insertBefore(row,next||null);}
  }
  const dimension=descendants(xml,'dimension')[0];if(dimension)dimension.setAttribute('ref','A1:G'+Math.max(last+additions.length,Number(dimension.getAttribute('ref')?.match(/\d+$/)?.[0]||0)));
  const tableParts=descendants(xml,'tablePart');
  if (tableParts.length!==1) throw new Error('Ожидается одна структурированная таблица на листе');
  const sheetRels=read(sheetPath.replace(/([^/]+)$/, '_rels/$1.rels'));
  const tableRel=Array.from(sheetRels.documentElement!.childNodes).find(n=>n.nodeType===1&&(n as Element).getAttribute('Id')===tableParts[0].getAttributeNS(REL,'id')) as Element|undefined;
  if(!tableRel||tableRel.getAttribute('TargetMode')==='External')throw new Error('Не найдена таблица листа');
  const tablePath=entryPath(sheetPath,tableRel.getAttribute('Target')!),table=read(tablePath),root=table.documentElement!;
  const range=/^A1:G(\d+)$/.exec(root.getAttribute('ref')||'');
  if(!range||root.getAttribute('totalsRowCount')==='1')throw new Error('Неподдерживаемый диапазон или строка итогов таблицы');
  const end=Math.max(Number(range[1]),last+additions.length);root.setAttribute('ref','A1:G'+end);
  for(const filter of descendants(table,'autoFilter'))filter.setAttribute('ref','A1:G'+end);
  for(const filter of descendants(xml,'autoFilter'))filter.setAttribute('ref','A1:G'+end);
  files[sheetPath]=serialize(xml);files['xl/styles.xml']=serialize(styles);files[tablePath]=serialize(table);
  return {bytes:zipSync(files,{level:6}),plan};
}
