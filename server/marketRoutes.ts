import {Router} from 'express';
import type {Database} from 'bun:sqlite';
import {createMarketService,validPoolId} from './marketData';
export function createMarketRoutes(db:Database,demo:boolean){
 const router=Router(),service=createMarketService(db);
 router.use((_req,res,next)=>{res.set('Cache-Control','public, max-age=30');next();});
 router.get('/',async(req,res)=>{
  const view=req.query.view||'top',token=req.query.token;
  if(!['top','new'].includes(String(view))||token!==undefined&&(typeof token!=='string'||!/^0x[0-9a-f]{40}$/i.test(token)||/^0x0{40}$/i.test(token)))return res.status(400).json({error:'Invalid market query.'});
  if(demo)return res.json(service.unavailable([],'fixture_realm'));
  res.json(token?await service.tokenPools(token as string):await service.pools(view as 'top'|'new'));
 });
 router.get('/pools/:id',async(req,res)=>{
  if(!validPoolId(req.params.id))return res.status(400).json({error:'Invalid Arc pool identifier.'});
  res.json(demo?service.unavailable([],'fixture_realm'):await service.pool(req.params.id));
 });
 router.get('/pools/:id/chart',async(req,res)=>{
  const range=req.query.range||'24h',side=req.query.side||'base';
  if(!validPoolId(req.params.id)||!['24h','7d'].includes(String(range))||!['base','quote'].includes(String(side)))return res.status(400).json({error:'Invalid chart query.'});
  res.json(demo?service.unavailable([],'fixture_realm'):await service.candles(req.params.id,range as '24h'|'7d',side as 'base'|'quote'));
 });
 return router;
}
