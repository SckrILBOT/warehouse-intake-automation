'use client';
import {useEffect,useState} from 'react';
import type {WorkbookPlan} from '@/lib/workbook';
type Job={id:string;state:string;documentVersion:number;target:{account:string;path:string};plan:WorkbookPlan;createdAt:string};
type Target={configured:boolean;profile?:'test'|'work';account?:string;path?:string;pending?:{id:string;document_id:string;state:string};error?:string};
async function request<T=Job>(path:string,body?:unknown){const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error||'Не удалось связаться с облаком');return data;}
export default function ExcelPanel({id,status,version,onUpdate,onBusy}:{id:string;status:string;version:number;onUpdate:()=>Promise<void>;onBusy:(busy:boolean)=>void}){
  const [target,setTarget]=useState<Target|null>(null),[job,setJob]=useState<Job|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[closed,setClosed]=useState(false);
  const [connectionCheck,setConnectionCheck]=useState('');
  const base='/api/documents/'+id+'/excel';
  useEffect(()=>{let active=true;setJob(null);setClosed(false);setError('');Promise.all([request<Target>('/api/cloud'),request(base)]).then(([t,j])=>{if(active){setTarget(t);setJob(j);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,status,version,base]);
  async function act(action:string){setBusy(true);onBusy(true);setError('');try{const next=await request(base,{action,jobId:job?.id,editorClosed:closed});setJob(next);setClosed(false);await onUpdate();}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}}
  const sameTarget=!!job&&job.target.account===target?.account&&job.target.path===target?.path;
  const uncertain=job&&['writing','unknown'].includes(job.state)&&sameTarget,written=job?.state==='written',prepared=job?.state==='prepared'&&job.documentVersion===version&&sameTarget;
  return <section className="excel-panel" aria-labelledby="excel-title" aria-busy={busy}>
    <h2 id="excel-title">{target?.profile==='work'?'Запись в рабочий Excel':'Запись в Excel'}</h2>
    {!target?<p>Проверяю подключение…</p>:!target.configured?<p>{target.error}</p>:<>
      <p><strong>{target.path}</strong><br/><span className="caption">{target.profile==='work'?'Рабочий аккаунт':'Личный тестовый аккаунт'}: {target.account}</span></p>
      {target.profile==='work'&&<p className="notice">Выбрана основная рабочая книга. Учебные накладные в неё записывать не нужно.</p>}
      <button disabled={busy} onClick={async()=>{setBusy(true);onBusy(true);setError('');setConnectionCheck('');try{await request('/api/cloud',{});setConnectionCheck('Книга доступна. Проверено только чтение, файл не изменён.');}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}}}>Проверить подключение</button>
      {connectionCheck&&<p role="status">{connectionCheck}</p>}
      <p className="notice">На время записи закрой книгу в редакторе Mail и Excel на всех устройствах. Mail не защищает от одновременных изменений. Сохраним резервную копию и проверим записанный файл.</p>
      {target.pending&&target.pending.document_id!==id&&<p role="status">Есть незавершённая запись в эту книгу. <a href={'/?document='+encodeURIComponent(target.pending.document_id)}>Открыть её документ</a></p>}
      {status!=='reviewed'&&!written&&!uncertain&&<p>Сначала заверши проверку документа кнопкой внизу.</p>}
      {job&&<>
        {!sameTarget&&<p className="notice">Эта операция относится к другой книге: {job.target.path}, аккаунт {job.target.account}. Её результат не означает запись в текущую рабочую книгу. Для нового прихода создай новую приёмку.</p>}
        {job.state==='prepared'&&!prepared&&sameTarget&&<p>Документ изменился после подготовки. Нажми «Подготовить запись» для пересчёта строк.</p>}
        {written?<p className="notice success" role="status">Проверено в облаке: добавлено строк — {job.plan.added}, точных совпадений пропущено — {job.plan.skipped}. {job.plan.added===0?'Книга не изменялась.':'Результат записи подтверждён чтением файла.'}</p>:uncertain?<div className="notice" role="status"><strong>Результат записи пока не подтверждён</strong><p>Не записывай документ повторно. Нажми «Проверить результат». Если файл не совпадёт с подготовленным, запись останется заблокирована до ручной проверки и восстановления.</p><button disabled={busy} onClick={()=>void act('reconcile')}>Проверить результат</button></div>:job.state==='conflict'?<p role="status">Книгу изменили после подготовки. Запись остановлена. Подготовь её заново.</p>:job.state==='failed'?<p role="status">Запись не начиналась. Подготовь её заново.</p>:null}
        {prepared&&<>
          <p><strong>Будет добавлено: {job.plan.added}.</strong> Найдено точных совпадений: {job.plan.skipped}.</p>
          {job.plan.warnings.map((w,i)=><p className="notice" key={i}>{w}</p>)}
          {job.plan.rows.length>0&&<div className="excel-preview"><table><caption>Новые строки · {job.plan.sheet}, {job.plan.firstRow}–{job.plan.lastRow}</caption><thead><tr><th scope="col">Наименование</th><th scope="col">Количество</th><th scope="col">Документ</th><th scope="col">Продавец</th><th scope="col">Дата</th></tr></thead><tbody>{job.plan.rows.map((row,i)=><tr key={i}>{row.slice(0,5).map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
          <label className="editor-closed"><input type="checkbox" checked={closed} disabled={busy} onChange={e=>setClosed(e.target.checked)}/>Я закрыл книгу на всех устройствах и проверил новые строки и пропущенные совпадения</label>
          <button className="primary" disabled={busy||!closed||status!=='reviewed'} onClick={()=>void act('write')}>{busy?'Проверяю и записываю…':job.plan.added?(target.profile==='work'?'Записать в рабочий Excel':'Записать в тестовый Excel'):'Подтвердить отсутствие новых строк'}</button>
          <p className="caption">Подготовка действует 10 минут. Во время записи оставь страницу открытой.</p>
        </>}
        <p><a href={base+'/backup?job='+encodeURIComponent(job.id)}>Скачать книгу до этой операции</a></p>
      </>}
      {status==='reviewed'&&!uncertain&&!written&&<button disabled={busy||!!target.pending} onClick={()=>void act('prepare')}>{busy?'Готовлю книгу…':prepared?'Обновить подготовку':'Подготовить запись'}</button>}
    </>}
    {error&&<p role="alert" className="error-message">{error}</p>}
  </section>;
}
