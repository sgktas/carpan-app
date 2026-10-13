import type {Database} from 'bun:sqlite';
import type {EcosystemEntry,EcosystemAsset} from '../src/ecosystem';
import type {Project} from '../src/types';
import {projectAddresses} from './projectAddresses';
import {ecosystemResearch} from './ecosystemProfiles';
import {projectInsights} from './ecosystemInsights';

const checkedAt='2026-10-09';
const directory='https://www.arc.io/ecosystem';
const contracts='https://docs.arc.io/arc/references/contract-addresses';
const source=(title:string,url:string)=>({title,url,checkedAt});
const participant=(id:string,name:string,domain:string,category:string,en:string,tr:string,color:string,documentation?:string):EcosystemEntry=>({
  id:`eco_${id}`,name,domain,category,description:{en,tr},color,stage:'participant',sources:[source(documentation?'Arc integration documentation':'Arc ecosystem directory',documentation||directory),source('Official website',`https://${domain}`)],addresses:[],referral:false,curated:true,
});
export const curatedEcosystem:EcosystemEntry[]=[
  {id:'eco_circle',name:'Circle',domain:'circle.com',category:'Stablecoins',stage:'mainnet',description:{en:'Stablecoins and settlement infrastructure on Arc.',tr:'Arc üzerinde stablecoin ve ödeme altyapısı.'},color:'#9f8bff',sources:[source('Arc contract reference',contracts),source('Circle', 'https://www.circle.com')],addresses:[{address:'0x3600000000000000000000000000000000000000',label:'USDC · ERC-20 interface',sourceUrl:contracts,chainId:5042},{address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',label:'EURC',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_cctp',name:'Circle CCTP',domain:'circle.com',category:'Interoperability',stage:'mainnet',description:{en:'Protocol for crosschain stablecoin transfers.',tr:'Ağlar arasında stablecoin transfer protokolü.'},color:'#75b8ff',sources:[source('Arc contract reference',contracts),source('CCTP documentation','https://developers.circle.com/cctp')],addresses:[{address:'0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',label:'TokenMessengerV2',sourceUrl:contracts,chainId:5042},{address:'0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',label:'MessageTransmitterV2',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_gateway',name:'Circle Gateway',domain:'circle.com',category:'Interoperability',stage:'mainnet',description:{en:'Shared USDC balances across supported networks.',tr:'Desteklenen ağlar arasında ortak USDC bakiyesi.'},color:'#8ae0c0',sources:[source('Arc contract reference',contracts),source('Gateway documentation','https://developers.circle.com/gateway')],addresses:[{address:'0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',label:'GatewayWallet',sourceUrl:contracts,chainId:5042},{address:'0x2222222d7164433c4C09B0b0D809a9b52C04C205',label:'GatewayMinter',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_stablefx',name:'StableFX',domain:'circle.com',category:'Trading',stage:'mainnet',description:{en:'Stablecoin FX settlement infrastructure.',tr:'Stablecoin döviz işlemleri için mutabakat altyapısı.'},color:'#e9c489',sources:[source('Arc contract reference',contracts),source('StableFX documentation','https://developers.circle.com/stablefx')],addresses:[{address:'0xe2E5F173576B513d994073CCbDaCBE027d43DFe6',label:'FxEscrow',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  participant('aave','Aave','aave.com','DeFi','Lending and borrowing infrastructure.','Borç alma ve verme altyapısı.','#af9aff'),
  participant('1inch','1inch','1inch.com','Trading','Decentralized exchange aggregation.','Merkeziyetsiz borsa toplayıcısı.','#7baaff'),
  participant('across','Across','across.to','Interoperability','Intent-based crosschain transfer infrastructure.','Niyet temelli ağlar arası transfer altyapısı.','#82e5cf'),
  participant('blockscout','Blockscout','blockscout.com','Data & Infrastructure','Open-source blockchain explorer.','Açık kaynak blok zinciri gezgini.','#b19af9'),
  participant('alchemy','Alchemy','alchemy.com','Data & Infrastructure','RPC and blockchain data services.','RPC ve blok zinciri veri hizmetleri.','#69b4ff','https://docs.arc.io/arc/tools/data-indexers'),
  participant('chainlink','Chainlink','chain.link','Data & Infrastructure','Oracle and data infrastructure.','Oracle ve veri altyapısı.','#78a7ff'),
  participant('goldsky','Goldsky','goldsky.com','Data & Infrastructure','Onchain indexing and data pipelines.','Zincir verisi indeksleme ve veri akışları.','#e5b46d','https://docs.arc.io/arc/tools/data-indexers'),
  participant('thegraph','The Graph','thegraph.com','Data & Infrastructure','Decentralized onchain data indexing.','Merkeziyetsiz zincir verisi indeksleme.','#ae94ef','https://docs.arc.io/arc/tools/data-indexers'),
  {id:'eco_arc',name:'Arc',domain:'arc.io',category:'Data & Infrastructure',stage:'mainnet',description:{en:'USDC-powered settlement network and builder ecosystem.',tr:'USDC ile çalışan mutabakat ağı ve geliştirici ekosistemi.'},color:'#b9abe8',sources:[{title:'Arc Mainnet announcement',url:'https://www.arc.io/blog/arc-economic-os-internet',checkedAt:'2026-10-10'}],addresses:[],referral:false,curated:true},
  {id:'eco_extended',name:'Extended',domain:'extended.exchange',category:'Trading',stage:'announced',description:{en:'Trading platform with an announced Arc settlement migration.',tr:'Arc mutabakat geçişi duyurulan işlem platformu.'},color:'#93d5b0',sources:[{title:'Arc House migration announcement',url:'https://community.arc.io/en',checkedAt:'2026-10-10'},{title:'Official project documentation',url:'https://docs.extended.exchange/',checkedAt:'2026-10-10'}],addresses:[],referral:false,curated:true},
].map(p=>({...p,...ecosystemResearch(p.id),research:projectInsights(p.id)})) as EcosystemEntry[];
export const ecosystemAssets:EcosystemAsset[]=[
  {symbol:'USDC',name:'USD Coin',address:'0x3600000000000000000000000000000000000000',decimals:6,kind:'Native stablecoin',sourceUrl:contracts,projectId:'eco_circle',checkedAt},
  {symbol:'EURC',name:'Euro Coin',address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',decimals:6,kind:'Stablecoin',sourceUrl:contracts,projectId:'eco_circle',checkedAt},
  {symbol:'USYC',name:'USYC',address:'0x8a5D989Bbb96929F689B0200f435f53dA42bF490',decimals:6,kind:'Permissioned fund token',sourceUrl:contracts,projectId:'eco_circle',checkedAt},
  {symbol:'cirBTC',name:'Circle wrapped Bitcoin',address:'0x171A4217b86A807A64eB94757Db6849fb4bDbAA0',decimals:8,kind:'Wrapped asset',sourceUrl:contracts,projectId:'eco_circle',checkedAt},
  {symbol:'WETH',name:'Wrapped Ether',address:'0x128cC466B61f542da60c70e3aA11c10e19B84EDB',decimals:18,kind:'Bridged asset',sourceUrl:contracts,projectId:'',checkedAt},
];
export function curatedProject(id:string):Project|undefined {
 const p=curatedEcosystem.find(p=>p.id===id);if(!p)return;
 return {id:p.id,name:p.name,description:p.description.en,officialDomain:p.domain,submittedBy:'',arcContractAddress:null,referralLinkPattern:`https://${p.domain}`,referralMode:'url',validParticipationCondition:'',participantBenefit:'',sponsoredUntil:null,validationMethod:'official_source_catalog',allowsFreeParticipation:false,allowsPaidParticipation:false,status:'approved',approvedBy:null,approvedAt:null,rejectionReason:null,createdAt:checkedAt+'T00:00:00.000Z',isDemo:false};
}
export function curatedRelatedProjects(address:string){
 const normalized=address.toLowerCase();
 return curatedEcosystem.flatMap(p=>{
  const known=p.addresses.find(a=>a.chainId===5042&&a.address.toLowerCase()===normalized);
  const asset=ecosystemAssets.find(a=>a.projectId===p.id&&a.address.toLowerCase()===normalized);
  if(!known&&!asset)return [];
  return [{id:p.id,name:p.name,officialDomain:p.domain,label:known?.label||asset!.symbol,role:'contract',sourceUrl:known?.sourceUrl||asset!.sourceUrl,sourceNote:'Address documented in the official Arc contract reference.',reviewedAt:checkedAt+'T00:00:00.000Z'}];
 });
}
export function ecosystemCatalog(db:Database,projects:Project[],demo:boolean){
 const community:EcosystemEntry[]=projects.map(p=>({id:p.id,name:p.name,domain:p.officialDomain,category:'Community projects',stage:'unclassified',description:{en:p.description,tr:p.description},color:'#8ad9b2',sources:[{title:'Submitted website',url:`https://${p.officialDomain}`,checkedAt:p.approvedAt?.slice(0,10)||''}],addresses:(projectAddresses(db,p.id) as {address:string;label:string;sourceUrl:string}[]).map(a=>({address:a.address,label:a.label,sourceUrl:a.sourceUrl,chainId:5042})),referral:p.allowsFreeParticipation,curated:false}));
 // A submitted record is not proof of deployment or a market listing. Reviewed addresses retain their own source.
 return {projects:[...(demo?[]:curatedEcosystem),...community],assets:demo?[]:ecosystemAssets,checkedAt};
}
