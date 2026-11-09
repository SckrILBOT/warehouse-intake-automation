'use client';
import {useState} from 'react';
import type {Draft} from '@/lib/review';
export type HistoryDoc={id:string;filename:string;status:string;draft:Draft|null;version:number;updatedAt:string;deletedAt?:string|null};
const statuses:Record<string,string>={uploaded:'Фото загружено',recognizing:'Распознаётся',review:'На проверке',reviewed:'Проверено тобой',exporting:'Записывается в Excel','excel-unknown':'Проверь результат Excel',written:'Запись в Excel подтверждена',error:'Нужна повторная попытка'};
export default function DocumentHistory({docs,trash,currentId,open,loading,busy,destination,onOpen,onDelete,onRestore}:{docs:HistoryDoc[];trash:HistoryDoc[];currentId?:string;open:boolean;loading:boolean;busy:boolean;destination:{profile:string;path:string}|null;onOpen:(id:string)=>void;onDelete:(doc:HistoryDoc)=>void;onRestore:(doc:HistoryDoc)=>void}){
 const [showTrash,setShowTrash]=useState(false),list=showTrash?trash:docs;
 return <aside className={'sidebar '+(open?'sidebar-open':'')}>
  <div className="history-heading"><h2>{showTrash?'Корзина':'Документы'}</h2><button className="history-view" onClick={()=>setShowTrash(!showTrash)}>{showTrash?'К документам':`Корзина${trash.length?' ('+trash.length+')':''}`}</button></div>
  <p className="muted">{showTrash?'Документы можно восстановить. Строки Excel не меняются.':'Фото и сохранённые проверки'}</p>
  {loading?<p>Загружаю историю…</p>:!list.length?<p className="empty-history">{showTrash?'Корзина пуста.':'Здесь появятся загруженные накладные.'}</p>:<nav aria-label={showTrash?'Корзина документов':'История документов'}>{list.map(doc=>{
   const label=doc.draft?.number.value?'№ '+doc.draft.number.value:doc.filename;
   const content=<><strong>{label}</strong><span>{showTrash?'Удалён из истории':statuses[doc.status]||doc.status}</span><small>{new Date(showTrash?doc.deletedAt||doc.updatedAt:doc.updatedAt).toLocaleDateString('ru-RU')}</small></>;
   return <div className="document-entry" key={doc.id}>{showTrash?<div className="document-link">{content}</div>:<button disabled={busy} onClick={()=>onOpen(doc.id)} className={'document-link '+(currentId===doc.id?'selected':'')}>{content}</button>}
    <button className={'document-action '+(showTrash?'':'danger')} disabled={busy} onClick={()=>showTrash?onRestore(doc):onDelete(doc)} title={showTrash?'Восстановить':'Удалить'} aria-label={(showTrash?'Восстановить ':'Удалить ')+label}>
     {showTrash?<span aria-hidden="true">↶</span>:<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>}
    </button>
   </div>;
  })}</nav>}
  <div className="sidebar-foot"><span className="connection-dot"/>Приёмка склада<p>{destination?.profile==='work'?'Подключена рабочая книга':'Подключена личная тестовая книга'}<br/>{destination?.path}</p><details><summary>Установить на телефон</summary><p>Android: меню браузера → «Установить приложение». iPhone: Safari → «Поделиться» → «На экран Домой».</p></details></div>
 </aside>;
}
