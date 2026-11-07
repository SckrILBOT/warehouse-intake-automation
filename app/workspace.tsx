'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { fields, pending, problems, realDate, type Draft, type Field, type Item } from '@/lib/review';
type Doc = { id:string;filename:string;status:string;draft:Draft|null;error:string|null;version:number;updatedAt:string };
const statuses:Record<string,string> = { uploaded:'Фото загружено',recognizing:'Распознаётся',review:'На проверке',reviewed:'Проверено тобой',error:'Нужна повторная попытка' };
async function api(path:string,options:RequestInit={}) {
  const res=await fetch(path,{...options,headers:options.body instanceof FormData?options.headers:{'Content-Type':'application/json',...options.headers}});
  const data:any=await res.json().catch(()=>({error:'Сервер не ответил. Проверь историю перед повтором.'}));
  if(!res.ok) throw new Error(data.error||'Не удалось выполнить действие'); return data;
}
const freshField=():Field=>({value:'',alternatives:[],reasons:['Добавлено вручную'],reviewed:false});
const changed=(field:Field,value:string):Field=>({...field,value,reviewed:true});
function FieldEditor({label,field,onChange,type='text',long=false}:{label:string;field:Field;onChange:(f:Field)=>void;type?:string;long?:boolean}) {
  const id=useId(), numeric=Number(field.value.replace(',','.'));
  const invalid=!field.value.trim()||(type==='decimal'&&(!Number.isFinite(numeric)||numeric<=0))||(type==='date'&&!realDate(field.value));
  const issue=pending(field)||invalid;
  return <div className={'field '+(issue?'field-issue':'')}>
    <div className="field-label"><label htmlFor={id}>{label}</label><span className={issue?'field-state warn':'field-state'}>{issue?'Проверь':field.reviewed?'Проверено тобой':'Совпало'}</span></div>
    {long?<textarea id={id} rows={3} aria-invalid={invalid} value={field.value} onChange={e=>onChange(changed(field,e.target.value))}/>:<input id={id} aria-invalid={invalid} type={type==='decimal'?'text':type} inputMode={type==='decimal'?'decimal':undefined} value={field.value} onChange={e=>onChange(changed(field,e.target.value))}/>}
    {invalid&&<p className="field-note">{!field.value.trim()?'Заполни поле':type==='decimal'?'Укажи число больше нуля':'Укажи полную корректную дату'}</p>}
    {pending(field)&&<p className="field-note">{field.reasons.includes('Результаты распознавания различаются')?'Варианты различаются':field.reasons.includes('Один из способов не прочитал поле')?'Есть пропуск в распознавании':'Нужна сверка с фото'}</p>}
    {field.alternatives.length>0&&<details className="alternatives"><summary>Сравнить варианты</summary>{field.reasons.length>0&&<p className="comparison-reason">{field.reasons.join('. ')}</p>}{field.alternatives.map((a,i)=><div className="alternative" key={i}><strong>{a.source}</strong><p>{a.value||'Не прочитано'}</p>{a.value&&<button className="text-button" onClick={()=>onChange(changed(field,a.value))}>Использовать этот вариант</button>}</div>)}</details>}
    {issue&&!invalid&&<button className="confirm-field" onClick={()=>onChange({...field,reviewed:true})}>Значение верное</button>}
  </div>;
}
export default function Workspace() {
  const [docs,setDocs]=useState<Doc[]>([]),[current,setCurrent]=useState<Doc|null>(null),[draft,setDraft]=useState<Draft|null>(null),[file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[history,setHistory]=useState(false),[onlyIssues,setOnlyIssues]=useState(false);
  const [error,setError]=useState(''),[saveLabel,setSaveLabel]=useState(''),[offline,setOffline]=useState(false),[install,setInstall]=useState<any>(null);
  const latest=useRef<{doc:Doc|null;draft:Draft|null;dirty:boolean}>({doc:null,draft:null,dirty:false});
  const saving=useRef<Promise<boolean>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const imageDialog=useRef<HTMLDialogElement|null>(null);
  async function refresh(){setDocs(await api('/api/documents'));}
  useEffect(()=>{
    refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));
    const documentId=new URLSearchParams(window.location.search).get('document');
    if(documentId)void openDocument(documentId);
    if('serviceWorker'in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const network=()=>setOffline(!navigator.onLine);network();
    const beforeInstall=(e:any)=>{e.preventDefault();setInstall(e);};
    const beforeUnload=(e:BeforeUnloadEvent)=>{if(latest.current.dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('online',network);window.addEventListener('offline',network);window.addEventListener('beforeinstallprompt',beforeInstall);window.addEventListener('beforeunload',beforeUnload);
    return()=>{window.removeEventListener('online',network);window.removeEventListener('offline',network);window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('beforeunload',beforeUnload);if(timer.current)clearTimeout(timer.current);};
  },[]);
  async function save(complete=false):Promise<boolean>{
    if(timer.current)clearTimeout(timer.current);
    if(saving.current){if(!await saving.current)return false;return save(complete);}
    const snapshot=latest.current;
    if(!snapshot.doc||!snapshot.draft||(!snapshot.dirty&&!complete))return true;
    if(complete&&problems(snapshot.draft).length){setError(problems(snapshot.draft).join('. '));return false;}
    setSaveLabel('Сохраняю…');
    const operation=(async()=>{
      try{
        const result=await api('/api/documents/'+snapshot.doc!.id,{method:'PATCH',body:JSON.stringify({version:snapshot.doc!.version,draft:snapshot.draft,complete})});
        const nextDoc={...snapshot.doc!,...result};
        if(latest.current.doc?.id===snapshot.doc!.id){const dirty=latest.current.draft!==snapshot.draft;latest.current={...latest.current,doc:nextDoc,dirty};setCurrent(nextDoc);setSaveLabel(dirty?'Есть несохранённые правки':'Правки сохранены');}
        setDocs(list=>list.map(d=>d.id===nextDoc.id?{...nextDoc,draft:snapshot.draft}:d));return true;
      }catch(e){setError((e as Error).message);setSaveLabel('Не сохранено — нажми «Сохранить»');return false;}
      finally{saving.current=null;}
    })();
    saving.current=operation;const ok=await operation;if(ok&&latest.current.dirty&&!complete)return save();return ok;
  }
  function change(next:Draft){latest.current={...latest.current,draft:next,dirty:true};setDraft(next);setSaveLabel('Есть несохранённые правки');setError('');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{void save();},1100);}
  async function openDocument(id:string){
    if(!await save())return;
    try{const doc=await api('/api/documents/'+id);latest.current={doc,draft:doc.draft,dirty:false};setCurrent(doc);setDraft(doc.draft);setFile(null);setError('');setHistory(false);setOnlyIssues(false);setSaveLabel(doc.draft?'Последняя сохранённая версия':'');window.history.replaceState(null,'','/?document='+encodeURIComponent(id));}catch(e){setError((e as Error).message);}
  }
  async function newDocument(){if(!await save())return;latest.current={doc:null,draft:null,dirty:false};setCurrent(null);setDraft(null);setFile(null);setError('');setSaveLabel('');setHistory(false);window.history.replaceState(null,'','/');}
  async function recognize(id:string,retry=false){setBusy(true);setError('');try{await api(`/api/documents/${id}/recognize`,{method:'POST',body:JSON.stringify({retry})});}catch(e){setError((e as Error).message);}finally{setBusy(false);await openDocument(id);await refresh().catch(()=>{});}}
  async function upload(){if(!file||busy)return;setBusy(true);setError('');try{const body=new FormData();body.set('image',file);const created=await api('/api/documents',{method:'POST',body});await openDocument(created.id);await refresh();await recognize(created.id);}catch(e){setError((e as Error).message);setBusy(false);}}
  function chooseFile(chosen?:File){if(!chosen)return;if(chosen.size>8*1024*1024){setError('Выбери фото до 8 МБ');return;}if(!['image/jpeg','image/png'].includes(chosen.type)){setError('Нужен JPG или PNG. HEIC пока нужно преобразовать в JPG.');return;}setFile(chosen);setError('');}
  function editItem(id:string,key:'name'|'quantity'|'unit',field:Field){if(draft)change({...draft,items:draft.items.map(x=>x.id===id?{...x,[key]:field}:x)});}
  function confirmItem(item:Item){if(!draft)return;if(!item.name.value.trim()||!(Number(item.quantity.value.replace(',','.'))>0)||!item.unit.value.trim()){setError('Заполни название, положительное количество и единицу в позиции '+item.number);return;}change({...draft,items:draft.items.map(x=>x.id===item.id?{...x,name:{...x.name,reviewed:true},quantity:{...x.quantity,reviewed:true},unit:{...x.unit,reviewed:true}}:x)});}
  const itemIssue=(item:Item)=>[item.name,item.quantity,item.unit].some(pending)||!item.name.value.trim()||!(Number(item.quantity.value.replace(',','.'))>0)||!Number.isFinite(Number(item.quantity.value.replace(',','.')))||!item.unit.value.trim();
  const unresolved=draft?fields(draft).filter(pending).length:0,issueRows=draft?.items.filter(itemIssue).length||0,shown=draft?.items.filter(x=>!onlyIssues||itemIssue(x))||[],errors=draft?problems(draft):[],imageUrl=current?`/api/documents/${current.id}/image`:'';
  return <div className="app-shell">
    <header className="app-header"><a href="/" className="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 9 16 3l12 6v15l-12 6-12-6Z M4 9l12 6 12-6 M16 15v15" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m9 20 4 4 9-10" fill="none" stroke="currentColor" strokeWidth="2"/></svg><span>Приёмка склада</span></a><div className="header-actions">{install&&<button onClick={async()=>{await install.prompt();setInstall(null);}}>Установить</button>}<button className="history-toggle" onClick={()=>setHistory(!history)}>История</button><button disabled={busy} onClick={()=>void newDocument()}>Новая приёмка</button><details className="account-menu"><summary>Меню</summary><div><button disabled={busy} onClick={async()=>{if(await save())window.location.assign('/settings');}}>Сменить пароль</button><button disabled={busy} onClick={async()=>{if(await save()){await api('/api/auth/logout',{method:'POST',body:'{}'});window.location.assign('/');}}}>Выйти</button></div></details></div></header>
    <aside className={'sidebar '+(history?'sidebar-open':'')}><h2>Документы</h2><p className="muted">Фото и сохранённые проверки</p>{loading?<p>Загружаю историю…</p>:!docs.length?<p className="empty-history">Здесь появятся загруженные накладные.</p>:<nav aria-label="История документов">{docs.map(doc=><button disabled={busy} key={doc.id} onClick={()=>void openDocument(doc.id)} className={'document-link '+(current?.id===doc.id?'selected':'')}><strong>{doc.draft?.number.value?'№ '+doc.draft.number.value:doc.filename}</strong><span>{statuses[doc.status]||doc.status}</span><small>{new Date(doc.updatedAt).toLocaleDateString('ru-RU')}</small></button>)}</nav>}<div className="sidebar-foot"><span className="connection-dot"/>Личная тестовая версия<p>Запись в Excel ещё не подключена.</p><details><summary>Установить на телефон</summary><p>Android: меню браузера → «Установить приложение». iPhone: Safari → «Поделиться» → «На экран Домой».</p></details></div></aside>
    <main className="work-sheet">
      {offline&&<p className="notice" role="status">Нет интернета. Оставь приложение открытым: несохранённые правки пока только на этом устройстве.</p>}
      {error&&<div className="error-message" role="alert"><strong>Не удалось завершить действие</strong><p>{error}</p><button onClick={()=>setError('')}>Закрыть сообщение</button></div>}
      {!current&&<section><div className="title-row"><div><h1>Новая приёмка</h1><p className="muted">Сфотографируй накладную. Сравним распознавание, затем проверишь товары.</p></div></div><div className="upload-layout"><div className="upload-panel"><svg className="document-drawing" viewBox="0 0 160 180" aria-hidden="true"><path d="M30 12h72l28 28v128H30Z M102 12v28h28 M46 64h67 M46 80h67 M46 105h30 M88 105h25 M46 125h30 M88 125h25 M46 145h30 M88 145h25" fill="none" stroke="currentColor" strokeWidth="2"/></svg><h2>Документ целиком</h2><p>В кадре нужны шапка, дата и все товарные строки. Выбери фотографию или сделай новую.</p><div className="upload-actions"><label className="button primary" htmlFor="camera-input">Снять фото</label><input className="visually-hidden" id="camera-input" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e=>chooseFile(e.target.files?.[0])}/><label className="button" htmlFor="file-input">Выбрать фото</label><input className="visually-hidden" id="file-input" type="file" accept="image/jpeg,image/png" onChange={e=>chooseFile(e.target.files?.[0])}/></div>{file&&<div className="selected-file"><strong>{file.name}</strong><span>{(file.size/1024/1024).toFixed(1)} МБ</span><button className="primary" onClick={()=>void upload()} disabled={busy||offline}>{busy?'Загружаю…':'Распознать фото'}</button></div>}<p className="caption">JPG или PNG, до 8 МБ. Запросы оплачиваются по тарифам Яндекса.</p></div><div className="workflow-note"><h2>Сначала проверка</h2><ol><li><strong>Несколько способов</strong><p>Чтение фотографии и OCR с разбором таблицы.</p></li><li><strong>Расхождения рядом</strong><p>Покажем, где отличаются название, количество или реквизиты.</p></li><li><strong>Твои исправления</strong><p>Любое поле можно изменить с телефона. Правки сохраняются в черновике.</p></li></ol><p className="scope-note">Сейчас тестируем распознавание и проверку. Облачная таблица остаётся без изменений.</p></div></div></section>}
      {current&&!draft&&<section className="processing"><h1>{busy||current.status==='recognizing'?'Читаем накладную':'Фотография загружена'}</h1><p>{current.filename}</p><div className="processing-layout"><img src={imageUrl} alt="Загруженная накладная"/><div>{busy||current.status==='recognizing'?<><div className="activity" aria-hidden="true"/><h2>Сравниваем способы распознавания</h2><p>Это может занять несколько минут. Пока оставь страницу открытой.</p><button disabled={busy} onClick={()=>void openDocument(current.id)}>Проверить статус</button><p className="caption">Проверка статуса не запускает платные запросы.</p>{!busy&&Date.now()-Date.parse(current.updatedAt)>600000&&<button onClick={()=>{if(confirm('Предыдущая попытка могла быть оплачена. Запустить новое распознавание?'))void recognize(current.id,true);}}>Повторить распознавание</button>}</>:<><h2>{current.status==='error'?'Распознавание не завершилось':'Готово к распознаванию'}</h2>{current.error&&<p>{current.error}</p>}<button className="primary" onClick={()=>{if(current.status!=='error'||confirm('Повторная попытка оплачивается отдельно. Продолжить?'))void recognize(current.id,current.status==='error');}}>Распознать</button></>}</div></div></section>}
      {current&&draft&&<>
        <div className="title-row"><div><h1>Проверка накладной</h1><p className="muted">{draft.items.length} позиций · {unresolved?'требуют внимания полей: '+unresolved:'Все спорные поля проверены'}</p></div><span className="save-status" aria-live="polite">{saveLabel}</span></div>
        {current.status==='reviewed'&&!latest.current.dirty&&<div className="notice success" role="status">Проверка сохранена. Документ ещё не записан в Excel.</div>}
        <div className="review-layout"><div className="editor"><section><h2>Реквизиты документа</h2><div className="header-fields"><FieldEditor label="Номер документа" field={draft.number} onChange={f=>change({...draft,number:f})}/><FieldEditor label="Дата документа" type="date" field={draft.date} onChange={f=>change({...draft,date:f})}/><FieldEditor label="Продавец" field={draft.seller} onChange={f=>change({...draft,seller:f})}/></div></section>
        {draft.notices.length>0&&<details className="document-notices"><summary>Замечания распознавания ({draft.notices.length})</summary><ul>{draft.notices.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}
        <section className="goods"><div className="goods-heading"><h2>Товары</h2><div className="filters"><button aria-pressed={!onlyIssues} onClick={()=>setOnlyIssues(false)}>Все {draft.items.length}</button><button aria-pressed={onlyIssues} onClick={()=>setOnlyIssues(true)}>Проверить {issueRows}</button></div></div>
        {!shown.length&&<p className="notice">Спорных позиций нет. Все товары доступны во вкладке «Все».</p>}
        {shown.map(item=><article className={'goods-item '+(itemIssue(item)?'needs-attention':'')} key={item.id}><div className="item-heading"><h3>Позиция {item.number}</h3><button className="text-button danger" onClick={()=>{if(confirm('Удалить эту позицию из черновика?'))change({...draft,items:draft.items.filter(x=>x.id!==item.id)});}}>Удалить</button></div><FieldEditor label="Наименование" field={item.name} long onChange={f=>editItem(item.id,'name',f)}/><div className="quantity-fields"><FieldEditor label="Количество" type="decimal" field={item.quantity} onChange={f=>editItem(item.id,'quantity',f)}/><FieldEditor label="Единица" field={item.unit} onChange={f=>editItem(item.id,'unit',f)}/></div><div className="item-footer"><span>{itemIssue(item)?'Сравни с фотографией':'Можно редактировать любое поле'}</span><button onClick={()=>confirmItem(item)}>Позиция проверена</button></div></article>)}
        <button className="add-item" onClick={()=>{setOnlyIssues(false);change({...draft,items:[...draft.items,{id:crypto.randomUUID(),number:String(draft.items.length+1),name:freshField(),quantity:freshField(),unit:freshField()}]});}}>Добавить товар вручную</button></section></div>
        <aside className="source-panel"><div className="desktop-photo"><h2>Фотография документа</h2><button className="photo-preview" onClick={()=>imageDialog.current?.showModal()}><img src={imageUrl} alt="Оригинал накладной — нажми для увеличения"/></button><button className="text-button" onClick={()=>imageDialog.current?.showModal()}>Увеличить фото</button></div><details open className="mobile-photo"><summary>Фотография документа</summary><button className="photo-preview" onClick={()=>imageDialog.current?.showModal()}><img src={imageUrl} alt="Оригинал накладной — нажми для увеличения"/></button><button className="text-button" onClick={()=>imageDialog.current?.showModal()}>Увеличить фото</button></details><p>Совпадение способов не гарантирует правильность. Сверяй цифры и артикулы с фото.</p></aside></div>
        <footer className="review-footer"><div><strong>{unresolved?'Осталось спорных полей: '+unresolved:'Можно завершить проверку'}</strong><p>{errors.length?errors[0]:'Данные сохранятся в проверенном черновике.'}</p></div><div className="footer-buttons"><button className="photo-short" onClick={()=>imageDialog.current?.showModal()}>Фото</button><button onClick={()=>void save()} disabled={offline}>Сохранить</button><button className="primary" onClick={()=>void save(true)} disabled={offline||errors.length>0}>Завершить проверку</button></div></footer>
      </>}
    </main>
    {current&&<dialog ref={imageDialog} className="photo-dialog" aria-labelledby="photo-title"><div className="photo-dialog-header"><h2 id="photo-title">Исходная фотография</h2><button onClick={()=>imageDialog.current?.close()}>Закрыть</button></div><div className="photo-zoom"><img src={imageUrl} alt="Полная фотография накладной"/></div><a href={imageUrl} target="_blank" rel="noreferrer">Открыть оригинал в отдельном окне</a></dialog>}
  </div>;
}
