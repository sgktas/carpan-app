import {test,expect} from 'bun:test';
import {encodeEventTopics,encodeAbiParameters,erc20Abi,type Hex,type TransactionReceipt} from 'viem';
import {gatewayRetryData,gatewayWithdrawalState,restoreGatewayRecord,gatewayKey,type GatewayRecord} from '../src/gateway';
import {verifyGatewayRemoval} from '../src/gateway-client';

const wallet=('0x'+'11'.repeat(20)) as Hex,recipient=('0x'+'22'.repeat(20)) as Hex,gatewayWallet=('0x'+'77'.repeat(20)) as Hex,usdc=('0x'+'36'.repeat(20)) as Hex;
const retry={attestation:('0x'+'ab'.repeat(200)) as Hex,signature:('0x'+'cd'.repeat(65)) as Hex};
const spend:GatewayRecord={version:1,sdkRevision:2,plan:{environment:'testnet',action:'spend',wallet,recipient,source:'Base_Sepolia',destination:'Arc_Testnet',amount:'0.05'},state:'uncertain',createdAt:1,minBlock:'10'};

test('only a RESUMABLE SDK error with hex attestation and signature becomes a continuation',()=>{
 expect(gatewayRetryData({recoverability:'RESUMABLE',cause:{trace:retry}})).toEqual(retry);
 expect(gatewayRetryData({recoverability:'FATAL',cause:{trace:retry}})).toBeNull();
 expect(gatewayRetryData({recoverability:'RESUMABLE',cause:{trace:{attestation:'nope',signature:retry.signature}}})).toBeNull();
 expect(gatewayRetryData({recoverability:'RESUMABLE',cause:{trace:{attestation:retry.attestation,signature:'0x'+'a'.repeat(2000)}}})).toBeNull();
 expect(gatewayRetryData(new Error('x'))).toBeNull();expect(gatewayRetryData(null)).toBeNull();
});

test('a saved continuation survives reload for spends only; source evidence is validated',()=>{
 const restored=restoreGatewayRecord(JSON.stringify({...spend,retry,sourceBefore:'1.25'}),wallet,'testnet')!;
 expect(restored.retry).toEqual(retry);expect(restored.sourceBefore).toBe('1.25');expect(restored.state).toBe('uncertain');
 // A pre-revision hashless record with a continuation must not be downgraded to "not submitted".
 expect(restoreGatewayRecord(JSON.stringify({...spend,sdkRevision:undefined,retry}),wallet,'testnet')!.state).toBe('uncertain');
 const deposit={...spend,plan:{...spend.plan,action:'deposit',recipient:wallet,destination:'Base_Sepolia'}};
 expect(restoreGatewayRecord(JSON.stringify({...deposit,retry}),wallet,'testnet')!.retry).toBeUndefined();
 expect(restoreGatewayRecord(JSON.stringify({...spend,sourceBefore:'1e3'}),wallet,'testnet')!.sourceBefore).toBeUndefined();
 expect(gatewayKey(wallet,'testnet')).toContain('testnet');
});

test('withdrawal state follows the contract block and converts the 7-day block delay into time',()=>{
 expect(gatewayWithdrawalState({chain:'Arc_Testnet',withdrawing:0n,withdrawalBlock:0n,current:100n,delay:1209600n}).state).toBe('none');
 const waiting=gatewayWithdrawalState({chain:'Arc_Testnet',withdrawing:5n,withdrawalBlock:1209700n,current:100n,delay:1209600n});
 expect(waiting.state).toBe('waiting');expect(waiting.blocksLeft).toBe(1209600n);expect(waiting.secondsLeft).toBe(604800);
 expect(gatewayWithdrawalState({chain:'Ethereum_Sepolia',withdrawing:5n,withdrawalBlock:100n,current:100n,delay:50400n}).state).toBe('ready');
 expect(gatewayWithdrawalState({chain:'Ethereum_Sepolia',withdrawing:5n,withdrawalBlock:25300n,current:100n,delay:50400n}).secondsLeft).toBe(302400);
});

test('a completed removal must move exactly the pending USDC from the Gateway Wallet to the owner',()=>{
 const transfer=(from:Hex,to:Hex,value:bigint,token=usdc)=>({address:token,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])});
 const receipt=(logs:unknown[],status:'success'|'reverted'='success',to:Hex=gatewayWallet)=>({status,from:wallet,to,logs}) as unknown as TransactionReceipt;
 expect(verifyGatewayRemoval(receipt([transfer(gatewayWallet,wallet,500n)]),wallet,gatewayWallet,usdc,500n)).toBe(true);
 expect(verifyGatewayRemoval(receipt([transfer(gatewayWallet,wallet,499n)]),wallet,gatewayWallet,usdc,500n)).toBe(false);
 expect(verifyGatewayRemoval(receipt([transfer(gatewayWallet,recipient,500n)]),wallet,gatewayWallet,usdc,500n)).toBe(false);
 expect(verifyGatewayRemoval(receipt([transfer(gatewayWallet,wallet,500n,recipient)]),wallet,gatewayWallet,usdc,500n)).toBe(false);
 expect(verifyGatewayRemoval(receipt([transfer(gatewayWallet,wallet,500n)],'reverted'),wallet,gatewayWallet,usdc,500n)).toBe(false);
 expect(verifyGatewayRemoval(receipt([transfer(gatewayWallet,wallet,500n)],'success',recipient),wallet,gatewayWallet,usdc,500n)).toBe(false);
});
