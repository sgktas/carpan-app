import {test,expect} from 'bun:test';
import {encodeAbiParameters,encodeEventTopics,type Hex,type TransactionReceipt} from 'viem';
import {CCTP_ABI,addressBytes32,factFor,inspectRecovery,irisUrl,parseCctpMessage,receiveRequest,sourceBurns,verifyDelivery,type RecoveryIo} from '../src/bridge-recovery';

const arc=factFor('mainnet',5042)!,arbitrum=factFor('mainnet',42161)!;
const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222';
const hash=('0x'+'ab'.repeat(32)) as Hex,nonce=('0x'+'cd'.repeat(32)) as Hex,zero=('0x'+'0'.repeat(64)) as Hex;
const u=(value:bigint|number,bytes:number)=>BigInt(value).toString(16).padStart(bytes*2,'0');
const w=(value:Hex)=>value.slice(2);
function message({src=arc,dst=arbitrum,n=zero,amount=1_000_000n,fee=0n,caller=zero,to=recipient,token=src.usdc}:{src?:typeof arc;dst?:typeof arc;n?:Hex;amount?:bigint;fee?:bigint;caller?:Hex;to?:string;token?:string}={}):Hex{
 const body=u(1,4)+w(addressBytes32(token))+w(addressBytes32(to))+u(amount,32)+w(addressBytes32(wallet))+u(500,32)+u(fee,32)+u(0,32);
 return ('0x'+u(1,4)+u(src.domain,4)+u(dst.domain,4)+w(n)+w(addressBytes32(src.tokenMessenger))+w(addressBytes32(dst.tokenMessenger))+w(caller)+u(1000,4)+u(0,4)+body) as Hex;
}
function sentLog(msg:Hex,address:string=arc.messageTransmitter){return {address,topics:encodeEventTopics({abi:CCTP_ABI,eventName:'MessageSent'}),data:encodeAbiParameters([{type:'bytes'}],[msg])};}
const receipt=(logs:unknown[],status:'success'|'reverted'='success')=>({status,logs,transactionHash:hash}) as unknown as TransactionReceipt;
function io(over:Partial<{logs:unknown[];iris:{status:number;body:unknown};used:bigint}>={}):RecoveryIo&{calls:string[]}{
 const calls:string[]=[];
 return {calls,receipt:async()=>receipt(over.logs??[sentLog(message())]),iris:async url=>{calls.push(url);return over.iris??{status:200,body:{messages:[{message:message({n:nonce,fee:100n}),attestation:'0x'+'ee'.repeat(65),status:'complete',eventNonce:nonce}]}};},usedNonce:async()=>over.used??0n};
}

test('parses the CCTP V2 header and burn body',()=>{
 const p=parseCctpMessage(message({n:nonce,amount:42n,fee:7n}));
 expect(p.sourceDomain).toBe(26);expect(p.destinationDomain).toBe(3);expect(p.nonce).toBe(nonce);expect(p.body.amount).toBe(42n);expect(p.body.feeExecuted).toBe(7n);
 expect(()=>parseCctpMessage('0x01')).toThrow();
});

test('only reviewed transmitter + token messenger + USDC burns count as source evidence',()=>{
 expect(sourceBurns(receipt([sentLog(message())]),arc,'mainnet')).toHaveLength(1);
 expect(()=>sourceBurns(receipt([sentLog(message(),'0x9999999999999999999999999999999999999999')]),arc,'mainnet')).toThrow();
 expect(()=>sourceBurns(receipt([sentLog(message({token:'0x3333333333333333333333333333333333333333'}))]),arc,'mainnet')).toThrow();
 expect(()=>sourceBurns(receipt([sentLog(message())],'reverted'),arc,'mainnet')).toThrow();
});

test('attested and unused message is ready; the Iris URL uses the source domain',async()=>{
 const fake=io();const [item]=await inspectRecovery('mainnet',5042,hash,fake);
 expect(item.state).toBe('ready');expect(item.nonce).toBe(nonce);expect(item.feeExecuted).toBe(100n);expect(item.recipient).toBe(recipient);
 expect(fake.calls[0]).toBe(irisUrl('mainnet',26,hash));expect(fake.calls[0]).toStartWith('https://iris-api.circle.com/v2/messages/26?transactionHash=');
 const request=receiveRequest(item,wallet);expect(request.chainId).toBe(42161);expect(request.address).toBe(arbitrum.messageTransmitter);expect(request.functionName).toBe('receiveMessage');
});

test('used nonce is delivered and cannot be submitted again',async()=>{
 const [item]=await inspectRecovery('mainnet',5042,hash,io({used:1n}));
 expect(item.state).toBe('delivered');expect(()=>receiveRequest(item,wallet)).toThrow();
});

test('pending or missing attestation waits; a complete message with other routing is never offered',async()=>{
 expect((await inspectRecovery('mainnet',5042,hash,io({iris:{status:404,body:{}}})))[0].state).toBe('awaiting_attestation');
 expect((await inspectRecovery('mainnet',5042,hash,io({iris:{status:200,body:{messages:[{status:'pending_confirmations',attestation:'PENDING',delayReason:'insufficient_fee'}]}}})))[0].delayReason).toBe('insufficient_fee');
 const forged=message({n:nonce,to:'0x4444444444444444444444444444444444444444'});
 const [item]=await inspectRecovery('mainnet',5042,hash,io({iris:{status:200,body:{messages:[{message:forged,attestation:'0x'+'ee'.repeat(65),status:'complete'}]}}}));
 expect(item.state).toBe('mismatch');expect(()=>receiveRequest(item,wallet)).toThrow();
 await expect(inspectRecovery('mainnet',5042,hash,io({iris:{status:503,body:{}}}))).rejects.toThrow('503');
});

test('a destination caller restriction is honoured',async()=>{
 const caller=addressBytes32('0x5555555555555555555555555555555555555555');
 const fake=io({logs:[sentLog(message({caller}))],iris:{status:200,body:{messages:[{message:message({caller,n:nonce}),attestation:'0x'+'ee'.repeat(65),status:'complete'}]}}});
 const [item]=await inspectRecovery('mainnet',5042,hash,fake);
 expect(()=>receiveRequest(item,wallet)).toThrow('0x5555');
 expect(receiveRequest(item,'0x5555555555555555555555555555555555555555').functionName).toBe('receiveMessage');
});

test('testnet and mainnet registries are never mixed, and bad input is rejected early',async()=>{
 await expect(inspectRecovery('testnet',5042,hash,io())).rejects.toThrow();
 await expect(inspectRecovery('mainnet',5042,'0x123',io())).rejects.toThrow();
});

test('delivery is confirmed only by MessageReceived for the same nonce from the reviewed transmitter',async()=>{
 const [item]=await inspectRecovery('mainnet',5042,hash,io());
 const received=(n:Hex,address:string=arbitrum.messageTransmitter)=>({address,topics:encodeEventTopics({abi:CCTP_ABI,eventName:'MessageReceived',args:{caller:wallet,nonce:n,finalityThresholdExecuted:1000}}),data:encodeAbiParameters([{type:'uint32'},{type:'bytes32'},{type:'bytes'}],[26,addressBytes32(arc.tokenMessenger),'0x00'])});
 expect(verifyDelivery(item,receipt([received(nonce)]))).toBe(true);
 expect(verifyDelivery(item,receipt([received(('0x'+'11'.repeat(32)) as Hex)]))).toBe(false);
 expect(verifyDelivery(item,receipt([received(nonce,'0x9999999999999999999999999999999999999999')]))).toBe(false);
 expect(verifyDelivery(item,receipt([received(nonce)],'reverted'))).toBe(false);
});
