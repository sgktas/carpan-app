import {Router,type Request,type RequestHandler} from 'express';
import type {Database} from 'bun:sqlite';
import {readFinanceDecisions,saveFinanceDecision} from './financeWorkspace';

type FinanceRequest=Request&{userId?:string};
export const FINANCE_OWNER_CHANGED='Hesap değişti. Bu notu kaydetmeden önce Finans sayfasını yeniden aç.';

export function createFinanceWorkspaceRoutes(db:Database,requireAuth:RequestHandler){
  const router=Router();
  router.use(requireAuth);
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.post('/:address/decisions/read',(req:FinanceRequest,res)=>{
    try{res.json(readFinanceDecisions(db,req.userId!,req.params.address,req.body?.ids));}
    catch(e){res.status(400).json({error:e instanceof Error?e.message:'Finans kayıtları okunamadı.'});}
  });
  router.put('/:address/decisions',(req:FinanceRequest,res)=>{
    // The cookie is the authority; ownerId only guards an edit made under an
    // earlier session. Never choose the destination account from the payload.
    if(typeof req.body?.ownerId!=='string'||req.body.ownerId!==req.userId)
      return res.status(409).json({error:FINANCE_OWNER_CHANGED});
    try{res.json(saveFinanceDecision(db,req.userId!,req.params.address,req.body));}
    catch(e){res.status(400).json({error:e instanceof Error?e.message:'Finans kaydı kaydedilemedi.'});}
  });
  return router;
}
