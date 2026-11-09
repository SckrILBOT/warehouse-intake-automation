import {identity,owned,resources,json,failure,ApiError} from '@/lib/server';
import {recognize} from '@/lib/recognition';
import {reconcile,type Reading} from '@/lib/review';
import {readingFromTable} from '@/lib/ocr-table';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 let id:string|undefined,owner:string|undefined,attempt:number|undefined;
 try{
  owner=await identity(request,true);id=(await context.params).id;
  const row=await owned(id,owner),{db,bucket}=resources(),body=await request.json() as {retry?:boolean;usePartial?:boolean;stop?:boolean};
  if(body.stop){
   if(row.status!=='recognizing')return json({id,status:row.status});
   const result=await db.prepare("UPDATE documents SET status='error',error=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND status='recognizing'").bind('Ожидание остановлено. Готовые этапы сохранены. Уже отправленные запросы могли быть оплачены; повтор не запускался.',new Date().toISOString(),id,owner,row.version).run();
   if(!result.meta.changes)throw new ApiError(409,'Статус изменился. Проверь документ заново');return json({id,status:'error'});
  }
  if(body.usePartial){
   if(!['recognizing','error'].includes(row.status))throw new ApiError(409,'Документ уже обработан. Проверь его статус');
   const progress=JSON.parse(row.recognition_progress||'{}'),prefix=`${row.image_key}/recognition/${progress.attempt??row.version}`;
   async function saved(name:string){if(progress[name]?.state!=='done')return null;const object=await bucket.get(`${prefix}/${name}.json`);return object?JSON.parse(await object.text()):null;}
   const direct:Reading=await saved('direct')||{items:[]},tableResponse=await saved('table'),structured:Reading=await saved('structured')||readingFromTable(tableResponse?.result?.textAnnotation);
   if(!direct.items?.length&&!structured.items?.length)throw new ApiError(409,'Готовых товарных строк пока нет. Фото сохранено');
   const result={draft:reconcile(direct,structured,['Открыт сохранённый результат доступных способов. Незавершённые способы не подтверждают его точность; проверь все поля по фото.']),evidence:{direct,structured,table:tableResponse?.result?.textAnnotation||null,partial:true}};
   const evidenceKey=`${prefix}/partial-evidence.json`;await bucket.put(evidenceKey,JSON.stringify(result.evidence));
   const update=await db.prepare("UPDATE documents SET status='review',draft=?,evidence=?,error=NULL,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND status IN ('recognizing','error')").bind(JSON.stringify(result.draft),evidenceKey,new Date().toISOString(),id,owner,row.version).run();
   if(!update.meta.changes)throw new ApiError(409,'Статус изменился. Открой документ заново');return json({id,status:'review'});
  }
  const stale=row.status==='recognizing'&&Date.now()-Date.parse(row.updated_at)>300000;
  if(row.status!=='uploaded'&&!(body.retry&&(row.status==='error'||stale)))throw new ApiError(409,'Распознавание уже запущено или документ готов. Проверь статус; повтор не запущен');
  attempt=row.version+1;
  const claim=await db.prepare("UPDATE documents SET status='recognizing',error=NULL,recognition_progress=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=?").bind(JSON.stringify({attempt}),new Date().toISOString(),id,owner,row.version).run();
  if(!claim.meta.changes){attempt=undefined;throw new ApiError(409,'Распознавание уже запущено на другом устройстве');}
  const prefix=`${row.image_key}/recognition/${attempt}`,image=await bucket.get(row.image_key);if(!image)throw new Error('Исходное фото не найдено');
  const result=await recognize(await image.arrayBuffer(),row.mime,async(stage,progress,data)=>{
   if(data!==undefined)await bucket.put(`${prefix}/${stage}.json`,JSON.stringify(data));
   const update=await db.prepare("UPDATE documents SET recognition_progress=json_set(COALESCE(recognition_progress,'{}'),?,json(?)),updated_at=? WHERE id=? AND owner=? AND version=? AND status='recognizing'").bind('$.'+stage,JSON.stringify(progress),new Date().toISOString(),id,owner,attempt).run();
   if(!update.meta.changes)throw new Error('Эта попытка уже остановлена или её готовый результат открыт');
  });
  const evidenceKey=`${prefix}/evidence.json`;await bucket.put(evidenceKey,JSON.stringify(result.evidence));
  const update=await db.prepare("UPDATE documents SET status='review',draft=?,evidence=?,error=NULL,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND status='recognizing'").bind(JSON.stringify(result.draft),evidenceKey,new Date().toISOString(),id,owner,attempt).run();
  return json({id,status:update.meta.changes?'review':'superseded'});
 }catch(e){
  if(attempt!==undefined&&id&&owner){
   const message=e instanceof Error?e.message.slice(0,900):'Распознавание не завершилось';
   const update=await resources().db.prepare("UPDATE documents SET status='error',error=?,updated_at=? WHERE id=? AND owner=? AND version=? AND status='recognizing'").bind(message,new Date().toISOString(),id,owner,attempt).run();
   if(!update.meta.changes)return json({id,status:'superseded'});return json({error:message},502);
  }
  return failure(e);
 }
}
