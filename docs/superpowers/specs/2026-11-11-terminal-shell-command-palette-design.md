# Terminal kabuğu ve komut paleti — tasarım

Tarih: 11 Kasım 2026 · Durum: onay bekliyor · Alt proje 1/4

## Amaç ve bağlam

Carpan Terminal'i, Arc'ta varlığı olan veya Arc'ı izleyen **bireysel kullanıcılar** için daha kullanışlı hale getirmek. Finans ekibi ileride gelecek; bu işte onun için tasarım yapılmıyor, yalnızca kapı açık bırakılıyor.

Bireysel kullanıcının dört ana işi: kendi cüzdanını görmek, herhangi bir adresi/işlemi araştırmak, canlı hareketleri yakalamak, takip ve alarm. Bu dört iş dört ayrı alt projedir; her biri kendi spec → plan → uygulama döngüsünü izler:

1. **Kabuk ve komut paleti** ← bu belge (diğer üçünün temeli)
2. Varlık sayfası iskeleti (adres, işlem, token, blok)
3. Cüzdanım
4. Canlı filtreler, kayıtlı görünümler, izleme/alarm birleşimi

Referans mimari: Bloomberg'in komut çubuğu, Arkham'ın arama ve adres kimliği, Etherscan/Blockscout'un tutarlı varlık sayfaları, DeBank/Zerion'un cüzdan görünümü, DexScreener'ın filtreli canlı tabloları.

### Bugünkü durum (koddan)

- `ArcTerminalHeader` Terminal başlığında yalnızca 4 sekme gösteriyor: Keşif, Akış haritası, Takip listem, Alarmlar. Kontratlar, Doğrulananlar, Token, Etiketler ve Gezgin başka bağlantılardan ulaşılan gizli sayfalar.
- Arama tek kutu: 64 haneli hash → işlem, adres → adres sayfası, `usdc` → token, gerisi kontrat araması. İsim, blok numarası, etiket, geçmiş yok.
- `ArcRadarPage` tek dosyada 10 farklı `?view=` değeri taşıyor.
- Adres sayfası (`ArcWalletPage`) bugün başlıkta "Canlı" altında işaretleniyor.

## Kararlar (kullanıcıyla netleşen)

| Konu | Karar |
| --- | --- |
| Ana kullanıcı | Bireysel; finans ekibi sonra |
| Palet kapsamı | Arama + eylemler (komut dili yok) |
| Gezinme | **Canlı · Keşfet · İzleme**; Cüzdanım 3. alt projede dördüncü başlık olarak eklenir, ölü bağlantı yok |
| Ağ kapsamı | Arc varsayılan + ağ seçici (Base, Arbitrum, Ethereum); seçim hatırlanır |
| Yaklaşım | **C:** `TerminalShell` mevcut sayfaları sarar, **hiçbir adres değişmez** |

## Kapsam dışı (bu sürümde yok)

Sorgu/komut dili; özel etiketleri adla arama (liste servisi gerekir); ağlar arası otomatik "şurada bulundu" önerisi; Cüzdanım; yeni adres/işlem sayfası; kayıtlı görünümler; sunucuda yeni uç nokta; arama için hız sınırı (ayrı iş olarak not edilir).

## Tasarım

### 1. Kabuk ve gezinme

`ArcTerminalHeader`'ın Terminal dalı değişir; Carpan düzeyindeki başlıklar (Finans, Ekosistem, Köprü, API) aynen kalır. Üst gezinme `Canlı · Keşfet · İzleme`; seçili başlığın sayfaları ikinci bir satırda küçük sekmeler olarak gösterilir (mobilde yatay kaydırılır).

| Başlık | Alt sekmeler | Mevcut adres (değişmez) |
| --- | --- | --- |
| Canlı | — | `/arc` |
| Keşfet | Gezgin, Token, Kontratlar, Doğrulananlar, Akış haritası | `/arc?view=explorer`, `token`, `contracts`, `verified`, `flow` |
| İzleme | Takip listem, Alarmlar, Etiketler | `/arc?view=following`, `alerts`, `labels` |

Aktif başlık, sayfanın `active`/`view` değerinden tek bir eşleme tablosuyla hesaplanır. `/arc/addresses/:a` ve `/arc/contracts/:a` Keşfet altında işaretlenir (`ArcWalletPage` bugün `overview` geçiriyor; `explorer` geçirecek, `module==='watch'` durumu İzleme'ye eşlenir). `bridge` görünümü Carpan düzeyindeki Köprü menüsüne ait kalır. Mevcut renk jetonları ve koyu/açık tema kullanılır; yeni stil dili getirilmez.

### 2. Komut paleti

**Açılış:** başlıktaki arama kutusu paleti açar; `/` ve `Ctrl/Cmd+K` açar, `Esc` kapatır, ok tuşları ve Enter ile gezilir. Mobilde ekranın üstünde tam genişlik. Erişilebilirlik: combobox/listbox düzeni, `aria-activedescendant`, kapanınca odak tetikleyiciye döner, `prefers-reduced-motion` saygı görür.

**Yazılanı tanıma** (`classifyQuery`, sunucusuz ve anında): `0x`+40 hane → adres; `0x`+64 hane → işlem (blok hash'i ikinci seçenek); yalnızca rakam → blok numarası; diğer → isim/sembol araması. Adres, işlem ve blok her zaman doğrudan açılır; sağlayıcı kapalı olsa da çalışır. Giriş boşluk ve harf büyüklüğüne dayanıklıdır.

**Sonuç grupları (sırasıyla):**

1. **Eylemler** (yazılana göre): adres için *Aç*, *İzle*, *Alarm kur*, *Kopyala*, *Explorer'da aç*. *İzle* mevcut `api.saveNetworkWatch` servisini kullanır; giriş gerekiyorsa `/?login=1&next=…` ile yönlendirir. *Alarm kur* `/arc?view=alerts&address=<adres>` adresini açar (mevcut ön doldurma).
2. **Git:** Canlı, Gezgin, Token, Kontratlar, Doğrulananlar, Akış haritası, Takip listem, Alarmlar, Etiketler.
3. **Sonuçlar:** metin için mevcut `GET /onchain/networks/:chain/data?kind=search&q=` (300 ms bekleme, en az 2 karakter, yeni karakterde eski yanıt yok sayılır). Özel etiketler: giriş yapmış kullanıcı bir adres yazdığında, o adres için kaydedilmiş özel etiket (varsa) mevcut `GET /arc/wallets/:address/label` ile okunur ve adres satırında gösterilir; giriş yoksa sessizce atlanır. **Etiket adıyla arama ilk sürümde yok**, çünkü hesabın tüm etiketlerini listeleyen bir servis bugün mevcut değil (yalnızca adres başına okuma/yazma var).
4. **Son aramalar** (kutu boşken): en fazla 8, yalnızca bu cihazda (`localStorage`), sadece sorgu ve tür saklanır.

**Taklit ve güvenlik kuralları** (gerçek veriyle doğrulandı: `usdc` araması gerçek USDC'nin yanında aynı sembollü taklit token'lar ve alakasız bir ENS sonucu döndürüyor):

- Doğrulanmış varlıklar (projede zaten gözden geçirilmiş liste: `src/arc-asset-transfers.ts`, `USDC_ASSET`) en üstte **Doğrulanmış varlık** rozetiyle.
- Aynı sembolü taşıyan başka kontrat **Aynı sembol, farklı kontrat** uyarısıyla ve sona itilmiş olarak.
- **Yazım tuzakları da** (gerçek veride taklitlerin çoğu sembolü birebir kopyalamıyor: `UDSC`, `USDCAT`, `USDC-G`): doğrulanmış sembolün yanına en çok 4 karakterlik ek, tek karakter ekleme/çıkarma veya iki bitişik karakterin yer değiştirmesi **Benzer sembol, … ile karışabilir** uyarısı alır. Tek karakter değişimi (ör. `USDT`, `USD1`) bilinçli olarak dışarıda bırakılır; gerçek ve farklı token'lar yanlışlıkla işaretlenmez. Uyarı yalnızca Arc'ta uygulanır.
- `ens_domain` sonuçları yalnızca Ethereum ağında gösterilir; Arc aramasında gizlenir.

**Ağ seçici:** paletin içinde `Arc ▾` rozeti; Base, Arbitrum, Ethereum. Seçim `localStorage`'da saklanır. Arc adresi `/arc/addresses/<a>`, diğer ağlar mevcut `researchUrl(chain, address)` ile gezgini açar; işlem/blok için `/arc?view=explorer&chain=<id>&hash=…&data=tx` biçimi kullanılır.

### 3. Veri, hata durumları, dosyalar

**Yeni dosyalar:**
- `src/terminal-command.ts` — saf mantık: `classifyQuery`, `buildResults`, taklit/doğrulanmış kuralı, ENS filtresi. Arayüz ve ağ bağımlılığı yok.
- `src/terminal-recents.ts` — son aramalar; bozuk/erişilemeyen depolamada sessizce boş liste.
- `src/components/terminal/TerminalNav.tsx`, `src/components/terminal/CommandPalette.tsx` (+ CSS) — arayüz.
- `src/i18n/terminal-en.json` — İngilizce çeviriler, `src/i18n/index.tsx` sözlüğüne eklenir.
- Değişen: `src/components/ArcTerminalHeader.tsx`, `src/pages/ArcWalletPage.tsx` (active değeri).

**Hata durumları:**
- Arama kaynağı yanıt vermezse paletin üstünde satır içi not; eylemler, sayfa komutları, son aramalar ve doğrudan açma çalışmaya devam eder.
- Kredi bütçesi korunma modundaysa sonuç "kayıtlı veri" etiketiyle gelir (mevcut davranış).
- Giriş gerektiren eylem: girişe yönlendirir, dönünce aynı sayfaya gelir.
- Boş sonuç: ne bulunamadığını ve doğrudan açılabilecek seçenekleri söyler.

**Maliyet:** her metin araması yaklaşık 25 Blockscout kredisi, sunucuda 60 sn önbellekli; adres/işlem/blok girişi kredi harcamaz.

**Bilinen risk:** arama, halka açık `/onchain/networks/:id/data` ucunu kullanır; bu uç zaten korumasız. Kötüye kullanım günlük kredi tavanıyla (15 milyon) sınırlıdır. Hız sınırı bu işin kapsamında değildir; ayrı iş olarak izlenir.

## Test ve kabul ölçütleri

**Birim testleri** (projenin mevcut düzeniyle `server/` altında): sorgu tanıma (adres, işlem, blok, metin, büyük/küçük harf, boşluk, geçersiz uzunluk); sonuç sıralama; taklit token ve ENS kuralı; son aramalar (bozuk veri, sınır 8, yineleme, depolama hatası); her `view` ve sayfa için aktif başlık eşlemesi.

**Tarayıcı kontrolü** (gerçek veriyle, koyu ve açık tema, TR ve EN, klavye, 375 px mobil, yatay kayma yok, konsol hatasız).

**Kabul:**
1. Üst gezinme `Canlı · Keşfet · İzleme`; her eski adres çalışır ve doğru başlığı işaretler.
2. `/` ve Ctrl/Cmd+K paleti açar; adres, işlem ve blok girilince tek Enter ile doğru sayfa açılır, sağlayıcı kapalıyken de.
3. "usdc" aramasında gerçek USDC rozetli en üsttedir; aynı sembollü taklitler uyarılı ve altta; Arc aramasında ENS sonucu yoktur.
4. Ağ seçimi hatırlanır; Base/Arbitrum/Ethereum adresleri gezginde açılır.
5. Son aramalar en fazla 8 ve yalnızca sorgu/tür saklar.
6. Tüm testler, TypeScript, lint ve derleme geçer; koyu/açık tema görünümü ve mevcut sayfaların içeriği değişmez.

## Sonraki alt projelere kapı

Gezinme tablosu ve palet "Git" listesi veri odaklıdır; Cüzdanım, yeni varlık sayfaları ve kayıtlı görünümler tabloya satır ekleyerek gelir, kabuğu değiştirmez.
