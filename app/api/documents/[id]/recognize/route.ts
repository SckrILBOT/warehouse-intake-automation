import { identity, owned, resources, json, failure, ApiError } from '@/lib/server';
import { recognize } from '@/lib/recognition';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let id: string | undefined, owner: string | undefined;
  let claimed = false;
  try {
    owner = await identity(request, true); id = (await context.params).id;
    const row = await owned(id, owner), { db, bucket } = resources();
    const body = await request.json() as { retry?: boolean };
    const stale = row.status === 'recognizing' && Date.now() - Date.parse(row.updated_at) > 10 * 60 * 1000;
    if (row.status !== 'uploaded' && !(body.retry && (row.status === 'error' || stale))) throw new ApiError(409, 'Документ уже обрабатывается или распознан. Проверь его в истории.');
    const claim = await db.prepare('UPDATE documents SET status=\'recognizing\',error=NULL,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=?').bind(new Date().toISOString(),id,owner,row.version).run();
    if (!claim.meta.changes) throw new ApiError(409, 'Распознавание уже запущено на другом устройстве');
    claimed = true;
    const image = await bucket.get(row.image_key);
    if (!image) throw new Error('Исходное фото не найдено');
    const result = await recognize(await image.arrayBuffer(), row.mime);
    const evidence = JSON.stringify(result.evidence);
    // Full OCR remains evidence, never a public asset or client secret.
    await bucket.put(`${row.image_key}/evidence.json`, evidence, { httpMetadata: { contentType: 'application/json' } });
    await db.prepare('UPDATE documents SET status=\'review\',draft=?,evidence=?,version=version+1,updated_at=? WHERE id=? AND owner=?').bind(JSON.stringify(result.draft),`${row.image_key}/evidence.json`,new Date().toISOString(),id,owner).run();
    return json({ id, status: 'review' });
  } catch (e) {
    if (claimed && id && owner) {
      const message = e instanceof Error ? e.message.slice(0,600) : 'Распознавание не завершилось';
      try { await resources().db.prepare('UPDATE documents SET status=\'error\',error=?,updated_at=? WHERE id=? AND owner=?').bind(message,new Date().toISOString(),id,owner).run(); } catch { /* Original error remains visible. */ }
      return json({ error: message }, 502);
    }
    return failure(e);
  }
}
