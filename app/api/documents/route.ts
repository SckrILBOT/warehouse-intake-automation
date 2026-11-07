import { identity, resources, json, failure, publicDocument, type DocumentRow, ApiError } from '@/lib/server';
export async function GET(request: Request) {
  try {
    const owner = await identity(request), { db } = resources();
    const rows = await db.prepare('SELECT id, filename, status, draft, error, version, created_at, updated_at FROM documents WHERE owner = ? ORDER BY updated_at DESC LIMIT 50').bind(owner).all<DocumentRow>();
    return json(rows.results.map(publicDocument));
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const owner = await identity(request, true), { db, bucket } = resources();
    if (Number(request.headers.get('content-length')) > 9 * 1024 * 1024) throw new ApiError(413, 'Фото слишком большое. Выбери файл до 8 МБ.');
    const form = await request.formData(), image = form.get('image');
    if (!(image instanceof File) || !image.size || image.size > 8 * 1024 * 1024) throw new ApiError(400, 'Выбери фото JPG или PNG до 8 МБ');
    const data = await image.arrayBuffer(), bytes = new Uint8Array(data);
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg) throw new ApiError(400, 'Поддерживаются фотографии JPG и PNG. HEIC пока нужно преобразовать в JPG.');
    if (png && bytes.length > 24 && new DataView(data).getUint32(16) * new DataView(data).getUint32(20) > 20000000) throw new ApiError(400, 'Фото больше 20 мегапикселей. Выбери меньший размер.');
    const id = crypto.randomUUID(), key = `${owner}/${id}`, now = new Date().toISOString(), mime = png ? 'image/png' : 'image/jpeg';
    await bucket.put(key, data, { httpMetadata: { contentType: mime } });
    try { await db.prepare('INSERT INTO documents (id,owner,filename,mime,image_key,status,version,created_at,updated_at) VALUES (?,?,?,?,?,\'uploaded\',0,?,?)').bind(id,owner,image.name.slice(0,200),mime,key,now,now).run(); }
    catch (e) { await bucket.delete(key); throw e; }
    return json({ id }, 201);
  } catch (e) { return failure(e); }
}
