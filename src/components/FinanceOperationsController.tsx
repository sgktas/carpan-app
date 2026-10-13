import {usePageLoading} from '../hooks/usePageLoading';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n/index';
import {FinanceOperations,type FinanceOperationsState,type FinanceOperationsActions} from './FinanceOperations';
import type {FinanceOrganizationView,FinanceBusinessWalletView,FinanceCounterpartyView,FinanceOperationSnapshot,FinanceHistoryReport} from '../finance-operations-contract';
import {localizedFinanceError} from '../finance-operation-errors';

const empty:FinanceOperationSnapshot={scan:null,decisions:{},exportBatches:[],loadedRanges:[]};
export function FinanceOperationsController(){
  const {user}=useAuth(),{language}=useI18n(),owner=user!.id;
  const [orgs,setOrgs]=useState<FinanceOrganizationView[]>([]),[org,setOrg]=useState<string|null>(null);
  const [wallets,setWallets]=useState<FinanceBusinessWalletView[]>([]),[wallet,setWallet]=useState<string|null>(null);
  const [parties,setParties]=useState<FinanceCounterpartyView[]>([]),[snapshot,setSnapshot]=useState(empty);
  const [history,setHistory]=useState<FinanceHistoryReport|null>(null),[historyLoading,setHistoryLoading]=useState(false);
  const [initialLoading,setInitialLoading]=useState(true),[orgLoading,setOrgLoading]=useState(false),[walletLoading,setWalletLoading]=useState(false),[actionLoading,setActionLoading]=useState(false),[error,setError]=useState(''),[balance,setBalance]=useState<string|null>(null);
  const active=useRef(''),orgSequence=useRef(0),walletSequence=useRef(0),mounted=useRef(true),actionSequence=useRef(0),historyAttempts=useRef(new Set<string>()),historyCursor=useRef<string|null>(null);active.current=`${owner}:${org}:${wallet}`;
  const tr=language==='tr';
  usePageLoading(initialLoading||orgLoading||(walletLoading&&!snapshot.scan));
  useEffect(()=>{let current=true;mounted.current=true;setInitialLoading(true);setOrgs([]);setOrg(null);api.financeOperations.organizations().then(rows=>{if(current&&mounted.current){setOrgs(rows);setOrg(rows[0]?.id||null);}}).catch(e=>{if(current&&mounted.current)setError(e.message);}).finally(()=>{if(current&&mounted.current)setInitialLoading(false);});return()=>{current=false;mounted.current=false;};},[owner]);
  useEffect(()=>{
    const current=++orgSequence.current;walletSequence.current++;setWallets([]);setParties([]);setWallet(null);setSnapshot(empty);setBalance(null);
    if(!org){setOrgLoading(false);return;}
    setOrgLoading(true);setError('');
    Promise.all([api.financeOperations.wallets(org),api.financeOperations.counterparties(org)]).then(([ws,ps])=>{
      if(current!==orgSequence.current||!mounted.current)return;setWallets(ws);setParties(ps);setWallet(ws[0]?.id||null);
    }).catch(e=>{if(current===orgSequence.current&&mounted.current)setError(e.message);}).finally(()=>{if(current===orgSequence.current&&mounted.current)setOrgLoading(false);});
  },[org,owner]);
  useEffect(()=>{
    const current=++walletSequence.current;setSnapshot(empty);setBalance(null);setHistory(null);setHistoryLoading(false);historyCursor.current=null;
    if(!org||!wallet||!wallets.some(w=>w.id===wallet)){setWalletLoading(false);return;}
    const scope=`${owner}:${org}:${wallet}`;
    setWalletLoading(true);setError('');
    api.financeOperations.state(org,wallet).then(async s=>{
      if(current!==walletSequence.current||scope!==active.current||!mounted.current)return;
      setSnapshot(s);
      // One discovery attempt per selected wallet in this mounted console. Empty/error
      // responses never cause polling, and receipt imports already stored skip first use.
      if(orgs.find(o=>o.id===org)?.role==='viewer'||s.loadedRanges.some(r=>r.scope==='receipt_import')||historyAttempts.current.has(scope))return;
      historyAttempts.current.add(scope);setHistoryLoading(true);
      const result=await api.financeOperations.history(org,wallet,owner);
      if(current===walletSequence.current&&scope===active.current&&mounted.current){setSnapshot(result.state);setHistory(result.history);historyCursor.current=result.nextCursor;}
    }).catch(e=>{if(current===walletSequence.current&&scope===active.current&&mounted.current)setError(e.message);}).finally(()=>{if(current===walletSequence.current&&scope===active.current&&mounted.current){setWalletLoading(false);setHistoryLoading(false);}});
    const address=wallets.find(w=>w.id===wallet)!.address;
    api.arcWalletOverview(address).then(result=>{if(current===walletSequence.current&&mounted.current)setBalance(result.balance?.raw||null);}).catch(()=>{});
  },[org,wallet,owner]);
  // All actions retain their original authenticated owner and workspace while awaiting IO.
  const run=async(action:()=>Promise<void>)=>{
    const scope=active.current,actionId=++actionSequence.current;setActionLoading(true);setError('');
    try{await action();}catch(e){if(active.current===scope&&mounted.current)setError(e instanceof Error?e.message:'Finance request failed.');throw e;}
    finally{if(actionId===actionSequence.current&&mounted.current)setActionLoading(false);}
  };
  const reload=async(scope:string)=>{if(scope!==active.current||!mounted.current)return;const s=await api.financeOperations.state(org!,wallet!);if(scope===active.current&&mounted.current)setSnapshot(s);};
  const actions:FinanceOperationsActions={
    selectWorkspace:setOrg,selectWallet:setWallet,
    createWorkspace: name=>run(async()=>{const scope=active.current,record=await api.financeOperations.createOrganization(name,owner),rows=await api.financeOperations.organizations();if(scope===active.current&&mounted.current){setOrgs(rows);setOrg(record.id);}}),
    addWallet:(label,address)=>run(async()=>{const scope=active.current,w=await api.financeOperations.addWallet(org!,label,address,owner),rows=await api.financeOperations.wallets(org!);if(scope===active.current&&mounted.current){setWallets(rows);setWallet(w.id);}}),
    refresh:()=>run(async()=>{const scope=active.current,s=await api.financeOperations.refresh(org!,wallet!,owner);if(scope!==active.current||!mounted.current)return;setSnapshot(s);const address=wallets.find(w=>w.id===wallet)?.address;if(address){try{const result=await api.arcWalletOverview(address);if(scope===active.current&&mounted.current)setBalance(result.balance?.raw||null);}catch{if(scope===active.current&&mounted.current)setBalance(null);}}}),
    loadHistory:()=>run(async()=>{const scope=active.current;historyAttempts.current.add(scope);setHistoryLoading(true);try{const result=await api.financeOperations.history(org!,wallet!,owner,historyCursor.current||undefined);if(scope===active.current&&mounted.current){setSnapshot(result.state);setHistory(result.history);historyCursor.current=result.nextCursor;}}catch(e){if(scope===active.current&&mounted.current&&e instanceof Error&&['Finance history pagination expired. Load history again.',localizedFinanceError('Finance history pagination expired. Load history again.','tr')].includes(e.message)){historyCursor.current=null;setHistory(previous=>previous?{...previous,hasMore:false,remainingCandidates:0}:null);}throw e;}finally{if(scope===active.current&&mounted.current)setHistoryLoading(false);}}),
    loadOlder:()=>run(async()=>{const scope=active.current,s=await api.financeOperations.refresh(org!,wallet!,owner,true);if(scope===active.current&&mounted.current)setSnapshot(s);}),
    importTransaction:hash=>run(async()=>{const scope=active.current,s=await api.financeOperations.import(org!,wallet!,hash,owner);if(scope===active.current&&mounted.current)setSnapshot(s);}),
    saveCounterparty:value=>run(async()=>{
      const scope=active.current,existing=parties.find(p=>p.addresses.some(a=>a.address===value.address.toLowerCase()));
      await api.financeOperations.saveCounterparty(org!,{name:value.name,code:value.accountCode,kind:existing?.kind||'other',addresses:existing?.addresses||[{chainId:5042,address:value.address,label:''}]},owner,existing?.id);
      const rows=await api.financeOperations.counterparties(org!);if(scope===active.current&&mounted.current)setParties(rows);
    }),
    updateMovement:(id,value)=>run(async()=>{
      const scope=active.current,row=snapshot.scan?.movements.find(m=>m.id===id);if(!row)throw Error('Movement is no longer loaded.');
      const peer=row.to===row.wallet?row.from:row.to,party=parties.find(p=>p.addresses.some(a=>a.address===peer));
      const prior=snapshot.decisions[id];
      await api.financeOperations.decision(org!,wallet!,id,{category:value.category,reference:value.reference,counterpartyId:prior?.counterpartyId||party?.id||null,status:value.status||'review',expectedVersion:value.expectedVersion??prior?.version??0},owner);await reload(scope);
    }),
    bulkUpdate:(ids,status)=>run(async()=>{const scope=active.current;await api.financeOperations.bulk(org!,wallet!,ids.map(id=>({id,expectedVersion:snapshot.decisions[id]?.version||0})),status,owner);await reload(scope);}),
    exportApproved:ids=>run(async()=>{
      const scope=active.current,result=await api.financeOperations.export(org!,wallet!,ids,crypto.randomUUID(),Object.fromEntries(ids.map(id=>[id,snapshot.decisions[id]?.version||0])),owner);if(scope!==active.current||!mounted.current)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify(result.payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`carpan-finance-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);await reload(scope);
    }),
  };
  const scan=snapshot.scan,feeByHash=new Map(scan?.fees.map(f=>[f.hash,f])||[]);
  const state:FinanceOperationsState={loading:initialLoading||orgLoading||walletLoading||actionLoading,history,historyLoading,error:localizedFinanceError(error,language),readOnly:orgs.find(o=>o.id===org)?.role==='viewer',canManageWallets:!org||['owner','admin'].includes(orgs.find(o=>o.id===org)?.role||''),workspaces:orgs,selectedWorkspaceId:org,wallets,selectedWalletId:wallet,
    counterparties:parties.flatMap(p=>p.addresses.map(a=>({address:a.address,name:p.name,accountCode:p.code}))),balanceRaw:balance,balanceDecimals:6,
    movements:(scan?.movements||[]).map(m=>{
      const decision=snapshot.decisions[m.id],peer=m.to===m.wallet?m.from:m.to,party=decision?.counterpartyId?parties.find(p=>p.id===decision.counterpartyId):decision?.status==='approved'?undefined:parties.find(p=>p.addresses.some(a=>a.address===peer)),fee=feeByHash.get(m.hash);
      return {id:m.id,hash:m.hash,from:m.from,to:m.to,raw:m.raw18,decimals:18,timestamp:m.timestamp,direction:m.direction,version:decision?.version||0,canBulkApprove:!!decision&&(!!decision.counterpartyId||!!decision.reference.trim()),chainStatus:'confirmed',status:decision?.status||'new',category:decision?.category||'review',reference:decision?.reference||'',counterparty:party?{id:party.id,address:peer,name:party.name,accountCode:party.code}:null,gasRaw:fee?.raw18,gasDecimals:18,gasPayer:fee?.gasPayer,block:m.block,evidenceUrl:`https://explorer.arc.io/tx/${m.hash}`,source:m.interface,systemLogIndex:m.logIndex,aliases:m.aliases.map(a=>({logIndex:a.logIndex,token:a.emitter,mappingStatus:a.mappingStatus}))};
    }),
    fees:scan?{paidRaw:(scan.fees||[]).filter(f=>f.gasPayer===scan.wallet).reduce((sum,f)=>sum+BigInt(f.raw18),0n).toString(),decimals:18,transactionCount:(scan.fees||[]).filter(f=>f.gasPayer===scan.wallet).length}:null,
    coverage:scan?{scope:scan.coverage.scope,fromBlock:scan.coverage.fromBlock,toBlock:scan.coverage.toBlock,complete:scan.coverage.complete,scannedAt:scan.coverage.fetchedAt,incompleteRanges:snapshot.loadedRanges.filter(r=>r.scope==='bounded_usdc_transfers'&&!r.complete).length,retryRange:snapshot.loadedRanges.some(r=>r.scope==='bounded_usdc_transfers'&&!r.complete),hasMore:snapshot.loadedRanges.some(r=>r.scope==='bounded_usdc_transfers'&&!r.complete)||BigInt(scan.coverage.fromBlock)>0n,loadedRanges:snapshot.loadedRanges.length,warning:tr?'Toplamlar yalnız yüklenen kayıtları kapsar. Transfer üretmeyen ücretli işlemler bu taramada yok.':'Totals cover loaded records only. Fee-only transactions are outside this scan.'}:null,
    exportBatches:snapshot.exportBatches.map(batch=>({...batch,recordCount:batch.movementCount})),
  };
  return <FinanceOperations state={state} actions={actions}/>;
}
