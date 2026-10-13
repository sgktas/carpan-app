# Carpan Ecosystem — arayüz referansları ve önerilen yapı

Araştırma: 10 Ekim 2026. Kapsam: Ecosystem kategori arayüzü, proje detayları, Upcoming ve kişisel takip akışı. Bu belge bir tasarım önerisidir; canlı sürümde bir arayüz değişikliği yapıldığını ifade etmez.

## Kullanıcının kesinleştirdiği tasarım sınırı

Genel sinematik Carpan arayüzü korunur. Ana sayfa, Finance, Terminal, giriş/kayıt, global menü, footer, tipografi ve ortak tasarım dili bu revizenin kapsamında değildir. Ecosystem'in mevcut sinematik hero görseli, başlıkları ve kompozisyonu da korunur. Değişiklik alanı hero altındaki kategori içeriği, proje kartları/listesi, proje detayları, Upcoming ve kişisel takip düzenidir. Önceki taslaktaki genel header yeniden çizimi, düz giriş paneli ve hero küçültme önerisi iptal edildi.

## Tasarım kararı

Ana referans **RootData'nın proje merkezli araştırma mimarisi**. Buna DappRadar'ın kategori üzerinden keşfi, CryptoRank'ın Upcoming düzeni ve DropsTab'ın yatırım geçmişi ile takip deneyimi eklenir. Token/pool incelemesinde mevcut GeckoTerminal veri akışının sınırları korunur.

Carpan'ın temel kullanıcı yolculuğu:

**Projeyi keşfet → araştırma profilini oku → kaynaklı Arc kontratını Terminal'de incele → projeyi kaydet → istediğin güncellemeleri aç.**

## İncelenen kaynaklar

| Platform | Doğrulanan yapı | Carpan'a uyarlanacak parça |
| --- | --- | --- |
| [RootData — Projects](https://www.rootdata.com/projects) | Proje dizini; etiket, ekosistem, yatırımcı, tur ve faaliyet durumu filtreleri | Proje kimliği, okunur katalog ve detay bilgi hiyerarşisi |
| [RootData — Fundraising](https://www.rootdata.com/fundraising) | Proje, tur, tutar, tarih, kaynak ve yatırımcı bağlamı | Her yatırım kaydının kendi tarihi ve kaynağıyla sunulması |
| [CryptoRank — Upcoming](https://cryptorank.io/upcoming-ico) | Upcoming/Active/Past ayrımı; arama, filtre ve tarih sütunları | Yaklaşan, devam eden ve geçmiş duyuruların ayrılması |
| [DropsTab — Funding Rounds](https://dropstab.com/latest-fundraising-rounds) | Özet paneller, filtreler ve yatırım turu listesi | Araştırma özetleri ve karşılaştırılabilir finansman kayıtları |
| [DropsTab — Funding Guide](https://news.dropstab.com/research/crypto-fundraising-rounds-guide) | Proje içindeki tur zaman çizelgesi ve genişletilebilir ayrıntılar | Proje profilinde kaynaklı yatırım geçmişi |
| [DappRadar — Rankings](https://dappradar.com/rankings) | Kategori seçenekleri, zincir filtresi ve yoğun proje tablosu | Kategori üzerinden keşif ve liste okunurluğu |

CryptoRank, DropsTab ve DappRadar'ın herkese açık güncel ekranları tarayıcıda incelendi. RootData'nın tarayıcı sayfası CAPTCHA gösterdi; doğrulama aşılmadı. RootData değerlendirmesi herkese açık indekslenen sayfalar ve [resmî belgelerdeki](https://docs.rootdata.com/) bilgi mimarisine dayanıyor. DropsTab rehberindeki görsel örnekler yayın tarihinin örnekleridir; güncel ürün ekranıyla aynı oldukları varsayılmadı.

Buradaki harmanlama Carpan için tasarım değerlendirmesidir. Referans platformların önerdiği veya Carpan'a sağladığı bir ortaklık anlamına gelmez.

## Mevcut arayüzde görülen sorunlar

- Overview üç büyük kapsam kartından sonra Projects ile aynı katalog tablosunu gösteriyor. İlk ekran kullanıcıya nereden başlayacağını yeterince anlatmıyor.
- Her katalog kaydında Arc tokenı veya piyasa bulunmadığı için token/piyasa sütunları çok fazla boş hücre üretiyor.
- Güncel duyurular ve Upcoming kayıtları genel bakışta görünür değil.
- Proje detayında uzun araştırma, kaynak, yatırım ve bildirimi birlikte okurken görsel öncelik zayıflıyor.
- Kaydetme ile bildirim tercihleri işlev olarak ayrı; arayüzde bu ayrım daha rahat anlaşılmalı.

## İç navigasyon

**Overview · Projects · Tokens & Markets · Upcoming · My Watchlist**

Mevcut kategori sekmeleri ve route davranışı korunur. Genel site menüsü bu revizede değişmez. Referanslardan alınan yapı yalnız Ecosystem'in bu sekmelerinin altındaki içeriğe uygulanır.

### Overview

Mevcut onaylanmış sinematik hero aynen kalır; boyutu, sahnesi, başlıkları veya kompozisyonu sadeleştirilmez. İçerik düzenlemesi hero ve mevcut kategori sekmelerinin altında başlar. Düzeltilen konuşma taslağı yalnız Ecosystem alanını gösterir ve mevcut hero görselini içerir.

İlk içerik sırası:

1. **Arc'ta neler oluyor?** Kaynaklı yaklaşan son tarih, açıklanmış proje gelişmesi ve incelenebilir kontrat bağlantısı. En fazla üç içerik kartı; gerçek veri yoksa daha az gösterilir.
2. **Araştırmaya başla.** İki veya üç seçilmiş proje; gerçek logo, bir cümle açıklama, kategori, açık Arc durumu ve araştırma bağlantısı. Seçki editoryaldir; popülerlik veya performans sıralaması gibi gösterilmez.
3. Kategori seçenekleri ve tüm projelere geçiş.

Katalog/adres/token sayıları küçük bir kapsam satırına taşınabilir. Bu sayılar ürünün toplam zincir kapsamı veya kullanıcı/işlem sayısı değildir.

### Projects

Varsayılan görünüm okunur liste, isteğe bağlı kart görünümü. Arama, kategori ve Arc entegrasyon durumu kontrolleri listenin üstünde yer alır. Filtrelerin mevcut URL durumunda tutulması korunur.

Önerilen liste sütunları:

**Proje + kısa açıklama · Kategori · Arc durumu · Araştırma/kanıt · Kaydet**

Kaynak ve inceleme tarihi proje detayında erişilebilir kalır. Her satırda aynı uzun açıklama, token ve piyasa sütunları gösterilmez. Tokenı olan projelerin piyasalar bağlantısı ilgili profilinde görünür.

Bir kaydın ekosistem katılımcısı olması ile kaynaklı mainnet kontratı bulunması ayrı bilgi olarak sunulur. Circle'ın ürünleri şirketten bağımsız yatırım almış gibi gösterilmez.

### Proje detayı

Üstte kompakt resmî logo, isim, kategori, Arc durumu, resmî site ve kaydet kontrolü.

Masaüstünde iki sütun:

- **Ana içerik:** proje özeti, Arc bağlantısı, yatırım zaman çizelgesi, geliştirme kilometre taşları, ilgili duyurular.
- **Araştırma yan alanı:** kısa bilgiler, kaynaklar ve inceleme tarihi, ilgili Carpan aracı, takip/bildirim tercihleri.

Telefonda tek sütun; önce proje özeti ve önemli durum, sonra kanıt ve ayrıntılar. İçerik genişliği veya fontlar ekranı sığdırmak için küçültülmez.

Yatırım zaman çizelgesinde her tur kendi tutarı, tarihi, duyuruya göre yatırımcıları ve kaynağıyla görünür. Seçilmiş tarihî tur toplam yatırım veya güncel değerleme olarak adlandırılmaz. Bilgi bulunmaması tek açıklamayla gösterilir; aynı eksik veri için birden fazla büyük boş panel üretilmez.

Kaynaklı kontratta Terminal/akış haritası bağlantısı kullanılabilir. Kaynaklı kontratı olmayan projede kullanılamayan bir Terminal düğmesi üretilmez. Arc ağ profilinin genel Terminal bağlantısı, belirli bir kontrat kanıtı olarak sunulmaz.

### Upcoming

Varsayılan kronolojik ajanda. İlk sürümde az sayıda kayıt varken büyük boş aylık takvim yerine okunur liste daha uygundur.

Her kayıt: proje logosu, olay türü, başlık, kaynakta verilen tarih hassasiyeti, durum ve kaynak bağlantısı. Tam saatli son tarihlerde yerel saat ve orijinal saat dilimi gösterilir. Haftalık duyuru tam güne veya kesin açılış saatine dönüştürülmez.

Yaklaşan / devam eden / geçmiş ayrımı korunur. Programın sürmesi başvuruların hâlâ açık olduğu anlamına gelmez. Geçmiş kayıtlar arşive gider. Hatırlatma yalnız uygun kesin son tarihte ve kullanıcının ayrıca açmasıyla çalışır.

### My Watchlist

Takip edilen proje listesi ile hesap içi güncelleme kutusu aynı görünümde okunur. Her projede kaydetme ve bildirim ayarları ulaşılabilir olur.

- Projeyi kaydetmek otomatik bildirim aboneliği yaratmaz.
- Yeni incelenmiş güncellemeler ve kesin son tarih hatırlatması bağımsız tercihlerdir.
- Takipten çıkarma mevcut davranışa göre gelecekteki proje bildirimlerini durdurur.
- İzin vermemiş kullanıcıya eski kayıtlar yeni bildirimmiş gibi dökülmez.

### Tokens & Markets

Mevcut canlı fiyat/pool/grafik altyapısının sunumu geliştirilir. Varlık listesinden ilgili Arc pooluna, sonra grafiğe geçiş açık tutulur. Havuz hacmi ve likiditesi global token hacmi gibi gösterilmez. Eksik fiyat sıfıra çevrilmez. Veri kaynağı, zaman ve eski veri durumu görünür kalır.

## Görsel dil

- Carpan'ın mevcut koyu zemini, tipografisi, kontrol dili ve onaylanmış sinematik görselleri aynen devam eder.
- Ecosystem içerik kartları mevcut tasarım tokenlarıyla geliştirilir; yeni genel renk paleti kurulmaz.
- Mevcut Ecosystem emerald vurgu dili korunur. Referans sitelerden bilgi yerleşimi alınır; sitenin görsel kimliği yeniden kurulmaz.
- Yatırım tutarı, proje ismi ve tarih farklı hiyerarşide okunur. Alt açıklamalar aşırı soluk veya küçük olmaz.
- Tablo ve kanıt panellerinin arkasında hareketli sinematik sahne kullanılmaz.
- Telefon ekranında kategori/sekme kontrolleri ve proje satırları yeniden düzenlenir. Klavye odağı ve hover dışı temel eylemler korunur.

## Altyapı durumu ve tasarımın bağımlılıkları

Mevcut temel hazır: 15 katalog kaydı, 14 araştırma profili, 5 belgelenmiş varlık, kaynaklı yatırım/geliştirme bilgileri, 3 editoryal Upcoming kaydı, kişisel takip ve hesap içi isteğe bağlı proje bildirimleri. Piyasa görünümü Arc poolları ile 24 saat/7 günlük grafik verisini okuyor.

Henüz tamamlanmayan genişlemeler: otomatik dış duyuru toplama, tüm pool sayfalarının taranması/ikinci piyasa sağlayıcısı, proje güncellemelerinin e-posta/push ile gönderimi. Bu arayüz tasarımı mevcut altyapıyla uygulanabilir; bu genişlemeler yapılmış gibi gösterilmez.

Katalog genel bir sıralama motoru değildir. Popülerlik skoru, Smart Money, UAW, toplam TVL, FDV, tokenomics veya airdrop beklentisi mevcut veri olmadan eklenmez.

## Uygulama sırası

1. Overview'ın hero altındaki güncel içerik kartları; hero ve global arayüz sabit.
2. Projects listesi/kart görünümü ve filtrelerin sadeleşmesi.
3. Proje detaylarının bilgi hiyerarşisi ve kaynaklı yatırım zaman çizelgesi.
4. Upcoming ajanda, tarih/durum okunurluğu ve proje geçişleri.
5. Watchlist/güncelleme kutusu ve bildirim tercihlerinin birlikte sunulması.
6. Tokens & Markets sunumunun aynı kontrol/kart düzenine uyarlanması.

Görsel kontrol: mevcut API içeriğiyle masaüstü ve telefon; arama, filtre, profile geçiş, Terminal dönüşü, kaydetme ve bildirim ayarları. Loading, boş, hata, eski piyasa verisi ve oturum değişimi durumları korunur. Yeni dekoratif değişikliklere uygulamayı aynalayan gereksiz testler yazılmaz; veri/hesap davranışı etkilenirse ilgili anlamlı testler çalıştırılır.

Araştırma ekran kayıtları `.local/ecosystem-design-research/` içinde tutulur; source/release paketine eklenmez. Tıklanabilir konuşma taslağı yerel örnek seçimleri kullanır, gerçek hesabın takip ve bildirim ayarlarını değiştirmez.

## Taslak kontrolü

Geçici localhost önizlemesinde Discover ekranı, proje listesi, Extended araması, proje detayı ve yerel takip listesine geçiş kontrol edildi. 320 piksel tarayıcı genişliğinde Upcoming ajandası incelendi; taslak kökü 274 pikselde dışa taşan bir öğe göstermedi. Normal tarayıcı genişliği geri getirildi. Bu kontrol mevcut canlı API'nin veya üretim hesap işlemlerinin yeni bir kabul testi değildir. Uygulama kaynakları, üretim veritabanı ve canlı release 20261010-02 değiştirilmedi.

Kapsam düzeltmesinde taslağın yeni genel header'ı kaldırıldı; mevcut Ecosystem hero WebP'si byte düzeyinde aynı kopyayla, mevcut başlık/kompozisyon/CTA ve Space Grotesk/Inter tipografisiyle gösterildi. Önizlemede sinematik sahnenin görünürlüğü doğrulandı. Bu kayıt ilk taslaktaki sade hero ve yeni genel renk dili önerisinin yerini alır. `structure-cinematic-preserved.png` görseli `.local/ecosystem-design-research/` içindedir.
