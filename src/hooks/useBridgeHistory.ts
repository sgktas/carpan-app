import {useCallback,useEffect,useRef,useState} from 'react';
import type {EVMChainDefinition} from '@circle-fin/app-kit';
import {api} from '../api';
import {useAuth} from './useAuth';
import {decodeRecords,encodeRecords,type BridgeRecord,type BridgeEnvironment} from '../arc-bridge';
import {t} from '../i18n';

export function useBridgeHistory(storage:string,chains:EVMChainDefinition[],environment:BridgeEnvironment,address?:string){
 const {user}=useAuth();
 const [records,setRecords]=useState<BridgeRecord[]>(()=>{try{return decodeRecords(localStorage.getItem(storage),chains,environment);}catch{return [];}}),recordsRef=useRef(records);
 const eligible=!!address&&!!user?.walletVerifiedAt&&user.walletAddress?.toLowerCase()===address.toLowerCase();
 const [syncError,setSyncError]=useState(''),[loading,setLoading]=useState(false),[loaded,setLoaded]=useState(!eligible),[revision,setRevision]=useState(0);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 function store(next:BridgeRecord[]){localStorage.setItem(storage,encodeRecords(next));recordsRef.current=next;setRecords(next);}
 const persist=useCallback((record:BridgeRecord)=>{
  if(!eligible)return Promise.resolve();
  const task=queue.current.catch(()=>{}).then(()=>api.saveBridgeHistory(environment,record.wallet,encodeRecords([record])));
  queue.current=task;
  return task.then(()=>{setSyncError('');},()=>{setSyncError(t('Hesap geçmişi eşitlenemedi. Yerel kaydın korunuyor; yeniden göndermeden önce bağlantıyı kontrol et.'));throw new Error(t('Köprü kaydı hesapta saklanamadı. Yeniden eşitle.'));});
 },[eligible,environment,user?.id]);
 function save(record:BridgeRecord){store([record,...recordsRef.current.filter(r=>r.id!==record.id)].slice(0,500));void persist(record).catch(()=>{});}
 useEffect(()=>{
  let stopped=false;
  setLoaded(!eligible);setSyncError('');setLoading(eligible);
  if(!eligible)return()=>{stopped=true;};
  api.bridgeHistory(environment,address!).then(async response=>{
   if(stopped)return;
   const remote=response.snapshots.flatMap(snapshot=>decodeRecords(snapshot,chains,environment));
   const merged=new Map(recordsRef.current.map(r=>[r.id,r]));
   for(const r of remote){const local=merged.get(r.id);if(!local||Date.parse(r.updatedAt)>Date.parse(local.updatedAt))merged.set(r.id,r);}
   store([...merged.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,500));
   setLoaded(true);setLoading(false);
   // Import existing browser history only into its verified wallet's account.
   for(const r of recordsRef.current.filter(r=>r.wallet.toLowerCase()===address!.toLowerCase())){if(stopped)break;await persist(r);}
  }).catch(()=>{if(stopped)return;setLoading(false);setSyncError(t('Hesap geçmişi alınamadı. Yeniden eşitle; yeni gönderim başlatılmadı.'));});
  return()=>{stopped=true;};
 },[eligible,user?.id,address,environment,chains,revision,persist]);
 return {records,save,persist,eligible,loading,loaded,syncError,reload:()=>setRevision(n=>n+1)};
}
