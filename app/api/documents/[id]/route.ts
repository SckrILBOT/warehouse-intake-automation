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
    const body = await request.json() as { version: number; draft: unknown; complete?: boolean };
    if (row.version !== body.version) throw new ApiError(409, 'Документ изменён на другом устройстве. Открой его заново, чтобы увидеть последнюю версию.');
    try { validateDraft(body.draft); } catch { throw new ApiError(400, 'Проверь введённые данные'); }
    if (JSON.stringify(body.draft).length > 500000) throw new ApiError(413, 'Черновик слишком большой');
    if (body.complete && problems(body.draft).length) throw new ApiError(400, problems(body.draft).join('. '));
    const { db } = resources(), now = new Date().toISOString();
    const update = await db.prepare('UPDATE documents SET draft=?,status=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(body.draft),body.complete ? 'reviewed' : 'review',now,row.id,owner,body.version).run();
    if (!update.meta.changes) throw new ApiError(409, 'Документ уже изменён. Открой его заново.');
    return json({ version: body.version + 1, updatedAt: now, status: body.complete ? 'reviewed' : 'review' });
  } catch (e) { return failure(e); }
}
