'use client';
import {useEffect,useState} from 'react';
import type {Progress,Stage} from '@/lib/recognition-pipeline';
export type RecognitionProgress=Partial<Record<Stage,Progress>>&{attempt?:number};
export default function RecognitionStatus({status,updatedAt,error,progress,onCheck,onPartial,onStop,onRetry}:{status:string;updatedAt:string;error:string|null;progress?:RecognitionProgress|null;onCheck:()=>Promise<void>;onPartial:()=>Promise<void>;onStop:()=>Promise<void>;onRetry:()=>void}){
 const [now,setNow]=useState(Date.now()),[checking,setChecking]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const names:Record<Stage,string>={direct:'Чтение фото · DeepSeek',table:'OCR · таблица',page:'OCR · страница',structured:'Разбор ячеек OCR'};
 const stages=Object.keys(names) as Stage[],started=Math.min(...stages.map(s=>Date.parse(progress?.[s]?.startedAt||updatedAt))),seconds=Math.max(0,Math.floor((now-started)/1000));
 const available=stages.some(s=>progress?.[s]?.state==='done'&&(progress[s]?.items||0)>0),running=status==='recognizing';
 async function action(work:()=>Promise<void>){setChecking(true);try{await work();}finally{setChecking(false);}}
 return <div><h2>{running?'Распознаём документ':status==='error'?'Распознавание не завершилось':'Готово к распознаванию'}</h2>
  {running&&<p role="status">Прошло {Math.floor(seconds/60)} мин {seconds%60} с. Статус обновляется автоматически. Платное распознавание не перезапускается.</p>}
  {progress&&<ul className="recognition-stages">{stages.map(stage=><li key={stage}><strong>{names[stage]}</strong><span>{progress[stage]?.state==='done'?'Готово':progress[stage]?.state==='failed'?'Нет ответа':progress[stage]?.state==='running'?'Выполняется':'Ожидает'}</span>{progress[stage]?.error&&<small>{progress[stage]?.error}</small>}</li>)}</ul>}
  {error&&<p role="alert">{error}</p>}
  {available&&<><p>Уже есть прочитанные строки. Можно открыть их сейчас и сверить с фото, не ожидая остальные способы.</p><button className="primary" disabled={checking} onClick={()=>void action(onPartial)}>Открыть готовый результат</button></>}
  {running?<><button disabled={checking} onClick={()=>void action(onCheck)}>Проверить статус</button><button disabled={checking} onClick={()=>void action(onStop)}>Остановить ожидание</button><p className="caption">Фото и готовые этапы сохраняются. Уже отправленные запросы могут быть оплачены. Фоновое завершение после закрытия страницы не гарантируется.</p></>:<button disabled={checking} onClick={onRetry}>{status==='error'?'Повторить распознавание':'Распознать'}</button>}
 </div>;
}
