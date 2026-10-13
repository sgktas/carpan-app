import type {NextFunction,Request,Response} from 'express';
import {AuthRequestLimiter} from './authRequestGuard';

const paidResearchRoute=/^\/(?:arc\/(?:wallets\/0x[0-9a-f]{40}(?:\/(?:research|transfers))?|addresses\/0x[0-9a-f]{40}|contracts\/0x[0-9a-f]{40}|verified|transfers)|onchain\/(?:transfers|networks\/\d+\/data))$/i;
const crawler=/\b(?:ahrefsbot|gptbot|googlebot|bingbot|petalbot|bytespider|semrushbot|claudebot|claude-web|ccbot|anthropic-ai|facebookexternalhit|meta-externalagent|amazonbot|applebot|yandexbot|duckduckbot|dotbot|mj12bot|sogou|baiduspider)\b|(?:bot\b|crawler|spider)/i;
type Options={limiter?:AuthRequestLimiter;clock?:()=>number;limit?:number;windowMs?:number};
/** Public pages remain indexable; paid API enrichment is not a crawler resource.
 * The proxy-normalized Express IP is authority. Raw forwarding headers never are. */
export function createArcWalletReadGuard(options:Options={}){
  const limiter=options.limiter||new AuthRequestLimiter(),clock=options.clock||Date.now;
  const limit=options.limit||60,windowMs=options.windowMs||60000;
  return (req:Request,res:Response,next:NextFunction)=>{
    // Express decodes route parameters after this middleware; normalize the same
    // spelling here so escaped wallet addresses cannot skip their read guard.
    let path=req.path;try{path=decodeURIComponent(path);}catch{return next();}
    path=path.replace(/^\/api(?=\/)/i,'').replace(/\/+$/,'');
    if(!['GET','HEAD'].includes(req.method)||!paidResearchRoute.test(path))return next();
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Cache-Control','no-store');
    if(crawler.test(String(req.get('User-Agent')||'').slice(0,1000)))
      return res.status(403).json({error:'Automated crawlers cannot access this research API. Use the public website.',code:'crawler_not_supported'});
    const ip=(req.ip||req.socket.remoteAddress||'unknown').replace(/^::ffff:/i,'').slice(0,128);
    const result=limiter.consume(`arc-public:${ip}`,limit,windowMs,clock());
    if(!result.allowed){
      res.set('Retry-After',String(result.retryAfter));
      return res.status(429).json({error:'Too many wallet research requests. Wait before trying again.',code:'research_rate_limited'});
    }
    next();
  };
}
