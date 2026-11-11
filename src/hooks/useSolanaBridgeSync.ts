import {useCallback,useEffect,useRef,useState,type MutableRefObject} from 'react';
import {api} from '../api';
import {useAuth} from './useAuth';
import {decodeSolanaBridgeRecords,encodeSolanaBridgeRecords,type SolanaBridgeEnvironment,type SolanaBridgeRecord,type solanaBridgeDefinitions} from '../solana-bridge';

/** Newest snapshot per id wins; a delivered record is never replaced by an unfinished copy. */
export function mergeSolanaRecords(local:SolanaBridgeRecord[],remote:SolanaBridgeRecord[]){
 const merged=new Map(local.map(r=>[r.id,r]));
 for(const r of remote){const current=merged.get(r.id);if(!current||(Date.parse(r.updatedAt)>Date.parse(current.updatedAt)&&!(current.status==='delivered'&&r.status!=='delivered')))merged.set(r.id,r);}
 return [...merged.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,100);
}

/**
 * Mirrors Solana ↔ Arc recovery records to the Carpan account of the verified Arc wallet,
 * so an unfinished transfer survives a cleared browser or a new device. Local storage stays
 * the first copy; a failed upload never blocks or alters the local record.
 */
export function useSolanaBridgeSync(environment:SolanaBridgeEnvironment,evmWallet:string|undefined,definitions:ReturnType<typeof solanaBridgeDefinitions>,recordsRef:MutableRefObject<SolanaBridgeRecord[]>,replace:(next:SolanaBridgeRecord[])=>void){
 const {user}=useAuth();
 const eligible=!!evmWallet&&!!user?.walletVerifiedAt&&user.walletAddress?.toLowerCase()===evmWallet.toLowerCase();
 const [loaded,setLoaded]=useState(!eligible),[syncError,setSyncError]=useState(''),[revision,setRevision]=useState(0);
 const queue=useRef<Promise<unknown>>(Promise.resolve()),replaceRef=useRef(replace);replaceRef.current=replace;
 const persist=useCallback((record:SolanaBridgeRecord)=>{
  if(!eligible||record.evmWallet.toLowerCase()!==evmWallet!.toLowerCase())return Promise.resolve();
  const task=queue.current.catch(()=>{}).then(()=>api.saveSolanaBridgeHistory(environment,record.evmWallet,encodeSolanaBridgeRecords([record])));
  queue.current=task;
  return task.then(()=>setSyncError(''),e=>{setSyncError('Hesap geçmişi eşitlenemedi. Yerel kaydın korunuyor; kurtarma dosyasını indir.');throw e;});
 },[eligible,environment,evmWallet,user?.id]);
 useEffect(()=>{
  let stopped=false;setLoaded(!eligible);setSyncError('');
  if(!eligible)return()=>{stopped=true;};
  api.solanaBridgeHistory(environment,evmWallet!).then(async response=>{
   if(stopped)return;
   const remote=response.snapshots.flatMap(s=>{try{return decodeSolanaBridgeRecords(s,definitions,environment);}catch{return [];}});
   replaceRef.current(mergeSolanaRecords(recordsRef.current,remote));
   setLoaded(true);
   // Upload browser-only records that belong to this verified wallet.
   for(const r of recordsRef.current.filter(r=>r.evmWallet.toLowerCase()===evmWallet!.toLowerCase())){if(stopped)break;await persist(r).catch(()=>{});}
  // Like EVM history, a new burn stays blocked until the account copy is read: it may hold an unfinished transfer.
  }).catch(()=>{if(!stopped)setSyncError('Hesap geçmişi alınamadı. Yeni gönderim başlatılmadı; yeniden eşitle.');});
  return()=>{stopped=true;};
 },[eligible,environment,evmWallet,definitions,persist,revision,recordsRef]);
 return {eligible,loaded,syncError,persist,reload:()=>setRevision(n=>n+1)};
}
