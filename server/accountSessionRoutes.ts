import {Router,type Request,type RequestHandler} from 'express';
import type {Database} from 'bun:sqlite';
import {AuthRequestLimiter} from './authRequestGuard';
import {AccountSessionError,listAccountSessions,revokeAccountSession,revokeOtherAccountSessions} from './accountSessions';
import {disconnectXAccount,initXDisconnect,XDisconnectError} from './xAccountDisconnect';

type AccountRequest=Request&{userId?:string};
/** Mount behind the existing origin/CSRF guard. Dependencies allow isolated HTTP tests. */
export function createAccountSessionsRoutes(db:Database,requireAuth:RequestHandler,currentSessionHash:(req:Request)=>string|null){
  initXDisconnect(db);
  const router=Router(),limiter=new AuthRequestLimiter();
  router.use((_req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});next();});
  router.use(requireAuth);
  router.use((req:AccountRequest,res,next)=>{
    if(!req.userId)return res.status(401).json({error:'Oturum açılmamış'});
    const rate=limiter.consume(`${req.method==='GET'?'read':'write'}:${req.userId}`,req.method==='GET'?120:20,60_000);
    if(!rate.allowed){res.set('Retry-After',String(rate.retryAfter));return res.status(429).json({error:'Oturumlarını yönetmek için biraz bekle.'});}
    next();
  });
  const respond=(req:AccountRequest,res:import('express').Response,action:(userId:string,hash:string)=>unknown)=>{
    try{
      const hash=currentSessionHash(req);
      if(!hash)throw new AccountSessionError('Oturum açılmamış',401);
      res.json(action(req.userId!,hash));
    }catch(error){res.status(error instanceof AccountSessionError||error instanceof XDisconnectError?error.status:500).json({error:error instanceof AccountSessionError||error instanceof XDisconnectError?error.message:'Oturumlar yönetilemedi. Yeniden dene.'});}
  };
  router.get('/sessions',(req:AccountRequest,res)=>respond(req,res,(user,hash)=>listAccountSessions(db,user,hash)));
  router.post('/sessions/revoke-others',(req:AccountRequest,res)=>respond(req,res,(user,hash)=>revokeOtherAccountSessions(db,user,hash)));
  router.delete('/sessions/:id',(req:AccountRequest,res)=>respond(req,res,(user,hash)=>revokeAccountSession(db,user,hash,req.params.id)));
  router.post('/x/disconnect',(req:AccountRequest,res)=>respond(req,res,(user,hash)=>disconnectXAccount(db,user,hash)));
  return router;
}
