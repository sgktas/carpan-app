import {describe,expect,test} from 'bun:test';
import {AppKit,type EstimateResult,type RetryContext} from '@circle-fin/app-kit';
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction,type ParsedTransactionWithMeta} from '@solana/web3.js';
import {getBase58Decoder} from '@solana/kit';
import type {Wallet,WalletAccount} from '@wallet-standard/base';
import {
  SOLANA_CCTP,SOLANA_CCTP_RENT_RESERVE,SOLANA_FACTS,SOLANA_TOKEN_PROGRAM,checkpointSolanaStep,decodeSolanaBridgeRecords,encodeSolanaBridgeRecords,injectedSolanaProvider,inspectSolanaChain,
  resumeSolanaBridge,solanaBridgeDefinitions,solanaBridgeExplorer,solanaBridgeReadiness,solanaBridgeStep,solanaBridgeStorage,solanaNativeGas,solanaQuoteReceived,solanaUsdcAta,
  standardSolanaProvider,validSolanaSignature,validSolanaWallet,validateSolanaBridgeAmount,validateSolanaQuote,validateSolanaRecipient,verifySolanaReceipt,type SolanaBridgeRecord,type SolanaReadRpc,
} from '../src/solana-bridge';

const kit=new AppKit(),definitions=solanaBridgeDefinitions(kit,'testnet'),mainnet=solanaBridgeDefinitions(kit,'mainnet');
// Ephemeral test fixture public keys; no browser wallet or network transaction.
const wallet=Keypair.generate().publicKey.toBase58(),otherWallet=Keypair.generate().publicKey.toBase58();
const evm='0x1111111111111111111111111111111111111111',evmOther='0x2222222222222222222222222222222222222222';
const solSignature=getBase58Decoder().decode(new Uint8Array(64).fill(2)),arcHash=`0x${'12'.repeat(32)}`;
function record(direction:'arc-to-solana'|'solana-to-arc'='arc-to-solana'):SolanaBridgeRecord{
  return {version:1,id:'test-record',environment:'testnet',direction,evmWallet:evm,solanaWallet:wallet,recipient:direction==='arc-to-solana'?wallet:evm,amount:'0.10',createdAt:'2026-10-09T00:00:00Z',updatedAt:'2026-10-09T00:00:00Z',status:'interrupted',result:{token:'USDC',amount:'0.10',state:'error',provider:'CCTPV2BridgingProvider',config:{transferSpeed:'FAST'},source:{address:direction==='arc-to-solana'?evm:wallet,chain:direction==='arc-to-solana'?definitions.arc:definitions.solana},destination:{address:direction==='arc-to-solana'?wallet:evm,chain:direction==='arc-to-solana'?definitions.solana:definitions.arc,recipientAddress:direction==='arc-to-solana'?wallet:evm,useForwarder:false},steps:[{name:'burn',state:'success',txHash:direction==='arc-to-solana'?arcHash:solSignature,data:{originalMessage:'0x1234',nonce:123n}}]}};
}
function quote():EstimateResult<string,string>{return {token:'USDC',amount:'0.10',source:{address:evm,chain:definitions.arc.chain},destination:{address:wallet,chain:definitions.solana.chain,recipientAddress:wallet},fees:[{type:'provider',token:'USDC',amount:'0.001'}],gasFees:[{name:'burn',token:'USDC',blockchain:definitions.arc.chain,fees:{fee:'0.000001'}},{name:'mint',token:'SOL',blockchain:definitions.solana.chain,fees:{fee:'0.00002'}}]} as EstimateResult<string,string>;}
function rpcFixture():SolanaReadRpc{
  const dataKey=Keypair.generate().publicKey,loader='BPFLoaderUpgradeab1e11111111111111111111111';
  const program=new Uint8Array(36);new DataView(program.buffer).setUint32(0,2,true);program.set(dataKey.toBytes(),4);
  const bytecode=new Uint8Array(100);new DataView(bytecode.buffer).setUint32(0,3,true);bytecode[45]=1;
  return {getGenesisHash:async()=>SOLANA_FACTS.testnet.genesis,getSlot:async()=>123,
    getParsedAccountInfo:async key=>({value:key.toBase58()===SOLANA_FACTS.testnet.mint?{executable:false,owner:new PublicKey(SOLANA_TOKEN_PROGRAM),data:{parsed:{type:'mint',info:{decimals:6,isInitialized:true}}}}:{executable:true,owner:new PublicKey(loader),data:{}}}),
    getAccountInfo:async key=>({executable:key.toBase58()!==dataKey.toBase58(),owner:new PublicKey(loader),data:key.toBase58()===dataKey.toBase58()?bytecode:program}),
  };
}
function receipt(r:SolanaBridgeRecord,stage:'mint'|'burn'='mint'):ParsedTransactionWithMeta{
  const owner=stage==='mint'?r.recipient:r.solanaWallet,pre=stage==='mint'?'0':'100000',post=stage==='mint'?'99000':'0';
  return {slot:123,transaction:{signatures:[solSignature],message:{accountKeys:[{pubkey:solanaUsdcAta(owner,'testnet'),signer:false,writable:true}],instructions:[],recentBlockhash:wallet}},meta:{err:null,fee:5000,preBalances:[0],postBalances:[0],logMessages:[`Program ${SOLANA_CCTP.transmitter} invoke [1]`,`Program ${SOLANA_CCTP.messenger} invoke [2]`],preTokenBalances:[{accountIndex:0,mint:SOLANA_FACTS.testnet.mint,owner,uiTokenAmount:{amount:pre,decimals:6,uiAmount:null}}],postTokenBalances:[{accountIndex:0,mint:SOLANA_FACTS.testnet.mint,owner,uiTokenAmount:{amount:post,decimals:6,uiAmount:null}}]}} as unknown as ParsedTransactionWithMeta;
}

describe('Solana native USDC / network safeguards',()=>{
  test('SDK definitions are reviewed for each environment and always pair Arc',()=>{
    expect(definitions.arc.chainId).toBe(5042002);expect(definitions.solana.usdcAddress).toBe(SOLANA_FACTS.testnet.mint);expect(mainnet.arc.chainId).toBe(5042);expect(mainnet.solana.usdcAddress).toBe(SOLANA_FACTS.mainnet.mint);
    expect(solanaBridgeStorage('testnet')).not.toBe(solanaBridgeStorage('mainnet'));
  });
  test('strict 6-decimal/u64 amounts and correct recipient type',()=>{
    expect(validateSolanaBridgeAmount('0.10')).toBe(100000n);expect(validateSolanaBridgeAmount('18446744073709.551615')).toBe(2n**64n-1n);
    for(const bad of ['0','-1','1.0000001','1e3',' 1','18446744073709.551616'])expect(()=>validateSolanaBridgeAmount(bad)).toThrow();
    expect(validSolanaWallet(wallet)).toBe(true);expect(validSolanaWallet(SOLANA_FACTS.testnet.mint)).toBe(false);expect(validSolanaWallet('11111111111111111111111111111111')).toBe(false);
    expect(()=>validateSolanaRecipient('arc-to-solana',evm)).toThrow();expect(()=>validateSolanaRecipient('solana-to-arc',wallet)).toThrow();
  });
  test('genesis, token program, mint decimals, executable programs and deployed bytecode fail closed',async()=>{
    expect((await inspectSolanaChain('testnet',rpcFixture())).genesis).toBe(SOLANA_FACTS.testnet.genesis);
    const wrongGenesis=rpcFixture();wrongGenesis.getGenesisHash=async()=>SOLANA_FACTS.mainnet.genesis;await expect(inspectSolanaChain('testnet',wrongGenesis)).rejects.toThrow('beklenen ağı');
    const mint=rpcFixture(),read=mint.getParsedAccountInfo;mint.getParsedAccountInfo=async key=>key.toBase58()===SOLANA_FACTS.testnet.mint?{value:{executable:false,owner:new PublicKey(SOLANA_TOKEN_PROGRAM),data:{parsed:{type:'mint',info:{decimals:9,isInitialized:true}}}}}:read(key);await expect(inspectSolanaChain('testnet',mint)).rejects.toThrow('ondalık');
    const program=rpcFixture();program.getAccountInfo=async()=>null;await expect(inspectSolanaChain('testnet',program)).rejects.toThrow('bytecode');
    const missingExecutable=rpcFixture(),readProgram=missingExecutable.getParsedAccountInfo;missingExecutable.getParsedAccountInfo=async key=>{const value=await readProgram(key);if(key.toBase58()===SOLANA_CCTP.transmitter)value.value!.executable=false;return value;};await expect(inspectSolanaChain('testnet',missingExecutable)).rejects.toThrow('çalıştırılabilir');
  });
  test('quote context and native fee decimals cannot silently change',()=>{
    const q=quote();validateSolanaQuote(q,'arc-to-solana','0.10',wallet,evm,wallet,definitions);expect(solanaQuoteReceived(q)).toBe(99000n);expect(solanaNativeGas(q,definitions.solana)).toBe(20000n);
    for(const wrong of [{...q,amount:'0.20'},{...q,destination:{...q.destination,recipientAddress:otherWallet}},{...q,source:{...q.source,chain:mainnet.arc.chain}}])expect(()=>validateSolanaQuote(wrong,'arc-to-solana','0.10',wallet,evm,wallet,definitions)).toThrow('uyu');
    const incomplete=quote();incomplete.gasFees=incomplete.gasFees.slice(0,1);expect(()=>solanaNativeGas(incomplete,definitions.solana)).toThrow();
    const wrongToken=quote();wrongToken.gasFees[1].token='USDC';expect(()=>solanaNativeGas(wrongToken,definitions.solana)).toThrow();
    const wrongDecimals=quote();wrongDecimals.gasFees[1].fees!.fee='0.0000000001';expect(()=>solanaNativeGas(wrongDecimals,definitions.solana)).toThrow();
    const exhausted=quote();exhausted.fees[0].amount='0.10';expect(()=>solanaQuoteReceived(exhausted)).toThrow();
  });
  test('Arc native/erc20 same funds and Solana rent reserve are added before burn',()=>{
    const b={arcNative:100_000_000_000_000_000n,arcUsdc:100000n,solNative:SOLANA_CCTP_RENT_RESERVE+20000n,solUsdc:100000n,ataRent:2039280n};
    const ready=solanaBridgeReadiness('arc-to-solana',100000n,b,quote(),definitions);expect(ready.arcReady).toBe(false);expect(ready.solReady).toBe(false);expect(ready.arcRequired).toBe(100_001_000_000_000_000n);expect(ready.solRequired).toBe(5_959_280n);
    const inbound=solanaBridgeReadiness('solana-to-arc',100000n,{...b,arcNative:1000000000000n,solNative:3920000n},quote(),definitions);expect(inbound.arcReady).toBe(true);expect(inbound.solReady).toBe(true);
  });
});

describe('Solana browser wallet identity and manual signing',()=>{
  test('Phantom publicKey is normalized to SDK address and connect never happens implicitly',async()=>{
    let calls=0,active=wallet;const injected={isConnected:false,publicKey:{toBase58:()=>active},connect:async()=>{calls++;injected.isConnected=true;return {publicKey:injected.publicKey};},disconnect:async()=>{injected.isConnected=false;},signTransaction:async(tx:unknown)=>tx};
    const provider=injectedSolanaProvider(injected);expect(calls).toBe(0);expect(provider.address).toBeUndefined();expect((await provider.connect()).address).toBe(wallet);expect(calls).toBe(1);expect(provider.isConnected).toBe(true);
    active=otherWallet;expect(provider.isConnected).toBe(false);await expect(provider.signTransaction({})).rejects.toThrow('hesabı değişti');
  });
  test('Wallet Standard selects the explicit cluster and sends serialized transaction only after connect',async()=>{
    const account={address:wallet,publicKey:new PublicKey(wallet).toBytes(),chains:['solana:devnet'],features:['solana:signTransaction']} as WalletAccount;
    let accounts:readonly WalletAccount[]=[],connections=0,signs=0;
    const standard={version:'1.0.0',name:'Test Wallet',icon:'data:image/png;base64,',chains:['solana:devnet'],get accounts(){return accounts;},features:{'standard:connect':{connect:async()=>{connections++;accounts=[account];return {accounts};}},'solana:signTransaction':{supportedTransactionVersions:['legacy',0],signTransaction:async(input:{chain:string;transaction:Uint8Array})=>{expect(input.chain).toBe('solana:devnet');signs++;return [{signedTransaction:input.transaction}];}}}} as Wallet;
    const provider=standardSolanaProvider(standard,'testnet');expect(connections).toBe(0);expect(()=>standardSolanaProvider(standard,'mainnet')).toThrow('desteklemiyor');await provider.connect();
    const tx=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(wallet),recentBlockhash:otherWallet,instructions:[]}).compileToV0Message());expect(await provider.signTransaction(tx)).toBeInstanceOf(Uint8Array);expect(signs).toBe(1);
    accounts=[];await expect(provider.signTransaction(tx)).rejects.toThrow('hesabı değişti');expect(signs).toBe(1);
  });
});

describe('original burn snapshot and onchain delivery evidence',()=>{
  test('history restores bigint SDK data, isolates environments, rejects mutations and canonicalizes RPCs',()=>{
    const r=record(),json=encodeSolanaBridgeRecords([r]),decoded=decodeSolanaBridgeRecords(json,definitions,'testnet')[0];expect((decoded.result.steps[0].data as {nonce:bigint}).nonce).toBe(123n);
    expect(()=>decodeSolanaBridgeRecords(json,mainnet,'mainnet')).toThrow();
    expect(()=>decodeSolanaBridgeRecords(encodeSolanaBridgeRecords([{...r,recipient:otherWallet}]),definitions,'testnet')).toThrow('özeti');
    const poisoned=record();poisoned.result.source.chain={...poisoned.result.source.chain,rpcEndpoints:['https://attacker.invalid']};expect(decodeSolanaBridgeRecords(encodeSolanaBridgeRecords([poisoned]),definitions,'testnet')[0].result.source.chain.rpcEndpoints).toEqual(definitions.arc.rpcEndpoints);
    expect(validSolanaSignature(solSignature)).toBe(true);expect(validSolanaSignature(wallet)).toBe(false);expect(solanaBridgeExplorer(r,'burn')).toContain('explorer.testnet.arc.io');
  });
  test('successful original burn survives later errors and retry only receives that snapshot',async()=>{
    let r=record();r.result=checkpointSolanaStep(r.result,{name:'burn',state:'error',errorMessage:'transport timeout'});expect(solanaBridgeStep(r.result,'burn')?.state).toBe('success');
    const calls:unknown[]=[];const retry={retryBridge:async(result:unknown,context:unknown)=>{calls.push({result,context});return result as SolanaBridgeRecord['result'];}};
    const context={from:{},to:{}} as RetryContext;expect(await resumeSolanaBridge(retry,r,evm,wallet,context)).toBe(r.result);expect(calls.length).toBe(1);expect((calls[0] as {result:unknown}).result).toBe(r.result);
    await expect(resumeSolanaBridge(retry,r,evmOther,wallet,context)).rejects.toThrow();await expect(resumeSolanaBridge(retry,{...r,result:{...r.result,steps:[{name:'burn',state:'pending',txHash:arcHash}]}},evm,wallet,context)).rejects.toThrow();expect(calls.length).toBe(1);
  });
  test('Solana delivery requires matching signature, CCTP programs and correct recipient USDC delta',()=>{
    const r=record();r.result.steps.push({name:'mint',state:'success',txHash:solSignature});const tx=receipt(r);expect(verifySolanaReceipt(tx,r,'mint')).toBe(99000n);
    const wrongOwner=receipt(r);wrongOwner.meta!.postTokenBalances![0].owner=otherWallet;expect(()=>verifySolanaReceipt(wrongOwner,r,'mint')).toThrow();
    const failed=receipt(r);failed.meta!.err={InstructionError:[0,'Custom']};expect(()=>verifySolanaReceipt(failed,r,'mint')).toThrow('başarılı');
    const wrongPrograms=receipt(r);wrongPrograms.meta!.logMessages=[];expect(()=>verifySolanaReceipt(wrongPrograms,r,'mint')).toThrow('CCTP');
    const tooMuch=receipt(r);tooMuch.meta!.postTokenBalances![0].uiTokenAmount.amount='100001';expect(()=>verifySolanaReceipt(tooMuch,r,'mint')).toThrow('tutar');
    const wrongSignature=receipt(r);wrongSignature.transaction.signatures=[arcHash];expect(()=>verifySolanaReceipt(wrongSignature,r,'mint')).toThrow('imzası');
    expect(()=>verifySolanaReceipt(null,r,'mint')).toThrow();
  });
  test('Solana source burn proof requires exact native USDC decrease',()=>{
    const r=record('solana-to-arc');expect(verifySolanaReceipt(receipt(r,'burn'),r,'burn')).toBe(100000n);
    const wrong=receipt(r,'burn');wrong.meta!.postTokenBalances![0].uiTokenAmount.amount='1';expect(()=>verifySolanaReceipt(wrong,r,'burn')).toThrow('tutar');
  });
});
