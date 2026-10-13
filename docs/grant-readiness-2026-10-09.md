# Carpan — acil kod ve UI/UX listesi

> **Son durum,16:26Türkiye saati /20261009-15:** [Güncel başvuru hazırlığı](grant-readiness-current-2026-10-09.md). Aşağıdaki12ve önceki yayın notları tarihsel kayıttır. Google/Resend ilk girişleri tamamlandı; İngilizce artık ilk ziyaret varsayılanı. Asıl açık kapılar gerçek tahsilat kabul pilotu, public Google/tekrar giriş, gerçek Social kataloğu, repo/CI ve gerçek başvuru bilgileri.

| Öncelik | Kod | UI/UX | Durum |
| --- | --- | --- | --- |
| P0 Ödeme | Arc USDC cüzdan gönderimi, fee/funds/receipt, belirsiz sonuç kurtarma | Tek sayfada alıcı/tutar/gas/onay/sonuç | 20261009-10 yayında; izole receipt/recovery testleri geçti, gerçek ödeme pilotu yapılmadı |
| P0 Giriş | Google OAuth + Resend tek kullanımlık bağlantı, gerçek provider kullanılabilirliği | Google ve e-posta etkin; parola gerektirmeyen tek kullanımlık bağlantı | Google ilk gerçek giriş doğrulandı; tekrar giriş ve herkese açık Google yayını bekliyor. Resend hesap/alan/DNS/sınırlı anahtar ve sunucu yapılandırıldı; e-postalar teslim edildi ve ilk gerçek e-posta girişi hesap menüsü/oturum kaydıyla doğrulandı |
| P0 Global sunum | `lang=en`, browser/stored language, share metadata | Ürün/Arc anlatımı ve kısa değerlendirici rotası | Uygulandı |
| P0 Repo | Clean export/credential guard/runtime lock/CI | İngilizce README, mimari ve rehber | Temiz kopyada npm ci + verify geçti; kaynak ZIP hazır, GitHub yayını yapılmadı |
| P0 Başvuru | Çalışan/planlanan kanıt matrisi | Dürüst kilometre taşları ve ürün rotası | Taslak hazır; gerçek ekip/bütçe/takvim bilgileri owner tarafından doldurulacak |
| P1 Social | Proposal/review/save; gerçek cüzdanla erişilebilir admin sayımı | Boş katalog doğru; sonraki adım net | Admin erişimi salt okunur doğrulandı; gerçek projeler kaynak incelemesiyle yayımlanmalı |

Yeni rota pilotları bekletiliyor. Google'ın public yayın ayarları, offsite depolama ve bildirim kanalı tamamlanmalı. Resend kurulumu ve ilk gerçek e-posta girişi tamamlandı. X app, tam muhasebe/PnL, tam internal deploy indeksi ve diğer token köprüleri acil paket dışında.

Repo export GitHub yayını değildir; CI dosyası başarılı GitHub koşusu değildir; kod testleri gerçek USDC pilotu değildir. Ekran kaydı, repo/visibility/license, ekip ve gerçek bütçe/takvim bilgileri başvurudan önce tamamlanmalı. Gelir/kullanıcı/katalog/Circle desteği uydurulmaz.

## Doğrulanan son durum

- 20261009-12 yayında; önceki11 korunuyor. Girişin varsayılan hedefi ana sayfa; modül filtresi/anchor ve e-posta bağlantısının başka sekmedeki hedefi korunuyor. Google ayarları için 9 Ekim'de yalnız API planlı yeniden başlatıldı; indexer korunuyor. `/api/health` sağlıklı, `/about` HTTP200.
- Temiz kaynak kopyasında 202 test / 1440 assertion / 0 fail, lint/typecheck/build geçti. Son provider görünürlüğü düzeltmesinden sonra lint/typecheck/build yeniden geçti. Büyük SDK chunk uyarıları sürüyor.
- 347 kaynak dosyası whitelist ile ZIP'e alındı; özel .env/DB/arşiv/node_modules hariç. Guard geçti. GitHub CI henüz koşmadı; repository yayınlanmadı.
- UI fixture ödeme ekranı gerçek tahsilat/işlem kanıtı değildir. Kullanıcı cüzdan imzası veya gerçek USDC transferi yapılmadı. Genişletilmiş köprü rota pilotları kullanıcının isteğiyle bekliyor.
- Google Cloud Carpan projesi, yönetilen Carpan Support grubu ve Web OAuth istemcisi oluşturuldu. Kullanıcı secret'ı özel dosyaya kaydetti; iki Google alanı mevcut ortam yedeği sonrası VPS'e uygulandı. Production auth/status Google=true/email=true/X=false. Kullanıcının tamamladığı ilk gerçek Google girişi hesap ekranındaki Google oturumu ve bağlı Google kimliğiyle doğrulandı. Resend hesabı ve auth.carpan.app gönderim alanı/DNS doğrulandı; TLS zorunlu, tracking kurulmadı, receiving kapalı. Tekrar Google girişi, public Google yayını ve Resend anahtar ve sunucu ayarları uygulandı, teslim kaydı doğrulandı; kullanıcı tarafından e-posta giriş onayı yeni oturum kaydı ve hesap menüsünde E-posta ile giriş bilgisiyle doğrulandı.
- Google public launch öncesi gerçek gizlilik/kullanım koşulları, domain ve gerekli marka doğrulaması tamamlanmalı. Boş hukuk linkleri veya destek/verifikasyon iddiası eklenmedi.
- Başvuru için hâlâ gerçek ekip/bütçe/takvim, pilot ekran kaydı, kaynak incelenmiş Social projeleri ve repo sahipliği/görünürlük/lisans kararı gerekli. Offsite yedek ve bildirim hedefi yok.

20261009-11 yayında: ürün rehberinin birincil butonu Carpan mor paletine ve 48px hedef boyutuna uyarlandı.10korunuyor; bu frontend yayını backend'i yeniden başlatmadı. Sonraki Google sağlayıcı yapılandırması API-only restart ile uygulandı. Telefon doğrulama limitinden sonra mevcut proje sahibi + yönetilen Google Groups destek adresi kullanıldı. Google ilk canlı giriş başarılı; herkese açık yayın doğrulaması ve Resend kurulumu sürüyor.


20261009-12: Yönlendirme güvenliği/Google/X/e-posta için13izole test ve200assertion geçti; lint0warning/0error, typecheck ve temiz kaynak kopyasında production build başarılı. Yeni bağımlılık/tema değişikliği yok; büyük SDK chunk uyarısı sürüyor. Canlı kayıt-giriş geçişinde /onchain/projects?saved=1#projects hedefi korundu. Indexer yeniden başlatılmadı; API planlı yeniden başlatıldı ve mevcut oturumlar korundu.
