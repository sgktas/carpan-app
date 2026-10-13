import type {RequestHandler} from 'express';

// Owner-controlled launch switch; absent/false configuration keeps service closed.
export const FINANCE_API_ENABLED=process.env.CARPAN_FINANCE_API_ENABLED==='true';
export function createFinanceApiAvailabilityGuard(enabled=FINANCE_API_ENABLED):RequestHandler{
  return (_req,res,next)=>{
    if(enabled)return next();
    res.set('Cache-Control','private, no-store');
    res.set('X-Robots-Tag','noindex, nofollow');
    return void res.status(503).json({error:'Carpan API access is not open yet.',code:'api_not_open'});
  };
}
