import {Router} from 'express';
import {db} from './sqliteDb';
import {requireAuth,type AuthRequest} from './auth';
import {AuthRequestLimiter} from './authRequestGuard';
import {initBridgeHistory,historyEnvironment,listBridgeHistory,saveBridgeHistory} from './bridgeHistory';
initBridgeHistory(db);
export const bridgeHistoryRoutes=Router();
bridgeHistoryRoutes.use(requireAuth as any);
bridgeHistoryRoutes.use((_req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});next();});
const limits=new AuthRequestLimiter();
bridgeHistoryRoutes.get('/history',(req:AuthRequest,res)=>{try{res.json(listBridgeHistory(db,req.userId!,historyEnvironment(req.query.environment),req.query.wallet));}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Köprü geçmişi alınamadı.'});}});
bridgeHistoryRoutes.post('/history',(req:AuthRequest,res)=>{
 const rate=limits.consume(req.userId!,120,60000);if(!rate.allowed){res.set('Retry-After',String(rate.retryAfter));return res.status(429).json({error:'Köprü kayıtlarını eşitlemek için biraz bekle.'});}
 try{res.json(saveBridgeHistory(db,req.userId!,historyEnvironment(req.body?.environment),req.body?.wallet,req.body?.snapshot));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Köprü geçmişi saklanamadı.'});}
});
