/* carpan-localized */
import {t} from './i18n/index';
import {decodeEventLog,parseAbi,keccak256,toHex,type Hex,type TransactionReceipt} from 'viem';
import {BRIDGE_NETWORK_FACTS,type BridgeNetworkFact} from './bridge-networks';

/**
 * Hash-based CCTP V2 recovery. Works without a Carpan record: the source receipt, the reviewed
 * contracts and Circle's attestation are the only evidence. Nothing here signs or sends; the
 * destination call is made by the user's own wallet after an explicit review.
 */
export const CCTP_ABI=parseAbi([
 'event MessageSent(bytes message)',
 'event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)',
 'function usedNonces(bytes32 nonce) view returns (uint256)',
 'function receiveMessage(bytes message, bytes attestation) returns (bool)',
]);
export const MESSAGE_SENT_TOPIC=keccak256(toHex('MessageSent(bytes)'));
export type BridgeEnvironment='testnet'|'mainnet';
export const IRIS_HOSTS:Record<BridgeEnvironment,string>={mainnet:'https://iris-api.circle.com',testnet:'https://iris-api-sandbox.circle.com'};

export type CctpMessage={version:number;sourceDomain:number;destinationDomain:number;nonce:Hex;sender:Hex;recipient:Hex;destinationCaller:Hex;minFinalityThreshold:number;finalityThresholdExecuted:number;
 body:{version:number;burnToken:Hex;mintRecipient:Hex;amount:bigint;messageSender:Hex;maxFee:bigint;feeExecuted:bigint;expirationBlock:bigint}};

const ZERO32=('0x'+'0'.repeat(64)) as Hex;
function slice(bytes:string,start:number,end:number){if(bytes.length<end*2)throw new Error(t('CCTP mesajı beklenenden kısa.'));return bytes.slice(start*2,end*2);}
const word=(bytes:string,start:number)=>('0x'+slice(bytes,start,start+32)) as Hex;
const uint=(bytes:string,start:number,size:number)=>BigInt('0x'+slice(bytes,start,start+size));
/** A bytes32 that holds a left-padded EVM address. */
export function bytes32Address(value:Hex){const v=value.toLowerCase();return /^0x0{24}[0-9a-f]{40}$/.test(v)?('0x'+v.slice(26)) as Hex:null;}
export const addressBytes32=(address:string)=>('0x'+address.toLowerCase().replace(/^0x/,'').padStart(64,'0')) as Hex;

/** CCTP V2 header (148 bytes) followed by a BurnMessageV2 body (228 bytes before hook data). */
export function parseCctpMessage(message:Hex):CctpMessage{
 if(!/^0x[0-9a-f]*$/i.test(message)||message.length%2)throw new Error(t('CCTP mesajı geçersiz.'));
 const m=message.slice(2).toLowerCase(),b=m.slice(148*2);
 const parsed:CctpMessage={version:Number(uint(m,0,4)),sourceDomain:Number(uint(m,4,4)),destinationDomain:Number(uint(m,8,4)),nonce:word(m,12),sender:word(m,44),recipient:word(m,76),destinationCaller:word(m,108),minFinalityThreshold:Number(uint(m,140,4)),finalityThresholdExecuted:Number(uint(m,144,4)),
  body:{version:Number(uint(b,0,4)),burnToken:word(b,4),mintRecipient:word(b,36),amount:uint(b,68,32),messageSender:word(b,100),maxFee:uint(b,132,32),feeExecuted:uint(b,164,32),expirationBlock:uint(b,196,32)}};
 if(parsed.version!==1||parsed.body.version!==1)throw new Error(t('Yalnızca CCTP V2 USDC transferleri desteklenir.'));
 return parsed;
}

export function factFor(environment:BridgeEnvironment,chainId:number){return BRIDGE_NETWORK_FACTS.find(f=>f.id===chainId&&f.testnet===(environment==='testnet'))||null;}
export function factForDomain(environment:BridgeEnvironment,domain:number){return BRIDGE_NETWORK_FACTS.find(f=>f.domain===domain&&f.testnet===(environment==='testnet'))||null;}

export type SourceBurn={index:number;message:Hex;parsed:CctpMessage;source:BridgeNetworkFact;destination:BridgeNetworkFact|null;recipient:Hex|null;amount:bigint};
/** Accepts only messages emitted by the reviewed MessageTransmitter for a USDC burn from the reviewed TokenMessenger. */
export function sourceBurns(receipt:Pick<TransactionReceipt,'status'|'logs'|'transactionHash'>,source:BridgeNetworkFact,environment:BridgeEnvironment):SourceBurn[]{
 if(receipt.status!=='success')throw new Error(t('Kaynak işlem başarısız; köprülenecek USDC yok.'));
 const burns:SourceBurn[]=[];
 for(const log of receipt.logs){
  if(log.address.toLowerCase()!==source.messageTransmitter.toLowerCase()||log.topics[0]?.toLowerCase()!==MESSAGE_SENT_TOPIC)continue;
  let message:Hex;try{message=(decodeEventLog({abi:CCTP_ABI,data:log.data,topics:log.topics}).args as {message:Hex}).message;}catch{continue;}
  const parsed=parseCctpMessage(message);
  if(parsed.sourceDomain!==source.domain||parsed.sender!==addressBytes32(source.tokenMessenger)||parsed.body.burnToken!==addressBytes32(source.usdc))continue;
  const destination=factForDomain(environment,parsed.destinationDomain);
  // A destination outside the reviewed registry (e.g. Solana) is shown but cannot be completed here.
  if(destination&&parsed.recipient!==addressBytes32(destination.tokenMessenger))continue;
  burns.push({index:burns.length,message,parsed,source,destination,recipient:bytes32Address(parsed.body.mintRecipient),amount:parsed.body.amount});
 }
 if(!burns.length)throw new Error(t('Bu işlemde incelenmiş Circle sözleşmelerinden çıkan bir CCTP V2 USDC gönderimi bulunamadı.'));
 return burns;
}

export type IrisMessage={message:Hex|null;attestation:Hex|null;status:'complete'|'pending';eventNonce:Hex|null;delayReason:string|null};
export function irisUrl(environment:BridgeEnvironment,domain:number,hash:string){return `${IRIS_HOSTS[environment]}/v2/messages/${domain}?transactionHash=${hash}`;}
const hex=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]*$/i.test(v)&&v.length%2===0&&v.length>2?v as Hex:null;
export function parseIris(payload:unknown):IrisMessage[]{
 const list=payload&&typeof payload==='object'&&Array.isArray((payload as {messages?:unknown}).messages)?(payload as {messages:unknown[]}).messages:[];
 return list.slice(0,20).map(item=>{const v=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;const attestation=hex(v.attestation),message=hex(v.message);
  return {message,attestation,status:v.status==='complete'&&attestation&&message?'complete':'pending',eventNonce:hex(v.eventNonce),delayReason:typeof v.delayReason==='string'?v.delayReason.slice(0,120):null};});
}
/** Circle's final message fills nonce/fee/expiry; every routing and amount field must match the source event. */
export function matchesSource(burn:SourceBurn,iris:IrisMessage){
 if(!iris.message)return false;let final:CctpMessage;try{final=parseCctpMessage(iris.message);}catch{return false;}
 const a=burn.parsed,b=final;
 return a.sourceDomain===b.sourceDomain&&a.destinationDomain===b.destinationDomain&&a.sender===b.sender&&a.recipient===b.recipient&&a.destinationCaller===b.destinationCaller&&a.body.burnToken===b.body.burnToken&&a.body.mintRecipient===b.body.mintRecipient&&a.body.amount===b.body.amount&&a.body.messageSender===b.body.messageSender&&b.nonce!==ZERO32;
}

export type RecoveryState='awaiting_attestation'|'ready'|'delivered'|'unsupported_destination'|'mismatch';
export type RecoveryItem=SourceBurn&{state:RecoveryState;iris:IrisMessage|null;nonce:Hex|null;feeExecuted:bigint|null;destinationCaller:Hex|null;delayReason:string|null};
export type RecoveryIo={receipt:(chainId:number,hash:Hex)=>Promise<TransactionReceipt>;iris:(url:string)=>Promise<{status:number;body:unknown}>;usedNonce:(chainId:number,transmitter:Hex,nonce:Hex)=>Promise<bigint>};

export function validRecoveryHash(value:string){return /^0x[0-9a-f]{64}$/i.test(value.trim())?value.trim().toLowerCase() as Hex:null;}
export async function inspectRecovery(environment:BridgeEnvironment,sourceChainId:number,hashInput:string,io:RecoveryIo):Promise<RecoveryItem[]>{
 const hash=validRecoveryHash(hashInput);if(!hash)throw new Error(t('Geçerli bir kaynak işlem hash’i gir.'));
 const source=factFor(environment,sourceChainId);if(!source)throw new Error(t('Bu ortamda desteklenen bir kaynak ağ seç.'));
 let receipt:TransactionReceipt;
 try{receipt=await io.receipt(source.id,hash);}catch{throw new Error(t('{0} üzerinde bu hash için işlem makbuzu bulunamadı. Ağı ve hash’i kontrol et.',[source.name]));}
 const burns=sourceBurns(receipt,source,environment);
 const response=await io.iris(irisUrl(environment,source.domain,hash));
 const messages=response.status===404?[]:response.status>=200&&response.status<300?parseIris(response.body):null;
 if(messages===null)throw new Error(t('Circle tasdik servisi şu anda yanıt vermiyor (HTTP {0}). Daha sonra yeniden dene.',[response.status]));
 const items:RecoveryItem[]=[];
 for(const burn of burns){
  const base={...burn,iris:null,nonce:null,feeExecuted:null,destinationCaller:bytes32Address(burn.parsed.destinationCaller),delayReason:null};
  if(!burn.destination){items.push({...base,state:'unsupported_destination'});continue;}
  const candidate=messages.find(m=>m.status==='complete'&&matchesSource(burn,m));
  if(!candidate){const pending=messages.find(m=>m.status==='pending');
   // A complete Circle message that does not match the source event is never offered for signing.
   const conflicting=messages.length>0&&messages.every(m=>m.status==='complete');
   items.push({...base,state:conflicting?'mismatch':'awaiting_attestation',iris:pending||null,delayReason:pending?.delayReason||null});continue;}
  const final=parseCctpMessage(candidate.message!);
  const used=await io.usedNonce(burn.destination.id,burn.destination.messageTransmitter,final.nonce);
  items.push({...base,state:used>0n?'delivered':'ready',iris:candidate,nonce:final.nonce,feeExecuted:final.body.feeExecuted,delayReason:null});
 }
 return items;
}

/** The destination call is allowed only for the reviewed transmitter, and only if Circle restricted no other caller. */
export function receiveRequest(item:RecoveryItem,wallet:string){
 if(item.state!=='ready'||!item.destination||!item.iris?.message||!item.iris.attestation)throw new Error(t('Bu transfer hedefte tamamlanmaya hazır değil.'));
 if(item.parsed.destinationCaller!==ZERO32&&item.destinationCaller?.toLowerCase()!==wallet.toLowerCase())throw new Error(t('Bu mesajı yalnızca {0} adresi hedefte tamamlayabilir.',[item.destinationCaller||'—']));
 return {chainId:item.destination.id,address:item.destination.messageTransmitter,abi:CCTP_ABI,functionName:'receiveMessage' as const,args:[item.iris.message,item.iris.attestation] as const};
}
/** Success means: successful destination receipt, a MessageReceived for this exact nonce from the reviewed transmitter. */
export function verifyDelivery(item:RecoveryItem,receipt:Pick<TransactionReceipt,'status'|'logs'>){
 if(receipt.status!=='success'||!item.destination||!item.nonce)return false;
 return receipt.logs.some(log=>{
  if(log.address.toLowerCase()!==item.destination!.messageTransmitter.toLowerCase())return false;
  try{const e=decodeEventLog({abi:CCTP_ABI,data:log.data,topics:log.topics});return e.eventName==='MessageReceived'&&(e.args as {nonce:Hex}).nonce.toLowerCase()===item.nonce!.toLowerCase()&&(e.args as {sourceDomain:number}).sourceDomain===item.parsed.sourceDomain;}catch{return false;}
 });
}
