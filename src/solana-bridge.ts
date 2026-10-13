import {AppKit, type BridgeResult, type BridgeStep, type ChainDefinition, type EVMChainDefinition, type EstimateResult, type NonEVMChainDefinition, type RetryContext} from '@circle-fin/app-kit';
import {createSolanaKitAdapterFromProvider} from '@circle-fin/adapter-solana-kit';
import {getWallets} from '@wallet-standard/app';
import type {Wallet, WalletAccount} from '@wallet-standard/base';
import {Connection, PublicKey, VersionedTransaction, type ParsedTransactionWithMeta} from '@solana/web3.js';
import {createSolanaRpc,getBase58Encoder} from '@solana/kit';
import {createPublicClient, decodeEventLog, erc20Abi, http, isAddress, parseUnits, zeroAddress, type Abi,type Hex} from 'viem';
import {BRIDGE_NETWORK_FACTS, bridgeWalletChains, reviewedBridgeDefinition} from './bridge-networks';
import {inspectMainnetChain} from './bridge-mainnet-config';

export type SolanaBridgeEnvironment='testnet'|'mainnet';
export type SolanaBridgeDirection='arc-to-solana'|'solana-to-arc';
export type SolanaWalletProvider=Parameters<typeof createSolanaKitAdapterFromProvider>[0]['provider'];
export const SOLANA_TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SOLANA_CCTP={transmitter:'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',messenger:'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe'} as const;
export const SOLANA_FACTS={
  mainnet:{chain:'Solana',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',rpc:'https://api.mainnet-beta.solana.com',walletChain:'solana:mainnet'},
  testnet:{chain:'Solana_Devnet',mint:'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',rpc:'https://api.devnet.solana.com',walletChain:'solana:devnet'},
} as const;
// Pinned adapter 1.6.4 funds the CCTP message account with this refundable rent.
// A conservative same-size reserve is held for destination CCTP account creation.
export const SOLANA_CCTP_RENT_RESERVE=3_900_000n;
export const SOLANA_BRIDGE_STEPS=['approve','burn','fetchAttestation','mint'] as const;
export type SolanaBridgeRecord={version:1;id:string;environment:SolanaBridgeEnvironment;direction:SolanaBridgeDirection;evmWallet:Hex;solanaWallet:string;recipient:string;amount:string;createdAt:string;updatedAt:string;status:'running'|'interrupted'|'error'|'delivered'|'cancelled';result:BridgeResult<string>;error?:string;deliveredAmount?:string};
export const solanaBridgeStorage=(environment:SolanaBridgeEnvironment)=>`carpan.arc.solana.bridge.${environment}.v1`;
export const shortBridgeAddress=(address:string)=>`${address.slice(0,6)}…${address.slice(-5)}`;

export function validSolanaWallet(value:string):boolean {
  const reserved:string[]=[SOLANA_TOKEN_PROGRAM,SOLANA_ASSOCIATED_TOKEN_PROGRAM,SOLANA_CCTP.transmitter,SOLANA_CCTP.messenger,SOLANA_FACTS.mainnet.mint,SOLANA_FACTS.testnet.mint,'11111111111111111111111111111111'];
  try {return !reserved.includes(value)&&value.length>=32&&value.length<=44&&new PublicKey(value).toBase58()===value&&PublicKey.isOnCurve(new PublicKey(value).toBytes());}catch{return false;}
}
export function validateSolanaBridgeAmount(amount:string):bigint {
  if(amount.length>30||!/^\d+(?:\.\d{1,6})?$/.test(amount))throw new Error('USDC miktarını en fazla 6 ondalıkla gir.');
  const raw=parseUnits(amount,6);if(raw<=0n||raw>2n**64n-1n)throw new Error('USDC miktarı geçersiz.');return raw;
}
export function validateSolanaRecipient(direction:SolanaBridgeDirection,recipient:string){
  if(direction==='arc-to-solana'?!validSolanaWallet(recipient):!isAddress(recipient)||recipient.toLowerCase()===zeroAddress)throw new Error('Alıcı adresi hedef ağın cüzdan adresi olmalı.');
}
export function reviewedSolanaDefinition(chain:ChainDefinition,environment:SolanaBridgeEnvironment):chain is NonEVMChainDefinition {
  const f=SOLANA_FACTS[environment],v2=chain.cctp?.contracts.v2;
  return chain.type==='solana'&&chain.chain===f.chain&&chain.isTestnet===(environment==='testnet')&&chain.usdcAddress===f.mint&&chain.nativeCurrency.symbol==='SOL'&&chain.nativeCurrency.decimals===9&&chain.cctp?.domain===5&&v2?.type==='split'&&v2.tokenMessenger===SOLANA_CCTP.messenger&&v2.messageTransmitter===SOLANA_CCTP.transmitter;
}
export function solanaBridgeDefinitions(kit:AppKit,environment:SolanaBridgeEnvironment){
  const all=kit.getSupportedChains('bridge'),testnet=environment==='testnet';
  const arc=all.find((c):c is EVMChainDefinition=>c.type==='evm'&&c.chainId===(testnet?5042002:5042)&&reviewedBridgeDefinition(c,testnet));
  const solana=all.find((c):c is NonEVMChainDefinition=>reviewedSolanaDefinition(c,environment));
  if(!arc||!solana)throw new Error('Arc / Solana USDC ağ tanımları doğrulanamadı.');return {arc,solana};
}
export function solanaRpcUrl(environment:SolanaBridgeEnvironment){
  const configured=typeof import.meta.env==='object'?(environment==='mainnet'?import.meta.env.VITE_SOLANA_MAINNET_RPC_URL:import.meta.env.VITE_SOLANA_DEVNET_RPC_URL):undefined;
  if(configured){const url=new URL(configured);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Solana RPC adresi geçersiz.');return url.href;}
  return SOLANA_FACTS[environment].rpc;
}
export const solanaConnection=(environment:SolanaBridgeEnvironment)=>new Connection(solanaRpcUrl(environment),{commitment:'confirmed',disableRetryOnRateLimit:true});
export const arcBridgeClient=(environment:SolanaBridgeEnvironment)=>createPublicClient({chain:bridgeWalletChains(environment==='testnet').find(c=>c.id===(environment==='testnet'?5042002:5042))!,transport:http()});
export const solanaUsdcAta=(wallet:string,environment:SolanaBridgeEnvironment)=>PublicKey.findProgramAddressSync([new PublicKey(wallet).toBytes(),new PublicKey(SOLANA_TOKEN_PROGRAM).toBytes(),new PublicKey(SOLANA_FACTS[environment].mint).toBytes()],new PublicKey(SOLANA_ASSOCIATED_TOKEN_PROGRAM))[0];

type ParsedSolanaAccount={executable:boolean;owner:{toBase58():string};data:unknown}|null;
export type SolanaReadRpc={getGenesisHash:()=>Promise<string>;getSlot:()=>Promise<number>;getParsedAccountInfo:(key:PublicKey)=>Promise<{value:ParsedSolanaAccount}>;getAccountInfo:(key:PublicKey)=>Promise<{executable:boolean;owner:{toBase58():string};data:Uint8Array}|null>};
export async function inspectSolanaChain(environment:SolanaBridgeEnvironment,rpc:SolanaReadRpc=solanaConnection(environment)){
  const f=SOLANA_FACTS[environment];
  const [genesis,slot,mint,transmitter,messenger]=await Promise.all([rpc.getGenesisHash(),rpc.getSlot(),rpc.getParsedAccountInfo(new PublicKey(f.mint)),rpc.getParsedAccountInfo(new PublicKey(SOLANA_CCTP.transmitter)),rpc.getParsedAccountInfo(new PublicKey(SOLANA_CCTP.messenger))]);
  if(genesis!==f.genesis||!Number.isSafeInteger(slot)||slot<=0)throw new Error('Solana RPC beklenen ağı doğrulamıyor.');
  const data=mint.value?.data as {parsed?:{type?:string;info?:{decimals?:number;isInitialized?:boolean}}}|undefined;
  if(!mint.value||mint.value.executable||mint.value.owner.toBase58()!==SOLANA_TOKEN_PROGRAM||data?.parsed?.type!=='mint'||data.parsed.info?.decimals!==6||data.parsed.info.isInitialized!==true)throw new Error('Solana USDC mint / ondalık / token programı doğrulanamadı.');
  const loaders=['BPFLoaderUpgradeab1e11111111111111111111111','BPFLoader2111111111111111111111111111111111'];
  if([transmitter,messenger].some(p=>!p.value?.executable||!loaders.includes(p.value.owner.toBase58())))throw new Error('Solana CCTP programları çalıştırılabilir olarak doğrulanamadı.');
  await Promise.all([SOLANA_CCTP.transmitter,SOLANA_CCTP.messenger].map(async id=>{
    const program=await rpc.getAccountInfo(new PublicKey(id));if(!program?.executable||!program.data.length)throw new Error('Solana CCTP program bytecode’u bulunamadı.');
    if(program.owner.toBase58()===loaders[0]){
      // Upgradeable Loader Program state: u32 variant=2 + ProgramData pubkey.
      if(program.data.length!==36||new DataView(program.data.buffer,program.data.byteOffset,4).getUint32(0,true)!==2)throw new Error('Solana CCTP program verisi geçersiz.');
      const data=await rpc.getAccountInfo(new PublicKey(program.data.slice(4,36)));
      // ProgramData variant=3, slot/authority metadata, then executable bytes.
      if(!data||data.executable||data.owner.toBase58()!==loaders[0]||data.data.length<=45||new DataView(data.data.buffer,data.data.byteOffset,4).getUint32(0,true)!==3)throw new Error('Solana CCTP program bytecode’u bulunamadı.');
    }
  }));
  return {slot,genesis,mint:f.mint};
}
export async function inspectArcForSolana(environment:SolanaBridgeEnvironment){
  const id=environment==='testnet'?5042002:5042,fact=BRIDGE_NETWORK_FACTS.find(f=>f.id===id),client=arcBridgeClient(environment);
  if(!fact)throw new Error('Arc ağ tanımı bulunamadı.');
  return inspectMainnetChain(fact,{getChainId:()=>client.getChainId(),getBlockNumber:()=>client.getBlockNumber(),getBytecode:a=>client.getBytecode(a),readContract:a=>client.readContract({...a,abi:a.abi as Abi})});
}
export async function readSolanaBridgeBalances(environment:SolanaBridgeEnvironment,evmWallet:Hex,solanaWallet:string,solanaRecipient=solanaWallet){
  if(!isAddress(evmWallet)||!validSolanaWallet(solanaWallet)||!validSolanaWallet(solanaRecipient))throw new Error('Bağlı cüzdan adresleri geçersiz.');
  const connection=solanaConnection(environment),arc=arcBridgeClient(environment),mint=SOLANA_FACTS[environment].mint;
  const [arcNative,arcUsdc,solNative,account,recipientAta,rent,recipientAccount]=await Promise.all([
    arc.getBalance({address:evmWallet}),arc.readContract({address:'0x3600000000000000000000000000000000000000',abi:erc20Abi,functionName:'balanceOf',args:[evmWallet]}),
    connection.getBalance(new PublicKey(solanaWallet)),connection.getParsedAccountInfo(solanaUsdcAta(solanaWallet,environment)),connection.getParsedAccountInfo(solanaUsdcAta(solanaRecipient,environment)),connection.getMinimumBalanceForRentExemption(165),connection.getAccountInfo(new PublicKey(solanaRecipient)),
  ]);
  if(recipientAccount&&(recipientAccount.executable||recipientAccount.owner.toBase58()!=='11111111111111111111111111111111'||recipientAccount.data.length!==0))throw new Error('Solana alıcısı token hesabı veya program adresi değil, cüzdan adresi olmalı.');
  if(!Number.isSafeInteger(solNative)||!Number.isSafeInteger(rent))throw new Error('Solana bakiye cevabı geçersiz.');
  const info=(account.value?.data as {parsed?:{type?:string;info?:{mint?:string;owner?:string;state?:string;tokenAmount?:{amount?:string;decimals?:number}}}}|undefined)?.parsed;
  if(account.value&&(account.value.owner.toBase58()!==SOLANA_TOKEN_PROGRAM||info?.type!=='account'||info.info?.mint!==mint||info.info.owner!==solanaWallet||info.info.state!=='initialized'||info.info.tokenAmount?.decimals!==6||!/^\d+$/.test(info.info.tokenAmount.amount??'')))throw new Error('Solana USDC hesabı doğrulanamadı.');
  if(recipientAta.value){const recipientInfo=(recipientAta.value.data as {parsed?:{info?:{mint?:string;owner?:string;state?:string}}}).parsed?.info;if(recipientAta.value.owner.toBase58()!==SOLANA_TOKEN_PROGRAM||recipientInfo?.mint!==mint||recipientInfo.owner!==solanaRecipient||recipientInfo.state!=='initialized')throw new Error('Solana alıcı USDC hesabı geçersiz veya dondurulmuş.');}
  return {arcNative,arcUsdc,solNative:BigInt(solNative),solUsdc:BigInt(info?.info?.tokenAmount?.amount??'0'),ataRent:recipientAta.value?0n:BigInt(rent)};
}
export type SolanaBridgeBalances=Awaited<ReturnType<typeof readSolanaBridgeBalances>>;
export function solanaNativeGas(estimate:EstimateResult<string,string>,chain:ChainDefinition){
  const fees=estimate.gasFees.filter(f=>f.blockchain===chain.chain);
  if(!fees.length)throw new Error('Kaynak veya hedef gas teklifi eksik.');
  const total=fees.reduce((sum,f)=>{if(!f.fees||f.error||f.token!==chain.nativeCurrency.symbol||!new RegExp(`^\\d+(?:\\.\\d{1,${chain.nativeCurrency.decimals}})?$`).test(f.fees.fee))throw new Error('Kaynak veya hedef gas teklifi eksik.');return sum+parseUnits(f.fees.fee,chain.nativeCurrency.decimals);},0n);
  if(total<=0n)throw new Error('Kaynak veya hedef gas teklifi eksik.');return total;
}
export function validateSolanaQuote(estimate:EstimateResult<string,string>,direction:SolanaBridgeDirection,amount:string,recipient:string,evmWallet:string,solanaWallet:string,definitions:ReturnType<typeof solanaBridgeDefinitions>){
  const from=direction==='arc-to-solana'?definitions.arc:definitions.solana,to=direction==='arc-to-solana'?definitions.solana:definitions.arc;
  const sourceAddress=direction==='arc-to-solana'?evmWallet:solanaWallet,destinationAddress=direction==='arc-to-solana'?solanaWallet:evmWallet;
  if(validateSolanaBridgeAmount(estimate.amount)!==validateSolanaBridgeAmount(amount)||estimate.source.chain!==from.chain||estimate.destination.chain!==to.chain||estimate.source.address!==sourceAddress||estimate.destination.address!==destinationAddress||estimate.destination.recipientAddress!==recipient)throw new Error('Circle teklifi cüzdan / rota / alıcı / miktarla uyuşmuyor.');
  solanaQuoteReceived(estimate);solanaNativeGas(estimate,from);solanaNativeGas(estimate,to);
}
export function solanaQuoteReceived(estimate:EstimateResult<string,string>){
  let result=validateSolanaBridgeAmount(estimate.amount);if(estimate.token!=='USDC')throw new Error('Yalnız yerel USDC destekleniyor.');
  for(const fee of estimate.fees){if(fee.error||fee.amount===null||fee.token!=='USDC'||!/^\d+(?:\.\d{1,6})?$/.test(fee.amount))throw new Error('Circle ücret teklifi tamamlanamadı.');result-=parseUnits(fee.amount,6);}
  if(result<=0n)throw new Error('Kesintilerden sonra teslim tutarı sıfır.');return result;
}
export function solanaBridgeReadiness(direction:SolanaBridgeDirection,amount:bigint,balances:SolanaBridgeBalances,estimate:EstimateResult<string,string>,definitions:ReturnType<typeof solanaBridgeDefinitions>){
  const arcGas=solanaNativeGas(estimate,definitions.arc),solGas=solanaNativeGas(estimate,definitions.solana);
  const arcRequired=arcGas+(direction==='arc-to-solana'?amount*10n**12n:0n);
  const solRequired=solGas+SOLANA_CCTP_RENT_RESERVE+(direction==='arc-to-solana'?balances.ataRent:0n);
  const usdc=direction==='arc-to-solana'?balances.arcUsdc:balances.solUsdc;
  return {arcGas,solGas,arcRequired,solRequired,usdcReady:usdc>=amount,arcReady:balances.arcNative>=arcRequired,solReady:balances.solNative>=solRequired};
}

// Wallet Standard discovery is read-only. connect() is only called by a user action.
type ConnectFeature={connect:(args?:{silent?:boolean})=>Promise<{accounts:readonly WalletAccount[]}>};
type DisconnectFeature={disconnect:()=>Promise<void>};
type SignFeature={supportedTransactionVersions:readonly ('legacy'|0)[];signTransaction:(...args:{account:WalletAccount;chain:string;transaction:Uint8Array}[])=>Promise<readonly {signedTransaction:Uint8Array}[]>};
export type SolanaWalletChoice={id:string;name:string;create:(environment:SolanaBridgeEnvironment)=>SolanaWalletProvider};
export function standardSolanaProvider(wallet:Wallet,environment:SolanaBridgeEnvironment):SolanaWalletProvider {
  const chain=SOLANA_FACTS[environment].walletChain,connect=wallet.features['standard:connect'] as ConnectFeature|undefined,sign=wallet.features['solana:signTransaction'] as SignFeature|undefined;
  if(!connect||!sign||!wallet.chains.includes(chain))throw new Error('Cüzdan seçilen Solana ağını desteklemiyor.');
  let selected:string|undefined;
  const current=()=>wallet.accounts.find(a=>a.address===selected&&a.chains.includes(chain)&&a.features.includes('solana:signTransaction'));
  return {get isConnected(){return !!current();},get address(){return current()?.address;},async connect(){const result=await connect.connect();const account=result.accounts.find(a=>a.chains.includes(chain)&&a.features.includes('solana:signTransaction')&&validSolanaWallet(a.address));if(!account)throw new Error('Solana cüzdanında bu ağ için uygun hesap bulunamadı.');selected=account.address;return {address:account.address};},async disconnect(){selected=undefined;await (wallet.features['standard:disconnect'] as DisconnectFeature|undefined)?.disconnect();},async signTransaction(transaction){const account=current();if(!account)throw new Error('Solana cüzdan hesabı değişti; yeniden bağlan.');if(!(transaction instanceof VersionedTransaction)||(transaction.version!==0&&transaction.version!=='legacy')||!sign.supportedTransactionVersions.includes(transaction.version))throw new Error('Cüzdan bu işlem sürümünü desteklemiyor.');const response=await sign.signTransaction({account,chain,transaction:transaction.serialize()});if(!response[0]?.signedTransaction)throw new Error('Cüzdan imzalı işlem döndürmedi.');return response[0].signedTransaction;}};
}
type InjectedSolanaProvider={isConnected?:boolean;publicKey?:{toBase58:()=>string};address?:string;connect:()=>Promise<{publicKey?:{toBase58:()=>string};address?:string}>;disconnect:()=>Promise<void>;signTransaction:(tx:unknown)=>Promise<unknown>};
export function injectedSolanaProvider(provider:InjectedSolanaProvider):SolanaWalletProvider {
  let selected:string|undefined;const address=()=>provider.publicKey?.toBase58()??provider.address;
  return {get isConnected(){return !!provider.isConnected&&address()===selected;},get address(){return address()===selected?selected:undefined;},async connect(){const result=await provider.connect(),value=result.publicKey?.toBase58()??result.address??address();if(!value||!validSolanaWallet(value))throw new Error('Solana cüzdanı geçerli bir hesap döndürmedi.');selected=value;return {address:value};},async disconnect(){selected=undefined;await provider.disconnect();},async signTransaction(tx){if(!provider.isConnected||address()!==selected)throw new Error('Solana cüzdan hesabı değişti; yeniden bağlan.');return provider.signTransaction(tx);}};
}
export function availableSolanaWallets():SolanaWalletChoice[]{
  const choices:SolanaWalletChoice[]=getWallets().get().filter(w=>w.chains.some(c=>c.startsWith('solana:'))&&!!w.features['standard:connect']&&!!w.features['solana:signTransaction']).map(w=>({id:`standard:${w.name}`,name:w.name,create:environment=>standardSolanaProvider(w,environment)}));
  const injected=window as unknown as {phantom?:{solana?:InjectedSolanaProvider};solflare?:InjectedSolanaProvider;solana?:InjectedSolanaProvider};
  for(const [name,provider] of [['Phantom',injected.phantom?.solana??injected.solana],['Solflare',injected.solflare]] as const){if(provider&&typeof provider.connect==='function'&&typeof provider.signTransaction==='function'&&!choices.some(w=>w.name.toLowerCase()===name.toLowerCase()))choices.push({id:`injected:${name}`,name,create:()=>injectedSolanaProvider(provider)});}
  return choices;
}
export function createSolanaBrowserAdapter(provider:SolanaWalletProvider,environment:SolanaBridgeEnvironment,chain:NonEVMChainDefinition){
  if(!provider.isConnected||!provider.address||!validSolanaWallet(provider.address)||!reviewedSolanaDefinition(chain,environment))throw new Error('Solana cüzdanını açıkça bağla.');
  return createSolanaKitAdapterFromProvider({provider,capabilities:{addressContext:'user-controlled',supportedChains:[chain]},getRpc:({chain:requested})=>{if(!reviewedSolanaDefinition(requested,environment))throw new Error('Desteklenmeyen Solana ağı.');return createSolanaRpc(solanaRpcUrl(environment));}});
}

export function solanaBridgeHasBurn(result:BridgeResult<string>){return result.steps.some(s=>s.name==='burn'&&(s.state==='success'||!!s.txHash));}
export function checkpointSolanaStep(result:BridgeResult<string>,step:BridgeStep):BridgeResult<string>{
  // Never discard a previously confirmed burn or its SDK data during later errors.
  const previous=[...result.steps].reverse().find(s=>s.name===step.name);
  if(previous?.state==='success'&&step.state!=='success')return {...result,steps:[...result.steps,step]};
  return {...result,steps:[...result.steps.filter(s=>s.name!==step.name),{...previous,...step}],state:'pending'};
}
export function solanaBridgeStep(result:BridgeResult<string>,name:string){return [...result.steps].reverse().find(s=>s.name===name&&s.state==='success'&&s.txHash)??[...result.steps].reverse().find(s=>s.name===name);}
export function validSolanaSignature(value:string){try{return value.length>=80&&value.length<=90&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)&&getBase58Encoder().encode(value).length===64;}catch{return false;}}
const evmHash=(value:string)=>/^0x[0-9a-f]{64}$/i.test(value);
export function solanaBridgeTxHash(record:SolanaBridgeRecord,name:'mint'|'burn'){
  const step=solanaBridgeStep(record.result,name),isSolana=name==='burn'?record.direction==='solana-to-arc':record.direction==='arc-to-solana';
  return step?.txHash&&(isSolana?validSolanaSignature(step.txHash):evmHash(step.txHash))?step.txHash:null;
}
export function solanaBridgeExplorer(record:SolanaBridgeRecord,name:'mint'|'burn'){
  const hash=solanaBridgeTxHash(record,name);if(!hash)return null;
  const isSolana=name==='burn'?record.direction==='solana-to-arc':record.direction==='arc-to-solana';
  return isSolana?`https://solscan.io/tx/${hash}${record.environment==='testnet'?'?cluster=devnet':''}`:`https://${record.environment==='testnet'?'explorer.testnet.arc.io':'explorer.arc.io'}/tx/${hash}`;
}
export function encodeSolanaBridgeRecords(records:SolanaBridgeRecord[]){return JSON.stringify(records,(_key,value)=>typeof value==='bigint'?{__carpanSolanaBigInt:value.toString()}:value);}
export function decodeSolanaBridgeRecords(serialized:string|null,definitions:ReturnType<typeof solanaBridgeDefinitions>,environment:SolanaBridgeEnvironment):SolanaBridgeRecord[]{
  if(!serialized)return [];if(serialized.length>3_000_000)throw new Error('Köprü geçmişi okunamadı.');
  const parsed=JSON.parse(serialized,(_key,value)=>value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.__carpanSolanaBigInt==='string'&&/^-?\d{1,100}$/.test(value.__carpanSolanaBigInt)?BigInt(value.__carpanSolanaBigInt):value);
  if(!Array.isArray(parsed)||parsed.length>100)throw new Error('Köprü geçmişi okunamadı.');
  return parsed.map((r:SolanaBridgeRecord)=>{
    if(!r||r.version!==1||r.environment!==environment||!['arc-to-solana','solana-to-arc'].includes(r.direction)||!isAddress(r.evmWallet)||r.evmWallet.toLowerCase()===zeroAddress||!validSolanaWallet(r.solanaWallet)||typeof r.id!=='string'||r.id.length>100||!['running','interrupted','error','delivered','cancelled'].includes(r.status)||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.updatedAt)))throw new Error('Köprü geçmişi ağ veya hesap ile uyuşmuyor.');
    validateSolanaBridgeAmount(r.amount);validateSolanaRecipient(r.direction,r.recipient);
    const from=r.direction==='arc-to-solana'?definitions.arc:definitions.solana,to=r.direction==='arc-to-solana'?definitions.solana:definitions.arc;
    const sourceAddress=r.direction==='arc-to-solana'?r.evmWallet:r.solanaWallet,destinationAddress=r.direction==='arc-to-solana'?r.solanaWallet:r.evmWallet;
    if(!r.result||r.result.token!=='USDC'||r.result.amount!==r.amount||!['pending','success','error'].includes(r.result.state)||r.result.provider!=='CCTPV2BridgingProvider'||r.result.source?.chain?.chain!==from.chain||r.result.destination?.chain?.chain!==to.chain||r.result.source.address!==sourceAddress||r.result.destination.address!==destinationAddress||r.result.destination.recipientAddress!==r.recipient||r.result.destination.useForwarder===true||!Array.isArray(r.result.steps)||r.result.steps.length>100||r.deliveredAmount!==undefined&&!/^\d{1,25}$/.test(r.deliveredAmount))throw new Error('Köprü gönderim özeti değişmiş; yeni gönderim başlatma.');
    for(const step of r.result.steps){if(!SOLANA_BRIDGE_STEPS.includes(step.name as typeof SOLANA_BRIDGE_STEPS[number])||!['pending','success','error','noop'].includes(step.state))throw new Error('Köprü aşaması geçersiz.');if(step.txHash&&step.name==='burn'&&!(r.direction==='solana-to-arc'?validSolanaSignature(step.txHash):evmHash(step.txHash)))throw new Error('Kaynak işlem kanıtı geçersiz.');if(step.txHash&&step.name==='mint'&&!(r.direction==='arc-to-solana'?validSolanaSignature(step.txHash):evmHash(step.txHash)))throw new Error('Hedef işlem kanıtı geçersiz.');}
    // RPC URLs / mutable contracts from localStorage are never trusted for retry.
    return {...r,status:r.status==='running'?'interrupted':r.status,result:{...r.result,config:{transferSpeed:'FAST'},source:{address:sourceAddress,chain:from},destination:{address:destinationAddress,chain:to,recipientAddress:r.recipient,useForwarder:false}}};
  });
}
export async function resumeSolanaBridge(kit:Pick<AppKit,'retryBridge'>,record:SolanaBridgeRecord,evmWallet:string,solanaWallet:string,context:RetryContext){
  const burn=solanaBridgeStep(record.result,'burn');
  if(record.status==='delivered'||record.status==='cancelled'||record.evmWallet.toLowerCase()!==evmWallet.toLowerCase()||record.solanaWallet!==solanaWallet||burn?.state!=='success'||!solanaBridgeTxHash(record,'burn'))throw new Error('Mevcut kaynak gönderimi doğrula ve aynı iki cüzdanı bağla.');
  return kit.retryBridge(record.result,context);
}
function parsedTokenAmount(tx:ParsedTransactionWithMeta,wallet:string,mint:string,environment:SolanaBridgeEnvironment){
  const ata=solanaUsdcAta(wallet,environment).toBase58(),index=tx.transaction.message.accountKeys.findIndex(a=>a.pubkey.toBase58()===ata);
  if(index<0)throw new Error('İşlem doğru USDC hesabını içermiyor.');
  const pre=tx.meta?.preTokenBalances?.find(b=>b.accountIndex===index&&b.mint===mint&&b.owner===wallet&&b.uiTokenAmount.decimals===6);
  const post=tx.meta?.postTokenBalances?.find(b=>b.accountIndex===index&&b.mint===mint&&b.owner===wallet&&b.uiTokenAmount.decimals===6);
  if(!post||!/^\d+$/.test(post.uiTokenAmount.amount)||pre&&!/^\d+$/.test(pre.uiTokenAmount.amount))throw new Error('İşlem USDC bakiye kanıtını içermiyor.');
  return BigInt(post.uiTokenAmount.amount)-BigInt(pre?.uiTokenAmount.amount??'0');
}
export function verifySolanaReceipt(tx:ParsedTransactionWithMeta|null,record:SolanaBridgeRecord,stage:'mint'|'burn'):bigint {
  if(!tx?.meta||tx.meta.err)throw new Error('Solana işlem makbuzu henüz başarılı değil.');
  const hash=solanaBridgeTxHash(record,stage);if(!hash||tx.transaction.signatures[0]!==hash)throw new Error('Solana işlem imzası kayıtla uyuşmuyor.');
  if(![SOLANA_CCTP.transmitter,SOLANA_CCTP.messenger].every(id=>tx.meta!.logMessages?.some(log=>log.startsWith(`Program ${id} invoke [`))))throw new Error('Solana CCTP işlem kanıtı bulunamadı.');
  const wallet=stage==='mint'?record.recipient:record.solanaWallet,delta=parsedTokenAmount(tx,wallet,SOLANA_FACTS[record.environment].mint,record.environment),raw=validateSolanaBridgeAmount(record.amount);
  if(stage==='mint'?delta<=0n||delta>raw:-delta!==raw)throw new Error('İşlemde doğru USDC / alıcı / tutar doğrulanamadı.');return stage==='mint'?delta:-delta;
}
export async function verifySolanaBridgeStage(record:SolanaBridgeRecord,stage:'mint'|'burn'){
  const hash=solanaBridgeTxHash(record,stage);if(!hash)throw new Error('İşlem kanıtı henüz yok; yeniden gönderme.');
  const isSolana=stage==='burn'?record.direction==='solana-to-arc':record.direction==='arc-to-solana';
  if(isSolana){await inspectSolanaChain(record.environment);const tx=await solanaConnection(record.environment).getParsedTransaction(hash,{commitment:'confirmed',maxSupportedTransactionVersion:0});return verifySolanaReceipt(tx,record,stage);}
  await inspectArcForSolana(record.environment);const receipt=await arcBridgeClient(record.environment).getTransactionReceipt({hash:hash as Hex});if(receipt.status!=='success')throw new Error('Arc işlem makbuzu henüz başarılı değil.');
  const raw=validateSolanaBridgeAmount(record.amount);let value=0n;
  for(const log of receipt.logs){if(log.address.toLowerCase()!=='0x3600000000000000000000000000000000000000')continue;try{const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});if(event.eventName==='Transfer'&&(stage==='mint'?event.args.from.toLowerCase()===zeroAddress&&event.args.to.toLowerCase()===record.recipient.toLowerCase():event.args.from.toLowerCase()===record.evmWallet.toLowerCase()&&event.args.to.toLowerCase()===zeroAddress))value+=event.args.value;}catch{/* Other token events do not prove delivery. */}}
  if(stage==='mint'?value<=0n||value>raw:value!==raw)throw new Error('İşlemde doğru USDC / alıcı / tutar doğrulanamadı.');return value;
}
