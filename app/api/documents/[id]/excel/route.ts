import { env } from 'cloudflare:workers';
import { identity, owned, resources, json, failure, ApiError } from '@/lib/server';
import { cloudTarget, cloudRequest, CloudError } from '@/lib/cloud-mail';
import { prepareWorkbook, digest, sameWorkbookContents, type WorkbookPlan } from '@/lib/workbook';
import { problems, validateDraft } from '@/lib/review';

type Context={params:Promise<{id:string}>};
type Job={id:string;owner:string;document_id:string;document_version:number;target:string;state:string;before_hash:string;after_hash:string;backup_key:string;result_key:string;plan:string;created_at:string;updated_at:string};
function publicJob(job:Job){const split=job.target.indexOf('/');return {id:job.id,state:job.state,documentVersion:job.document_version,target:{account:job.target.slice(0,split),path:job.target.slice(split)},plan:JSON.parse(job.plan) as WorkbookPlan,createdAt:job.created_at,updatedAt:job.updated_at};}
export async function GET(request:Request,context:Context) {
  try{
    const owner=await identity(request),doc=await owned((await context.params).id,owner),{db}=resources();
    const job=await db.prepare('SELECT * FROM cloud_jobs WHERE document_id=? AND owner=? ORDER BY created_at DESC LIMIT 1').bind(doc.id,owner).first<Job>();
    return json(job?publicJob(job):null);
  }catch(e){return failure(e);}
}
export async function POST(request:Request,context:Context) {
  try {
    const owner=await identity(request,true),doc=await owned((await context.params).id,owner),{db,bucket}=resources();
    const target=cloudTarget(env),targetId=target.account+target.path;
    const body=await request.json() as {action?:string;jobId?:string;editorClosed?:boolean};
    if(body.action==='prepare') {
      if(doc.status!=='reviewed'||!doc.draft)throw new ApiError(409,'Сначала заверши проверку и сохрани документ');
      const pending=await db.prepare("SELECT id FROM cloud_jobs WHERE target=? AND state IN ('writing','unknown') LIMIT 1").bind(targetId).first();
      if(pending)throw new ApiError(409,'Есть незавершённая запись в эту книгу. Сначала проверь её результат');
      const draft=JSON.parse(doc.draft);validateDraft(draft);if(problems(draft).length)throw new ApiError(400,'Документ требует проверки');
      const before=await cloudRequest(target,'GET');
      let result:ReturnType<typeof prepareWorkbook>;
      try{result=prepareWorkbook(before,draft);}catch(e){throw new ApiError(409,(e as Error).message);}
      const id=crypto.randomUUID(),now=new Date().toISOString(),backupKey='excel/'+id+'/before.xlsx',resultKey='excel/'+id+'/after.xlsx';
      const beforeHash=await digest(before),afterHash=await digest(result.bytes);
      await bucket.put(backupKey,before,{httpMetadata:{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      await bucket.put(resultKey,result.bytes,{httpMetadata:{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      await db.prepare('INSERT INTO cloud_jobs (id,owner,document_id,document_version,target,state,before_hash,after_hash,backup_key,result_key,plan,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,doc.id,doc.version,targetId,'prepared',beforeHash,afterHash,backupKey,resultKey,JSON.stringify(result.plan),now,now).run();
      return json({id,state:'prepared',documentVersion:doc.version,target:{account:target.account,path:target.path},plan:result.plan,createdAt:now,updatedAt:now});
    }
    const job=await db.prepare('SELECT * FROM cloud_jobs WHERE id=? AND owner=? AND document_id=?').bind(body.jobId||'',owner,doc.id).first<Job>();
    if(!job)throw new ApiError(404,'Подготовленная запись не найдена');
    if(job.target!==targetId)throw new ApiError(409,'Настройки облака изменились. Подготовь запись заново');
    if(job.state==='written')return json(publicJob(job));
    async function finish(state:string,documentStatus:string){
      const now=new Date().toISOString();
      await db.batch([
        db.prepare('UPDATE cloud_jobs SET state=?,updated_at=? WHERE id=?').bind(state,now,job!.id),
        db.prepare("UPDATE documents SET status=?,updated_at=? WHERE id=? AND owner=? AND status IN ('exporting','excel-unknown')").bind(documentStatus,now,doc.id,owner),
      ]);job!.state=state;job!.updated_at=now;
    }
    if(body.action==='reconcile') {
      if(!['writing','unknown'].includes(job.state))return json(publicJob(job));
      if(job.state==='writing'&&Date.now()-Date.parse(job.updated_at)<180000)throw new ApiError(409,'Запись ещё может выполняться. Подожди три минуты перед проверкой');
      const current=await cloudRequest(target,'GET'),hash=await digest(current);
      let matches=hash===job.after_hash;
      if(!matches){
        const expected=await bucket.get(job.result_key);
        if(!expected)throw new CloudError('Подготовленная книга не найдена. Нужна ручная проверка');
        const expectedBytes=new Uint8Array(await expected.arrayBuffer());
        if(await digest(expectedBytes)!==job.after_hash)throw new CloudError('Контрольная копия не прошла проверку. Нужна ручная проверка');
        matches=sameWorkbookContents(expectedBytes,current);
      }
      if(matches)await finish('written','written');
      // A timed-out PUT can still finish later. Never release the target automatically on before_hash.
      else {console.info('Excel verification mismatch',{matchesOriginal:hash===job.before_hash,bytes:current.length});await finish('unknown','excel-unknown');}
      return json(publicJob(job));
    }
    if(body.action!=='write'||body.editorClosed!==true)throw new ApiError(400,'Закрой редактор книги на всех устройствах и подтверди это перед записью');
    if(job.state!=='prepared')throw new ApiError(409,'Эту операцию нельзя повторять. Проверь результат в истории');
    if(Date.now()-Date.parse(job.created_at)>600000)throw new ApiError(409,'Подготовка устарела. Подготовь запись заново');
    if(doc.version!==job.document_version||doc.status!=='reviewed')throw new ApiError(409,'Документ изменился. Заверши проверку и подготовь запись заново');
    const now=new Date().toISOString();
    // D1 serializes this atomic batch. One active/uncertain write blocks the entire target.
    const claim=await db.batch([
      db.prepare("UPDATE cloud_jobs SET state='writing',updated_at=? WHERE id=? AND state='prepared' AND NOT EXISTS (SELECT 1 FROM cloud_jobs WHERE target=? AND state IN ('writing','unknown')) AND EXISTS (SELECT 1 FROM documents WHERE id=? AND version=? AND status='reviewed')").bind(now,job.id,targetId,doc.id,job.document_version),
      db.prepare("UPDATE documents SET status='exporting' WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM cloud_jobs WHERE id=? AND state='writing')").bind(doc.id,job.document_version,job.id),
    ]);
    if(!claim[0].meta.changes)throw new ApiError(409,'Начата другая запись или документ изменён. Обнови страницу');
    let sent=false;
    try {
      const backup=await bucket.get(job.backup_key),output=await bucket.get(job.result_key);
      if(!backup||!output)throw new CloudError('Резервная копия или подготовленный файл не найдены');
      const backupBytes=new Uint8Array(await backup.arrayBuffer()),outputBytes=new Uint8Array(await output.arrayBuffer());
      if(await digest(backupBytes)!==job.before_hash||await digest(outputBytes)!==job.after_hash)throw new CloudError('Проверка резервной копии не прошла');
      const current=await cloudRequest(target,'GET');
      if(await digest(current)!==job.before_hash){await finish('conflict','reviewed');throw new ApiError(409,'Книгу изменили после подготовки. Ничего не записано. Подготовь запись заново');}
      if(job.before_hash===job.after_hash){await finish('written','written');return json(publicJob(job));}
      sent=true;
      // Mail ignores If-Match and LOCK. This is explicitly a closed-editor workflow.
      try{await cloudRequest(target,'PUT',outputBytes);}catch{/* Read back before deciding; never retry PUT automatically. */}
      const actual=await cloudRequest(target,'GET');
      if(await digest(actual)===job.after_hash||sameWorkbookContents(outputBytes,actual))await finish('written','written');else await finish('unknown','excel-unknown');
      return json(publicJob(job));
    }catch(e){
      if(!['conflict','written'].includes(job.state))await finish(sent?'unknown':'failed',sent?'excel-unknown':'reviewed');
      if(sent)return json(publicJob(job));throw e;
    }
  }catch(e){if(e instanceof CloudError)return json({error:e.message},502);return failure(e);}
}
