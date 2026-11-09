import { identity, owned, resources, failure, ApiError } from '@/lib/server';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
  try{
    const owner=await identity(request),doc=await owned((await context.params).id,owner),{db,bucket}=resources();
    const id=new URL(request.url).searchParams.get('job');
    const job=await db.prepare('SELECT backup_key FROM cloud_jobs WHERE id=? AND document_id=? AND owner=?').bind(id||'',doc.id,owner).first<{backup_key:string}>();
    if(!job)throw new ApiError(404,'Резервная копия не найдена');const object=await bucket.get(job.backup_key);if(!object)throw new ApiError(404,'Резервная копия не найдена');
    return new Response(object.body,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Sklad_test-before.xlsx"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){return failure(e);}
}
