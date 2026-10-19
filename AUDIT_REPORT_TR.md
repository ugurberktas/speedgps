# SpeedGPS — Bağımsız Teknik Denetim

Tarih: 20 Ekim 2026. İncelenen son HEAD: `7180dfcff0857900ba5673e0e9d191933e807250` ve çalışma alanı. Denetim yerel kaynak koduna dayanır; GitHub ve Netlify'a yazma, commit, push veya dağıtım yapılmadı. Kaynaklar, yapılandırmalar, testler, dokümantasyon ve üretilen PWA çıktısı incelendi. Gerçek GPS, fiziksel iPhone/Android, pil tüketimi ve uzun süreli saha testi yapılmadı.

## A. Yönetici Özeti

**Karar: mevcut sürüm, güvenilir hız/mesafe ölçümü iddiasıyla kararlı sürüm olarak yayınlanmaya hazır değil.** Temel arayüz, üretim derlemesi, gizlilik yaklaşımı ve küçük bağımlılık yüzeyi iyi. Asıl engel mimari büyüklük veya performans değil; hız reddi, mesafe kabulü, süre ve kesinti yönetiminin farklı doğruluk kuralları kullanması.

Güçlü taraflar:

- React/React DOM dışında çalışma zamanı bağımlılığı yok; backend, takipçi, reklam veya harita servisi gerekmiyor.
- Saf matematik, filtre, oturum, birim dönüşümü ve görsel bileşenler ayrılmış.
- Gerçek sıfır hız korunuyor; NaN/Infinity ve koordinat sınırları büyük ölçüde kontrol ediliyor.
- Başlat tekrarını engelleme, Durdur, unmount temizliği, görünürlük ve Wake Lock desteği mevcut.
- Mevcut 199 birim testi ve 28 E2E çalışması başarılı; boş bir test altyapısı değil.
- Production PWA çevrimdışı arayüzü ve gizlilik rotası çalışıyor.

Zayıf taraflar:

- Yaklaşık 1.060 satırlık App.tsx, GPS callback'i, mesafe, zaman, hata yönetimi, HUD API'leri ve tüm ana ekranı birlikte yönetiyor.
- Bir okumanın koordinatlarının, hızının ve mesafe katkısının kabulü tek bir tutarlı karar değil.
- Testlerin bir kısmı gerçek App akışını çalıştırmadan aynı mantığı test içinde yeniden yazıyor; bazı yanlış varsayımları onaylıyor.
- HUD'un asenkron kapanış ve klavye odağı yönetimi tamamlanmamış.

P0 bulunmadı. Aşağıdaki beş P1 bulgusu yayın engeli olarak değerlendirilmiştir. Algoritma veya HUD davranışı değiştirilmedi.

## B. Kritik Bulgular (P0/P1)

### B1 — P1: Reddedilen hız sıçraması mesafeye 1 km ekleyebiliyor

**Kod:** `src/utils/speedFilter.ts:85`, `src/utils/speedEngine.ts:277`, `src/App.tsx:389–440`.

Filtre reddettiği hız için önceki kabul edilmiş sayısal hızı döndürüyor. Tracker `isSpikeRejected` bilgisini App'e taşımıyor. App, sayı null değilse okumayı istatistiklere kabul ediyor; mesafede yalnızca alt eşik ve pozitif hız kontrolü var. Üst mesafe/hız tutarlılığı yok. Donanım hızı yolunda doğruluk yarıçapı mesafe eşiğinde kullanılmıyor.

**Tekrar:** İlk okuma 36 km/sa, sonraki okuma 1 saniye sonra 1.000 metre uzakta ve 360 km/sa. 360 reddediliyor, ekran 36 gösteriyor; mesafe `1000 m` oluyor. Gerçek React arayüzü üzerinde iki Chromium projesinde doğrulandı (`e2e/audit.spec.ts`).

**Etki:** Gürültülü konum örneği toplam mesafeyi kalıcı olarak bozuyor; reddedilmiş ölçüm güncel ve kaydedilebilir sayılıyor. Sürekli reddedilen örnekler, koordinat/timestamp kontrolünden geçtikleri için stale saatini de yeniliyor.

**Öneri:** Ret/hold/valid durumunu sonuçta açıkça taşı; eski hızın ekranda tutulmasını yeni ölçüm kabulünden ayır. Mesafe segmentine de zaman, doğruluk ve makul hareket kontrolü uygula. Bu ölçüm davranışı değişikliğidir; uygulanmadı.

### B2 — P1: Filtre yanlış bir başlangıç hızına süresiz kilitlenebiliyor

**Kod:** `src/utils/speedFilter.ts:138–160`, `src/utils/speedEngine.ts:254–280`.

İvme hesabının referansı son kabul edilmiş hız; zaman farkının referansı ise son gelen konum. Retlerde konum ilerliyor, hız referansı ilerlemiyor.

**Tekrar:** İlk hız yanlışlıkla 120 km/sa; ardından saniyede bir, koordinatları 10 m ilerleyen 20 adet 36 km/sa okuması. Sonuç hâlâ **120 km/sa**. Her turda `|120−36| = 84 > 15×1×3,6 = 54`; filtre hiçbir zaman toparlanamıyor. Yeni Vitest beklenen başarısızlık testi ve tarayıcıda modül çağrısı ile doğrulandı.

**Etki:** Gerçek hareket sürekli reddedilir; maksimum, ortalama ve kayıtlar yanlış hızla devam eder. Düzenli callback geldiği için 5 saniyelik stale koruması çözüm sağlamaz.

**Öneri:** Son kabul edilmiş ölçüm zamanı ile süreyi eşleştir; art arda tutarlı yeni örnekler için sınırlı yeniden edinim tanımla. Tek bir yanlış örneğin kalıcı referansa dönüşmesini önle.

### B3 — P1: Reddedilen Haversine sıçraması zaman geçtikçe sahte yüksek hıza dönüşüyor

**Kod:** `src/utils/speedEngine.ts:321–363`, `src/utils/speedFilter.ts:85`.

Eşik aşılmış ama hız reddedilmişse eski çapa korunuyor. Konum yeni noktada sabit kaldıkça çapa mesafesi sabit, çapa süresi büyüyor; hesaplanan hız sonunda 250 km/sa altına iniyor. İlk doğrulanmış hareket yokken filtre ayrıca resetleniyor. Eşik aşımı dalına girildiği için 3 saniyelik durma dalı çalışmıyor.

**Tekrar:** t=0 ve t=1 aynı konum, speed=null, accuracy=5. t=2'de konum 1.000 metre sıçrıyor; t=15'e kadar her saniye bu yeni sabit konum geliyor. t=15 sonucu **240 km/sa** (`1000/15×3,6`). Arada gerçek hareket yok. Vitest ve tarayıcı modül çağrısında doğrulandı.

**Etki:** Bir konum bozulması gecikmeli sahte maksimum/ortalama hız ve mesafe üretebilir.

**Öneri:** Reddedilen segmenti zamanla seyrelterek geçerli hâle getirme. Şüpheli çapa için yeniden referans edinme/karantina kararı ver; hareketsizlik kontrolünü yalnızca eşik altı dalına bağlama.

### B4 — P1: Ekrandaki süre, ortalama ve mesafe aynı ölçüm aralığını temsil etmiyor

**Kod:** `src/App.tsx:129–163`, `src/App.tsx:424–440`, `src/utils/measurementSession.ts:186–207`, `src/utils/smartHaversine.test.ts:170–241`.

Süre setInterval ile artıyor. Ortalama yalnızca GPS callback'lerinde `speed×dt` ile güncelleniyor. Mesafe başka bir koordinat çapası üzerinden birikiyor. İlk ve toparlanma örneklerine ölçülmemiş 1 saniye atanıyor. Durdur, son sıfır hız örneğinden sonra geçen süreyi ortalamaya işlemiyor.

**Tekrar 1:** 36 km/sa ilk örnek; 1 saniye sonra sıfır; yeni GPS örneği olmadan 20 saniye bekle ve durdur. Ekran **00:21**, ortalama hâlâ **18,0 km/sa**. Durağanlığa tanınan 30 saniye nedeniyle süre çalışırken ortalama aynı kalıyor. İki Chromium projesinde doğrulandı.

**Tekrar 2:** Mevcut smartHaversine testi, 16 saniyede 8 metre sabit yürüyüş için ortalamanın **1,0 km/sa** olmasını bekliyor. Fiziksel ortalama `8/16×3,6 = 1,8 km/sa`. Başlangıçta eşik altında biriktirilen gerçek hareket sıfır hız olarak istatistiğe işleniyor; mesafe sonradan eklenince ortalama geriye dönük düzelmiyor.

**Ek:** Accuracy=50, speed=null okumaları her saniye gelirse hız hep `--`, ortalama boşken süre ilerliyor. GPS bayatlığı “geçerli koordinat” ile yenileniyor; “ölçülebilir hız” ile değil. Stale kontrolünden önce süre artırıldığı için kesintinin ilk birkaç saniyesi de sayılıyor. Arka plandan dönüşte yeni fix gelmeden isPaused kaldırıldığında süre yeniden başlayabilir.

**Etki:** Kullanıcı süre, mesafe ve ortalamayı birlikte yorumlayamıyor; düzensiz örnekleme ve dur-kalkta hata büyüyor.

**Öneri:** Geçerli ölçüm aralığının tanımını tekleştir. İlk referansa süre ekleme; durdurma/durağanlık/kesinti sınırlarını aynı saat üzerinden kapat. Ortalama hız ve mesafe için aynı kabul edilmiş aralıkları kullan; basitçe mevcut mesafeyi süreye bölmek B1'deki mesafe hatası çözülmeden yeterli değildir.

### B5 — P1: Geçici TIMEOUT/POSITION_UNAVAILABLE otomatik toparlanmayı bitiriyor

**Kod:** `src/App.tsx:457–502`.

Hata türünden bağımsız olarak watcher clearWatch ile siliniyor, durum hata yapılıyor ve Wake Lock bırakılıyor. TIMEOUT mesajı ise “Konum bilgisi bekleniyor” diyor.

**Tekrar:** Aktif ölçümde mock Geolocation hata callback'ine code=3 gönderildiğinde clearWatch sayısı 1; sinyal geri gelse bile uygulamanın aktif watcher'ı yok. İki Chromium projesinde doğrulandı. Başlat'a yeniden basmak oturum istatistiklerini de sıfırlıyor.

**Etki:** Tünel/zayıf sinyal sonrası kendiliğinden devam etme beklentisi karşılanmıyor; kullanıcı beklerken ölçüm tamamen durmuş olabiliyor.

**Öneri:** İzin reddi ile geçici konum/zaman aşımı hatalarını ayır. Geçici hatada oturumu koruyarak bekleme/toparlanma durumuna geç; gerekiyorsa kontrollü watcher yeniden edinimi uygula. Oturum davranışı değiştiğinden uygulanmadı.

## C. Orta ve Düşük Öncelikli Bulgular (P2/P3)

| Öncelik | Kanıt ve etki | Öneri |
|---|---|---|
| P2 | `speedEngine.ts:321–344,414`: 60 saniye aynı konumda bekleyip 1 saniyede 5 metre hareket, 18 yerine **0,3 km/sa** üretir. Sıfır durumundaki çapa eski zamanını korur. | Duruş ile hareket başlangıcının zaman penceresini ayır. |
| P2 | `App.tsx:628–675`: Fullscreen isteği beklerken HUD kapatılırsa istek çözülünce orientation.lock yine çağrılır. Deferred Promise ile HUD kapalıyken 1 lock çağrısı doğrulandı. | Açma işlemi için iptal/nesil kontrolü; geç sonuçta kaynakları bırakma. |
| P2 | `HudView.tsx:29–58`: modal açılınca odak alttaki HUD düğmesinde kalıyor; focus trap/inert yok. fullscreenchange dinleyicisi de yok. | Odağı taşı ve geri getir; arka plan etkileşimini engelle; native fullscreen çıkışını izleyerek durumları eşleştir. |
| P2 | `App.tsx:706–708`: isStale durumunda rozet hâlâ yeşil “GPS Aktif”; alt yazı sinyal bekliyor diyor. | Tek bir gösterim durumu türet. |
| P2 | `vite.config.ts:10`, üretilen registerSW.js: prompt seçilmiş ama güncelleme bildirimi/aktivasyon arayüzü yok. Yeni worker beklemede kalabilir. | Oturum bittikten sonra kullanıcı kontrollü güncelleme; tüm istemciler kapanmadan güncellemenin neden beklediğini belirt. |
| P2 | `App.css:297,336,374`, `SpeedometerGauge.css:35`: birim/görünüm düğmeleri 21,2 px, HUD 23,2 px. Kadran etiketi #94a3b8/beyaz kontrastı yaklaşık 2,56:1; beyaz Başlat yazısının gradyan kontrastı yaklaşık 2,61–3,22:1. | Dokunma alanı ve küçük metin kontrastını artır. Bu değerler görsel erişilebilirlik bulgusudur. |
| P2 | `gpsReliability.ts:149`, `locationQuality.ts:40`: accuracy=0 reddediliyor; Geolocation standardı negatif olmayan değer tanımlar. | 0 değerini ayrı ve tutarlı ele al. Gerçek cihazda sıklığı doğrulanmadı; ölçüm davranışını değiştirmemek için dokunulmadı. |
| P2 | `App.tsx:689`: gizlilik rotasında App unmount olmaz; GPS ve süre devam ederken Durdur kontrolü görünmez. | Ölçümün sürdüğünü görünür kıl veya açık bir rota/oturum politikası belirle. |
| P3 | `App.tsx:610–618`: execCommand('copy') false dönerse yine başarı bildiriliyor; throw durumunda textarea temizliği finally içinde değil. | Dönüş değerini kontrol et ve DOM temizliğini finally kullanarak garanti et. |
| P3 | `PrivacyPolicy.tsx:126`: açılışta izin istenebileceği yazıyor; mevcut uygulamada yalnızca Başlat çağrısı bunu tetikliyor. Genel “yalnız RAM” ifadesi kullanıcının panoya kopyalamasını ve geliştirme JSON indirmesini açıklamıyor. | Teknik kapsamı daralt, kullanıcı tarafından dışa aktarma istisnasını belirt. |
| P3 | `tsconfig.app.json`: strict açıkça tanımlı değil; e2e strict. `playwright.config.ts` tsconfig.node kapsamına dahil değil. | Ayarları açıklaştır. Ek `tsc --strict` kontrolü bu denetimde geçti; büyük tip dönüşümü gerekmiyor. |

Düzeltilen .gitignore ve Wake Lock bulguları H bölümündedir; açık risk listesine yeniden eklenmemiştir.

## D. GPS ve Ölçüm Doğruluğu Değerlendirmesi

- m/s → km/sa için 3,6 dönüşümü ve Haversine küresel mesafe formülü doğru; `a` değerinin [0,1] aralığına sıkıştırılması yerinde.
- Doğrudan coords.speed=0 öncelikli korunuyor. Null/negatif/NaN/Infinity hızlar fallback'e yöneliyor. Koordinat sınırları ve pozitif/sonlu timestamp doğrulanıyor; aynı/geriye giden timestamp reddediliyor.
- App geçersiz timestamp'i Date.now ile değiştirdiğinden motorun timestamp reddi uygulama sınırında tamamen korunmuyor. maximumAge=0 doğru tercih; fakat callback alınma zamanı ile konumun edinilme zamanı ayrı kavramlar. Gecikmiş/future timestamp senaryoları henüz kapsamlı değil.
- Haversine için 25 m ve 500 ms sınırları, donanım hızı için 100 m sınırı ve 1 km/sa ölü bölgesi ürün varsayımlarıdır. 0,8 km/sa gerçek hareket de sıfırlanır; bunlar evrensel fizik yasaları değildir.
- 250 km/sa üst sınırı ve 15 m/s² ivme sınırı uygulama politikasına dönüştürülmeli; yorumlarda “fiziksel olarak imkânsız” denmesi fazla kesin.
- İki konum doğruluğunun aritmetik ortalaması, yer değiştirme belirsizliğinin istatistiksel güven aralığı değildir. İki konum gerçek noktanın farklı taraflarında ±5 m saparken aralarındaki fark 10 m olabilir. Eşiğin aşılması tek başına gerçek hareket kanıtı değildir.
- Medyan(3)+EMA(0,75) sadece Haversine yolunda; doğrudan hız daha az gecikmeyle geçiyor. EMA örnek bazlı olduğundan düzensiz dt'de aynı zaman tepkisini sağlamaz. Kaynak geçişinde filtre reseti Haversine'in ilk hareket kontrolünü zayıflatıyor.
- 5 saniye stale sınırı `>` ile ve 1 saniyelik timer üzerinden kontrol edilir; tam 5,000 saniyede kesin geçiş değildir. Sıfır hız için 30 saniye tolerans bilinçli tercih, fakat son sıfır sonrasında gerçekten harekete geçilip veri gelmezse bu hareket bilinemez.
- Sessiz kesinti ve visibilitychange sonrasında çapa reseti iyi; gerçek hata callback'i geldiğinde B5 devreye giriyor. Bu iki akış aynı davranmıyor.
- Başlat aktifken disabled ve watchId kontrolüyle korunmuş. Durdur mevcut istatistik/geçmişi tutuyor. Yeniden Başlat istatistikleri sıfırlıyor, geçmişi tutuyor. Hızı Kaydet yalnızca anlık hız/saat ekliyor. HUD, birim ve tempo değişimleri temel oturumu sıfırlamıyor.

Accuracy açıklaması W3C'nin %95 güven düzeyi tanımına düzeltildi: https://www.w3.org/TR/geolocation/#accuracy . Standardın varlığı bu uygulamanın saha doğruluğunu kanıtlamaz.

## E. HUD, Kadran, Mobil ve UX Değerlendirmesi

Kadranın `M(cx−r,cy) A r r ... (cx+r,cy)` yolu, πr yay uzunluğu ve `offset=L(1−progress)` hesabı tutarlı. km/sa=120, mph=75, m/s=35 üst ölçekleri var. Sayı ve yay aynı speedKmh'den türetiliyor; sayının tam sayıya yuvarlanması ile yayın kesirli hareketi normaldir. Üst sınırı geçen hızda yay dolar, sayı gerçek değeri göstermeye devam eder. m/s ölçeğinin 35 ucunda 35 etiketi bulunmaması küçük okunabilirlik eksikliğidir. Sıfır/invalid için progress=0; yuvarlak stroke uçları küçük nokta bırakabilir, matematik hatası değildir.

320×740 ekran görüntüsü incelendi: yatay taşma veya belirgin sayı/etiket çakışması yok. Dar ekranda kontroller iki satır, istatistikler tek sütun oluyor; bu Hızı Kaydet düğmesini aşağı taşıyor. Bu bir görsel yoğunluk/erişim konusu, ölçüm hatası değil. Ekran görüntüleri `audit-artifacts/mobile-320.png` ve `hud-320.png` içinde.

HUD aynalaması yalnız içeriğe uygulanıyor; Kapat aynalanmıyor. Dikey görünümde CSS 90° dönüşü var. Fullscreen ve orientation hataları yakalanıyor; oturum App'te kaldığından HUD aç/kapa ölçümü sıfırlamıyor. Esc listener temizleniyor, ancak onClose her render'da değiştiği için yeniden bağlanıyor; bu sızıntı değil, düşük öncelikli gereksiz iş. Fullscreen native çıkışı ve aç/kapat yarışı C bölümünde açık.

Modal focus yönetimi eksik; tab/radio rolleri var ancak standart ok tuşu/roving tabindex davranışı uygulanmamış. prefers-reduced-motion için animasyon alternatifi yok. Zoom engeli kaldırıldı.

iPhone Safari, Android Chrome ve iOS PWA için fiziksel doğrulama yok. CSS fallback veya mock Fullscreen/Orientation çağrıları, gerçek iPhone desteğinin kanıtı değildir. Manifest portrait ile HUD landscape isteğinin cihazdaki etkileşimi ve safe-area çentikleri ayrıca denenmeli.

**Bilinen V3 işleri — uygulanmadı:**

1. Hızı Kaydet bildiriminin ilgili düğmenin hemen üstüne taşınması.
2. Ölçüm başlamadan HUD'a girildiğinde ölçümün otomatik başlaması, çıkışta oturumun korunması.

## F. Gizlilik, Güvenlik, PWA ve Netlify Değerlendirmesi

Kaynak taramasında konumu dışarı gönderen fetch/XHR/sendBeacon/WebSocket, üçüncü taraf script, analitik, uzak font, unsafe HTML sink veya konumun localStorage/IndexedDB'ye yazılması bulunmadı. React metin render'ı kullanılıyor. Kayıtlar bellekte; kullanıcı isteğiyle hız/saat panoya, geliştirme ortamında ham koordinatlar JSON dosyasına çıkabiliyor.

Production paneli ve veri toplama çağrıları kapalı. Üretim JS'inde logger sınıfının `exportedAt/getSampleCount` gibi kullanılmayan parçaları hâlâ var; bu gerçek koordinat sızıntısı değildir, küçük bundle temizliği fırsatıdır. Test koordinatları ve geliştirici paneli arayüzü üretim testinde bulunmadı. İzlenen JSON dosyaları arasında GPS dump bulunmadı; tüm geçmiş commitlerin adli veri taraması yapılmadı. İndirme dosya adı ile ignore uyumsuzluğu düzeltildi.

`npm audit --json`: **0 bilinen açık**. Bu sonuç yalnız kullanılan advisory veritabanının raporudur; mutlak güvenlik garantisi değildir. Paketler yükseltilmedi.

Netlify konfigürasyonu SPA rewrite, hashed asset immutable cache, SW/manifest no-cache kurallarını içeriyor. Canlı `/gizlilik` HEAD isteği 200 döndü; HTTPS, HSTS, DENY, nosniff, Referrer-Policy ve Geolocation/Wake Lock Permissions-Policy başlıkları gözlendi. Bu okuma canlı dağıtımın yerel HEAD ile aynı olduğunu kanıtlamaz. CSP yok; veri sızdıran bir yol bulunmadığı için P1 güvenlik açığı olarak değil, savunmayı güçlendirme fırsatı olarak değerlendirildi.

PWA çıktısında statik precache, navigation fallback ve eski cache temizliği var; runtimeCaching boş. Konum verisi cache'e girmiyor. Yerel production önizlemesinde service worker kontrolü ve ağ kapalıyken `/gizlilik` açılışı doğrulandı. Offline arayüz, offline GPS ediniminin tüm cihazlarda çalışacağını garanti etmez.

`prompt` kayıt stratejisi aktif oturumu otomatik reload etmiyor. Buna karşılık güncelleme UI'si yok; yeni worker, açık istemciler kapanana kadar bekleyebilir. Aktif ölçümde otomatik güncelleme eklemek yerine oturum sonrasında kontrollü aktivasyon gerekir. İki gerçek dağıtım arasında PWA güncelleme testi yapılmadı.

Manifest, ikon boyutları ve yerel ikon üreticisi mevcut; install/maskeleme gerçek cihazda denenmedi. Netlify'da doğrudan gizlilik erişimi doğrulandı.

Gizlilik metninin istemci tarafı koordinat işleme iddiası kaynakla uyumlu. Bununla birlikte tarayıcı/OS konum sağlayıcısı ağ hizmetleri kullanabilir; uygulama kendi koordinatlarını göndermiyor olması tüm platformun ağ kullanmadığı anlamına gelmez. Netlify erişim logları metinde ayrılmış. VERBİS/şirket yokluğu, veri sorumlusu kimliği, açık rıza ve başvuru hakları hakkında hukuki uygunluk sonucu verilmedi; bunlar teknik kaynak incelemesiyle kesinleştirilemez.

## G. Test Kapsamı ve Güvenilirliği

Başlangıç: 15 dosyada 199 Vitest testi ve 14 senaryonun iki Chromium projesindeki 28 çalışması geçti. Matematik sınırları, sıfır hız, birim/tempo dönüşümü, temel kontroller, kayıt geçmişi, görsel yay ve Wake Lock sınıfının mock yaşam döngüsü için yararlı koruma var.

Zayıflıklar:

- smartHaversine.test.ts:239 civarı yanlış 1,0 ortalamasını doğru kabul ediyor.
- averageSpeedAccuracy.test.ts:185 civarındaki mesafe/süre tutarlılığı testi, elle tutarlı seçilen sabitleri karşılaştırıyor; App'in hesaplarını birleştirmiyor.
- speedFilter.test.ts:298 ve sprint5Step2.test.ts:49, reddedilen hızın eski hız olarak istatistiğe alınmasını onaylıyor, gerçek koordinat sıçramasını sınamıyor.
- stationaryJitterFix.test.ts:48 yalnız SpeedFilter'i test ediyor; Tracker'ın filtre resetini kapsamıyor.
- backgroundAndOutageRecovery testleri reseti kendileri yapıyor; gerçek hata callback'inin watcher'ı kapatmasını kaçırıyor.
- Eski “Yeni Ölçüm oturumu sıfırlar” açıklamaları güncel Hızı Kaydet davranışıyla uyuşmuyor.
- Çoğu E2E mock'unda clearWatch no-op; gerçek callback yaşam döngüsü yeterince modellenmiyor. Birçok hız örneğinde konum aynı veya timestamp ileride; UI için yararlı, fiziksel rota doğruluğu için yetersiz.
- Fullscreen mock'u fullscreenElement'i değiştirmiyor; native çıkış ve kilit bırakma doğrulanmış olmuyor.
- E2E yalnız Chromium masaüstü/Pixel emülasyonu. WebKit, Firefox ve fiziksel cihaz kapsamı yok. Testler dev server'a karşı; PWA üretim yaşam döngüsü mevcut suite içinde değil.

Eklendi: 3 motor regresyonu (`it.fails`), 4 App doğruluk regresyonu (`test.fail`, iki proje), watcher/history ve eksik Geolocation cleanup doğrulaması. Beklenen başarısızlıklar hatanın yeniden üretildiğini belgeler; düzeltildiğini göstermez. İlgili algoritma düzeltmesinde fails işaretleri kaldırılmalıdır.

## H. Doğrudan Düzeltilen Küçük Sorunlar

| Dosya | Önceki sorun | Düzeltme / doğrulama |
|---|---|---|
| `.gitignore` | Panel `speedgps-raw-data-*.json` indiriyor; yalnız gps-debug ignore ediliyordu. | İlgili pattern eklendi; git check-ignore iki adı da doğruladı. |
| `src/App.tsx:244` | Geolocation yokken başlatılan Wake Lock bırakılmıyordu. | Erken dönüşe releaseLock eklendi; pending Promise dahil E2E iki projede geçti. |
| `index.html:7` | maximum-scale=1 ve user-scalable=no büyütmeyi kısıtlıyordu. | Kısıt kaldırıldı; viewport ve production build doğrulandı. Fiziksel pinch-zoom denenmedi. |
| `src/utils/gpsMath.ts:13`, `gpsReliability.ts:14` | accuracy için %68 yazıyordu. | Yalnız yorum %95 olarak düzeltildi; eşik/matematik değişmedi. W3C kaynak kontrolü yapıldı. |
| `README.md:106` | Başka bilgisayarda çalışmayan kişisel file:/// bağlantısı. | Depoya göre netlify.toml bağlantısı. |
| `src/utils/auditRegression.test.ts`, `e2e/audit.spec.ts` | Kritik karşı örnekler yoktu. | Hedefli testler; aşağıdaki sonuçlar. |

V3 özellikleri, HUD/oturum politikası, GPS algoritması, tasarım ve bağımlılıklar değiştirilmedi.

## I. Önerilen İyileştirmeler

1. B1–B3: Ölçüm kabul durumunu hız/mesafe/stale arasında taşı, filtre kilitlenmesini ve Haversine çapa toparlanmasını düzelt.
2. B4: Ortak ölçüm aralığı tanımıyla süre, mesafe ve ortalamayı tutarlı yap; duruş ve Durdur sınırını test et.
3. B5: Geçici hata sonrası oturum korunarak toparlanma sağla.
4. C'deki HUD iptal/odak/fullscreen yaşam döngüsü, yanlış GPS rozeti ve erişilebilirlik sorunlarını gider.
5. Üretim PWA güncellemesini iki sürüm ve açık oturumla sınayan küçük bir test ekle.
6. Önceden belirlenmiş V3 işlerini ayrı değişiklik olarak uygula.
7. App içindeki ölçüm yaşam döngüsünü tek küçük hook/modüle ayır; state yönetim kütüphanesi veya kurumsal katmanlar ekleme. İki farklı isGpsDataStale yardımcısını (null davranışları farklı) birleştirmeyi değerlendir. Yalnız testlerde kullanılan yardımcıları ve eski sprint yorumlarını sadeleştir.

Performans: Her saniyelik timer ve GPS callback'i App'i render ediyor; kadran geometrisi küçük, medyan penceresi 3, debug buffer 300 ile sınırlı. Tespit edilmiş bir render fırtınası veya genel listener sızıntısı yok. History sınırsız büyüyebilir ve her render'da map edilir; binlerce kayıtla ölçülmeden sanallaştırma önermek gereksiz. GPS yüksek doğruluk ve Wake Lock pil tüketir; gerçek tüketim ölçülmedi. Başlangıç JS yaklaşık 260,46 kB / gzip 80,60 kB, CSS 21,26 kB / gzip 4,76 kB; ciddi bundle şişkinliği bulgusu yok. Lazy loading/memoization yayın engeli değildir.

## J. Son Karar

**Kararlı ölçüm aracı olarak yayın öncesi B1–B5 çözülmeli.** Mevcut sürüm yalnız açıkça deneysel/demo niteliğinde değerlendirilebilir; “yüksek doğruluk” iddiası testlerle desteklenmiyor. Küçük düzeltmeler bu kararı değiştirmedi.

Sonraya bırakılabilir: küçük App ayrıştırması, kullanılmayan örnek görseller, logger tree-shaking, küçük stil düzenlemeleri ve yeni özellikler. V3 işleri bu denetimin kapsamından bilinçli olarak ayrı tutuldu.

Gerçek cihaz kontrol listesi:

- iPhone Safari ve ana ekrana kurulmuş PWA; Android Chrome ve kurulu PWA.
- Açık alan sabit konum, çok yavaş yürüyüş, durduktan sonra kalkış, sabit hız, hızlanma/frenleme ve dönüşlü rota.
- Coords.speed mevcut/null kaynak geçişleri; 0,2–3 saniye düzensiz örnek aralıkları.
- Tünel, TIMEOUT/POSITION_UNAVAILABLE, izin iptali, 5/30 saniye kesinti, ekran kilidi, uygulama değiştirip geri dönme.
- HUD hızlı aç/kapa, native fullscreen çıkışı, cihaz döndürme, çentikler, 320 px, üç basamaklı hız ve erişilebilirlik büyütmesi.
- Wake Lock isteği reddi/pil tasarrufu; Durdur sırasında bekleyen istek.
- Aktif oturum sırasında yeni PWA sürümü, kapatıp açınca güncelleme, offline yeniden açılış.
- Referans cihaz/ölçülmüş rota ile mesafe ve zaman karşılaştırması; sürüş sırasında testleri yolcu yapmalı.

## K. Test ve Git Durumu

| Kontrol | Sonuç |
|---|---|
| Vitest `npm test` | 199 normal başarılı + 3 beklenen başarısızlık, 16 dosya / 202 test |
| Playwright `npm run test:e2e` | 40 çalışma: 32 normal başarılı + 8 beklenen başarısızlık; exit 0 |
| TypeScript `npx tsc -b` | Başarılı |
| Ek `npx tsc --noEmit --strict -p tsconfig.app.json` | Başarılı |
| Lint `npm run lint` | Başarılı |
| Production `npm run build` | Başarılı |
| `npm audit --json` | 0 bilinen güvenlik açığı |
| `git diff --check` | Başarılı |
| PWA production smoke | Worker kontrolü, debug görünmezliği, offline /gizlilik başarılı |
| Fiziksel GPS/iPhone/Android/pil | Yapılmadı |

Playwright özetindeki “40 passed”, test.fail işaretli beklenen hataları da kapsar. Yedi ayrı ölçüm kusuru senaryosunun başarısız beklentileri açık kalmaktadır; bu rapor “tüm davranışlar doğru” sonucu çıkarmaz.

Son çalışma alanında değişen takip edilen dosyalar: `.gitignore`, `README.md`, `index.html`, `src/App.tsx`, `src/utils/gpsMath.ts`, `src/utils/gpsReliability.ts`. Yeni dosyalar: bu rapor, iki audit test dosyası ve audit-artifacts altındaki kanıtlar.

İlk Git snapshot'ında kullanıcıya ait değişiklikler ve untracked V2 bileşenleri vardı; bunlara reset/overwrite yapılmadı. Son kontrolde bu önceki çalışma HEAD içinde görünüyor; bu denetimde Git commit komutu çalıştırılmadı. Son HEAD yukarıda belirtilmiştir. Çalışma alanı denetim değişiklikleri nedeniyle temiz değildir. Push ve Netlify deployment yapılmadı.
