export type Alternative = { source: string; value: string };
export type Field = { value: string; alternatives: Alternative[]; reasons: string[]; reviewed: boolean };
export type Item = { id: string; number: string; name: Field; quantity: Field; unit: Field };
export type Draft = { number: Field; seller: Field; date: Field; items: Item[]; notices: string[] };
type ReadItem = { line_number?: string; name?: string; quantity?: number | null; unit?: string; needs_review?: boolean; source_table_index?: number; source_name_row?: number; source_name_column?: number };
export type Reading = { document_number?: string | null; seller?: string | null; document_date?: string | null; items: ReadItem[]; warnings?: string[] };

const text = (v: unknown) => v == null ? '' : String(v);
const normalize = (v: string) => v.normalize('NFKC').replace(/\s+/g, ' ').trim();
const unit = (v: unknown) => ({ sht: 'шт', up: 'уп', m: 'м', 'упак': 'уп', 'шт.': 'шт' }[text(v)] || text(v));
function field(direct: unknown, ocr: unknown, label: string, extra: string[] = []): Field {
  const a = text(direct), b = text(ocr), reasons = [...extra];
  if (!a || !b) reasons.push('Один из способов не прочитал поле');
  else if (normalize(a) !== normalize(b)) reasons.push('Результаты распознавания различаются');
  return { value: a || b, alternatives: [{ source: 'Чтение фото', value: a }, { source: 'OCR + разбор', value: b }], reasons: [...new Set(reasons)], reviewed: false };
}
export function lineNumber(value: unknown): string | null {
  const tokens = text(value).trim().split(/\s+/);
  if (!tokens.length || !tokens.every(t => /^\d{1,4}$/.test(t)) || !tokens.every(t => t === tokens[0])) return null;
  return String(Number(tokens[0]));
}
export function reconcile(direct: Reading, ocr: Reading, extraNotices: string[] = []): Draft {
  const a = Array.isArray(direct.items) ? direct.items : [], b = Array.isArray(ocr.items) ? ocr.items : [];
  const numbersA = a.map(x => lineNumber(x.line_number)), numbersB = b.map(x => lineNumber(x.line_number));
  const aligned = a.length === b.length && a.length > 0 && numbersA.every((n, i) => n !== null && n === numbersB[i]) && new Set(numbersA).size === a.length;
  const notices = [...extraNotices];
  if (!aligned) notices.push('Не удалось уверенно сопоставить строки. Позиции двух способов показаны отдельно; проверь и удали повторы.');
  const pairs: [ReadItem | undefined, ReadItem | undefined][] = aligned ? a.map((x, i) => [x, b[i]]) : [...a.map(x => [x, undefined] as [ReadItem, undefined]), ...b.map(x => [undefined, x] as [undefined, ReadItem])];
  const items = pairs.map(([x, y], i) => {
    const sharedCell = y && b.filter(z => z.source_table_index === y.source_table_index && z.source_name_row === y.source_name_row && z.source_name_column === y.source_name_column && z.source_name_row != null).length > 1;
    const warnings = [...(!aligned ? ['Сопоставление строки требует проверки'] : []), ...(x?.needs_review || y?.needs_review ? ['Распознаватель отметил строку как спорную'] : []), ...(sharedCell ? ['OCR объединил несколько товаров: количество может относиться к соседней позиции'] : [])];
    return { id: crypto.randomUUID(), number: lineNumber(x?.line_number ?? y?.line_number) || String(i + 1), name: field(x?.name, y?.name, 'name', warnings), quantity: field(x?.quantity, y?.quantity, 'quantity', warnings), unit: field(unit(x?.unit), unit(y?.unit), 'unit', warnings) };
  });
  return { number: field(direct.document_number, ocr.document_number, 'number'), seller: field(direct.seller, ocr.seller, 'seller'), date: field(direct.document_date, ocr.document_date, 'date'), items, notices: [...new Set([...notices, ...(direct.warnings || []), ...(ocr.warnings || [])])].slice(0, 80) };
}
export function pending(field: Field) { return field.reasons.length > 0 && !field.reviewed; }
export function fields(draft: Draft): Field[] { return [draft.number, draft.seller, draft.date, ...draft.items.flatMap(x => [x.name, x.quantity, x.unit])]; }
export function realDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function problems(draft: Draft): string[] {
  const errors: string[] = [];
  if (!draft.number.value.trim()) errors.push('Укажи номер документа');
  if (!draft.seller.value.trim()) errors.push('Укажи продавца');
  if (!realDate(draft.date.value)) errors.push('Укажи полную дату документа');
  if (!draft.items.length) errors.push('Добавь хотя бы один товар');
  draft.items.forEach((item, index) => {
    if (!item.name.value.trim()) errors.push(`Позиция ${index + 1}: нет наименования`);
    const q = Number(item.quantity.value.replace(',', '.'));
    if (!item.quantity.value.trim() || !Number.isFinite(q) || q <= 0) errors.push(`Позиция ${index + 1}: количество должно быть больше нуля`);
    if (!item.unit.value.trim()) errors.push(`Позиция ${index + 1}: нет единицы измерения`);
  });
  const unresolved = fields(draft).filter(pending).length;
  if (unresolved) errors.push(`Осталось проверить полей: ${unresolved}`);
  return errors;
}
export function validateDraft(value: unknown): asserts value is Draft {
  if (!value || typeof value !== 'object') throw new Error('Некорректный черновик');
  const d = value as Draft;
  if (!Array.isArray(d.items) || d.items.length > 500 || !Array.isArray(d.notices)) throw new Error('Некорректные позиции');
  for (const f of fields(d)) {
    if (!f || typeof f.value !== 'string' || f.value.length > 5000 || typeof f.reviewed !== 'boolean' || !Array.isArray(f.reasons) || !Array.isArray(f.alternatives)) throw new Error('Некорректное поле');
  }
  if (new Set(d.items.map(x => x.id)).size !== d.items.length || d.items.some(x => typeof x.id !== 'string' || typeof x.number !== 'string')) throw new Error('Некорректные идентификаторы позиций');
}
