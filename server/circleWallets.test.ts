import {describe,it,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {circleWalletConfiguration,createCircleWalletService,CircleWalletError,normalizeCircleBalances} from './circleWallets';

const appId=randomUUID(),subject=randomUUID(),deviceId=randomUUID(),token='valid-test-user-token-0123456789';
const deviceToken=`x.${Buffer.from(JSON.stringify({sub:deviceId,exp:Math.floor(Date.now()/1000)+900})).toString('base64url')}.x`;
function setup(){
 const db=new Database(':memory:');db.run('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,auth_method TEXT,google_id TEXT,is_demo INTEGER,merged_into TEXT)');
 db.run("INSERT INTO users VALUES('a','a@example.com','google','google-a',0,NULL),('b','b@example.com','email',NULL,0,NULL),('unverified','u@example.com','wallet',NULL,0,NULL),('demo','d@example.com','email',NULL,1,NULL)");
 const calls:{email:string;initializations:number;wallets:any[];challengeStatus:string;balanceRequests:string[]}={email:'',initializations:0,wallets:[],challengeStatus:'PENDING',balanceRequests:[]};
 const client={
  createDeviceTokenForEmailLogin:async(input:{email:string})=>{calls.email=input.email;return {data:{deviceToken,deviceEncryptionKey:'encrypted',otpToken:'otp'}};},
  getUserStatus:async()=>({data:{id:subject}}),
  listWallets:async()=>({data:{wallets:calls.wallets}}),
  createUserPinWithWallets:async()=>{calls.initializations++;return {data:{challengeId:'challenge-1'}};},
  getUserChallenge:async()=>({data:{challenge:{id:'challenge-1',status:calls.challengeStatus}}}),
  getWalletTokenBalance:async(input:{walletId:string})=>{calls.balanceRequests.push(input.walletId);return {data:{tokenBalances:[{amount:'0.1',token:{blockchain:'ARC-TESTNET',symbol:'USDC',isNative:true},updateDate:'2026-11-03T00:00:00Z'},{amount:'9',token:{blockchain:'ETH-SEPOLIA',symbol:'TEST',isNative:false},updateDate:'2026-11-03T00:00:00Z'}]}};},
 };
 const service=createCircleWalletService(db,{appId,client:client as any,reader:{listWallets:async()=>client.listWallets() as any,balances:async walletId=>client.getWalletTokenBalance({walletId}) as any}});return {db,calls,client,service};
}
describe('Circle wallet account and challenge boundaries',()=>{
 it('shows Arc USDC once without merging unrelated tokens or losing amount precision',()=>{
  const row=(amount:string,isNative:boolean,tokenAddress?:string)=>({amount,token:{blockchain:'ARC-TESTNET',symbol:'USDC',isNative,tokenAddress},updateDate:'2026-11-03T00:00:00Z'});
  const native=row('40',true),canonical=row('40.000001',false,'0x3600000000000000000000000000000000000000'),other=row('2',false,'0x'+'1'.repeat(40));
  expect(normalizeCircleBalances([native,canonical,other]).map(b=>b.amount)).toEqual(['40.000001','2']);
  expect(normalizeCircleBalances([native,other]).map(b=>b.amount)).toEqual(['40','2']);
 });
 it('restores only the linked account wallet after the Circle flow is closed',async()=>{const {db,service,calls}=setup();try{
  const flow=await service.start('a','s',deviceId);await service.connect('a','s',flow.flowId,token);
  calls.wallets.push({id:'wallet-1',address:'0x'+'1'.repeat(40),blockchain:'ARC-TESTNET',accountType:'EOA',state:'LIVE',userId:subject});
  service.close('a','s',flow.flowId);
  expect((await service.snapshot('a')).wallets).toHaveLength(1);
  expect((await service.snapshot('a')).balances['wallet-1']).toMatchObject([{amount:'0.1',symbol:'USDC'}]);
  expect(await service.snapshot('b')).toMatchObject({wallets:[],balances:{}});
  expect(calls.initializations).toBe(0);
  calls.wallets[0].userId=randomUUID();
  await expect(service.snapshot('a')).rejects.toMatchObject({status:403});
 }finally{db.close();}});
 it('links the provider user rather than treating the device subject as a user',async()=>{const {db,service,client}=setup();try{
  expect(subject).not.toBe(deviceId);
  const flow=await service.start('a','s',deviceId);await service.connect('a','s',flow.flowId,token);
  expect(db.query('SELECT circle_user_id FROM circle_wallet_accounts WHERE user_id=?').get('a')).toMatchObject({circle_user_id:subject});
  client.getUserStatus=async()=>({data:{id:randomUUID()}});
  await expect(service.connect('a','s',flow.flowId,token)).rejects.toMatchObject({status:409});
 }finally{db.close();}});
 it('does not bind identities when Circle rejects the user credential',async()=>{const {db,service,client}=setup();try{
  const flow=await service.start('a','s',deviceId);client.getUserStatus=async()=>{throw Error('Provider rejected credential');};
  await expect(service.connect('a','s',flow.flowId,token)).rejects.toThrow('Provider rejected credential');
  expect(db.query('SELECT COUNT(*) AS n FROM circle_wallet_accounts').get()).toMatchObject({n:0});
  await expect(service.wallets('a','s',flow.flowId)).rejects.toMatchObject({status:401});
 }finally{db.close();}});
 it('requires explicit testnet configuration',()=>{
  expect(circleWalletConfiguration({CIRCLE_WALLETS_ENABLED:'true',CIRCLE_APP_ID:appId,CIRCLE_API_KEY:'TEST_API_KEY:abc'} as NodeJS.ProcessEnv).enabled).toBe(true);
  for(const patch of [{CIRCLE_WALLETS_ENABLED:'false'},{CIRCLE_API_KEY:'LIVE_API_KEY:abc'},{CIRCLE_APP_ID:'bad'}])expect(circleWalletConfiguration({...{CIRCLE_WALLETS_ENABLED:'true',CIRCLE_APP_ID:appId,CIRCLE_API_KEY:'TEST_API_KEY:abc'},...patch} as NodeJS.ProcessEnv).enabled).toBe(false);
 });
 it('derives the verified email from CARPAN and isolates owner and browser session',async()=>{const {db,calls,service}=setup();try{
  expect(()=>service.email('unverified')).toThrow(CircleWalletError);expect(()=>service.email('demo')).toThrow(CircleWalletError);
  const flow=await service.start('a','session-a',deviceId);expect(calls.email).toBe('a@example.com');
  await expect(service.connect('b','session-a',flow.flowId,token)).rejects.toMatchObject({status:401});
  await expect(service.connect('a','session-b',flow.flowId,token)).rejects.toMatchObject({status:401});
  await service.connect('a','session-a',flow.flowId,token);
  await expect(service.initialize('a','session-b',flow.flowId)).rejects.toMatchObject({status:401});
  db.run("UPDATE users SET email='changed@example.com' WHERE id='a'");
  await expect(service.wallets('a','session-a',flow.flowId)).rejects.toMatchObject({status:401});
 }finally{db.close();}});
 it('requires a provider-validated identity and prevents another account binding',async()=>{const {db,client,service}=setup();try{
  const first=await service.start('a','s',deviceId);
  client.getUserStatus=async()=>({data:{id:''}});
  await expect(service.connect('a','s',first.flowId,token)).rejects.toMatchObject({status:403});
  client.getUserStatus=async()=>({data:{id:subject}});await service.connect('a','s',first.flowId,token);
  const second=await service.start('b','s2',deviceId);
  await expect(service.connect('b','s2',second.flowId,token)).rejects.toMatchObject({status:409});
 }finally{db.close();}});
 it('does not duplicate an in-flight initialization or an existing wallet',async()=>{const {db,calls,service}=setup();try{
  const flow=await service.start('a','s',deviceId);await service.connect('a','s',flow.flowId,token);
  expect((await service.initialize('a','s',flow.flowId)).challengeId).toBe('challenge-1');
  expect((await service.initialize('a','s',flow.flowId)).challengeId).toBe('challenge-1');expect(calls.initializations).toBe(1);
  calls.wallets.push({id:'wallet-1',address:'0x'+'1'.repeat(40),blockchain:'ARC-TESTNET',accountType:'EOA',state:'LIVE',userId:subject});
  const found=await service.initialize('a','s',flow.flowId);expect(found.challengeId).toBeNull();expect(found.wallets).toHaveLength(1);expect(calls.initializations).toBe(1);
 }finally{db.close();}});
 it('reports a failed challenge and only retries after Circle confirms failure',async()=>{const {db,calls,service}=setup();try{
  const flow=await service.start('a','s',deviceId);await service.connect('a','s',flow.flowId,token);
  await service.initialize('a','s',flow.flowId);
  expect(await service.status('a','s',flow.flowId)).toMatchObject({challengeStatus:'PENDING',retryable:false});
  calls.challengeStatus='FAILED';
  expect(await service.status('a','s',flow.flowId)).toMatchObject({challengeStatus:'FAILED',retryable:true});
  await service.initialize('a','s',flow.flowId);
  expect(calls.initializations).toBe(2);
 }finally{db.close();}});
 it('only reads balances for a wallet owned by the verified Circle session',async()=>{const {db,calls,service}=setup();try{
  const flow=await service.start('a','s',deviceId);await service.connect('a','s',flow.flowId,token);
  await expect(service.balances('a','s',flow.flowId,'unknown')).rejects.toMatchObject({status:403});
  expect(calls.balanceRequests).toHaveLength(0);
  calls.wallets.push({id:'wallet-1',address:'0x'+'1'.repeat(40),blockchain:'ARC-TESTNET',accountType:'EOA',state:'LIVE',userId:subject});
  expect(await service.balances('a','s',flow.flowId,'wallet-1')).toMatchObject({walletId:'wallet-1',balances:[{amount:'0.1',symbol:'USDC'}]});
  expect(calls.balanceRequests).toEqual(['wallet-1']);
 }finally{db.close();}});
});
