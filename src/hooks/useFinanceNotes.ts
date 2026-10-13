/* carpan-localized */
import { t } from '../i18n/index';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import type {FinanceDecision} from '../arc-finance';
import {FinanceSaveQueue} from '../finance-save-queue';

export function useFinanceNotes(ownerId:string|null){
  const signedIn=Boolean(ownerId);
  const [,redraw]=useState(0),values=useRef<Record<string,Record<string,FinanceDecision>>>({});
  const [readError,setReadError]=useState('');
  const ready=useRef(new Set<string>()),timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const queue=useRef<FinanceSaveQueue>();
  // Keep the original owner with delayed and unmount saves. Another tab can
  // replace the shared session cookie before React observes the account change.
  if(!queue.current)queue.current=new FinanceSaveQueue((wallet,id,decision)=>{
    if(!ownerId)return Promise.reject(new Error(t("Notları kaydetmek için giriş yap.")));
    return api.saveFinanceDecision(wallet,id,decision,ownerId);
  },()=>redraw(n=>n+1));
  const edits=queue.current;
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(edits.pending.size){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return()=>{window.removeEventListener('beforeunload',warn);for(const timer of timers.current.values())clearTimeout(timer);for(const key of edits.pending.keys())void edits.flush(key);};
  },[edits]);
  async function read(wallet:string,ids:string[]){
    if(!signedIn)return;
    setReadError('');
    try{
      let saved:Record<string,FinanceDecision>={};
      for(let i=0;i<ids.length;i+=200){const result=await api.financeDecisions(wallet,ids.slice(i,i+200));saved={...saved,...result.decisions};}
      values.current[wallet]=edits.overlay(wallet,{...values.current[wallet],...saved});
      for(const id of ids)ready.current.add(`${wallet}/${id}`);
      redraw(n=>n+1);
    }catch(e){setReadError(e instanceof Error?e.message:t("Kaydedilmiş notlar alınamadı."));}
  }
  function change(wallet:string,id:string,patch:Partial<FinanceDecision>){
    if(!signedIn||!ready.current.has(`${wallet}/${id}`))return;
    const decision={...(values.current[wallet]?.[id]||{category:'review' as const,reference:''}),...patch};
    values.current[wallet]={...values.current[wallet],[id]:decision};
    const key=edits.set(wallet,id,decision);clearTimeout(timers.current.get(key));
    timers.current.set(key,setTimeout(()=>{timers.current.delete(key);void edits.flush(key);},550));
  }
  function retry(){for(const key of edits.pending.keys()){clearTimeout(timers.current.get(key));timers.current.delete(key);void edits.flush(key);}}
  return {read,change,retry,readError,decisions:(wallet:string)=>values.current[wallet]||{},
    canEdit:(wallet:string,id:string)=>signedIn&&ready.current.has(`${wallet}/${id}`),
    pending:edits.pending.size,saveError:[...edits.errors.values()][0]||''};
}
