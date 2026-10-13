import {Router,type Request,type RequestHandler} from 'express';
import type {Database} from 'bun:sqlite';
import {FinanceOrganizationError,ensurePersonalFinanceOrganization,listFinanceOrganizations,createFinanceOrganization,requireFinanceOrganizationAccess,listFinanceBusinessWallets,getFinanceBusinessWallet,registerFinanceBusinessWallet,listFinanceCounterparties,createFinanceCounterparty,updateFinanceCounterparty,readFinanceOrganizationAudit} from './financeOrganizations';
import {readFinanceOperationState,saveFinanceOperationScan,updateFinanceMovementDecision,bulkFinanceMovementDecisions,createFinanceExportBatch,readFinanceExportBatch,readFinanceMovementAudit} from './financeOperationsStore';
import {scanFinanceMovements,financeMovementRpcReader,normalizeFinanceReceipt,FINANCE_MOVEMENT_BLOCK_WINDOW,FINANCE_MOVEMENT_TRANSACTION_LIMIT,FINANCE_MOVEMENT_EVENT_LIMIT,type FinanceMovementReader} from './financeMovements';
import type {FinanceMovementScan} from '../src/finance-movements';
import {AuthRequestLimiter} from './authRequestGuard';
import {loadFinanceHistory,discardFinanceHistoryCursor,type FinanceHistoryResult,type FinanceHistoryRequest} from './financeHistory';

type UserRequest=Request&{userId?:string};
/** Internal authenticated v1 service. Commercial credentials/webhooks are a later adapter. */
export function createFinanceOperationsRoutes(db:Database,auth:RequestHandler,scan=(wallet:string)=>scanFinanceMovements(wallet),reader:FinanceMovementReader=financeMovementRpcReader,historyLoader:typeof loadFinanceHistory=loadFinanceHistory){
  const router=Router(),limiter=new AuthRequestLimiter();
  const running=new Map<string,Promise<FinanceMovementScan>>(),historyRunning=new Map<string,Promise<FinanceHistoryResult>>(),receiptImports=new Set<string>();
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();},auth);
  // Payload owner is only a replay guard; authorization always comes from the cookie.
  router.use((req:UserRequest,res,next)=>{
    if(!['GET','HEAD'].includes(req.method)&&req.body?.ownerId!==req.userId)return void res.status(409).json({error:'Account changed. Reload Finance before saving.',code:'owner_changed'});
    next();
  });
  const route=(method:'get'|'post'|'put',path:string,handler:(req:UserRequest)=>unknown|Promise<unknown>)=>router[method](path,async(req:UserRequest,res)=>{
    try{res.json(await handler(req));}catch(error){
      if(error instanceof FinanceOrganizationError){
        const e=error as Error&{status:number;code:string};res.status(e.status).json({error:e.message,code:e.code});
      }else res.status(503).json({error:'Finance data could not be loaded. Saved records are preserved; retry.',code:'finance_unavailable'});
    }
  });
  const org=(req:UserRequest)=>String(req.params.org),wallet=(req:UserRequest)=>String(req.params.wallet);
  route('get','/organizations',req=>listFinanceOrganizations(db,req.userId!));
  route('post','/organizations/personal',req=>ensurePersonalFinanceOrganization(db,req.userId!));
  route('post','/organizations',req=>createFinanceOrganization(db,req.userId!,req.body));
  route('get','/organizations/:org/wallets',req=>listFinanceBusinessWallets(db,req.userId!,org(req)));
  route('post','/organizations/:org/wallets',req=>registerFinanceBusinessWallet(db,req.userId!,org(req),req.body));
  route('get','/organizations/:org/counterparties',req=>listFinanceCounterparties(db,req.userId!,org(req)));
  route('post','/organizations/:org/counterparties',req=>createFinanceCounterparty(db,req.userId!,org(req),req.body));
  route('put','/organizations/:org/counterparties/:id',req=>updateFinanceCounterparty(db,req.userId!,org(req),String(req.params.id),req.body));
  route('get','/organizations/:org/audit',req=>readFinanceOrganizationAudit(db,req.userId!,org(req),req.query.before));
  const root='/organizations/:org/wallets/:wallet';
  route('get',`${root}/movements`,req=>readFinanceOperationState(db,req.userId!,org(req),wallet(req)));
  route('post',`${root}/history`,async req=>{
    requireFinanceOrganizationAccess(db,req.userId!,org(req),'write');
    const account=getFinanceBusinessWallet(db,req.userId!,org(req),wallet(req));
    if(account.disabledAt)throw new FinanceOrganizationError('conflict','This business wallet is disabled.',409);
    if(req.body?.cursor!==undefined&&(typeof req.body.cursor!=='string'||!req.body.cursor||req.body.cursor.length>128))throw new FinanceOrganizationError('invalid_input','Finance history pagination expired. Load history again.',400);
    const previous=readFinanceOperationState(db,req.userId!,org(req),wallet(req)),scopeKey=`${org(req)}:${wallet(req)}`;
    // A single wallet history session advances at a time. The caller's body never supplies evidence or scope.
    if(historyRunning.has(scopeKey)||receiptImports.has(scopeKey)||[...running.keys()].some(key=>key.startsWith(scopeKey+':')))throw new FinanceOrganizationError('limit_reached','Wait 30 seconds before loading this wallet history again.',429);
    const limit=limiter.consume(`history:${scopeKey}`,1,30_000);
    if(!limit.allowed)throw new FinanceOrganizationError('limit_reached','Wait 30 seconds before loading this wallet history again.',429);
    const input:FinanceHistoryRequest={scope:scopeKey,ownerId:req.userId!,wallet:account.address,knownHashes:[...new Set(previous.scan?.movements.map(m=>m.hash)||[])],...req.body?.cursor?{cursor:req.body.cursor}:{}};
    const pending=historyLoader(db,input,reader);historyRunning.set(scopeKey,pending);
    let result:FinanceHistoryResult|undefined;
    try{
      result=await pending;
      // Membership and disabled-wallet status are checked even when discovery found no receipt.
      requireFinanceOrganizationAccess(db,req.userId!,org(req),'write');
      if(getFinanceBusinessWallet(db,req.userId!,org(req),wallet(req)).disabledAt)throw new FinanceOrganizationError('conflict','This business wallet is disabled.',409);
      db.transaction(()=>{for(const scanResult of result!.scans)saveFinanceOperationScan(db,req.userId!,org(req),wallet(req),scanResult);})();
      const state=readFinanceOperationState(db,req.userId!,org(req),wallet(req));
      return {state,history:{...result.history,importedMovements:(state.scan?.movements.length||0)-(previous.scan?.movements.length||0)},nextCursor:result.nextCursor};
    }catch(error){discardFinanceHistoryCursor(input,result?.nextCursor||input.cursor);throw error;}
    finally{historyRunning.delete(scopeKey);}
  });
  route('post',`${root}/refresh`,async req=>{
    requireFinanceOrganizationAccess(db,req.userId!,org(req),'write');
    const account=getFinanceBusinessWallet(db,req.userId!,org(req),wallet(req));
    if(account.disabledAt)throw new FinanceOrganizationError('conflict','This business wallet is disabled.',409);
    const previous=readFinanceOperationState(db,req.userId!,org(req),wallet(req));
    const windows=previous.loadedRanges.filter(r=>r.scope==='bounded_usdc_transfers');
    const retry=windows.filter(r=>!r.complete).sort((a,b)=>BigInt(a.fromBlock)<BigInt(b.fromBlock)?-1:1)[0];
    const oldest=windows.reduce((a,r)=>BigInt(r.fromBlock)<a?BigInt(r.fromBlock):a,2n**256n-1n);
    const to=req.body?.older===true?(retry?BigInt(retry.toBlock):oldest<2n**256n-1n?oldest-1n:undefined):undefined;
    if(to!==undefined&&to<0n)throw new FinanceOrganizationError('invalid_input','No earlier block range remains.',400);
    const scopeKey=`${org(req)}:${wallet(req)}`,key=`${scopeKey}:${to?.toString()||'latest'}`;
    if(historyRunning.has(scopeKey)||receiptImports.has(scopeKey))throw new FinanceOrganizationError('limit_reached','Wait 30 seconds before loading this wallet history again.',429);
    let pending=running.get(key);
    if(!pending){
      const limit=limiter.consume(scopeKey,1,30_000);
      if(!limit.allowed)throw new FinanceOrganizationError('limit_reached','Wait 30 seconds before refreshing this wallet again.',429);
      pending=to===undefined?scan(account.address):scanFinanceMovements(account.address,reader,{toBlock:to,...retry?{fromBlock:BigInt(retry.fromBlock)}:{}});running.set(key,pending);
      void pending.finally(()=>running.delete(key)).catch(()=>{});
    }
    const result=await pending;
    // Recheck membership and wallet after the network call, before private persistence.
    saveFinanceOperationScan(db,req.userId!,org(req),wallet(req),result);
    return readFinanceOperationState(db,req.userId!,org(req),wallet(req));
  });
  route('put',`${root}/movements/:id`,req=>updateFinanceMovementDecision(db,req.userId!,org(req),wallet(req),String(req.params.id),req.body));
  route('post',`${root}/decisions/bulk`,req=>bulkFinanceMovementDecisions(db,req.userId!,org(req),wallet(req),req.body));
  route('post',`${root}/exports`,req=>{
    const versions=req.body?.expectedVersions;
    if(!versions||typeof versions!=='object'||Array.isArray(versions)||!Array.isArray(req.body?.ids))throw new FinanceOrganizationError('invalid_input','Reviewed movement versions are required.',400);
    return createFinanceExportBatch(db,req.userId!,org(req),wallet(req),req.body);
  });
  route('get',`${root}/exports/:id`,req=>readFinanceExportBatch(db,req.userId!,org(req),wallet(req),String(req.params.id)));
  route('get',`${root}/movements/:id/audit`,req=>readFinanceMovementAudit(db,req.userId!,org(req),wallet(req),String(req.params.id),req.query.before));
  route('post',`${root}/import`,async req=>{
    requireFinanceOrganizationAccess(db,req.userId!,org(req),'write');
    const account=getFinanceBusinessWallet(db,req.userId!,org(req),wallet(req)),hash=req.body?.hash;
    if(account.disabledAt)throw new FinanceOrganizationError('conflict','This business wallet is disabled.',409);
    const scopeKey=`${org(req)}:${wallet(req)}`;
    if(historyRunning.has(scopeKey)||receiptImports.has(scopeKey)||[...running.keys()].some(key=>key.startsWith(scopeKey+':')))throw new FinanceOrganizationError('limit_reached','Wait 30 seconds before loading this wallet history again.',429);
    if(typeof hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(hash))throw new FinanceOrganizationError('invalid_input','A valid transaction hash is required.',400);
    const limit=limiter.consume(`import:${org(req)}:${wallet(req)}`,3,60_000);
    if(!limit.allowed)throw new FinanceOrganizationError('limit_reached','Wait before importing another transaction.',429);
    receiptImports.add(scopeKey);
    try{
    const deadline=Date.now()+30_000;
    const bounded=async<T,>(action:()=>Promise<T>):Promise<T>=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('Receipt read timed out');let timer:ReturnType<typeof setTimeout>|undefined;try{const result=await Promise.race([action(),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error('Receipt read timed out')),remaining);})]);if(Date.now()>=deadline)throw Error('Receipt read timed out');return result;}finally{clearTimeout(timer);}};
    if(await bounded(()=>reader.chainId())!==5042)throw Error('Wrong chain');
    const receipt=await bounded(()=>reader.receipt(hash)),block=await bounded(()=>reader.block(receipt.blockNumber));
    if(receipt.transactionHash.toLowerCase()!==hash.toLowerCase()||receipt.blockHash.toLowerCase()!==block.hash?.toLowerCase()||receipt.blockNumber!==block.number)throw Error('Invalid proof');
    const result=normalizeFinanceReceipt(receipt,block.timestamp,account.address);
    if(!result.movements.length)throw new FinanceOrganizationError('invalid_input','This receipt has no USDC movements for the selected wallet.',400);
    const scanResult:FinanceMovementScan={wallet:account.address,movements:result.movements,unmappedAliases:result.unmappedAliases,warnings:result.warnings,fees:[result.fee],coverage:{wallet:account.address,fromBlock:block.number.toString(),toBlock:block.number.toString(),toBlockHash:receipt.blockHash.toLowerCase(),fetchedAt:new Date().toISOString(),checkedTransactions:1,candidateTransactions:1,failedTransactions:0,truncated:false,blockWindow:FINANCE_MOVEMENT_BLOCK_WINDOW,transactionLimit:FINANCE_MOVEMENT_TRANSACTION_LIMIT,eventLimit:FINANCE_MOVEMENT_EVENT_LIMIT,complete:false,scope:'receipt_import',includesGas:true,includesGasOnlyTransactions:false}};
    scanResult.warnings.push('One transaction receipt was imported; this is not complete block history.');
    saveFinanceOperationScan(db,req.userId!,org(req),wallet(req),scanResult);
    return readFinanceOperationState(db,req.userId!,org(req),wallet(req));
    }finally{receiptImports.delete(scopeKey);}
  });
  return router;
}
