import {test,expect} from 'bun:test';
import {encodeEventTopics,encodeAbiParameters,erc20Abi,type Hex,type TransactionReceipt} from 'viem';
import {gatewayAmount,gatewayPlan,gatewayNetworks,gatewayNetwork,gatewayKey,gatewayFeesWithin,gatewayFeeTotals,gatewayReceipt,restoreGatewayRecord,GATEWAY_MAINNET_WRITES,type GatewayRecord,type GatewayPlan} from '../src/gateway';
const wallet=('0x'+'11'.repeat(20)) as Hex,recipient=('0x'+'22'.repeat(20)) as Hex,target=('0x'+'33'.repeat(20)) as Hex,hash=('0x'+'aa'.repeat(32)) as Hex;
const plan:GatewayPlan={environment:'testnet',action:'deposit',wallet,recipient:wallet,source:'Arc_Testnet',destination:'Arc_Testnet',amount:'0.1'};
const record:GatewayRecord={version:1,sdkRevision:2,plan,state:'pending',hash,createdAt:Date.now(),minBlock:'10'};
function receipt(to=target,from=wallet,amount=100000n):TransactionReceipt{return {transactionHash:hash,status:'success',blockNumber:11n,gasUsed:10n,effectiveGasPrice:20n,logs:[{address:gatewayNetwork('Arc_Testnet','testnet').usdc,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[amount])}]} as unknown as TransactionReceipt;}

test('Gateway preserves USDC precision and separates live networks from tests',()=>{
 expect(gatewayAmount('0.000001')).toBe(1n);expect(gatewayAmount('0',true)).toBe(0n);
 for(const amount of ['0','-1','0.0000001','1e6','1,5','01','Infinity',(1n<<256n).toString()])expect(()=>gatewayAmount(amount)).toThrow();
 expect(gatewayNetworks('testnet')).toHaveLength(4);expect(gatewayNetworks('mainnet')).toHaveLength(4);
 expect(()=>gatewayPlan({...plan,source:'Arc'})).toThrow();expect(()=>gatewayPlan({...plan,recipient})).toThrow();expect(()=>gatewayPlan({...plan,destination:'Base_Sepolia'})).toThrow();
 expect(()=>gatewayPlan({...plan,action:'spend',recipient:('0x'+'0'.repeat(40)) as Hex})).toThrow();
 expect(gatewayKey(wallet,'mainnet')).not.toBe(gatewayKey(wallet,'testnet'));expect(GATEWAY_MAINNET_WRITES).toBe(false);
});
test('fee review tracks tokens independently and rejects newly introduced or increased fees',()=>{
 const fees=[{type:'gasFee',token:'ETH',amount:'0.00001'},{type:'provider',token:'USDC',amount:'0.01'}];
 expect(gatewayFeesWithin(fees,fees)).toBe(true);
 expect(gatewayFeesWithin([{...fees[0],amount:'0.00002'}],fees)).toBe(false);
 expect(gatewayFeesWithin([{type:'gasFee',token:'USDC',amount:'0.02'}],fees)).toBe(false);
 expect(gatewayFeesWithin([{type:'provider',token:'EURC',amount:'0.01'}],fees)).toBe(false);
 expect(()=>gatewayFeeTotals([{type:'gasFee',token:'ETH',amount:'-1'}])).toThrow();
});
test('success requires exact USDC evidence, rejects old and removed logs and keeps a failed destination unresolved',()=>{
 const token=gatewayNetwork('Arc_Testnet','testnet').usdc,ok=receipt();
 expect(gatewayReceipt(record,ok,token,target)).toMatchObject({state:'confirmed',received:'0.1',gas:'0.0000000000000002'});
 for(const bad of [receipt(target,wallet,99999n),receipt(recipient),{...ok,transactionHash:'0x'+'bb'.repeat(32)},{...ok,blockNumber:9n},{...ok,logs:ok.logs.map(l=>({...l,removed:true}))},{...ok,logs:[...ok.logs,...ok.logs]}])expect(()=>gatewayReceipt(record,bad as TransactionReceipt,token,target)).toThrow();
 expect(gatewayReceipt(record,{...ok,status:'reverted'},token,target).state).toBe('failed');
 const spend={...record,plan:{...plan,action:'spend' as const,recipient}};
 expect(gatewayReceipt(spend,receipt(recipient),token,target).state).toBe('confirmed');
 expect(gatewayReceipt(spend,{...ok,status:'reverted'},token,target).state).toBe('uncertain');
});
test('reload never clears an uncertain operation or trusts a cached completion',()=>{
 expect(restoreGatewayRecord(JSON.stringify({...record,state:'confirmed'}),wallet,'testnet')?.state).toBe('pending');
 expect(restoreGatewayRecord(JSON.stringify({...record,state:'signing',hash:undefined}),wallet,'testnet')?.state).toBe('uncertain');
 expect(restoreGatewayRecord(JSON.stringify({...record,sdkRevision:undefined,state:'uncertain',hash:undefined}),wallet,'testnet')?.state).toBe('not-submitted');
 expect(restoreGatewayRecord(JSON.stringify({...record,sdkRevision:undefined}),wallet,'testnet')?.state).toBe('pending');
 for(const patch of [{version:2},{createdAt:0},{minBlock:undefined},{state:'done'},{hash:'0x123'}])expect(()=>restoreGatewayRecord(JSON.stringify({...record,...patch}),wallet,'testnet')).toThrow();
 expect(()=>restoreGatewayRecord(JSON.stringify(record),recipient,'testnet')).toThrow();expect(()=>restoreGatewayRecord(JSON.stringify(record),wallet,'mainnet')).toThrow();
});
