import {decodeEventLog,erc20Abi,isAddress,parseUnits,zeroAddress,type Hex,type TransactionReceipt} from 'viem';
export const ARC_ASSETS=[
 {symbol:'EURC',address:'0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1',decimals:6},
 {symbol:'cirBTC',address:'0x171a4217b86a807a64eb94757db6849fb4bdbaa0',decimals:8},
] as const;
export type ArcAsset=typeof ARC_ASSETS[number];
export const ARC_ASSET_SOURCE='https://docs.arc.io/arc/references/contract-addresses';
export type AssetTransfer={wallet:Hex;token:Hex;recipient:Hex;raw:string;hash?:Hex;state:'signing'|'pending'|'confirmed'|'failed'|'uncertain';gasRaw18?:string;block?:string};
export function assetPlan(symbol:string,recipient:string,amount:string){
 const asset=ARC_ASSETS.find(a=>a.symbol===symbol);
 if(!asset||!isAddress(recipient)||recipient.toLowerCase()===zeroAddress)throw Error('Invalid asset or recipient.');
 if(!/^\d+(\.\d+)?$/.test(amount)||amount.length>90||(amount.split('.')[1]?.length||0)>asset.decimals)throw Error('Invalid amount or precision.');
 const raw=parseUnits(amount,asset.decimals);if(raw<=0n||raw>=(1n<<256n))throw Error('Invalid amount.');
 return {asset,recipient:recipient.toLowerCase() as Hex,raw};
}
export function assetBudget(tokenBalance:bigint,raw:bigint,usdcGasBalance18:bigint,gas:bigint,maxFee:bigint){
 if(raw<=0n||gas<=0n||maxFee<=0n)throw Error('Invalid transfer budget.');
 const gasLimit=(gas*120n+99n)/100n,gasReserve=gasLimit*maxFee;
 return {gasLimit,gasReserve,ready:tokenBalance>=raw&&usdcGasBalance18>=gasReserve};
}
export function decodeAssetTransfer(value:string|null,wallet:string):AssetTransfer|null{
 if(!value)return null;if(value.length>2500)throw Error('Invalid saved transfer.');
 const r=JSON.parse(value) as AssetTransfer;
 if(!r||r.wallet?.toLowerCase()!==wallet.toLowerCase()||!isAddress(r.wallet)||!isAddress(r.recipient)||r.recipient.toLowerCase()===zeroAddress||!ARC_ASSETS.some(a=>a.address===r.token?.toLowerCase())||!/^\d{1,78}$/.test(r.raw)||BigInt(r.raw)<=0n||BigInt(r.raw)>=(1n<<256n)||!['signing','pending','confirmed','failed','uncertain'].includes(r.state)||r.hash&&!/^0x[0-9a-f]{64}$/i.test(r.hash)||['pending','confirmed','failed'].includes(r.state)&&!r.hash)throw Error('Saved transfer cannot be trusted. Inspect your wallet before sending again.');
 return {...r,token:r.token.toLowerCase() as Hex,state:r.hash?'pending':'uncertain',gasRaw18:undefined,block:undefined};
}
export function verifyAssetTransfer(r:AssetTransfer,receipt:TransactionReceipt){
 if(!r.hash||receipt.transactionHash.toLowerCase()!==r.hash.toLowerCase()||receipt.from.toLowerCase()!==r.wallet.toLowerCase()||receipt.to?.toLowerCase()!==r.token.toLowerCase())throw Error('Transaction does not match this transfer.');
 const gasRaw18=(receipt.gasUsed*receipt.effectiveGasPrice).toString();
 if(receipt.status==='reverted')return {...r,state:'failed' as const,gasRaw18};
 if(receipt.status!=='success')throw Error('Transfer outcome is not confirmed.');
 let total=0n;
 for(const log of receipt.logs){if(log.removed||log.address.toLowerCase()!==r.token.toLowerCase())continue;
  try{const e=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});if(e.eventName==='Transfer'&&e.args.from.toLowerCase()===r.wallet.toLowerCase()&&e.args.to.toLowerCase()===r.recipient.toLowerCase())total+=e.args.value;}catch{/* Unrelated logs never prove a payment. */}
 }
 if(total!==BigInt(r.raw))throw Error('Receipt does not prove the exact recipient and amount.');
 return {...r,state:'confirmed' as const,gasRaw18,block:receipt.blockNumber.toString()};
}
