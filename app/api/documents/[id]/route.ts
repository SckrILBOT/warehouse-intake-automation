import { identity, owned, resources, json, failure, publicDocument, ApiError } from '@/lib/server';
import { validateDraft, problems } from '@/lib/review';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return json(publicDocument(await owned((await context.params).id, await identity(request)))); } catch (e) { return failure(e); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const owner = await identity(request, true), row = await owned((await context.params).id, owner);
    if (row.status === 'recognizing') throw new ApiError(409, 'Распознавание ещё идёт');
    if (['exporting','excel-unknown','written'].includes(row.status)) throw new ApiError(409, 'Документ передаётся в Excel или уже записан. Проверь результат записи; для другого прихода создай новый документ');
    const body = await request.json() as { version: number; draft: unknown; complete?: boolean };
    if (row.version !== body.version) throw new ApiError(409, 'Документ изменён на другом устройстве. Открой его заново, чтобы увидеть последнюю версию.');
    try { validateDraft(body.draft); } catch { throw new ApiError(400, 'Проверь введённые данные'); }
    if (JSON.stringify(body.draft).length > 500000) throw new ApiError(413, 'Черновик слишком большой');
    if (body.complete && problems(body.draft).length) throw new ApiError(400, problems(body.draft).join('. '));
    const { db } = resources(), now = new Date().toISOString();
    const update = await db.prepare('UPDATE documents SET draft=?,status=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND status NOT IN (\'exporting\',\'excel-unknown\',\'written\')').bind(JSON.stringify(body.draft),body.complete ? 'reviewed' : 'review',now,row.id,owner,body.version).run();
    if (!update.meta.changes) throw new ApiError(409, 'Документ уже изменён. Открой его заново.');
    return json({ version: body.version + 1, updatedAt: now, status: body.complete ? 'reviewed' : 'review' });
  } catch (e) { return failure(e); }
}
export async function DELETE(request:Request,context:Context){
  try{
    const owner=await identity(request,true),row=await owned((await context.params).id,owner),body=await request.json() as {version:number};
    if(row.version!==body.version)throw new ApiError(409,'Документ изменился. Обнови историю перед удалением');
    if(['exporting','excel-unknown'].includes(row.status))throw new ApiError(409,'Сначала проверь результат записи в Excel. Документ незавершённой записи удалять нельзя');
    const {db}=resources(),now=new Date().toISOString();
    const result=await db.prepare("UPDATE documents SET deleted_at=?,updated_at=?,version=version+1,status=CASE WHEN status='recognizing' THEN 'error' ELSE status END,error=CASE WHEN status='recognizing' THEN 'Ожидание остановлено. Готовые этапы сохранены. Уже отправленные запросы могли быть оплачены; повтор не запускался.' ELSE error END WHERE id=? AND owner=? AND version=? AND deleted_at IS NULL AND status NOT IN ('exporting','excel-unknown') AND NOT EXISTS (SELECT 1 FROM cloud_jobs WHERE document_id=? AND owner=? AND state IN ('writing','unknown'))").bind(now,now,row.id,owner,body.version,row.id,owner).run();
    if(!result.meta.changes)throw new ApiError(409,'Статус документа изменился или ещё не выяснен результат записи в Excel. Обнови историю');
    return json({id:row.id,deletedAt:now});
  }catch(e){return failure(e);}
}
