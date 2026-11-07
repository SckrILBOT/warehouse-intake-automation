import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function identity(request: Request, write = false) {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, 'Войди в аккаунт, чтобы открыть документы');
  if (write && request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'Открой приложение заново и повтори действие');
  return user.userId;
}
export function resources() {
  if (!env.DB || !env.BUCKET) throw new ApiError(503, 'Хранилище ещё не подключено');
  return { db: env.DB, bucket: env.BUCKET };
}
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  return json({ error: 'Не удалось выполнить действие. Твои сохранённые данные остаются в истории.' }, 500);
}
export type DocumentRow = { id: string; owner: string; filename: string; mime: string; image_key: string; status: string; draft: string | null; evidence: string | null; error: string | null; version: number; created_at: string; updated_at: string };
export async function owned(id: string, owner: string): Promise<DocumentRow> {
  const { db } = resources();
  const row = await db.prepare('SELECT * FROM documents WHERE id = ? AND owner = ?').bind(id, owner).first<DocumentRow>();
  if (!row) throw new ApiError(404, 'Документ не найден');
  return row;
}
export function publicDocument(row: DocumentRow) { return { id: row.id, filename: row.filename, status: row.status, draft: row.draft ? JSON.parse(row.draft) : null, error: row.error, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at }; }
