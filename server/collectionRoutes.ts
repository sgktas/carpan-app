import {Router} from 'express';
import {db} from './sqliteDb';
import {requireAuth,type AuthRequest} from './auth';
import {initCollections,listCollections,createCollection,getCollection,publicCollection,attachCollectionProofs,decideCollectionProof,cancelCollection,collectionAudit} from './collections';
import {loadCollectionReceipt} from './collectionReceipts';
import {initFinanceInbox,readFinanceInbox,refreshFinanceInbox,inboxProof} from './financeInbox';
initCollections(db);
initFinanceInbox(db);
export const collectionRoutes=Router();
collectionRoutes.use((_req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});next();});
collectionRoutes.get('/pay/:token',(req,res)=>{const result=publicCollection(db,req.params.token);if(!result)return res.status(404).json({error:'Ödeme bağlantısı bulunamadı veya kapatılmış.'});res.json(result);});
collectionRoutes.use(requireAuth as any);
const errorText=(e:unknown)=>e instanceof Error?e.message:'İşlem tamamlanamadı.';
collectionRoutes.get('/inbox',(req:AuthRequest,res)=>{try{res.json(readFinanceInbox(db,req.userId!,req.query.wallet));}catch(e){res.status(400).json({error:errorText(e)});}});
const lastInboxAttempt=new Map<string,number>();
collectionRoutes.post('/inbox/refresh',async(req:AuthRequest,res)=>{
  try{
    const before=readFinanceInbox(db,req.userId!,req.body?.wallet),now=Date.now();
    for(const [id,at] of lastInboxAttempt)if(now-at>60000)lastInboxAttempt.delete(id);
    if(now-(lastInboxAttempt.get(req.userId!)||0)<30000)return res.json(before);
    lastInboxAttempt.set(req.userId!,now);
    res.json(await refreshFinanceInbox(db,req.userId!,req.body?.wallet));
  }catch(e){const message=errorText(e),safe=['Bu cüzdan hesabının tahsilat taleplerine bağlı değil.','RPC Arc Mainnet ağına bağlı değil.','Gelen hareketlerin zincir kanıtı alınamadı. Mevcut kayıt korunuyor; yeniden dene.'];res.status(422).json({error:safe.includes(message)?message:'Arc gelen kutusu şu anda güncellenemiyor. Mevcut kaydın korunuyor; yeniden dene.'});}
});
collectionRoutes.post('/inbox/assign',async(req:AuthRequest,res)=>{
  try{
    const draft=req.body;if(typeof draft?.requestId!=='string'||typeof draft.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(draft.hash)||!Number.isSafeInteger(draft.logIndex)||draft.logIndex<0)throw new Error('Gelen kutusu eşleştirme bilgisi geçersiz.');
    const request=getCollection(db,req.userId!,draft.requestId);if(request.cancelled)throw new Error('İptal edilmiş talep.');
    const cached=inboxProof(db,req.userId!,request.recipient,draft.hash.toLowerCase(),draft.logIndex);
    const now=Date.now();if(now-(lastLookup.get(req.userId!)||0)<5000)return res.status(429).json({error:'Yeni zincir sorgusu için 5 saniye bekle.'});lastLookup.set(req.userId!,now);
    // Re-read the actual receipt; browser-selected suggestions cannot manufacture payment evidence.
    const proofs=await loadCollectionReceipt(cached.hash,request.recipient,request.payer).catch(()=>{throw new Error('Zincir kanıtı doğrulanamadı. Ağ, hash ve alıcıyı kontrol et; RPC kesintisinde yeniden dene.');}),proof=proofs.find(p=>p.logIndex===cached.logIndex);
    if(!proof||proof.raw18!==cached.raw18||proof.from!==cached.from||proof.block!==cached.block)throw new Error('Zincir kanıtı değişti; gelen kutusunu yenile.');
    res.json(attachCollectionProofs(db,req.userId!,request.id,[proof]));
  }catch(e){res.status(409).json({error:errorText(e)});}
});
collectionRoutes.get('/requests',(req:AuthRequest,res)=>res.json(listCollections(db,req.userId!)));
collectionRoutes.get('/requests/:id/audit',(req:AuthRequest,res)=>{try{res.json(collectionAudit(db,req.userId!,req.params.id,req.query.before||''));}catch(e){res.status(400).json({error:errorText(e)});}});
collectionRoutes.post('/requests',(req:AuthRequest,res)=>{try{res.status(201).json(createCollection(db,req.userId!,req.body));}catch(e){res.status(400).json({error:errorText(e)});}});
collectionRoutes.post('/requests/:id/cancel',(req:AuthRequest,res)=>{try{res.json(cancelCollection(db,req.userId!,req.params.id));}catch(e){res.status(400).json({error:errorText(e)});}});
collectionRoutes.patch('/requests/:id/proofs',(req:AuthRequest,res)=>{try{res.json(decideCollectionProof(db,req.userId!,req.params.id,req.body));}catch(e){res.status(400).json({error:errorText(e)});}});
const lastLookup=new Map<string,number>();
collectionRoutes.post('/requests/:id/proofs',async(req:AuthRequest,res)=>{
  let request;
  try{request=getCollection(db,req.userId!,req.params.id);if(request.cancelled)throw new Error('İptal edilmiş talep.');if(typeof req.body?.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(req.body.hash))throw new Error('Geçerli işlem hash’i gir.');}
  catch(e){return res.status(400).json({error:errorText(e)});}
  const now=Date.now();for(const [id,at] of lastLookup)if(now-at>60000)lastLookup.delete(id);
  if(now-(lastLookup.get(req.userId!)||0)<5000)return res.status(429).json({error:'Yeni zincir sorgusu için 5 saniye bekle.'});lastLookup.set(req.userId!,now);
  let proofs;
  try{proofs=await loadCollectionReceipt(req.body.hash,request.recipient,request.payer);}
  catch{return res.status(422).json({error:'Arc Mainnet üzerinde başarılı ve bu alıcıya gelen uygun USDC kanıtı doğrulanamadı. Ağ, hash ve alıcıyı kontrol et; bekleyen işlem veya RPC kesintisinde yeniden dene. Mint ve kendi cüzdanına aktarım tahsilat sayılmaz.'});}
  try{res.json(attachCollectionProofs(db,req.userId!,req.params.id,proofs));}
  catch(e){res.status(409).json({error:errorText(e)});}
});
