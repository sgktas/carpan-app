import {test,expect} from 'bun:test';
import {encodeEventTopics,encodeAbiParameters,erc20Abi,type Hex,type TransactionReceipt} from 'viem';
import {ARC_ASSETS,assetPlan,assetBudget,decodeAssetTransfer,verifyAssetTransfer,type AssetTransfer} from '../src/arc-asset-transfers';
const wallet=('0x'+'11'.repeat(20)) as Hex,recipient=('0x'+'22'.repeat(20)) as Hex,hash=('0x'+'aa'.repeat(32)) as Hex;
test('official token precision keeps EURC and cirBTC separate and rejects truncated transfers',()=>{
 expect(assetPlan('EURC',recipient,'1.000001').raw).toBe(1000001n);
 expect(assetPlan('cirBTC',recipient,'0.00000001').raw).toBe(1n);
 for(const [symbol,amount] of [['EURC','0.0000001'],['cirBTC','0.000000001'],['cirBTC','0'],['EURC','1e3'],['USDC','1']])expect(()=>assetPlan(symbol,recipient,amount)).toThrow();
 expect(()=>assetPlan('EURC','0x'+'0'.repeat(40),'1')).toThrow();
});
test('asset balance never pays USDC gas; USDC gas never pays asset amount',()=>{
 expect(assetBudget(100n,100n,1200n,10n,100n)).toMatchObject({ready:true,gasReserve:1200n});
 expect(assetBudget(99n,100n,999999999n,10n,100n).ready).toBe(false);
 expect(assetBudget(999999999n,100n,1199n,10n,100n).ready).toBe(false);
});
function evidence(token:Hex,amount=100n):TransactionReceipt{return {status:'success',transactionHash:hash,from:wallet,to:token,gasUsed:5n,effectiveGasPrice:20n,blockNumber:3n,logs:[{address:token,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:wallet,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[amount])}]} as unknown as TransactionReceipt;}
test('receipt requires exact token, recipient and amount, preserves failed gas and rejects spoofed/removed evidence',()=>{
 for(const a of ARC_ASSETS){const r:AssetTransfer={wallet,recipient,token:a.address,raw:'100',hash,state:'pending'},receipt=evidence(a.address);
  expect(verifyAssetTransfer(r,receipt)).toMatchObject({state:'confirmed',gasRaw18:'100',raw:'100',block:'3'});
  expect(verifyAssetTransfer(r,{...receipt,status:'reverted'})).toMatchObject({state:'failed',gasRaw18:'100'});
  expect(()=>verifyAssetTransfer(r,evidence(a.address,99n))).toThrow();
  expect(()=>verifyAssetTransfer({...r,recipient:wallet},receipt)).toThrow();
  expect(()=>verifyAssetTransfer(r,{...receipt,to:recipient})).toThrow();
  expect(()=>verifyAssetTransfer(r,{...receipt,logs:receipt.logs.map(l=>({...l,removed:true}))})).toThrow();
  expect(()=>verifyAssetTransfer(r,{...receipt,logs:[...receipt.logs,...receipt.logs]})).toThrow();
 }
});
test('refresh preserves unresolved submissions and rechecks previously claimed confirmations',()=>{
 const r:AssetTransfer={wallet,recipient,token:ARC_ASSETS[0].address,raw:'1',state:'signing'};
 expect(decodeAssetTransfer(JSON.stringify(r),wallet)?.state).toBe('uncertain');
 expect(decodeAssetTransfer(JSON.stringify({...r,state:'confirmed',hash}),wallet)?.state).toBe('pending');
 for(const patch of [{wallet:recipient},{token:recipient},{recipient:'0x'+'0'.repeat(40)},{raw:'-1'},{state:'pending'},{raw:(1n<<256n).toString()}])expect(()=>decodeAssetTransfer(JSON.stringify({...r,...patch}),wallet)).toThrow();
});
