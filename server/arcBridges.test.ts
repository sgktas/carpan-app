import {expect,test} from 'bun:test';
import {encodeAbiParameters,encodeEventTopics,parseAbiParameters} from 'viem';
import {ARC_BRIDGES,BRIDGE_ABI,bridgeEvidence} from '../src/arc-bridges';
import {normalizeExplorerRow} from './chainExplorer';
const recipient='0x1111111111111111111111111111111111111111';
const token='0x3600000000000000000000000000000000000000';
function incoming(){return normalizeExplorerRow({address:{hash:ARC_BRIDGES[0].address},topics:encodeEventTopics({abi:BRIDGE_ABI,eventName:'MintAndWithdraw',args:{mintRecipient:recipient,mintToken:token}}),data:encodeAbiParameters(parseAbiParameters('uint256,uint256'),[12345678901234567890n,4n])},'5042','logs',0);}
test('CCTP raw event decodes exact integer amount and does not invent source network',()=>{expect(bridgeEvidence(incoming(),'5042')).toEqual({label:'Arc inflow · mint',direction:'in',raw:'12345678901234567890',token,domain:null});});
test('same event from another emitter or another chain is not bridge proof',()=>{const row=incoming();expect(bridgeEvidence({...row,address:recipient},'5042')).toBeNull();expect(bridgeEvidence(row,'1')).toBeNull();});
test('forged decoded label without matching raw event is rejected',()=>{const row=incoming();expect(bridgeEvidence({...row,data:{decoded:{method_call:'MintAndWithdraw(...)'},topics:[],data:'0x'}},'5042')).toBeNull();expect(bridgeEvidence({...row,data:{...row.data,data:'0x01'}},'5042')).toBeNull();});
test('Gateway receipt carries source domain and exact amount',()=>{
 const row=normalizeExplorerRow({address:{hash:ARC_BRIDGES[5].address},topics:encodeEventTopics({abi:BRIDGE_ABI,eventName:'AttestationUsed',args:{token,recipient,transferSpecHash:('0x'+'a'.repeat(64)) as `0x${string}`}}),data:encodeAbiParameters(parseAbiParameters('uint32,bytes32,bytes32,uint256'),[6,('0x'+'b'.repeat(64)) as `0x${string}`,('0x'+'c'.repeat(64)) as `0x${string}`,1000000n])},'5042','logs',0);
 expect(bridgeEvidence(row,'5042')).toEqual({label:'Arc inflow · Gateway',direction:'in',raw:'1000000',token,domain:6});
});
test('CCTP outbound exposes destination domain without asserting delivery',()=>{
 const bytes=('0x'+'0'.repeat(64)) as `0x${string}`;
 const row=normalizeExplorerRow({address:{hash:ARC_BRIDGES[0].address},topics:encodeEventTopics({abi:BRIDGE_ABI,eventName:'DepositForBurn',args:{burnToken:token,depositor:recipient,minFinalityThreshold:1000}}),data:encodeAbiParameters(parseAbiParameters('uint256,bytes32,uint32,bytes32,bytes32,uint256,bytes'),[40000000n,bytes,6,bytes,bytes,10000n,'0x'])},'5042','logs',0);
 expect(bridgeEvidence(row,'5042')).toEqual({label:'Arc outflow · burn',direction:'out',raw:'40000000',token,domain:6});
});
