import { identity, owned, resources, failure } from '@/lib/server';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const row = await owned((await context.params).id, await identity(request));
    const image = await resources().bucket.get(row.image_key);
    if (!image) return new Response('Фото не найдено', { status: 404 });
    return new Response(image.body, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) { return failure(e); }
}
