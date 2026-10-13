import {AppKit} from '@circle-fin/app-kit';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {MAINNET_BRIDGE_FACTS,inspectMainnetChain,mainnetReader,verifiedMainnetDefinitions} from '../src/bridge-mainnet-config';

// Read-only: no private keys, wallet provider, signatures or transactions.
verifiedMainnetDefinitions(new AppKit());
const ids=process.argv.slice(2).map(Number),facts=ids.length?MAINNET_BRIDGE_FACTS.filter(f=>ids.includes(f.id)):MAINNET_BRIDGE_FACTS;
if(ids.length&&facts.length!==new Set(ids).size)throw new Error('Unsupported bridge chain ID.');
const file='.local/bridge-readiness-20261009.json';
const results:{chainId:number;[key:string]:unknown}[]=ids.length&&existsSync(file)?JSON.parse(readFileSync(file,'utf8')).results.filter((r:{chainId:number})=>!ids.includes(r.chainId)):[];let failed=false;
for(let offset=0;offset<facts.length;offset+=4){
 const batch=facts.slice(offset,offset+4),checked=await Promise.allSettled(batch.map(f=>inspectMainnetChain(f,mainnetReader(f.id))));
 for(const [i,r] of checked.entries()){const row=r.status==='fulfilled'?{ok:true,...r.value}:{ok:false,chainId:batch[i].id,name:batch[i].name,error:String(r.reason?.shortMessage||r.reason?.message||r.reason).slice(0,300)};results.push(row);console.log(JSON.stringify(row));if(r.status==='rejected')failed=true;}
}
writeFileSync(file,JSON.stringify({checkedAt:new Date().toISOString(),scope:'read-only configuration, no transfer',results},null,2));
if(failed)process.exitCode=1;
