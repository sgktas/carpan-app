import {randomUUID} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import {Blockchain,initiateUserControlledWalletsClient} from '@circle-fin/user-controlled-wallets';

export class CircleWalletError extends Error{constructor(message:string,public status=400){super(message);}}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
type Provider=ReturnType<typeof initiateUserControlledWalletsClient>;
type WalletReader={listWallets(input:{userId:string;pageAfter?:string}):ReturnType<Provider['listWallets']>;balances(walletId:string):ReturnType<Provider['getWalletTokenBalance']>};
export function createCircleWalletReader(apiKey:string):WalletReader{
 async function read(path:string){const r=await fetch('https://api.circle.com/v1/w3s/'+path,{headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(10_000)});if(!r.ok)throw new CircleWalletError('Circle wallet details are temporarily unavailable.',502);return r.json();}
 return {listWallets:async input=>read('wallets?'+new URLSearchParams({userId:input.userId,blockchain:Blockchain.ArcTestnet,pageSize:'50',...input.pageAfter?{pageAfter:input.pageAfter}:{}})),balances:async walletId=>read('wallets/'+encodeURIComponent(walletId)+'/balances')};
}
type Flow={owner:string;session:string;email:string;until:number;circleUserId?:string;token?:string};
type WalletView={id:string;address:string;blockchain:string;accountType:string;state:string};
type WalletAccess={circleUserId?:string;token?:string};
type CircleBalance={amount:string;token:{blockchain:string;symbol?:string;name?:string;tokenAddress?:string;isNative:boolean};updateDate:string};
export function normalizeCircleBalances(values:CircleBalance[]){
 const rows=values.filter(b=>b.token.blockchain===Blockchain.ArcTestnet);
 // Arc's native USDC and its canonical ERC-20 interface share one balance:
 // https://docs.arc.io/arc/references/contract-addresses. Never add both views.
 const hasUsdcInterface=rows.some(b=>b.token.tokenAddress?.toLowerCase()==='0x3600000000000000000000000000000000000000');
 return rows.filter(b=>!(hasUsdcInterface&&b.token.isNative&&b.token.symbol==='USDC')).map(b=>({amount:b.amount,symbol:b.token.symbol||b.token.name||'Token',tokenAddress:b.token.tokenAddress||null,isNative:b.token.isNative,updatedAt:b.updateDate}));
}
export function circleWalletConfiguration(env=process.env){const appId=env.CIRCLE_APP_ID||'',key=env.CIRCLE_API_KEY||'';return {enabled:env.CIRCLE_WALLETS_ENABLED==='true'&&uuid(appId)&&key.startsWith('TEST_API_KEY:'),appId,environment:'testnet' as const};}
export function createCircleWalletService(db:Database,options:{appId:string;client:Provider;reader?:WalletReader;now?:()=>number}){
 const {client,appId}=options,now=options.now||Date.now,flows=new Map<string,Flow>();
 db.run(`CREATE TABLE IF NOT EXISTS circle_wallet_accounts(user_id TEXT NOT NULL,app_id TEXT NOT NULL,circle_user_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,app_id),UNIQUE(app_id,circle_user_id))`);
 db.run(`CREATE TABLE IF NOT EXISTS circle_wallet_initializations(user_id TEXT NOT NULL,app_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,challenge_id TEXT,PRIMARY KEY(user_id,app_id))`);
 const account=(owner:string)=>{const u=db.query('SELECT email,auth_method,google_id,is_demo,merged_into FROM users WHERE id=?').get(owner) as {email:string|null;auth_method:string;google_id:string|null;is_demo:number;merged_into:string|null}|null;
  if(!u||u.is_demo||u.merged_into||!u.email||!u.google_id&&u.auth_method!=='email')throw new CircleWalletError('Sign in with a verified Google or email account to use a Circle wallet.',403);
  return u.email.trim().toLowerCase();};
 function sweep(){for(const [id,f]of flows)if(f.until<=now())flows.delete(id);}
 function flow(owner:string,session:string,id:unknown,connected=false){sweep();const f=typeof id==='string'?flows.get(id):undefined;if(!f||f.owner!==owner||f.session!==session||f.email!==account(owner)||connected&&!f.token)throw new CircleWalletError('Wallet verification session expired. Verify your email again.',401);return f;}
 const credentials=(f:WalletAccess)=>f.token?{userToken:f.token}:{userId:f.circleUserId!};
 async function list(f:WalletAccess):Promise<WalletView[]>{const all:Awaited<ReturnType<Provider['listWallets']>>['data'][]=[];let after:string|undefined;for(let page=0;page<20;page++){
   if(!f.token&&!options.reader)throw new CircleWalletError('Wallet read service unavailable.',503);
   const r=f.token?await client.listWallets({userToken:f.token,blockchain:Blockchain.ArcTestnet,pageSize:50,...after?{pageAfter:after}:{}}):await options.reader!.listWallets({userId:f.circleUserId!,...after?{pageAfter:after}:{}});const wallets=r.data?.wallets||[];all.push(r.data);if(wallets.some(w=>!f.token?w.userId!==f.circleUserId:w.userId&&w.userId!==f.circleUserId))throw new CircleWalletError('Wallet ownership could not be verified.',403);
   if(wallets.length<50)return all.flatMap(d=>d?.wallets||[]).filter(w=>w.blockchain===Blockchain.ArcTestnet&&w.accountType==='EOA').map(w=>({id:w.id,address:w.address,blockchain:w.blockchain,accountType:w.accountType,state:w.state}));
   const next=wallets.at(-1)?.id;if(!next||next===after)throw new CircleWalletError('Wallet pagination could not be verified.',502);after=next;
  }throw new CircleWalletError('Wallet list exceeds the supported review limit.',502);}
 async function readBalances(f:WalletAccess,walletId:string){const response=f.token?await client.getWalletTokenBalance({...credentials(f),walletId,includeAll:false,pageSize:50}):await options.reader!.balances(walletId);return normalizeCircleBalances(response.data?.tokenBalances||[]);}
 return {
  email:account,
  async snapshot(owner:string){account(owner);const linked=db.query('SELECT circle_user_id FROM circle_wallet_accounts WHERE user_id=? AND app_id=?').get(owner,appId) as {circle_user_id:string}|null;
   if(!linked)return {wallets:[],balances:{},balanceErrors:{}};
   const access={circleUserId:linked.circle_user_id},wallets=await list(access);
   const reads=await Promise.all(wallets.map(async wallet=>{try{return {id:wallet.id,balances:await readBalances(access,wallet.id),error:false};}catch{return {id:wallet.id,balances:[],error:true};}}));
   return {wallets,balances:Object.fromEntries(reads.map(r=>[r.id,r.balances])),balanceErrors:Object.fromEntries(reads.map(r=>[r.id,r.error]))};
  },
  async start(owner:string,session:string,deviceId:unknown){if(!uuid(deviceId))throw new CircleWalletError('Invalid wallet device.');const email=account(owner);sweep();if(flows.size>=4096)throw new CircleWalletError('Wallet verification is busy. Try later.',503);
   const r=await client.createDeviceTokenForEmailLogin({deviceId,email,idempotencyKey:randomUUID()});const d=r.data;if(!d?.deviceToken||!d.deviceEncryptionKey||!d.otpToken)throw new CircleWalletError('Circle did not return a complete verification session.',502);
   // This payload comes directly from our authenticated Circle API response, never from the browser.
   let claims:{sub?:string;exp?:number};try{claims=JSON.parse(Buffer.from(d.deviceToken.split('.')[1],'base64url').toString());}catch{throw new CircleWalletError('Circle verification identity is unavailable.',502);}
   if(claims.sub!==deviceId||!Number.isFinite(claims.exp)||claims.exp!*1000<=now())throw new CircleWalletError('Circle verification device is unavailable.',502);
   const id=randomUUID();flows.set(id,{owner,session,email,until:Math.min(now()+15*60_000,claims.exp!*1000)});
   return {flowId:id,deviceToken:d.deviceToken,deviceEncryptionKey:d.deviceEncryptionKey,otpToken:d.otpToken};
  },
  async connect(owner:string,session:string,id:unknown,userToken:unknown){const f=flow(owner,session,id);if(typeof userToken!=='string'||userToken.length<20||userToken.length>16000)throw new CircleWalletError('Invalid Circle session.');
   // A device token identifies the browser, not the end user. Validate the user
   // credential with Circle under this app's API key, then link the two authenticated
   // accounts. Never derive a CARPAN identity or email from client JWT claims.
   const identity=await client.getUserStatus({userToken}),circleUserId=identity.data?.id;
   if(!uuid(circleUserId))throw new CircleWalletError('Circle user identity could not be verified.',403);
   const existing=db.query('SELECT circle_user_id FROM circle_wallet_accounts WHERE user_id=? AND app_id=?').get(owner,appId) as {circle_user_id:string}|null;
   if(existing&&existing.circle_user_id!==circleUserId)throw new CircleWalletError('This account is already linked to a different Circle wallet identity.',409);
   try{db.run('INSERT OR IGNORE INTO circle_wallet_accounts VALUES(?,?,?,?)',[owner,appId,circleUserId,new Date(now()).toISOString()]);}catch{throw new CircleWalletError('Circle identity belongs to another CARPAN account.',409);}
   const linked=db.query('SELECT user_id FROM circle_wallet_accounts WHERE app_id=? AND circle_user_id=?').get(appId,circleUserId) as {user_id:string}|null;if(linked?.user_id!==owner)throw new CircleWalletError('Circle identity belongs to another CARPAN account.',409);
   f.circleUserId=circleUserId;f.token=userToken;return {wallets:await list(f)};
  },
  async wallets(owner:string,session:string,id:unknown){return {wallets:await list(flow(owner,session,id,true))};},
  async status(owner:string,session:string,id:unknown){const f=flow(owner,session,id,true),wallets=await list(f);
   if(wallets.length)return {wallets,challengeId:null,challengeStatus:null,retryable:false};
   const stored=db.query('SELECT challenge_id FROM circle_wallet_initializations WHERE user_id=? AND app_id=?').get(owner,appId) as {challenge_id:string|null}|null;
   if(!stored?.challenge_id)return {wallets,challengeId:null,challengeStatus:null,retryable:true};
   const response=await client.getUserChallenge({userToken:f.token!,challengeId:stored.challenge_id});const challenge=response.data?.challenge;
   if(challenge?.id!==stored.challenge_id)throw new CircleWalletError('Wallet approval status could not be verified.',502);
   return {wallets,challengeId:stored.challenge_id,challengeStatus:challenge.status,retryable:challenge.status==='FAILED'||challenge.status==='EXPIRED'};
  },
  async balances(owner:string,session:string,id:unknown,walletId:unknown){const f=flow(owner,session,id,true);
   const wallet=(await list(f)).find(w=>w.id===walletId);if(!wallet)throw new CircleWalletError('Wallet is not linked to this account.',403);
   return {walletId:wallet.id,balances:await readBalances(f,wallet.id)};
  },
  async initialize(owner:string,session:string,id:unknown){const f=flow(owner,session,id,true),wallets=await list(f);if(wallets.length)return {wallets,challengeId:null};
   const stored=db.query('SELECT idempotency_key,challenge_id FROM circle_wallet_initializations WHERE user_id=? AND app_id=?').get(owner,appId) as {idempotency_key:string;challenge_id:string|null}|null;
   if(stored?.challenge_id){const response=await client.getUserChallenge({userToken:f.token!,challengeId:stored.challenge_id});const challenge=response.data?.challenge;
    if(challenge?.id!==stored.challenge_id)throw new CircleWalletError('Existing wallet approval could not be verified.',502);
    if(challenge.status==='PENDING'||challenge.status==='IN_PROGRESS')return {wallets:[],challengeId:stored.challenge_id};
    if(challenge.status==='COMPLETE')throw new CircleWalletError('Wallet creation is being processed. Refresh wallet status shortly.',409);
    if(challenge.status!=='FAILED'&&challenge.status!=='EXPIRED')throw new CircleWalletError('Existing wallet approval needs review.',409);
    // Only a provider-confirmed terminal failure allows a new idempotency key.
    db.run('DELETE FROM circle_wallet_initializations WHERE user_id=? AND app_id=?',[owner,appId]);return this.initialize(owner,session,id);
   }
   const key=stored?.idempotency_key||randomUUID();if(!stored)db.run('INSERT INTO circle_wallet_initializations VALUES(?,?,?,NULL)',[owner,appId,key]);
   const response=await client.createUserPinWithWallets({userToken:f.token!,blockchains:[Blockchain.ArcTestnet],accountType:'EOA',idempotencyKey:key});const challengeId=response.data?.challengeId;if(!challengeId)throw new CircleWalletError('Circle wallet approval was not returned.',502);
   db.run('UPDATE circle_wallet_initializations SET challenge_id=? WHERE user_id=? AND app_id=?',[challengeId,owner,appId]);return {wallets:[],challengeId};
  },
  close(owner:string,session:string,id:unknown){if(typeof id==='string'){const f=flows.get(id);if(f?.owner===owner&&f.session===session)flows.delete(id);}return {ok:true};},
 };
}
