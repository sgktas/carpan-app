import type {EcosystemEntry,EcosystemProfile,EcosystemText} from '../src/ecosystem';

const text=(en:string,tr:string):EcosystemText=>({en,tr});
const resource=(en:string,tr:string,url:string)=>({title:text(en,tr),url});
const action=(en:string,tr:string,to:string)=>({label:text(en,tr),to});
const directory='https://www.arc.io/ecosystem';
const indexers='https://docs.arc.io/arc/tools/data-indexers';
const contracts='https://docs.arc.io/arc/references/contract-addresses';
const listed=text('Arc lists this project in its ecosystem directory. This snapshot does not establish a deployed Arc market or contract.','Arc bu projeyi ekosistem kataloğunda listeliyor. Bu inceleme, dağıtılmış Arc piyasası veya kontratı bulunduğunu kanıtlamıyor.');
const explorer=action('Explore Arc activity','Arc hareketlerini incele','/arc?view=explorer');
const profiles:Record<string,EcosystemProfile>={
  arc:{overview:text('Arc is Circle’s EVM-compatible settlement network, using USDC for gas. Its ecosystem combines financial applications, assets and developer infrastructure.','Arc, gas için USDC kullanan Circle’ın EVM uyumlu mutabakat ağıdır. Ekosisteminde finans uygulamaları, varlıklar ve geliştirici altyapısı birlikte yer alır.'),capabilities:[text('USDC gas','USDC gas'),text('Financial applications','Finans uygulamaları'),text('Developer programmes','Geliştirici programları')],arcContext:text('The official announcement confirms mainnet availability. Network roadmap targets and builder programmes have their own sources; a grant is not an airdrop or guaranteed allocation.','Resmî duyuru mainnet kullanılabilirliğini doğrular. Ağ yol haritası hedefleri ve geliştirici programları ayrı kaynaklara sahiptir; hibe airdrop veya garantili pay değildir.'),resources:[resource('Arc platform','Arc platformu','https://www.arc.io/'),resource('Arc House','Arc House','https://community.arc.io/en')],actions:[explorer]},
  extended:{overview:text('Extended is a trading platform. Arc House announces a planned migration of its settlement network to Arc. The current project documentation also describes Starknet infrastructure; migration completion is not verified in this snapshot.','Extended bir işlem platformudur. Arc House, mutabakat ağının Arc’a planlanan geçişini duyuruyor. Mevcut proje belgeleri Starknet altyapısını da açıklıyor; bu incelemede geçişin tamamlandığı doğrulanmıyor.'),capabilities:[text('Trading infrastructure','İşlem altyapısı'),text('Announced migration','Duyurulan geçiş')],arcContext:text('Announced for the week of 19 October 2026, not a verified deployed Arc contract or token launch. No Arc address is inferred.','19 Ekim 2026 haftası için duyurulmuştur; doğrulanmış Arc kontrat dağıtımı veya token lansmanı değildir. Arc adresi çıkarımı yapılmaz.'),resources:[resource('Extended documentation','Extended belgeleri','https://docs.extended.exchange/'),resource('Arc House announcement','Arc House duyurusu','https://community.arc.io/en')],actions:[explorer]},
  circle:{
    overview:text('Circle builds stablecoin and financial infrastructure. Its USDC and EURC assets support digital payments and settlement; Arc provides the network context for the contracts below.','Circle, stablecoin ve finans altyapısı geliştirir. USDC ve EURC dijital ödeme ve mutabakat için kullanılır; aşağıdaki kontratlar Arc üzerindeki karşılıklarını gösterir.'),
    capabilities:[text('Digital dollar and euro assets','Dijital dolar ve euro varlıkları'),text('Payment infrastructure','Ödeme altyapısı'),text('Developer tools','Geliştirici araçları')],
    arcContext:text('Arc documents the USDC and EURC mainnet addresses. USDC is also Arc’s gas asset; its native and ERC-20 views represent the same funds.','Arc, USDC ve EURC mainnet adreslerini belgeliyor. USDC aynı zamanda gas varlığıdır; yerel ve ERC-20 görünümleri aynı bakiyeyi temsil eder.'),
    resources:[resource('Circle platform','Circle platformu','https://www.circle.com'),resource('Arc contract reference','Arc kontrat referansı',contracts)],
    actions:[action('Open Finance','Finansı aç','/finance'),action('Explore USDC transfers','USDC transferlerini incele','/arc')],
  },
  cctp:{
    overview:text('CCTP moves USDC between supported blockchains by burning on the source chain and minting on the destination. Bridge Kit gives applications a wallet-connected integration path.','CCTP, kaynak ağda yakıp hedef ağda basarak USDC’yi desteklenen blok zincirleri arasında taşır. Bridge Kit, uygulamalara cüzdan bağlantılı entegrasyon sunar.'),
    capabilities:[text('Burn-and-mint transfers','Yakma ve basma transferleri'),text('Fast or standard transfers','Hızlı veya standart transferler'),text('Destination hooks','Hedef ağ çağrıları')],
    arcContext:text('Arc’s reference lists TokenMessengerV2 and MessageTransmitterV2. Carpan’s bridge uses Circle’s USDC route; other CCTP asset capabilities are not enabled here.','Arc referansı TokenMessengerV2 ve MessageTransmitterV2 adreslerini listeler. Carpan köprüsü Circle’ın USDC rotasını kullanır; diğer CCTP varlık işlevleri burada etkin değildir.'),
    resources:[resource('CCTP protocol documentation','CCTP protokol belgeleri','https://developers.circle.com/cctp'),resource('Arc contract reference','Arc kontrat referansı',contracts)],
    actions:[action('Open USDC bridge','USDC köprüsünü aç','/arc?view=bridge&environment=mainnet')],
  },
  gateway:{
    overview:text('Gateway combines deposits across supported chains into a unified USDC balance. Applications can access that balance on a supported destination after the initial deposit is established.','Gateway, desteklenen ağlardaki yatırımları ortak bir USDC bakiyesinde birleştirir. İlk yatırım tamamlandıktan sonra uygulamalar bakiyeyi desteklenen hedef ağda kullanabilir.'),
    capabilities:[text('Unified USDC balance','Ortak USDC bakiyesi'),text('Crosschain access','Ağlar arası erişim'),text('Signed authorizations','İmzalı yetkilendirme')],
    arcContext:text('GatewayWallet and GatewayMinter have documented Arc mainnet addresses. Carpan offers contract research; a Gateway deposit or spend interface is not integrated.','GatewayWallet ve GatewayMinter için Arc mainnet adresleri belgelenmiştir. Carpan kontrat araştırması sunar; Gateway yatırma veya harcama arayüzü entegre değildir.'),
    resources:[resource('Gateway integration guide','Gateway entegrasyon rehberi','https://developers.circle.com/gateway'),resource('Arc contract reference','Arc kontrat referansı',contracts)],actions:[explorer],
  },
  stablefx:{
    overview:text('StableFX combines institutional request-for-quote trading with stablecoin settlement on Arc. Access is permissioned; an escrow contract coordinates settlement of both sides of a trade.','StableFX, kurumsal teklif talebi işlemlerini Arc üzerinde stablecoin mutabakatıyla birleştirir. Erişim izinlidir; emanet kontratı işlemin iki tarafının mutabakatını koordine eder.'),
    capabilities:[text('RFQ execution','Teklif talebi işlemleri'),text('Stablecoin FX settlement','Stablecoin döviz mutabakatı'),text('Institutional integration','Kurumsal entegrasyon')],
    arcContext:text('The FxEscrow mainnet address is documented by Arc. Carpan can inspect this contract; it does not offer StableFX quotes or institutional trading access.','FxEscrow mainnet adresi Arc tarafından belgelenmiştir. Carpan kontratı inceleyebilir; StableFX teklifi veya kurumsal işlem erişimi sunmaz.'),
    resources:[resource('StableFX documentation','StableFX belgeleri','https://developers.circle.com/stablefx'),resource('Arc contract reference','Arc kontrat referansı',contracts)],actions:[explorer],
  },
  aave:{
    overview:text('Aave is a non-custodial liquidity protocol. Suppliers provide assets to lending markets and borrowers use collateral to access liquidity. Its documentation describes market parameters, contracts and integration tools.','Aave, saklama hizmeti sunmayan bir likidite protokolüdür. Kullanıcılar borç verme piyasalarına varlık sağlar veya teminat karşılığında borç alır. Belgeleri piyasa parametrelerini, kontratları ve entegrasyon araçlarını açıklar.'),
    capabilities:[text('Asset supply','Varlık sağlama'),text('Collateralized borrowing','Teminatlı borçlanma'),text('Market and risk parameters','Piyasa ve risk parametreleri')],arcContext:listed,
    resources:[resource('Protocol and integration docs','Protokol ve entegrasyon belgeleri','https://aave.com/docs'),resource('Arc ecosystem listing','Arc ekosistem kaydı',directory)],actions:[explorer],
  },
  '1inch':{
    overview:text('1inch provides decentralized trading and aggregation infrastructure. Its products help users and applications discover swap routes across available liquidity sources.','1inch, merkeziyetsiz işlem ve likidite toplama altyapısı sunar. Ürünleri, kullanıcıların ve uygulamaların mevcut likidite kaynakları arasında takas rotaları bulmasına yardımcı olur.'),
    capabilities:[text('DEX aggregation','DEX likidite toplama'),text('Swap routing','Takas rotalama'),text('Trading tools','İşlem araçları')],arcContext:listed,
    resources:[resource('Official products','Resmî ürünler','https://1inch.com/'),resource('Arc ecosystem listing','Arc ekosistem kaydı',directory)],actions:[explorer],
  },
  across:{
    overview:text('Across provides crosschain bridging and swap infrastructure. Its intent-based approach uses relayers to fulfil transfers between supported networks. A project listing does not confirm a particular route is available.','Across, ağlar arası köprü ve takas altyapısı sunar. Niyet temelli yaklaşımı, desteklenen ağlar arasındaki transferleri gerçekleştiren aktarıcılar kullanır. Proje kaydı, belirli bir rotanın kullanılabilir olduğunu doğrulamaz.'),
    capabilities:[text('Crosschain transfers','Ağlar arası transferler'),text('Intent-based routing','Niyet temelli rotalama'),text('Bridge and swap products','Köprü ve takas ürünleri')],arcContext:listed,
    resources:[resource('Across products and network selection','Across ürünleri ve ağ seçimi','https://across.to/'),resource('Arc ecosystem listing','Arc ekosistem kaydı',directory)],actions:[explorer],
  },
  blockscout:{
    overview:text('Blockscout provides open-source blockchain exploration and data APIs. Researchers can inspect addresses, transactions, tokens and verified contract information. Carpan’s Terminal uses explorer data alongside its own Arc indexer.','Blockscout, açık kaynak blok zinciri gezgini ve veri API’leri sunar. Araştırmacılar adresleri, işlemleri, tokenları ve doğrulanmış kontrat bilgilerini inceleyebilir. Carpan Terminal, gezgin verisini kendi Arc indeksleyicisiyle birlikte kullanır.'),
    capabilities:[text('Transaction and address research','İşlem ve adres araştırması'),text('Contract exploration','Kontrat inceleme'),text('Explorer APIs','Gezgin API’leri')],
    arcContext:text('The directory lists Blockscout. Use Terminal for Carpan’s Arc data views; a provider’s presence does not guarantee every endpoint is available on Arc.','Katalog Blockscout’u listeler. Carpan’ın Arc veri görünümleri için Terminal’i kullan; sağlayıcının bulunması her uç noktanın Arc’ta çalıştığını garanti etmez.'),
    resources:[resource('Blockscout platform','Blockscout platformu','https://www.blockscout.com/'),resource('Arc ecosystem listing','Arc ekosistem kaydı',directory)],actions:[explorer],
  },
  alchemy:{
    overview:text('Alchemy provides blockchain infrastructure and developer data services. Applications use its APIs to read balances, transfers and history, and webhooks to receive onchain events.','Alchemy, blok zinciri altyapısı ve geliştirici veri hizmetleri sunar. Uygulamalar API’lerle bakiye, transfer ve geçmişi okur; webhook’larla zincir olaylarını alır.'),
    capabilities:[text('Data APIs','Veri API’leri'),text('Event webhooks','Olay webhook’ları'),text('Developer infrastructure','Geliştirici altyapısı')],
    arcContext:text('Arc’s data-indexer guide describes Alchemy APIs and webhooks for Arc data. Carpan has not enabled an Alchemy integration.','Arc veri indeksleyici rehberi, Arc verisi için Alchemy API’lerini ve webhook’larını açıklar. Carpan’da Alchemy entegrasyonu etkin değildir.'),
    resources:[resource('Alchemy platform','Alchemy platformu','https://www.alchemy.com/'),resource('Arc data-indexer guide','Arc veri indeksleyici rehberi',indexers)],actions:[explorer],
  },
  chainlink:{
    overview:text('Chainlink builds oracle and interoperability infrastructure connecting smart contracts to external data and crosschain services. Available feeds and integrations depend on the specific network and product.','Chainlink, akıllı kontratları dış veriye ve ağlar arası hizmetlere bağlayan oracle ve birlikte çalışabilirlik altyapısı geliştirir. Veri akışı ve entegrasyon kapsamı ağa ve ürüne göre değişir.'),
    capabilities:[text('Oracle data','Oracle verileri'),text('Crosschain infrastructure','Ağlar arası altyapı'),text('Smart contract connectivity','Akıllı kontrat bağlantıları')],arcContext:listed,
    resources:[resource('Chainlink platform','Chainlink platformu','https://chain.link/'),resource('Arc ecosystem listing','Arc ekosistem kaydı',directory)],actions:[explorer],
  },
  goldsky:{
    overview:text('Goldsky supplies onchain data pipelines and indexing services. Developers can stream blockchain data to their own storage or query indexed data through subgraphs.','Goldsky, zincir verisi akışları ve indeksleme hizmetleri sunar. Geliştiriciler blok zinciri verisini kendi depolarına aktarabilir veya indekslenmiş veriyi subgraph’larla sorgulayabilir.'),
    capabilities:[text('Real-time data pipelines','Gerçek zamanlı veri akışları'),text('Subgraph queries','Subgraph sorguları'),text('Database delivery','Veritabanına aktarım')],
    arcContext:text('Arc’s guide names Goldsky pipelines and subgraphs for Arc. This is an infrastructure reference; Carpan does not currently use Goldsky as a data provider.','Arc rehberi, Arc için Goldsky veri akışlarını ve subgraph’larını belirtir. Bu bir altyapı referansıdır; Carpan şu anda Goldsky’yi veri sağlayıcısı olarak kullanmaz.'),
    resources:[resource('Goldsky platform','Goldsky platformu','https://goldsky.com/'),resource('Arc data-indexer guide','Arc veri indeksleyici rehberi',indexers)],actions:[explorer],
  },
  thegraph:{
    overview:text('The Graph organizes blockchain data for application queries. Subgraphs expose indexed contract data, while Substreams support data processing and delivery to applications or databases.','The Graph, uygulama sorguları için blok zinciri verisini düzenler. Subgraph’lar indekslenmiş kontrat verisini sunar; Substreams veriyi işler ve uygulamalara veya veritabanlarına aktarır.'),
    capabilities:[text('Subgraph queries','Subgraph sorguları'),text('Substreams processing','Substreams veri işleme'),text('Indexed contract data','İndekslenmiş kontrat verisi')],
    arcContext:text('Arc’s guide includes The Graph for data queries and streams. No Carpan subgraph or integration is claimed by this listing.','Arc rehberi, veri sorguları ve akışları için The Graph’ı içerir. Bu kayıt, Carpan’a ait subgraph veya entegrasyon bulunduğu anlamına gelmez.'),
    resources:[resource('The Graph products','The Graph ürünleri','https://thegraph.com/'),resource('Arc data-indexer guide','Arc veri indeksleyici rehberi',indexers)],actions:[explorer],
  },
};

export function ecosystemResearch(id:string):Pick<EcosystemEntry,'logo'|'profile'> {
  const key=id.replace(/^eco_/,'');
  const profile=profiles[key];if(!profile)return {};
  if(['arc','extended'].includes(key))return {profile,logo:{src:`/images/ecosystem/${key}.svg`,sourceUrl:key==='arc'?'https://www.arc.io/':'https://extended.exchange/',background:'#111719'}};
  const circle=['circle','cctp','gateway','stablefx'].includes(key);
  const name=circle?'circle':key;
  const svg=['aave','across','alchemy','blockscout','thegraph'].includes(name);
  return {profile,logo:{src:`/images/ecosystem/${name}.${svg?'svg':'png'}`,sourceUrl:circle?'https://developers.circle.com/cctp':name==='thegraph'?'https://thegraph.com/brand/':directory,background:name==='aave'?'#f4f2fa':name==='thegraph'?'#f8f6ff':'#111719'}};
}
