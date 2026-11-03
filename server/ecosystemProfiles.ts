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
  crossmint:{overview:text('Crossmint provides programmable wallets, stablecoin payment infrastructure and tools for agents. Arc’s October 20 partner spotlight describes its work bringing these capabilities to Arc.','Crossmint, programlanabilir cüzdanlar, stablecoin ödeme altyapısı ve ajan araçları sunar. Arc’ın 20 Ekim tanıtımı bu yeteneklerin Arc’a taşınmasına yönelik çalışmaları anlatır.'),capabilities:[text('Programmable wallets','Programlanabilir cüzdanlar'),text('Stablecoin payments','Stablecoin ödemeleri'),text('Agent infrastructure','Ajan altyapısı')],arcContext:text('This is a source-backed ecosystem listing. Individual feature availability, geographic coverage and contract deployment must be checked separately. Carpan does not claim a Crossmint integration.','Bu, kaynağa dayalı ekosistem kaydıdır. Özelliklerin kullanılabilirliği, ülke kapsamı ve kontrat dağıtımı ayrıca kontrol edilmelidir. Carpan için Crossmint entegrasyonu iddia edilmez.'),resources:[resource('Crossmint','Crossmint','https://www.crossmint.com/'),resource('Crossmint on Arc','Arc üzerinde Crossmint','https://www.arc.io/blog/how-crossmint-supports-stablecoin-apps-and-the-agentic-economy-on-arc')],actions:[explorer]},
  arc:{overview:text('Arc is Circle’s EVM-compatible settlement network, using USDC for gas. Its mainnet also documents ERC-8004 registries for agent identity, reputation and validation.','Arc, gas için USDC kullanan Circle’ın EVM uyumlu mutabakat ağıdır. Mainnet, ajan kimliği, itibarı ve doğrulaması için ERC-8004 kayıtlarını da belgeliyor.'),capabilities:[text('USDC gas','USDC gas'),text('Financial applications','Finans uygulamaları'),text('Agent identity registries','Ajan kimlik kayıtları')],arcContext:text('The official contract reference lists the ERC-8004 registry addresses shown below. ARC has not launched as a public token; the ARC whitepaper is exploratory and does not establish a token contract or market.','Resmî kontrat referansı aşağıda gösterilen ERC-8004 kayıt adreslerini listeliyor. ARC halka açık token olarak çıkmadı; ARC teknik belgesi keşif amaçlıdır ve token kontratı veya piyasası olduğunu göstermez.'),resources:[resource('Arc platform','Arc platformu','https://www.arc.io/'),resource('Arc contract reference','Arc kontrat referansı',contracts),resource('ARC whitepaper and status','ARC teknik belgesi ve durumu','https://www.arc.io/arc-token-whitepaper')],actions:[explorer]},
  extended:{overview:text('Extended is a perpetual trading venue. Its official update says the Arc settlement migration completed on 22 October 2026, with positions and orders carried across and deposits and withdrawals reopened.','Extended bir sürekli vadeli işlem platformudur. Resmî güncellemesi, pozisyonlar ve emirler taşınarak Arc mutabakat geçişinin 22 Ekim 2026’da tamamlandığını, yatırma ve çekmenin yeniden açıldığını bildiriyor.'),capabilities:[text('Perpetual trading','Sürekli vadeli işlemler'),text('Arc settlement','Arc mutabakatı'),text('Native USDC and cirBTC collateral','Yerel USDC ve cirBTC teminatı')],arcContext:text('The migration is reported complete by Extended. This profile does not list an Arc contract address or confirm any XTEN claim or token-market availability.','Extended geçişin tamamlandığını bildiriyor. Bu profil Arc kontrat adresi yayımlamıyor; XTEN talep veya token piyasasının açıldığını da doğrulamıyor.'),resources:[resource('Extended documentation','Extended belgeleri','https://docs.extended.exchange/'),resource('Official migration and XTEN updates','Resmî geçiş ve XTEN güncellemeleri','https://t.me/s/extended_updates')],actions:[explorer]},
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
  morpho:{
    overview:text('Morpho provides non-custodial lending markets and vault infrastructure. Arc Earn Kit uses Morpho as the underlying credit protocol for supported USDC and EURC opportunities.','Morpho, saklamasız borç verme piyasaları ve vault altyapısı sunar. Arc Earn Kit, desteklenen USDC ve EURC fırsatlarında temel kredi protokolü olarak Morpho’yu kullanır.'),
    capabilities:[text('Lending markets','Borç verme piyasaları'),text('Non-custodial vaults','Saklamasız vault’lar'),text('Embedded earn integrations','Uygulama içi getiri entegrasyonları')],
    arcContext:text('Arc’s official Earn Kit material confirms Morpho integration. This listing is not a yield recommendation; availability, vault terms, liquidity and risk are specific to each opportunity. No Morpho contract address is inferred.','Arc’ın resmî Earn Kit içeriği Morpho entegrasyonunu doğruluyor. Bu kayıt getiri önerisi değildir; kullanılabilirlik, vault koşulları, likidite ve risk her fırsata özgüdür. Morpho kontrat adresi çıkarımı yapılmamıştır.'),
    resources:[resource('Morpho protocol','Morpho protokolü','https://morpho.org/'),resource('Arc Earn Kit and Morpho','Arc Earn Kit ve Morpho','https://www.arc.io/blog/how-earn-kit-keeps-usdc-in-arc-apps-productive-with-morpho-vaults')],actions:[explorer],
  },
  uniswap:{
    overview:text('Uniswap provides automated market-maker pools, swaps and liquidity infrastructure. Arc’s official materials identify Uniswap as part of the network’s day-one trading infrastructure.','Uniswap, otomatik piyasa yapıcı havuzları, takas ve likidite altyapısı sunar. Arc’ın resmî kaynakları Uniswap’ı ağın ilk gün işlem altyapısının parçası olarak gösteriyor.'),
    capabilities:[text('Token swaps','Token takasları'),text('Liquidity pools','Likidite havuzları'),text('Programmable v4 hooks','Programlanabilir v4 hook’ları')],
    arcContext:text('Arc announced Uniswap support for mainnet and names it among live trading markets. This directory has no independently sourced Arc pool or contract addresses, so it does not imply that every token has a market.','Arc, Uniswap desteğini mainnet için duyurdu ve canlı işlem piyasaları arasında saydı. Bu katalogda bağımsız kaynakla doğrulanmış Arc havuz veya kontrat adresi yoktur; bu nedenle her tokenın piyasası olduğu anlamına gelmez.'),
    resources:[resource('Uniswap protocol','Uniswap protokolü','https://uniswap.org/'),resource('Uniswap on Arc','Arc üzerinde Uniswap','https://www.arc.io/blog/how-uniswap-brings-deep-liquidity-for-apps-on-arc')],actions:[explorer],
  },
  aero:{
    overview:text('Aero is a multichain spot exchange formed from the Aerodrome and Velodrome merger. Aero’s launch material says Aero Lite was already live on Arc before the unified multichain rollout.','Aero, Aerodrome ve Velodrome birleşmesiyle oluşan çok ağlı bir spot borsadır. Aero’nun lansman kaynağı, birleşik çok ağlı sürümden önce Aero Lite’ın Arc’ta yayında olduğunu belirtiyor.'),
    capabilities:[text('Spot trading','Spot işlemler'),text('Concentrated liquidity','Yoğunlaştırılmış likidite'),text('Crosschain routing','Ağlar arası yönlendirme')],
    arcContext:text('Aero’s official launch material includes Arc among its deployment networks. Carpan does not infer an Arc token address, pool availability or liquidity depth from this announcement.','Aero’nun resmî lansman kaynağı Arc’ı dağıtım ağları arasında sayıyor. Carpan bu duyurudan Arc token adresi, havuz kullanılabilirliği veya likidite derinliği çıkarımı yapmıyor.'),
    resources:[resource('Aero','Aero','https://aero.xyz/'),resource('Aero launch update','Aero lansman güncellemesi','https://aero.xyz/articles/aero-launch-update-all-systems-go/')],actions:[explorer],
  },
  '0x':{
    overview:text('0x is an open-source decentralized exchange infrastructure provider and developer toolkit. Arc’s ecosystem directory lists it among its trading projects.','0x, açık kaynaklı merkeziyetsiz borsa altyapısı ve geliştirici araçları sunar. Arc’ın ekosistem kataloğu projeyi işlem kategorisinde listeliyor.'),
    capabilities:[text('DEX infrastructure','DEX altyapısı'),text('Developer toolkit','Geliştirici araç seti'),text('Swap integrations','Takas entegrasyonları')],
    arcContext:listed,
    resources:[resource('0x protocol','0x protokolü','https://0x.org/'),resource('Arc ecosystem listing','Arc ekosistem kaydı',directory)],actions:[explorer],
  },
  hibachi:{
    overview:text('Hibachi is building an institutional FX venue that pairs offchain order matching with zero-knowledge-verified post-trade settlement on Arc.','Hibachi, zincir dışı emir eşleştirmeyi Arc üzerinde sıfır bilgi kanıtıyla doğrulanan işlem sonrası mutabakatla birleştiren kurumsal bir döviz platformu geliştiriyor.'),
    capabilities:[text('FX spot and perpetuals','Döviz spot ve sürekli vadeli işlemler'),text('Central limit order book','Merkezi limit emir defteri'),text('ZK-verified settlement','ZK doğrulamalı mutabakat')],
    arcContext:text('The Arc partner spotlight describes Hibachi as being built on Arc. It does not establish that the venue is generally available or provide a contract address.','Arc iş ortağı tanıtımı Hibachi’nin Arc üzerinde geliştirildiğini söylüyor. Platformun herkese açık olduğunu veya bir kontrat adresini doğrulamıyor.'),
    resources:[resource('Hibachi','Hibachi','https://hibachi.xyz/'),resource('Hibachi on Arc','Arc üzerinde Hibachi','https://www.arc.io/blog/how-hibachi-is-bringing-fx-price-discovery-to-arc')],actions:[explorer],
  },
  pulsar:{
    overview:text('Pulsar is developing a consumer money app for stablecoin funding, currency conversion and cross-border payments. Arc’s October spotlight says the app is live on Arc mainnet and onboarding users.','Pulsar, stablecoin yatırma, döviz dönüşümü ve sınır ötesi ödemeler için tüketici para uygulaması geliştiriyor. Arc’ın Ekim tanıtımı uygulamanın Arc mainnet’te yayında olduğunu ve kullanıcı kabul ettiğini belirtiyor.'),
    capabilities:[text('Stablecoin funding','Stablecoin yatırma'),text('Cross-border payments','Sınır ötesi ödemeler'),text('USD and EUR flows','USD ve EUR akışları')],
    arcContext:text('The Arc spotlight says the product is in development and onboarding from a waitlist; feature availability can vary. This listing does not verify a contract address or imply that regulated services are provided by Pulsar itself.','Arc tanıtımı ürünün geliştirme ve bekleme listesinden kullanıcı kabul aşamasında olduğunu söylüyor; özelliklerin kullanılabilirliği değişebilir. Bu kayıt kontrat adresi doğrulamaz ve düzenlemeye tabi hizmetleri Pulsar’ın kendisinin sunduğu anlamına gelmez.'),
    resources:[resource('Pulsar Money','Pulsar Money','https://pulsar.money/'),resource('Pulsar on Arc','Arc üzerinde Pulsar','https://www.arc.io/blog/how-pulsar-is-building-a-cross-border-money-experience-with-arc')],actions:[explorer],
  },
  envio:{
    overview:text('Envio is an event-driven indexing framework with GraphQL APIs. Arc’s data-indexer documentation lists it for building APIs from Arc events.','Envio, GraphQL API’leri sunan olay odaklı bir indeksleme çerçevesidir. Arc veri indeksleme belgeleri, Arc olaylarından API üretmek için Envio’yu listeliyor.'),
    capabilities:[text('Event indexing','Olay indeksleme'),text('GraphQL APIs','GraphQL API’leri'),text('Arc data access','Arc verisine erişim')],arcContext:listed,
    resources:[resource('Envio','Envio','https://envio.dev/'),resource('Arc data-indexer guide','Arc veri indeksleme rehberi',indexers)],actions:[explorer],
  },
  pinax:{
    overview:text('Pinax provides RPC, archive access and Firehose data streams. Arc’s indexer directory lists these services for querying and processing Arc data.','Pinax, RPC, arşiv erişimi ve Firehose veri akışları sunar. Arc indeksleyici kataloğu, Arc verisini sorgulamak ve işlemek için bu hizmetleri listeliyor.'),
    capabilities:[text('RPC and archive access','RPC ve arşiv erişimi'),text('Firehose streams','Firehose akışları'),text('Historical chain data','Geçmiş zincir verisi')],arcContext:listed,
    resources:[resource('Pinax','Pinax','https://pinax.network/'),resource('Arc data-indexer guide','Arc veri indeksleme rehberi',indexers)],actions:[explorer],
  },
  thirdweb:{
    overview:text('thirdweb lists open-source tooling for retrieving, enriching and transforming blockchain data, including Arc.','thirdweb, Arc dâhil blok zinciri verisini alma, zenginleştirme ve dönüştürme için açık kaynak araçlar sunuyor.'),
    capabilities:[text('Blockchain data APIs','Blok zinciri veri API’leri'),text('Data enrichment','Veri zenginleştirme'),text('Open-source tooling','Açık kaynak araçlar')],arcContext:listed,
    resources:[resource('thirdweb','thirdweb','https://thirdweb.com/'),resource('Arc data-indexer guide','Arc veri indeksleme rehberi',indexers)],actions:[explorer],
  },
  zerion:{
    overview:text('Zerion offers wallet data services for portfolio, transaction and DeFi position queries. Arc’s data-indexer guide lists its APIs and transaction subscriptions for Arc.','Zerion, portföy, işlem ve DeFi pozisyonu sorguları için cüzdan veri hizmetleri sunar. Arc veri indeksleme rehberi, Arc için API ve işlem aboneliklerini listeliyor.'),
    capabilities:[text('Wallet portfolio data','Cüzdan portföy verisi'),text('DeFi positions','DeFi pozisyonları'),text('Transaction subscriptions','İşlem abonelikleri')],arcContext:listed,
    resources:[resource('Zerion','Zerion','https://zerion.io/'),resource('Arc data-indexer guide','Arc veri indeksleme rehberi',indexers)],actions:[explorer],
  },
};

export function ecosystemResearch(id:string):Pick<EcosystemEntry,'logo'|'profile'> {
  const key=id.replace(/^eco_/,'');
  const profile=profiles[key];if(!profile)return {};
  if(['arc','extended'].includes(key))return {profile,logo:{src:`/images/ecosystem/${key}.svg`,sourceUrl:key==='arc'?'https://www.arc.io/':'https://extended.exchange/',background:'#111719'}};
  const circle=['circle','cctp','gateway','stablefx'].includes(key);
  const name=circle?'circle':key;
  if(!['circle','1inch','aave','across','alchemy','blockscout','thegraph','chainlink','goldsky'].includes(name))return {profile};
  const svg=['aave','across','alchemy','blockscout','thegraph'].includes(name);
  return {profile,logo:{src:`/images/ecosystem/${name}.${svg?'svg':'png'}`,sourceUrl:circle?'https://developers.circle.com/cctp':name==='thegraph'?'https://thegraph.com/brand/':directory,background:name==='aave'?'#f4f2fa':name==='thegraph'?'#f8f6ff':'#111719'}};
}
