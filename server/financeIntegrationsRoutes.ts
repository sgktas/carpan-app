import {Router,type Request,type RequestHandler} from 'express';
import {createHash} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import {FinanceOrganizationError,listFinanceBusinessWallets,getFinanceBusinessWallet} from './financeOrganizations';
import {readFinanceOperationState,readFinanceExportBatch} from './financeOperationsStore';
import {listFinanceIntegrations,createFinanceIntegration,getFinanceIntegration,listFinanceApiKeys,createFinanceApiKey,revokeFinanceApiKey,listFinanceAcknowledgements,authenticateFinanceApiKey,recordFinanceApiUse,acknowledgeFinanceExport,type FinanceApiScope,type FinanceApiPrincipal} from './financeIntegrations';
import {webhookConfigurationAvailable,getFinanceWebhookEndpoint,listFinanceWebhookDeliveries,configureFinanceWebhook,queueFinanceWebhook,retryFinanceWebhook} from './financeWebhooks';
import {AuthRequestLimiter} from './authRequestGuard';

type UserRequest=Request&{userId?:string};
function errorResponse(error:unknown,res:Parameters<RequestHandler>[1]){
  if(error instanceof FinanceOrganizationError){if(error.status===401)res.set('WWW-Authenticate','Bearer realm="Carpan Finance"');res.status(error.status).json({error:error.message,code:error.code});}
  else res.status(503).json({error:'Finance integration is temporarily unavailable. Saved records are preserved.',code:'finance_unavailable'});
}
export function createFinanceIntegrationsRoutes(db:Database,auth:RequestHandler){
  const router=Router(),limiter=new AuthRequestLimiter();
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();},auth);
  router.use((req:UserRequest,res,next)=>{
    if(!['GET','HEAD'].includes(req.method)){
      if(req.body?.ownerId!==req.userId)return void res.status(409).json({error:'Account changed. Reload Finance before saving.',code:'owner_changed'});
      const limit=limiter.consume(`${req.userId}:integrations`,30,60_000);if(!limit.allowed){res.set('Retry-After',String(limit.retryAfter));return void res.status(429).json({error:'Wait before changing another integration.',code:'limit_reached'});}
    }next();
  });
  const route=(method:'get'|'post'|'put',path:string,handler:(req:UserRequest)=>unknown|Promise<unknown>)=>router[method](path,async(req:UserRequest,res)=>{try{res.json(await handler(req));}catch(error){errorResponse(error,res);}});
  const org=(req:UserRequest)=>String(req.params.org),integration=(req:UserRequest)=>String(req.params.integration);
  const available=()=>({webhooks:webhookConfigurationAvailable()});
  const root='/organizations/:org',target=root+'/:integration';
  route('get',root,req=>({integrations:listFinanceIntegrations(db,req.userId!,org(req)),available:available()}));
  route('post',root,req=>({integration:createFinanceIntegration(db,req.userId!,org(req),req.body)}));
  route('get',target,req=>({integration:getFinanceIntegration(db,req.userId!,org(req),integration(req)),keys:listFinanceApiKeys(db,req.userId!,org(req),integration(req)),webhook:getFinanceWebhookEndpoint(db,req.userId!,org(req),integration(req)),deliveries:listFinanceWebhookDeliveries(db,req.userId!,org(req),integration(req)).items,acknowledgements:listFinanceAcknowledgements(db,req.userId!,org(req),integration(req)),available:available()}));
  route('post',target+'/keys',req=>createFinanceApiKey(db,req.userId!,org(req),integration(req),req.body));
  route('post',target+'/keys/:key/revoke',req=>revokeFinanceApiKey(db,req.userId!,org(req),integration(req),String(req.params.key)));
  route('put',target+'/webhook',async req=>{const result=await configureFinanceWebhook(db,req.userId!,org(req),integration(req),req.body);return {endpoint:result.endpoint,...result.signingSecret?{secret:result.signingSecret}:{}};});
  route('post',target+'/deliveries',req=>({delivery:queueFinanceWebhook(db,req.userId!,org(req),integration(req),req.body?.walletId,req.body?.batchId)}));
  route('post',target+'/deliveries/:delivery/retry',req=>({delivery:retryFinanceWebhook(db,req.userId!,org(req),integration(req),String(req.params.delivery))}));
  route('get',target+'/acknowledgements',req=>({acknowledgements:listFinanceAcknowledgements(db,req.userId!,org(req),integration(req))}));
  route('get',target+'/exports',req=>{
    getFinanceIntegration(db,req.userId!,org(req),integration(req));
    const rows=db.query(`SELECT b.id,b.wallet_id,w.label,b.created_at,b.movement_count FROM finance_export_batches b JOIN finance_business_wallets w ON w.id=b.wallet_id AND w.organization_id=b.organization_id WHERE b.organization_id=? AND w.disabled_at IS NULL ORDER BY b.created_at DESC,b.id DESC LIMIT 100`).all(org(req)) as {id:string;wallet_id:string;label:string;created_at:string;movement_count:number}[];
    return {items:rows.map(row=>({id:row.id,walletId:row.wallet_id,walletLabel:row.label,createdAt:row.created_at,movementCount:row.movement_count,status:'generated',accountingStatus:'not_submitted'}))};
  });
  return router;
}

const cursorEncode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
function cursorDecode(value:unknown):Record<string,unknown>|null{
  if(value===undefined)return null;
  if(typeof value!=='string'||value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))throw new FinanceOrganizationError('invalid_input','Invalid Finance API cursor.',400);
  try{const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}catch{throw new FinanceOrganizationError('invalid_input','Invalid Finance API cursor.',400);}
}
/** Organization is taken exclusively from the Bearer credential. No cookie fallback. */
export function createFinanceExternalApiRoutes(db:Database){
  const router=Router(),limiter=new AuthRequestLimiter();
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.use((req,res,next)=>{const result=limiter.consume(`ip:${req.ip||req.socket.remoteAddress||'unknown'}`,240,60_000);if(!result.allowed){res.set('Retry-After',String(result.retryAfter));return void res.status(429).json({error:'Wait before sending another Finance API request.',code:'limit_reached'});}next();});
  const route=(method:'get'|'post',path:string,scope:FinanceApiScope,handler:(req:Request,principal:FinanceApiPrincipal)=>unknown)=>router[method](path,(req,res)=>{
    try{
      const principal=authenticateFinanceApiKey(db,req.get('Authorization'),scope);
      for(const bucket of [{key:`key:${principal.keyId}`,limit:120},{key:`org:${principal.organizationId}`,limit:600}]){const result=limiter.consume(bucket.key,bucket.limit,60_000);if(!result.allowed){res.set('Retry-After',String(result.retryAfter));return void res.status(429).json({error:'Wait before sending another Finance API request.',code:'limit_reached'});}}
      recordFinanceApiUse(db,principal);res.json(handler(req,principal));
    }catch(error){errorResponse(error,res);}
  });
  route('get','/wallets','movements:read',(_req,p)=>({items:listFinanceBusinessWallets(db,p.actorId,p.organizationId)}));
  route('get','/wallets/:wallet/movements','movements:read',(req,p)=>{
    const id=String(req.params.wallet),wallet=getFinanceBusinessWallet(db,p.actorId,p.organizationId,id),state=readFinanceOperationState(db,p.actorId,p.organizationId,id);
    const generation=createHash('sha256').update(JSON.stringify({scan:state.scan,decisions:state.decisions})).digest('hex'),cursor=cursorDecode(req.query.cursor);
    if(cursor&&(cursor.generation!==generation||cursor.walletId!==id||!Number.isSafeInteger(cursor.offset)||(cursor.offset as number)<0||(cursor.offset as number)>5000))throw new FinanceOrganizationError('conflict','Finance snapshot changed or cursor is invalid. Restart pagination.',409);
    const offset=(cursor?.offset as number)||0,movements=state.scan?.movements||[],page=movements.slice(offset,offset+50),hashes=new Set(page.map(m=>m.hash));
    const acks=(page.length?db.query(`SELECT movement_id,decision_version,external_record_id,recorded_at,batch_id FROM finance_accounting_acknowledgements WHERE organization_id=? AND integration_id=? AND wallet_id=? AND (${page.map(()=>'(movement_id=? AND decision_version=?)').join(' OR ')})`).all(p.organizationId,p.integrationId,id,...page.flatMap(m=>[m.id,state.decisions[m.id]?.version||0])):[]) as {movement_id:string;decision_version:number;external_record_id:string;recorded_at:string;batch_id:string}[];
    return {schema:'carpan.finance.movements.page.v1',wallet,coverage:state.scan?.coverage||null,loadedRangeCount:state.loadedRanges.length,
      records:page.map(movement=>{const decision=state.decisions[movement.id],ack=acks.find(a=>a.movement_id===movement.id&&a.decision_version===decision?.version);return {movement,decision,accountingAcknowledgement:ack?{externalRecordId:ack.external_record_id,recordedAt:ack.recorded_at,batchId:ack.batch_id,decisionVersion:ack.decision_version}:null};}),
      fees:(state.scan?.fees||[]).filter(fee=>hashes.has(fee.hash)),nextCursor:offset+50<movements.length?cursorEncode({walletId:id,generation,offset:offset+50}):null};
  });
  route('get','/wallets/:wallet/exports','exports:read',(req,p)=>{
    const walletId=String(req.params.wallet);getFinanceBusinessWallet(db,p.actorId,p.organizationId,walletId);const cursor=cursorDecode(req.query.cursor);
    if(cursor&&(cursor.walletId!==walletId||typeof cursor.createdAt!=='string'||cursor.createdAt.length>32||!Number.isFinite(Date.parse(cursor.createdAt))||typeof cursor.id!=='string'||!/^[a-f0-9-]{36}$/.test(cursor.id)))throw new FinanceOrganizationError('invalid_input','Invalid Finance API cursor.',400);
    const rows=db.query(`SELECT id FROM finance_export_batches WHERE organization_id=? AND wallet_id=? ${cursor?'AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 51`).all(...(cursor?[p.organizationId,walletId,cursor.createdAt as string,cursor.createdAt as string,cursor.id as string]:[p.organizationId,walletId])) as {id:string}[];
    const items=rows.slice(0,50).map(row=>{const {payload:_payload,...metadata}=readFinanceExportBatch(db,p.actorId,p.organizationId,walletId,row.id);return metadata;});
    const last=items.at(-1);return {items,nextCursor:rows.length>50&&last?cursorEncode({walletId,createdAt:last.createdAt,id:last.id}):null};
  });
  route('get','/wallets/:wallet/exports/:batch','exports:read',(req,p)=>readFinanceExportBatch(db,p.actorId,p.organizationId,String(req.params.wallet),String(req.params.batch)));
  route('post','/wallets/:wallet/exports/:batch/acknowledgements','accounting:write',(req,p)=>acknowledgeFinanceExport(db,p,String(req.params.wallet),String(req.params.batch),req.body));
  return router;
}
