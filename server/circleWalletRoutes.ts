import {Router,type Request,type RequestHandler} from 'express';
import type {Database} from 'bun:sqlite';
import {AuthRequestLimiter} from './authRequestGuard';
import {circleWalletConfiguration,createCircleWalletService,createCircleWalletReader,CircleWalletError} from './circleWallets';
import {initiateUserControlledWalletsClient} from '@circle-fin/user-controlled-wallets';
export function createCircleWalletRoutes(db:Database,requireAuth:RequestHandler,sessionHash:(req:Request)=>string|null){
 const router=Router(),config=circleWalletConfiguration(),limiter=new AuthRequestLimiter();
 const service=config.enabled?createCircleWalletService(db,{appId:config.appId,client:initiateUserControlledWalletsClient({apiKey:process.env.CIRCLE_API_KEY!}),reader:createCircleWalletReader(process.env.CIRCLE_API_KEY!)}):null;
 router.use((_req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});next();});router.use(requireAuth);
 router.get('/config',(req:Request&{userId?:string},res)=>{try{res.json(service?{enabled:true,appId:config.appId,email:service.email(req.userId!),environment:'testnet'}:{enabled:false});}catch{res.status(403).json({error:'Sign in with a verified Google or email account.'});}});
 router.use((req:Request&{userId?:string},res,next)=>{if(!service)return res.status(503).json({error:'Circle wallets are not available.'});const rate=limiter.consume(`${req.path}:${req.userId}`,req.path==='/otp'?4:30,15*60_000);if(!rate.allowed)return res.status(429).set('Retry-After',String(rate.retryAfter)).json({error:'Please wait before trying wallet verification again.'});next();});
 const handle=(action:(owner:string,session:string,body:Record<string,unknown>)=>Promise<unknown>|unknown)=>(req:Request&{userId?:string},res:import('express').Response)=>{void(async()=>{try{const session=sessionHash(req);if(!req.userId||!session)throw new CircleWalletError('Sign in again.',401);res.json(await action(req.userId,session,req.body||{}));}catch(e){res.status(e instanceof CircleWalletError?e.status:502).json({error:e instanceof CircleWalletError?e.message:'Circle wallet request could not be completed. No payment was requested.'});}})();};
 router.post('/otp',handle((o,s,b)=>service!.start(o,s,b.deviceId)));
 router.get('/account',handle(o=>service!.snapshot(o)));
 router.post('/connect',handle((o,s,b)=>service!.connect(o,s,b.flowId,b.userToken)));
 router.post('/initialize',handle((o,s,b)=>service!.initialize(o,s,b.flowId)));
 router.post('/wallets',handle((o,s,b)=>service!.wallets(o,s,b.flowId)));
 router.post('/status',handle((o,s,b)=>service!.status(o,s,b.flowId)));
 router.post('/balances',handle((o,s,b)=>service!.balances(o,s,b.flowId,b.walletId)));
 router.post('/close',handle((o,s,b)=>service!.close(o,s,b.flowId)));
 return router;
}
