import {realDate,type Reading} from './review.ts';
type Cell={rowIndex?:number;columnIndex?:number;rowSpan?:number;columnSpan?:number;text?:string};
export type Annotation={tables?:{cells?:Cell[]}[];fullText?:string};
const clean=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim();
const heading=(v:unknown)=>clean(v).toLowerCase().replace(/[^а-яёa-z0-9]/g,'');
/** Literal column extraction only: never borrow quantities across rows or from a product name. */
export function readingFromTable(annotation:Annotation|null|undefined):Reading {
 const result:Reading={document_number:null,seller:null,document_date:null,items:[],warnings:['Поля извлечены из ячеек OCR. Сверь их с фотографией; это не подтверждение точности.']};
 const source=annotation?.fullText||'';
 const number=/номер\s+документа\s*[:№]?\s*([^\s,;]+)/i.exec(source);if(number)result.document_number=number[1];
 const seller=/(?:продавец|поставщик|грузоотправитель)\s*:\s*([^\r\n]+)/i.exec(source);if(seller)result.seller=seller[1].split(/покупатель\s*:|грузополучатель\s*:/i)[0].trim();
 const dates=Array.from(source.matchAll(/(?:дата\s+документа|дата\s+составления)\s*:\s*(\d{2})\.(\d{2})\.(\d{4})/gi)).map(m=>`${m[3]}-${m[2]}-${m[1]}`);
 if(dates.length&&new Set(dates).size===1&&realDate(dates[0]))result.document_date=dates[0];
 for(const [tableIndex,table] of (annotation?.tables||[]).entries()){
  const cells=table.cells||[];
  const names=cells.filter(c=>['наименование','наименованиетовара','наименованиетоваров','наименованиепродукции'].includes(heading(c.text)));
  const amounts=cells.filter(c=>['количество','колво','количествотовара'].includes(heading(c.text)));
  if(names.length!==1||amounts.length!==1)continue;
  const nameHeader=names[0],amountHeader=amounts[0];
  // Grouped/multi-level headers need model/manual interpretation; never mistake
  // the group's "Количество" column or a numbered subheader for a goods row.
  if(Number(nameHeader.rowIndex)!==Number(amountHeader.rowIndex)||[nameHeader,amountHeader].some(c=>Number(c.rowSpan||1)!==1||Number(c.columnSpan||1)!==1))continue;
  const headerEnd=Math.max(Number(nameHeader.rowIndex),Number(amountHeader.rowIndex));
  const units=cells.filter(c=>Number(c.rowIndex)<=headerEnd&&['ед','едизм','единица','единицаизмерения'].includes(heading(c.text)));
  const lineHeaders=cells.filter(c=>Number(c.rowIndex)<=headerEnd&&['номер','пп'].includes(heading(c.text))||Number(c.rowIndex)<=headerEnd&&clean(c.text)==='№');
  const column=(col:number|undefined,row:number)=>cells.filter(c=>Number(c.columnIndex)===Number(col)&&Number(c.rowIndex)===row);
  for(const cell of cells.filter(c=>Number(c.columnIndex)===Number(nameHeader.columnIndex)&&Number(c.rowIndex)>headerEnd)){
   const name=clean(cell.text),row=Number(cell.rowIndex);if(!name||/^(итого|всего|сумма)(?:\s|:|$)/i.test(name))continue;
   const rowTexts=cells.filter(c=>Number(c.rowIndex)===row).map(c=>clean(c.text));
   if(rowTexts.length>=3&&rowTexts.every((v,i)=>v===String(i+1)))continue;
   const qCells=column(amountHeader.columnIndex,row),unitCells=units.length===1?column(units[0].columnIndex,row):[];
   const merged=[cell,...qCells,...unitCells].some(c=>Number(c.rowSpan||1)!==1||Number(c.columnSpan||1)!==1);
   const qText=qCells.length===1?clean(qCells[0].text).replace(',','.'):'';
   const quantity=!merged&&/^\d+(?:\.\d+)?$/.test(qText)&&Number(qText)>0?Number(qText):null;
   const numbers=lineHeaders.length===1?column(lineHeaders[0].columnIndex,row):[];
   result.items.push({line_number:numbers.length===1&&/^\d+$/.test(clean(numbers[0].text))?clean(numbers[0].text):undefined,name,quantity,unit:unitCells.length===1&&!merged?clean(unitCells[0].text):'',needs_review:true,source_table_index:tableIndex,source_name_row:row,source_name_column:Number(cell.columnIndex)});
  }
 }
 return result;
}
