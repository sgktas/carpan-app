import {Router,type RequestHandler} from 'express';
import type {Database} from 'bun:sqlite';
import type {AuthRequest} from './auth';
import {curatedProject} from './ecosystemCatalog';
import {updateFeed} from './ecosystemInsights';
import {ecosystemInbox,setEcosystemSubscription,markEcosystemRead} from './ecosystemNotifications';
export function createEcosystemUpdateRoutes(db:Database,demo:boolean,auth:RequestHandler){
 const router=Router();
 router.get('/updates',(_req,res)=>res.set('Cache-Control','public, max-age=60').json(updateFeed(demo)));
 router.use('/notifications',auth,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 router.get('/notifications',(req:AuthRequest,res)=>res.json(demo?{subscriptions:[],notifications:[],unread:0}:ecosystemInbox(db,req.userId!)));
 router.put('/notifications/subscriptions/:id',(req:AuthRequest,res)=>{
  if(demo||!curatedProject(req.params.id))return res.status(404).json({error:'Reviewed project not found.'});
  try{res.json(setEcosystemSubscription(db,req.userId!,req.params.id,req.body));}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Unable to save notification preferences.'});}
 });
 router.post('/notifications/:id/read',(req:AuthRequest,res)=>{
  if(demo||!markEcosystemRead(db,req.userId!,req.params.id))return res.status(404).json({error:'Notification not found.'});res.json({ok:true});
 });
 return router;
}
