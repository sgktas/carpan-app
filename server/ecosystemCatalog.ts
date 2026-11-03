import type {Database} from 'bun:sqlite';
import type {EcosystemEntry,EcosystemAsset} from '../src/ecosystem';
import type {Project} from '../src/types';
import {projectAddresses} from './projectAddresses';
import {ecosystemResearch} from './ecosystemProfiles';
import {projectInsights} from './ecosystemInsights';

const checkedAt='2026-10-25';
const directory='https://www.arc.io/ecosystem';
const arcMainnet='https://www.arc.io/blog/arc-economic-os-internet';
const contracts='https://docs.arc.io/arc/references/contract-addresses';
const source=(title:string,url:string)=>({title,url,checkedAt});
const participant=(id:string,name:string,domain:string,category:string,en:string,tr:string,color:string,evidence?:{title:string;url:string}):EcosystemEntry=>({
  id:`eco_${id}`,name,domain,category,description:{en,tr},color,stage:'participant',sources:[source('Arc ecosystem directory',directory),source(evidence?.title||'Arc Mainnet announcement',evidence?.url||arcMainnet)],addresses:[],referral:false,curated:true,
});
export const curatedEcosystem:EcosystemEntry[]=[
  {id:'eco_crossmint',name:'Crossmint',domain:'crossmint.com',category:'Payments',stage:'participant',description:{en:'Wallet, stablecoin payment and agent infrastructure described in Arc’s official partner spotlight.',tr:'Arc’ın resmî proje tanıtımında yer alan cüzdan, stablecoin ödeme ve ajan altyapısı.'},color:'#a1d5bd',sources:[{title:'Crossmint on Arc',url:'https://www.arc.io/blog/how-crossmint-supports-stablecoin-apps-and-the-agentic-economy-on-arc',checkedAt:'2026-11-02'}],addresses:[],referral:false,curated:true},
  {id:'eco_circle',name:'Circle',domain:'circle.com',category:'Stablecoins',stage:'mainnet',description:{en:'Stablecoins and settlement infrastructure on Arc.',tr:'Arc üzerinde stablecoin ve ödeme altyapısı.'},color:'#9f8bff',sources:[source('Arc contract reference',contracts),source('Circle', 'https://www.circle.com')],addresses:[{address:'0x3600000000000000000000000000000000000000',label:'USDC · ERC-20 interface',sourceUrl:contracts,chainId:5042},{address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',label:'EURC',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_cctp',name:'Circle CCTP',domain:'circle.com',category:'Interoperability',stage:'mainnet',description:{en:'Protocol for crosschain stablecoin transfers.',tr:'Ağlar arasında stablecoin transfer protokolü.'},color:'#75b8ff',sources:[source('Arc contract reference',contracts),source('CCTP documentation','https://developers.circle.com/cctp')],addresses:[{address:'0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',label:'TokenMessengerV2',sourceUrl:contracts,chainId:5042},{address:'0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',label:'MessageTransmitterV2',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_gateway',name:'Circle Gateway',domain:'circle.com',category:'Interoperability',stage:'mainnet',description:{en:'Shared USDC balances across supported networks.',tr:'Desteklenen ağlar arasında ortak USDC bakiyesi.'},color:'#8ae0c0',sources:[source('Arc contract reference',contracts),source('Gateway documentation','https://developers.circle.com/gateway')],addresses:[{address:'0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',label:'GatewayWallet',sourceUrl:contracts,chainId:5042},{address:'0x2222222d7164433c4C09B0b0D809a9b52C04C205',label:'GatewayMinter',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_stablefx',name:'StableFX',domain:'circle.com',category:'Trading',stage:'mainnet',description:{en:'Stablecoin FX settlement infrastructure.',tr:'Stablecoin döviz işlemleri için mutabakat altyapısı.'},color:'#e9c489',sources:[source('Arc contract reference',contracts),source('StableFX documentation','https://developers.circle.com/stablefx')],addresses:[{address:'0xe2E5F173576B513d994073CCbDaCBE027d43DFe6',label:'FxEscrow',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  participant('aave','Aave','aave.com','DeFi','Lending and borrowing infrastructure.','Borç alma ve verme altyapısı.','#af9aff'),
  participant('1inch','1inch','1inch.com','Trading','Decentralized exchange aggregation.','Merkeziyetsiz borsa toplayıcısı.','#7baaff'),
  participant('across','Across','across.to','Interoperability','Intent-based crosschain transfer infrastructure.','Niyet temelli ağlar arası transfer altyapısı.','#82e5cf'),
  participant('blockscout','Blockscout','blockscout.com','Data & Infrastructure','Open-source blockchain explorer.','Açık kaynak blok zinciri gezgini.','#b19af9'),
  participant('alchemy','Alchemy','alchemy.com','Data & Infrastructure','RPC and blockchain data services.','RPC ve blok zinciri veri hizmetleri.','#69b4ff',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  participant('chainlink','Chainlink','chain.link','Data & Infrastructure','Oracle and data infrastructure.','Oracle ve veri altyapısı.','#78a7ff'),
  participant('goldsky','Goldsky','goldsky.com','Data & Infrastructure','Onchain indexing and data pipelines.','Zincir verisi indeksleme ve veri akışları.','#e5b46d',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  participant('thegraph','The Graph','thegraph.com','Data & Infrastructure','Decentralized onchain data indexing.','Merkeziyetsiz zincir verisi indeksleme.','#ae94ef',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  participant('morpho','Morpho','morpho.org','DeFi','Non-custodial lending markets and vault infrastructure used by Arc Earn Kit.','Arc Earn Kit’in kullandığı saklamasız borç verme piyasaları ve vault altyapısı.','#87c5ad',{title:'Arc Earn Kit and Morpho integration',url:'https://www.arc.io/blog/how-earn-kit-keeps-usdc-in-arc-apps-productive-with-morpho-vaults'}),
  participant('uniswap','Uniswap','uniswap.org','Trading','Swap and liquidity infrastructure, including programmable v4 pools.','Programlanabilir v4 havuzları dâhil takas ve likidite altyapısı.','#ff9acb',{title:'Uniswap on Arc',url:'https://www.arc.io/blog/how-uniswap-brings-deep-liquidity-for-apps-on-arc'}),
  participant('aero','Aero','aero.xyz','Trading','Multichain spot exchange; Aero Lite launched on Arc and the unified Aero rollout includes Arc.','Çok ağlı spot borsa; Aero Lite Arc’ta açıldı ve birleşik Aero dağıtımı Arc’ı kapsıyor.','#8fd8bf',{title:'Aero launch update',url:'https://aero.xyz/articles/aero-launch-update-all-systems-go/'}),
  participant('0x','0x','0x.org','Trading','Open-source decentralized exchange infrastructure and developer toolkit.','Açık kaynaklı merkeziyetsiz borsa altyapısı ve geliştirici araç seti.','#b8a9ff'),
  participant('hibachi','Hibachi','hibachi.xyz','Trading','Building an institutional FX venue with offchain order matching and ZK-verified Arc settlement.','Arc üzerinde zincir dışı emir eşleştirme ve ZK doğrulamalı mutabakat kullanan kurumsal döviz platformu geliştiriyor.','#75c8d8',{title:'Hibachi on Arc',url:'https://www.arc.io/blog/how-hibachi-is-bringing-fx-price-discovery-to-arc'}),
  participant('pulsar','Pulsar','pulsar.money','Payments','Stablecoin-native cross-border money app; Arc says it is live on mainnet while product onboarding continues.','Stablecoin tabanlı sınır ötesi para uygulaması; Arc, ürün kullanıcı kabulü sürerken mainnet’te yayında olduğunu belirtiyor.','#f3b786',{title:'Pulsar on Arc',url:'https://www.arc.io/blog/how-pulsar-is-building-a-cross-border-money-experience-with-arc'}),
  participant('envio','Envio','envio.dev','Data & Infrastructure','Event-driven indexing framework and GraphQL APIs for Arc.','Arc için olay odaklı indeksleme çerçevesi ve GraphQL API’leri.','#89a9ff',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  participant('pinax','Pinax','pinax.network','Data & Infrastructure','RPC, archive access and Firehose streams for Arc data.','Arc verisi için RPC, arşiv erişimi ve Firehose akışları.','#e3a5c9',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  participant('thirdweb','thirdweb','thirdweb.com','Data & Infrastructure','Open-source tools for retrieving and transforming Arc blockchain data.','Arc blok zinciri verisini alma ve dönüştürme için açık kaynak araçlar.','#9cb8ff',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  participant('zerion','Zerion','zerion.io','Data & Infrastructure','Wallet and portfolio APIs for Arc balances, transactions and DeFi positions.','Arc bakiyeleri, işlemleri ve DeFi pozisyonları için cüzdan ve portföy API’leri.','#c09cff',{title:'Arc data-indexer documentation',url:'https://docs.arc.io/arc/tools/data-indexers'}),
  {id:'eco_arc',name:'Arc',domain:'arc.io',category:'Data & Infrastructure',stage:'mainnet',description:{en:'USDC-powered settlement network with mainnet ERC-8004 registries for agent identity, reputation and validation. No public ARC token is live.',tr:'Mainnet ERC-8004 ajan kimliği, itibar ve doğrulama kayıtları bulunan USDC tabanlı mutabakat ağı. Halka açık ARC tokenı yayında değil.'},color:'#b9abe8',sources:[source('Arc Mainnet announcement',arcMainnet),source('Arc contract reference',contracts),source('ARC whitepaper and launch status','https://www.arc.io/arc-token-whitepaper')],addresses:[{address:'0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',label:'ERC-8004 IdentityRegistry',sourceUrl:contracts,chainId:5042},{address:'0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',label:'ERC-8004 ReputationRegistry',sourceUrl:contracts,chainId:5042},{address:'0x8004Cc8439f36fd5F9F049d9Ff86523Df6dAAB58',label:'ERC-8004 ValidationRegistry',sourceUrl:contracts,chainId:5042}],referral:false,curated:true},
  {id:'eco_extended',name:'Extended',domain:'extended.exchange',category:'Trading',stage:'participant',description:{en:'Perpetual trading venue; Extended reports its Arc settlement migration completed on 22 October 2026.',tr:'Sürekli vadeli işlem platformu; Extended, Arc mutabakat geçişini 22 Ekim 2026’da tamamladığını bildiriyor.'},color:'#93d5b0',sources:[source('Extended official migration update','https://t.me/s/extended_updates'),source('Arc Mainnet announcement',arcMainnet)],addresses:[],referral:false,curated:true},
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
