import {identity,resources,json,failure,publicDocument,ApiError,type DocumentRow} from '@/lib/server';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const owner=await identity(request,true),id=(await context.params).id,{db}=resources(),body=await request.json() as {version:number};
  const row=await db.prepare('SELECT * FROM documents WHERE id=? AND owner=?').bind(id,owner).first<DocumentRow>();
  if(!row)throw new ApiError(404,'Документ не найден');
  if(!row.deleted_at)return json(publicDocument(row));
  if(body.version!==row.version)throw new ApiError(409,'Документ изменился. Обнови корзину');
  const result=await db.prepare('UPDATE documents SET deleted_at=NULL,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND deleted_at IS NOT NULL').bind(new Date().toISOString(),id,owner,body.version).run();
  if(!result.meta.changes)throw new ApiError(409,'Документ изменился. Обнови корзину');
  return json(publicDocument((await db.prepare('SELECT * FROM documents WHERE id=? AND owner=?').bind(id,owner).first<DocumentRow>())!));
 }catch(e){return failure(e);}
}
