# SpeedGPS V3 — Bağımsız Düzeltme Doğrulaması ve Regresyon Denetimi

Tarih: 20 Ekim 2026  
Çalışma alanı: `/Users/ugurberktas/Desktop/speedGPS`  
HEAD: `f9de1f2a0825dcdf55c8243682f78f0cc697ee5f`  
Esas alınan önceki rapor: `AUDIT_REPORT_TR.md` — tamamı okundu, değiştirilmedi.  
İncelenen sürüm: **HEAD üzerindeki commit edilmemiş V3 değişiklikleri dahil çalışma ağacı**. HEAD tek başına V3 değildir.

Kaynak kod ve test dosyaları değiştirilmedi. Commit, push, reset, clean, rebase ve deployment yapılmadı. Fiziksel cihaz/GNSS testi yapılmadı. Bu rapordaki tarayıcı sonuçları yerel Chromium ve kontrollü GPS girdileridir.

Başlangıçta aynı isimde, bütün sorunların çözüldüğünü ileri süren izlenmeyen bir rapor bulunuyordu. Bu metin doğrulama kanıtı kabul edilmedi; üzerine yeni denetim yazılmadan önce `/tmp/speedgps-v3-independent/preexisting-report.md` konumuna eksiksiz kopyalandı. Önceki asıl rapor `AUDIT_REPORT_TR.md` korunmuştur.

## A. Genel Sonuç

**V3 belirgin biçimde iyileşmiş, fakat kararlı sürüm olarak yayın onayı vermek için erken.** Önceki beş P1 bulgusunun üçü kendi özgün senaryosunda çözüldü; ikisi kısmen çözüldü. Ayrıca production service worker ile yeniden üretilen bir güncelleme kaynaklı oturum kaybı var.

En önemli sonuçlar:

- Reddedilen hız artık yeni geçerli örnekten ayrılıyor; ilk 1 km sıçraması mesafeye doğrudan yazılmıyor ve Hızı Kaydet engelleniyor. Ancak App'in ayrı mesafe çapası korunarak aynı yanlış mesafe sonradan kabul ediliyor.
- 120 km/sa başlangıç hatası sonrasında 36 km/sa'ye toparlanma gerçekleşiyor. Haversine motorundaki sabit sıçramanın 15 saniye sonra 240 km/sa olması engellenmiş.
- TIMEOUT ve POSITION_UNAVAILABLE watcher'ı kapatmıyor; sonraki geçerli örnek aynı oturumu sürdürüyor. PERMISSION_DENIED ve Durdur temizliği çalışıyor.
- Süre/ortalama problemi tamamen çözülmemiş: ilk örneğe hâlâ 1 saniye ekleniyor; yeni durağanlık timer'ı GPS callback'iyle aynı saniyeyi çift sayabiliyor.
- Aktif sekmede PWA bildirimi gizli olsa da başka sekmedeki güncelleme onayı aktif sekmeyi yeniliyor; ölçüm ve RAM geçmişi kayboluyor.
- HUD'un tek aç/kapat yarışı iyileştirilmiş; eski isteğin yeni açılmış HUD'ı kapatabildiği örtüşen istek yarışı kalmış.

**Standart testlerin tamamı geçti: 241 Vitest, 88 Playwright. Bu sonuç aşağıdaki açıkları kapatmıyor.** Bağımsız ek senaryolar kaynak/test değiştirilmeden gerçek App üzerinde çalıştırıldı. Güvenlik açısından konum aktarımı, kalıcı konum depolaması veya production debug paneli saptanmadı. Gereksiz yeni runtime bağımlılık eklenmemiş.

## B. Önceki 5 P1 Bulgusunun Karşılaştırmalı Tablosu

| Bulgu | Eski sorun | Mevcut çözüm ve neden çalıştığı | Tekrar kanıtı | Karar ve kalan risk |
|---|---|---|---|---|
| B1 — Reddedilen sıçrama mesafeye giriyor | 36 → 360 km/sa ret sonucunda önceki 36 yeni ölçüm sanılıyor; 1.000 m ekleniyordu. | `speedEngine.ts:322` civarında `held/isAccepted:false`; `App.tsx:511` dalı istatistikleri güncellemiyor, güncelliği yenilemiyor; kayıt reddi `App.tsx:660`. | t0:36, t1:1.000 m/360 → hız36, mesafe0, maksimum36, ortalama36; Hızı Kaydet ret mesajı. Sürekli360 gönderilince hız sonunda `--`, mesafe0. **Fakat** t2–16 aynı uzak koordinatta36 gönderilince mesafe1.000 m oluyor. | **KISMEN ÇÖZÜLDÜ.** İlk ret ve kayıt koruması doğru; eski mesafe çapası sonraki kabulde yanlış segmenti yeniden içeri alıyor. D1. |
| B2 — Yanlış hıza kilitlenme | İlk120 ardından20×36 sonucunda120 korunuyordu. | Reddedilen nokta artık `previousPoint` değerini ilerletmiyor; dt son kabulden büyüyor. Ayrıca filtrede ardışık ret toparlanması var. | Aynı20 okuma tekrarlandı: ilk36 `held/120`, ikinci36 `valid/36`, kalan18 okuma36. Normal ivmelenme ve tekil sıçrama testleri geçti. | **ÇÖZÜLDÜ.** Bu tracker senaryosu üç ret değil, ikinci okumada genişleyen dt ile toparlanıyor. İlk yanlış120'nin geçmiş maksimumdan geriye dönük çıkarılması yapılmıyor; kilitlenme çözümü böyle bir garanti vermiyor. |
| B3 — Haversine çapasının zamanla sahte hız üretmesi | t2'de1.000 m sıçrama, aynı koordinatta bekleme; t15'te240 km/sa. | `speedEngine.ts:376–407` şüpheli noktadaki ikinci yakın okumada motor çapası yeniden kuruluyor, hız0; eski mesafe zamana bölünmüyor. | t0, t1 sabit; t2–15 uzak noktada sabit: ilk ret, ardından0; 240 oluşmadı. 60 s sabit +1 s/5 m →18 km/sa. | **ÇÖZÜLDÜ (hız motorundaki özgün hata).** App'in bağımsız mesafe çapası aynı karantinayı paylaşmıyor: sonraki5 m hareket1 km mesafe üretebiliyor. Bu ayrı devam etkisi D1'de açık; “tüm istatistikler güvenli” anlamında kapanış değildir. |
| B4 — Süre/ortalama politikası | 36→0→20 s bekle→Durdur: süre 21 s, ortalama18'de kalıyordu; ilk örneğe1 s ekleniyordu. | Null hızda süre duruyor; sıfır hızda timer ortalamaya süre ekliyor. Ancak callback ve timer ortak aralığı tek kez tüketmiyor. | Özgün senaryo artık21 s/1,6 km/sa. 1 Hz sıfır okumalarıyla10 s sonunda ortalama1,8; süre 10 s iken hesaplanan ağırlık20 s. İlk36 ve2 s sonra72 →60 ortalama; payda 3 s. | **KISMEN ÇÖZÜLDÜ.** Donma giderilmiş; hayalî ilk saniye ve yeni çift sayım sürüyor. D2. Mesafe ve hız integralini zorunlu eşitlemek çözüm olarak önerilmiyor. |
| B5 — Geçici hatadan toparlanamama | Code2/3 watcher'ı kapatıyor, yeniden Başlat oturumu sıfırlıyordu. | `App.tsx:547–602`: code1 tam durdurma; code2/3 watcher korunarak bekleme ve referans temizliği. Yeni fix aynı watcher ile devam ediyor. | Code2/3: watch çağrısı1, clear0, sonraki fix36, mesafe0, önceki maksimum korunuyor. Durdur sonrası clear1/aktif watcher0, yeni emit ölçümü başlatmıyor. Code1'de clear1, hata durumu korunuyor. | **ÇÖZÜLDÜ.** Tarayıcının yeniden fix üretmesi fiziksel cihazda doğrulanmalı. İstatistiklerin toparlanma anındaki sahte1 s problemi B4 kapsamındadır. |

Eski sonuçlar önceki rapor ve korunan audit testlerinden; yeni sonuçlar bu denetimde yeniden çalıştırılan senaryolardan alınmıştır. Eski commit ayrı bir uygulama olarak yeniden çalıştırılmadı; çalışma ağacına checkout/reset uygulanmadı.

## C. V3'ün 33 Maddelik Kontrol Listesi

“Uygulandı” kod ve belirtilen otomasyon kapsamındadır; fiziksel cihaz sertifikası değildir. Açık maddelerin bilinçli ertelendiğine ilişkin onaylı karar belgesi görülmedi; bunları kendiliğinden “ertelendi” saymadım.

| # | Madde | Durum | Bağımsız değerlendirme |
|---|---|---|---|
| 1 | Hızı Kaydet uyarısı | UYGULANDI; birebir metin kabulü sınırlı | `App.tsx:1275` civarı history kartında, buton satırının üstünde. Durduruldu mesajı: “Ölçüm durdurulduğu için hız kaydedilemiyor. Lütfen önce Başlat butonuna basın.” Güncel kullanıcı talebinde başka bir birebir metin belirtilmediğinden bundan fazlası doğrulanamaz. |
| 2 | HUD birimleri | UYGULANDI | `HudView.tsx:96` ortak dönüşüm; 54 km/sa→34 mph→15 m/s E2E geçiyor. Ana ekran/istatistikler aynı km/sa verisini kullanıyor. |
| 3 | Bayat/geçersiz GPS rozeti | KISMEN | Stale/null/bekleme sarı. Ancak `held` ret sonrası “GPS Aktif” ve “Canlı ölçüm güncelleniyor” kalıyor; kayıt düğmesi aynı fix'i güvensiz diye reddediyor. `App.tsx:948`, E5. |
| 4 | Kopyalama hatası/DOM cleanup | UYGULANDI | Clipboard reddi + `execCommand=false` bağımsız testinde hata mesajı ve0 textarea. `App.tsx:724–765` finally temizliği. |
| 5 | Gizlilik açıklamaları | KISMEN | RAM, clipboard, işletim sistemi sağlayıcısı ve Netlify ayrımı iyileşmiş. HUD otomatik başlamaz ve izin yalnız Başlat'ta istenir ifadeleri yeni kodla çelişiyor. E4. |
| 6 | README/sürüm/eski anlatım | KISMEN | UI/package3.0, Hızı Kaydet anlatımı güncel. Lock dosyası0.0.0; README hâlâ sayfa açılışında izin istemini anlatıyor ve32 E2E senaryosu diyor (mevcut44×2). |
| 7 | Kadran uçları/sıfır yay | UYGULANDI | m/s35 uç etiketi var; 0'da opacity0/butt. Matematik testleri ve320 px görüntüsü doğru. |
| 8 | TypeScript/Orientation | UYGULANDI; tip gücü sınırlı | Her iki tsc komutu geçiyor. Runtime lock kontrolü var; `(screen.orientation as any)` tip güvenliği yerine kaçış kullanıyor. Uygulama tsconfig'inde strict hâlâ açık değil; node config Playwright config'i kapsamıyor. |
| 9 | Audit kanıtları/GPS JSON | UYGULANDI | Önceki dört kanıt dosyası Git'te izleniyor; ignore bunları silmemiş. Ham kayıt isimleri ignore ediliyor. Yeni `audit-artifacts/` dosyaları da ignore edilir; bilinçli kanıt ekleme ayrıca gerekir. |
| 10 | Production debug | UYGULANDI | DEV guard + pure singleton; production JS'de logger export dosya adı/exportedAt izleri yok, panel yok. Test dosyaları build'e giriş noktası değil. |
| 11 | Mobil hedef/kontrast | KISMEN |320 px'de ana buton 54px, mod/birim/HUD32px; önceki21–23px'den iyi. Kadran yazısı koyulaşmış. Tüm metinlerin AA olduğu kanıtlanmış değil; turuncu seçili birim ve gradient için E6. |
| 12 | Klavye/reduced-motion | BÜYÜK ÖLÇÜDE UYGULANDI | Roving tabindex, ok tuşları, HUD focus trap ve motion CSS var. `aria-controls="speed-display-panel"` hedef id'si DOM'da yok; P3. |
| 13 | Gizlilikte ölçüm/Durdur | UYGULANDI | Banner ve Durdur aynı üst App oturumunu kontrol ediyor; route değişimi App'i unmount etmiyor. Bekleme de “Canlı GPS ölçümü ... devam ediyor” şeklinde genelleniyor. |
| 14 | HUD otomatik Başlat | UYGULANDI | Durduruldu/hata durumunda `startTracking`; açık watcher varsa guard. HUD kapanışında stop/reset yok. E2E doğruluyor. |
| 15 | HUD focus/native çıkış | UYGULANDI | Kapat'a focus, Tab döngüsü, Escape, odak iadesi ve fullscreenchange mevcut. Temel senaryolar geçiyor; örtüşen istek ayrı16. |
| 16 | HUD async yarış | KISMEN | Tek bekleyen istekte kapanış güvenli. A aç/kapa/B aç, B tamamla/A tamamla sırası yeni HUD'ı kapatıyor. E1. |
| 17 | accuracy=0 | UYGULANDI |>=0 kabul, kaliteİyi, mesafede2m taban; negatif/NaN ve>100 reddi sürüyor. |
| 18 | GPS timestamp | KISMEN | NaN/negatif/çok ileri/aynı/geriye giden kontrolü var. Eski ama pozitif ve sıralı timestamp'in yaş kontrolü yok; 1 saat eski fix güncel36 olarak kabul edildi. E3. |
| 19 | Eşikler/yavaş/yüksek hız | KISMEN |1 km/sa deadband,250 tavan,100/25m accuracy ve500ms Haversine sınırı açık. Bunlar fizik kanunu değil. Donanım1–2,5 korunuyor; gerçek>250 desteklenmiyor. Yavaş yürüyüş App mesafesi E2. |
| 20 | GPS/Haversine geçişi | TEMEL SENARYOLAR UYGULANDI |36/54 seyir geçişleri,0 ve geri dönüş testleri geçti. Motor/mesafe referansları ortak değil; bütün hata/toparlanma kombinasyonları güvenilir kabul edilemez (D1). |
| 21 | Kontrollü PWA bildirimi | UYGULANDI | Gerçek waiting worker'da durdurulmuş sekmede bildirim var, aktif sekmede gizli. Bu tek başına reload koruması değil. |
| 22 | İki sürüm/aktif oturum | KISMEN; REGRESYON DOĞRULANDI | Production worker'ın farklı byte içeren ikinci sürümüyle aktivasyon sınandı. Başka sekmeden onay aktif sekmeyi yeniliyor. İki farklı uygulama bundle'ının tüm yükseltme uyumluluğu sınanmadı. D3. |
| 23 | Netlify/CSP | YEREL OLARAK UYGULANDI | Header config doğru; aynı CSP ile production yerel sunucuda yükleme/SW/offline gizlilik hatasız. V3 commit edilmemiş olduğundan canlı Netlify dağıtımında bunların uygulandığı iddia edilmiyor. |
| 24 | E2E modelleri/tarayıcılar | KISMEN | Yeni watcher Map/id ve fullscreen olay testleri iyi. Eski testlerin çoğunda clearWatch noop; 44 senaryo yalnız Chromium'un2 profilinde. PWA testleri asıl SW güncellemesini kapsamıyor. |
| 25 | Duruştan Haversine harekete geçiş | UYGULANDI |60s sabit→1s/5m 18 km/sa. Çapa duruş süresinden kurtarılmış. Yavaş hareketin mesafesi ayrıE2. |
| 26 | Geçici GPS toparlanması | UYGULANDI | B5; code2 ve3 aynı watcher ile devam; Stop sonrası yeniden başlamıyor. |
| 27 | Eski hıza kilitlenmeme | UYGULANDI | B2; 20×36 dizisi toparlanıyor. İlk yanlış maksimumu retroaktif düzeltmez. |
| 28 | Ret Haversine sıçraması | HIZDA UYGULANDI; MESAFEDE AÇIK | B3'ün240 km/sa hatası kapandı. Motorun yeniden çapalanması App mesafesini yeniden çapalamıyor (D1). |
| 29 | Hatalı verinin istatistikleri bozmaması | KISMEN | İlk ret kabul edilmiyor; gecikmeli yanlış mesafeD1, zaman paydasıD2 açık. |
| 30 | Süre/mesafe/ortalama politikası | KISMEN | Null süre koruması ve durağan ağırlık eklenmiş; çift sayım ve hayalî ilk saniye var. Hız integrali ile koordinat mesafesinin ayrı olması başlı başına hata sayılmadı. |
| 31 | Codex regresyon testleri | İŞARETLER KALDIRILMIŞ; KAPSAM EKSİK | Çalışan `it.fails/test.fail` yok; yalnız eski yorum var. B4 testi hâlâ ilk saniyede18 bekliyor ve sonra yalnız18 olmamasını doğruluyor. |
| 32 | App sadeleştirmesi | KISMEN AYRIŞTIRMA; ZORUNLU DEĞİL | PWA hook'a çıkmış ama App 1396 satıra büyümüş. Büyük mimari dönüşüm gerekmiyor; aynı ölçüm aralığının tek sahibi olması yeterli. |
| 33 | Gerçek cihaz hazırlığı | SAHA DOĞRULAMASI BEKLİYOR | Bu raporun L bölümü test listesidir. iPhone Safari/iOS PWA/Android gerçek GNSS, batarya ve tünel doğrulaması yapılmadı. |

## D. Hâlâ Açık Kritik Sorunlar

### D1 — P1: Reddedilen koordinat segmenti zaman geçince tekrar mesafeye kabul ediliyor

**Kod:** `src/App.tsx:455–486`, özellikle473–476 ve481–485; ret dalı511–519. Haversine yeniden çapa kurma: `src/utils/speedEngine.ts:376–407`.

**Yeniden üretim 1:** Her saniye callback, accuracy5; metreler enleme `m / 111194.92664455874` ile çevrildi.

1. t0:0m,36 km/sa.
2. t1:1.000m,360 km/sa — hız tutuldu, mesafe0, kayıt engellendi.
3. t2…16:1.000m,36 km/sa — yeni koordinat sabit, hız donanımı yeniden normal değer bildiriyor.
4. Ekran sonunda **1.000m** gösterdi; kabul edilen yeni konumlar arasında bu mesafe katedilmedi.

**Neden:** Mesafe üst sınırı `250/3.6 * dt + 2*accuracy`. Son mesafe çapası 0m'de kalıyor. t15'te sınır yaklaşık1051,7m oluyor; reddedilmiş1km artık “makul” bulunuyor. Hız motoru güncel olsa bile mesafe referansı eskimiş durumda.

**Yeniden üretim 2 (yalnız Haversine):** t0, t1:0m; t2…15:1.000m sabit; t16:1.005m, tüm speed=null. Motor0'dan 18 km/sa'ye doğru geçiyor; App mesafe ekranı **1.00km** oluyor. Gerçek yeni segment5m. Bu, B3'teki motor düzeltmesinin istatistik katmanına yayılmadığını gösteriyor.

**Etki:** Büyük sahte mesafe sonradan oturuma girer. İlk ret testinin geçmesi güvence değildir.

**Öneri:** Ret veya yeniden edinimde mesafe segmentini kes; yeni referansın eskisiyle köprü kurmasını engelle. Motorun yeniden çapa kurma olayını App mesafe hesabına açıkça taşı veya App düzeyinde aynı segment geçersizlik bilgisini tut. Zaman büyüdüğü için önceden reddedilen segmenti tekrar kabul etme. İlk ret, uzak noktada kalma ve yeniden hareketi kapsayan App E2E eklenmeli. GPS algoritmasına bu denetimde müdahale edilmedi.

### D2 — P1: Durağanlıkta süre çift sayılıyor; ilk/recovery örneğe hayalî süre ekleniyor

**Kod:** `src/App.tsx:150–170`, `src/App.tsx:497–509`; `src/utils/measurementSession.ts:187–207`; `e2e/audit.spec.ts:49–60`.

Timer0 hızda1s ekliyor ve `lastSessionStatTimestampRef +=1000` yapıyor. Sonraki fix'in timestamp'i bu referansla aynı olduğunda callback fark0 olması gerekirken `:1.0` fallback'i çalışıyor. Böylece aynı aralık yeniden ekleniyor. `updateSessionStats` ayrıca0 dt'yi1'e çevirdiği için yalnız çağıranı0 gönderecek şekilde değiştirmek yeterli olmaz.

**Somut sonuçlar:**

| Girdi | Ekran | Hesap sorunu |
|---|---|---|
| İlk 36 km/sa fix'i | Süre00:00, ortalama36 | Hiç aralık geçmeden payda1s/pay 36 ekleniyor. Anlık maksimumun görünmesi normal; ortalama ağırlığı oluşturmak ayrı mesele. |
|36→1s sonra 0→20s callback yok→Stop | Süre00:21, ortalama1,6 | Eski18 donması yok; fakat mevcut pay 36 ve payda 22. İlk hayalî saniye duruyor. |
| t0:36; t1…10:her saniye0 | Süre00:10, ortalama1,8 | Callback/timer birlikte 20s ağırlık oluşturuyor. Aynı durağan periyodun callback sıklığı sonucu değiştiriyor. |
| Sonraki t11:36 | Süre00:11, ortalama3,3 | Pay72/payda 22. Çift sayım hareket başlayınca da ortalamada kalıyor. |
| t0:36; t2:72 | Süre00:02, ortalama60 | `(36*1+72*2)/3`; ilk örneğin sahte saniyesi mevcut. |

**Etki:** Dur-kalkta ortalama GPS callback sıklığına bağlı olarak yapay düşüyor. Ekran süresiyle ağırlıklı ortalamanın paydası farklılaşıyor.

**Öneri:** Kabul edilen ölçüm zaman aralıklarını tek kez tüketen küçük bir ortak yardımcı/durum kullan. İlk fix ve recovery fix'i referans kurabilsin; 0 zaman ağırlığı desteklensin. Timer ve callback aynı interval için iki ayrı istatistik yazmasın. Stop son geçerli aralığı belirlenen politikaya göre kapatsın. Hız integralini koordinat mesafesiyle zorla eşitleme; sağ/sol uç veya interpolasyon tercihinin açık ve tutarlı olması yeterli. Test beklenen pay/paydayı ve UI süresini birlikte doğrulamalı.

### D3 — P1: Başka sekmeden PWA güncellemesi aktif ölçümü ve geçmişi siliyor

**Kod:** `src/utils/usePwaUpdate.ts:24–30`,51–66,75–85; `src/App.tsx:1035` civarındaki doğrudan `updateServiceWorker(true)` çağrısı. Kurulu `vite-plugin-pwa/dist/client/build/register.js` prompt akışında `controlling` olayının `event.isUpdate` dalında koşulsuz `window.location.reload()` bulunuyor.

**Gerçek service worker yeniden üretimi:**

- `npm run build` çıktısı yerel5175 portunda Netlify ile aynı CSP altında sunuldu. Tarayıcıda gerçek SW kuruldu ve kontrol etmesi beklendi.
- A sekmesinde GPS başlatıldı,36 km/sa okundu,1 kayıt yapıldı. B sekmesi aynı origin'de durdurulmuş durumda açıldı.
- Sunucu ikinci, byte içeriği farklı `sw.js` sundu; `registration.update()` ile waiting worker üretildi. Sürüm farkı SW sonuna denetim yorumu eklenmesiydi; kaynak/build dosyaları değiştirilmedi, HTTP cevabı değiştirildi.
- A'da bildirim0, geçmiş1, navigasyon0; B'de güncelleme bildirimi göründü.
- B'de Güncelle: A'da **1 navigasyon**, geçmiş**0**, durum**Durduruldu**.

Bu bir SW mock'u veya salt boolean testi değildir. İki uygulama bundle'ı arasında kapsamlı migrasyon testi de değildir; gerçek worker yükseltmesinin aktif istemcide reload etkisini kesin olarak gösterir.

**Etki:** Aktif kullanıcının izni olmadan oturumu kaybolur. Tek sekmedeki bildirimi gizlemek diğer istemcilerin aktivasyonunu engellemez.

**Öneri:** Controller değişimindeki reload politikasını aktif oturumu bilen uygulama kontrolüne al. Gerekirse açık istemciler arasında güncelleme koordinasyonu yap; aynı sekmede onaydan sonra GPS başlatılması yarışını da kapsa. Çözüm için konumları kalıcı depolamaya taşımak zorunlu değil. İki sekmeli gerçek production SW regresyon testi gerekir.

P0 saptanmadı. Üç P1 yukarıdaki bağımsız kök sorunlardır; B1/B3 mesafe devam etkisi iki kez sayılmadı.

## E. Yeni Ortaya Çıkan Hatalar ve Regresyonlar

### E1 — P2: Eski HUD isteği yeni HUD oturumunu kapatıyor

`src/App.tsx:842–857`: sekans uyuşmazlığı bulunan eski istek, mevcut fullscreen'in kime ait olduğuna bakmadan çıkış yapıyor. `fullscreenchange` dinleyicisi896–907 de yeni HUD'ı kapatıyor.

İki ertelenmiş fullscreen Promise'iyle sıralama: A aç→kapa→B aç→B tamamla→A tamamla. B tamamlandığında overlay1/fullscreentrue; A tamamlandığında overlay0/fullscreenfalse. Yeni GPS watcher açılmıyor; hata HUD oturum sahipliğinde. Mevcut `e2e/speedgps.spec.ts:2010` testi bu ters tamamlanma sırasını üretmiyor.

Çözüm: Eski isteğin temizliği yeni isteğin fullscreen/orientation kaynaklarını serbest bırakamamalı; request id bazlı sahiplik veya sıralı geçiş kullan. Aynı koruma kapanışta beklenen exit promise'i ve orientation tamamlanması için de değerlendirilmeli. İkinci kombinasyonlar bu denetimde ayrıca fiziksel cihazda sınanmadı.

### E2 — P2: Yavaş yürüyüşte gerçek App mesafesi birim testinden farklı; mesafe kaybı

`src/App.tsx:481–485` motor henüz0 döndürürken eşik altı hareketlerde mesafe referansını her fix'te yeniliyor. Motor ise kendi çapasında hareket biriktiriyor. Hareket doğrulandığında App önceki küçük adımları zaten kaybetmiş oluyor.

Önceki testle aynı8m/16s senaryosu gerçek App'e taşındı: speed=null, accuracy4, her saniye0,5m. Sonuç **4m**, ekran hızı2(yuvarlanmış1,8), ortalama0,7, süre00:15. `smartHaversine.test.ts:180–253` manuel mesafe hesabı aynı senaryoda8m doğruluyor; App'in yeni sıfır hız referans yenilemesini ve timer'ını çalıştırmıyor. Accuracy5 varyantında16s sonunda mesafe 0m çıktı.

Bu bulgu hız integrali ortalamasının mutlaka1,8 olması gerektiği iddiası değildir. Somut hata, hareketi biriktirerek8m'yi koruduğunu söyleyen testin gerçek App'i temsil etmemesidir. Sıfır kabul edilen küçük hareketleri, motorun doğrulanmış hareket aralığıyla tutarlı biçimde mesafeye aktaracak politika gerekir. Yeni App dalı HEAD farkında mevcut olduğundan V3 regresyonudur.

### E3 — P2: Eski timestamp güncel ölçüm olarak kabul ediliyor

`src/utils/gpsReliability.ts:237–255` yalnız pozitiflik ve gelecek üst sınırı kontrol ediyor. `App.tsx:431` güncelliği ölçüm zamanından bağımsız callback varışına eşitliyor. İlk okumaya `Date.now()-3600000` timestamp ve 36 km/sa verildiğinde hız36, rozetGPS Aktif oldu.

`maximumAge:0` normal platformdan taze veri istemek için doğru; buna rağmen kod seviyesinde eski okuma reddi uygulanmış değildir. Bu nedenle hatalı/gecikmiş sağlayıcı girdisine ilişkin P2 doğrulama açığıdır; normal tarayıcının sürekli bir saat eski veri ürettiği iddia edilmiyor. Sıralı fakat eski veri için tanımlı yaş sınırı ve test gerekir. Gelecek 15s toleransı da ölçüm saati/callback saati farkı olarak açıkça belgelenmeli.

### E4 — P2: Gizlilik metni HUD'un yeni izin başlatma davranışıyla çelişiyor

`src/components/PrivacyPolicy.tsx:174–182`: yalnız Başlat izin ister ve HUD kendi başına ölçüm başlatmaz deniyor. `src/App.tsx:815–817` tam tersine HUD açılışında startTracking çağırıyor. Gizlilik metni ve README izin açıklaması Başlat **ve HUD** girişini anlatmalı. Bu teknik tutarlılık bulgusudur; hukuki uygunluk hükmü değildir.

### E5 — P2: Reddedilmiş örnekte yeşil “GPS Aktif” ve canlı güncelleniyor metni

B1 ilk ret sonucu hız36 ve yeşilGPS Aktif kaldı; aynı anda Hızı Kaydet “Güvenilir olmayan GPS sıçraması...” uyarısı verdi. `App.tsx:948` koşulu `isCurrentFixRejectedRef` bilgisini kullanmıyor. Stale eşiği sonrasında sarıya geçmesi doğru, fakat geçici olarak tutulan eski hızı yeni güvenilir güncelleme gibi anlatıyor. Tutulan değerin statüsü görünür olmalı; her ret için ağır hata ekranı gerekmiyor.

### E6 — P2/P3: Erişilebilirlik ve dokümantasyonda tamamlanmamış küçük işler

- P2: Seçili birim metni `#ea580c` beyaz zeminde yaklaşık3,56:1; küçük yazı için4,5:1 seviyesinde değil. Başlat gradient'inin açık ucu `#f97316` ile beyaz yaklaşık2,80:1. Gradient'in her metin pikseli için oran ölçülmedi; “tüm AA sağlandı” denemez. Kadran etiketleri artık koyu ve belirgin biçimde daha iyi.
- P3: `aria-controls="speed-display-panel"` gerçek hedefi olmayan ilişki. Hız ve Tempo paneline karşılık gelen id/role ilişkisi tamamlanmalı.
- P3: package-lock sürüm0.0.0/package3.0.0; README eski izin akışı ve32 senaryo. Build'i bozmadı; sürüm/doküman uyumu eksik.
- P3: `tsconfig.app.json` strict eksikliği ve `tsconfig.node.json` Playwright config'ini kapsamaması sürüyor. Çalışan komutlarda TypeScript hatası bulunmadı; bunlar başarısız derleme olarak sunulmuyor.

Yeni timer çift sayımı D2'nin yeni regresyon kısmı; PWA veri kaybı D3 yeni. Geçmişten gelen eksiklikler (eski timestamp/kontrast gibi) yeni keşfedilmiş olsa da otomatik “V3'ün ürettiği yeni hata” sayılmadı.

## F. GPS ve Ölçüm Doğruluğu

### Hız kaynakları ve filtre

Haversine matematiği ve m/s×3,6 dönüşümü doğru; 0 donanım hızı null gibi ele alınmıyor. Geçersiz koordinatlar/accuracy, NaN/Infinity için sayısal korumalar var. Kullanılan status ayrımı eski belirsiz sayısal dönüşe göre önemli ilerleme. `held` örneğin mesafe/maksimum/ortalama yazmaması ve kaydedilememesi doğru.

Filtrede 250 km/sa üstü ret hiçbir ardışık toparlanma ile kabul edilmiyor.1 km/sa altı doğrudan hız bilinçli deadband; 1–2,5 arası korunuyor. Gerçek yüksek hızlı tren/havacılık250 üstünde bu ürün politikasına takılır; eşik bir fiziksel imkânsızlık kanıtı değildir.15m/s² GPS,12m/s² Haversine ivme sınırları ve35km/sa taban tolerans ampirik seçimlerdir; saha kalibrasyonu yapılmadı.

B2'de toparlanmayı yalnız “üç tutarlı örnek” diye açıklamak yanlış: tracker önceki kabul konumunu koruduğundan ikinci36 örneğinde dt2s, izin verilen fark108km/sa olur; 84 fark kabul edilir. Filtrenin doğrudan1s çağrılan birim testi üçüncü örnekte toparlanabilir. İki katmanın davranışı ayrı değerlendirilmelidir.

Haversine'de duruş→ilk hareket geçişi medyan geçmişini sıfırlıyor. Bu gecikmeyi azaltır, fakat ilk koordinat hareketinin tüm gürültüsünü filtrelediği anlamına gelmez. Son3 örneklik medyan ve0,75 EMA callback sayısına bağlıdır; düzensiz örneklemede zaman sabitli bir filtre değildir. Bunu tek başına yeni P1 saymadım.

### Çapalar, mesafe ve duruş

Motorun karantina/re-anchor mekanizması özgün B3'ü çözüyor. App ayrı `lastCoordsRef` tuttuğu için güvenli yeniden referans bilgisi mesafeye ulaşmıyor. D1 büyük fazla sayımı, E2 küçük adımların eksik sayımını gösteriyor. Bu iki bulgu yalnız unit motor testleriyle doğrulanamaz.

Accuracy ortalamasını eşik olarak kullanmak istatistiksel bir bağımsız hata birleşimi kanıtı değildir. Donanım hızında mesafe alt eşiği hâlâ2m; pozisyon jitter'ı ile donanım hızının farklı güvenilirlikte olabileceği dikkate alınmalı. Her koşulda koordinat mesafesi ile hız integralinin eşit olması beklenmez.

### Zaman, stale, Stop ve toparlanma

5s hareket/30s durağan tolerans korunuyor. Kontrol1s interval ile ve `>` sınırıyla yapıldığı için tam5000ms'de anlık kesilme garantisi yok. Durağan30s toleransı hareketin kesinlikle0 olduğunu kanıtlamaz; ürünün sinyal seyreltme varsayımıdır.

Null hızda sayaç ilerlememe düzeltmesi olumlu. Görünmezken fix'ler kullanılmıyor, dönüşte segment kesiliyor; tünel/recovery ilk fix'i eski mesafeye bağlamıyor. Aynı/geriye timestamp resetten önce reddediliyor. Geçici hata watcher'ı koruyor, Stop onu siliyor. Oturum verileri Stop'ta ekranda kalıyor; tekrarStart istatistikleri sıfırlıyor, kayıt geçmişini koruyor. Birim/tempo/HUD değişimi ölçüm değerini sıfırlamıyor.

Buna karşılık timer ve istatistik süresi ayrı muhasebeler olmaya devam ediyor; D2 bu yüzden P1. Ret sürelerinin paydada tutulması, hangi uç hızın aralığa uygulanacağı ve Stop'ta son aralığın kapanışı tek bir açık politika olarak tanımlanmalı.

## G. HUD, Kadran ve Kullanıcı Deneyimi

HUD, seçili birim ve ortak km/sa state'i kullanıyor; mirror yalnız sayısal bölümde, çıkış aynalanmıyor. Native fullscreen başarısızlığında CSS katmanı çalışabiliyor. Portrait90° CSS dönüşü,100dvh/dvw ve safe-area tanımları mevcut. Gerçek iPhone Safari veya iOS standalone yön kilidi davranışı doğrulanmadı.

Klavye focus'u Kapat'a gidiyor, Tab/Shift+Tab döngüsü veEscape temizliği mevcut; stabil `useCallback` nedeniyle her hız değişiminde modal effect'i yeniden bağlanmıyor. Native fullscreen çıkışı temel E2E'de kapanışla senkron. E1'deki ters Promise tamamlanması açık. Gereksiz watcher çoğalması gözlenmedi.

Kadran πr yarım daire uzunluğu, progress clamp, dashoffset=`L*(1-progress)` hesabı doğru.120 km/sa,75mph,35m/s ölçekleri ve35 uç etiketi var. Ölçek aşılınca yay dolu kalırken sayı gerçek değeri gösterebilir; bu bir veri uyuşmazlığı değil, doyumlu göstergedir.0 vegeçersizde turuncu yay görünmez. Animasyon transform/dashoffset/CSS ile; ölçülmüş FPS/batarya performansı yok.

320×740 Chromium görüntüsü `/tmp/speedgps-v3-independent/mobile-320.png` üzerinden görsel olarak incelendi: yatay taşma yok, kadran etiketleri/sayı çakışmıyor, sayfa uzun ve istatistikler tek sütuna iniyor. Mod/birim/HUD32px, başlat 54px.32px iyileştirmedir; 44px hedef konforu sağlandı diye raporlanamaz ve tek başına bütün WCAG kurallarında başarısızlık demek de değildir.

Hızı Kaydet uyarısı ilgili history kartının üstünde. Kopyalama başarısızlık mesajı doğru. Gizlilikte görünürStop eklenmesi yararlı. Tempo0'da sonsuz/NaN yerine`--:--`; HUD tempo ekranından açıldığında hız gösteriyor. Erişilebilirlikte açık noktalar E6'da.

## H. Güvenlik, Gizlilik, PWA ve Netlify

### Güvenlik/gizlilik

Kaynak taramasında GPS koordinatı gönderen fetch/XHR/beacon/WebSocket, analitik/üçüncü taraf script, konum için localStorage/IndexedDB veya güvensizHTML kullanımı saptanmadı. Kayıtlar React RAM state'inde; clipboard yalnız kullanıcı işlemiyle. GPS loggerDEV'de 300 örnekle sınırlı. Production build'de panel ve logger dışa aktarma izleri bulunmadı. Gerçek kullanıcı GPS verisi kullanılmadı; ek denetim koordinatları sentetiktir.

`npm audit`:0 vulnerability. Bu yalnız mevcut audit veritabanının sonucudur; mutlak güvenlik garantisi değil. Runtime bağımlılıkları react/react-dom olarak kaldı; bağımlılık sürümleri değiştirilmemiş. PWA hook'u mevcut plugin'i kullanıyor.

`.gitignore` gerçek panel dosyası `speedgps-raw-data-*.json`, varsayılan logger `speedgps-debug-*.json`, NMEA/GPX kayıtlarını kapsıyor. İzlenen dört eski audit kanıtı korunuyor. Ignore önceden izlenen dosyayı takipten çıkarmaz; ayrıca herhangi başka isimliJSON otomatik güvenli değildir. Bu incelemede kazara eklenen gerçek GPS kaydı görülmedi.

Gizlilik metnindeki işletim sistemi sağlayıcısı ayrımı doğru yönde; uygulamanın koordinat göndermemesi platformun konum çözümleme ağını kontrol ettiği anlamına gelmez. HUD izin anlatımı düzeltilmeli. Hukuki KVKK/VERBİS uygunluğu değerlendirilmedi veya garanti edilmedi.

Geolocation `accuracy` negatif olmayan değerdir; 0 kabulü teknik olarak doğru. Standart ve API kapsamı için [W3C Geolocation](https://www.w3.org/TR/geolocation/) incelendi. API'nin gerçek fiziksel konumu garanti etmemesi nedeniyle mock başarısı saha doğruluğu kanıtı değildir.

### PWA/Netlify

Manifest, ikon dosyaları, standalone/portrait, start_url ve statik precache mevcut. Production 14 precache girdisi312,19KiB; runtimeCaching boş. Offline `/gizlilik` gerçek kontrolcüSW altında açıldı. SPA fallback veNetlify200 rewrite tanımlı. Service worker ve manifest no-cache; hashli assets immutable. HSTS, nosniff, DENY, referrer, geolocation/wake-lock Permissions-Policy veCSP var.

Aynı CSP'yi sunan yerel production testinde konsol hatası yok; worker kuruldu, güncellendi, offline navigasyon çalıştı. Canlı Netlify V3 deployment doğrulanmadı ve deployment yapılmadı. HTTPS başlıklarının prod'da gerçek response üzerinden kontrolü yayın doğrulamasında ayrıca gerekir.

Prompt update ve `injectRegister:null` ile React kayıt hook'u doğru yönde. Otomatik bekleme/aktivasyonun uygulama state'inden bağımsızlığı D3'te sorun yaratıyor. Açık sayfanın sonsuza kadar yeni sürüm bulması garantilenmiyor; periyodik update poll yok, ertelenen prompt mevcut oturumda geri gelmiyor. Bunlar D3'ten ayrı, şimdilik ürün tercihi/limit olarak bırakıldı; gereksiz polling önerilmiyor.

Workbox'ın çoklu istemci olayları için [resmî workbox-window açıklaması](https://developer.chrome.com/docs/workbox/modules/workbox-window/) incelendi. Bulguyu belirleyen esas kanıt kurulu plugin kodu ve gerçek iki sekmeli yerel denemedir.

## I. Test Kalitesi ve Gerçek Sonuçlar

| Komut | Gerçek sonuç | Normal başarılı | Beklenen başarısız | Gerçek başarısız |
|---|---|---:|---:|---:|
| `npm test` | exit0; 18 dosya |241|0|0|
| `npm run test:e2e` | exit0; 44 senaryo×2 Chromium profili |88|0|0|
| `npm run lint` | exit0 |Geçti|—|0|
| `npm run build` | exit0; tsc+Vite+PWA |Geçti|—|0|
| `npx tsc -b` | exit0; ayrıca çalıştırıldı |Geçti|—|0|
| `npx tsc -p tsconfig.e2e.json --noEmit` | exit0 |Geçti|—|0|
| `git diff --check` | exit0 |Geçti|—|0|
| `npm audit` | exit0 |0 güvenlik açığı|—|—|

Çalışan expected-failure işareti yok. `e2e/audit.spec.ts:23` içindeki `test.fail()` yalnız yorum; `auditRegression` dosyasında da eski yorum duruyor. Bağımsız analiz scriptleri suite'e eklenmedi; yukarıdaki test sayılarına dahil değildir. Bu scriptlerin ölçtüğü hatalı çıktılar D/E'de açıkça raporlandı; “bütün testler geçti, hata yok” sonucu çıkarılmadı.

Olumlu test kapsamı: dönüşümler/geometri, sıfır hız, accuracy0, temel kaynak geçişleri, filtre toparlanması, temel fullscreen lifecycle, focus, privacyStop ve watcher izolasyonu için anlamlı kontroller var. Eski regresyon testlerinin gerçekten çalışır normal teste dönmesi B2/B3/B5 açısından değerli.

Açık test sorunları:

1. `e2e/audit.spec.ts:49–60` B4'te ilk1s sonunda18 beklemeyi koruyor; 20s sonra yalnız18 olmamasını ister.1,6 ile1,7 farkını veya çift payda sayımını yakalamaz. Eski testin failure işaretini kaldırmak bütün B4'ün çözüldüğünü göstermez.
2. `smartHaversine.test.ts:180–253` App mesafe akışını kopyalayan eski manuel hesap; App'teki yeni stationary referans ilerletmesi yok. Test8m, gerçekApp4m.1,0 hız integrali beklentisini yalnız farklı tanım diye açıklamak App entegrasyonunu doğrulamaz.
3. `usePwaUpdate.test.ts` beş boolean koşul testi; gerçek hook/SW/reload işlemi yok. E2E2323 yalnız güncelleme olmayan dev sayfasında bildirimin yokluğunu kontrol ediyor. D3'ü yakalayamaz.
4. `e2e/speedgps.spec.ts:2010` aç/kapa/aç testi eski ve yeni fullscreen promise'lerini ters sırada çözmüyor. Tek bekleyen promise testi1777 yararlı fakat yeterli değil.
5. Yeni2377+ watcher testleri id/clear izolasyonu sağlıyor. Eski grupların çoğunda `clearWatch:()=>{}` ve callback array'i devam ediyor; watcher temizliği için o grupların yeşil olması kanıt değil.
6. Ortalama/outage birim testlerinde elle helper çağırma ve `tracker.reset()` gerçek callback hatasını tümüyle modellemiyor. Bu denetimde bu nedenle code1/2/3 gerçekApp callback'leri ayrıca çalıştırıldı.
7. Playwright Desktop Chrome vePixel5 Chromium emülasyonu; WebKit/Firefox yok. Başlıktaki iPhone benzeri viewport gerçek Safari testi değildir.
8. Netlify testi dosyada header string'i arıyor; HTTP/CSP çalışmasını ispatlamaz. Bu denetimde production+eşCSP yerel testiyle bir kısmı ayrıca kapatıldı.

Kanıt dizini: `/tmp/speedgps-v3-independent/`. `repro.mjs`, `extra.mjs`, `ui.mjs`, `pwa.mjs` yeniden çalıştırılabilir analizler; sonuç JSON'ları ve komut logları aynı yerde. `repro/extra/ui` için yerel Vite 5174 gerekir; `pwa.mjs` kendi 5175 sunucusunu açar ve mevcut dist'i okur. Bu geçici dosyalar Git'e eklenmedi; `/tmp` kalıcı arşiv garantisi vermez. Esas sayısal kanıtlar bu rapora gömülmüştür.

## J. Önceki ve Yeni Denetimin Karşılaştırması

Önceki beş P1 için mükerrer sayım olmadan:

- **3 çözüldü:** B2, B3'ün hız motoru hatası, B5.
- **2 kısmen çözüldü ve açık:** B1, B4.
- **0 bütünüyle çözülmedi**, **0 doğrulanamadı**; sınırlamalar tabloda belirtildi.
- **Yeni bağımsız P1:** D3 PWA çoklu sekme oturum kaybı.
- Mevcut P1 kök sorun sayısı **3**: D1, D2, D3.

Önceki orta/düşük başlıkların tamamı yeniden eşleştirildi:

| Önceki konu | Yeni durum |
|---|---|
|60s duruş sonrası0,3km/sa |18 km/sa doğrulandı; çözüldü.|
|HUD bekleyen fullscreen sonrası lock |Tek aç/kapa düzeldi; örtüşen yeni istekE1 açık.|
|HUD focus/native çıkış |Temel senaryolar çözüldü.|
|Stale yeşil rozet |Stale/null düzeldi; heldE5 açık.|
|PWA kullanıcı update akışı yok |Bildirim var; D3 yeni güvenlik/oturum kontrol açığı.|
|Mobil hedef/kontrast |Boyutlar ve kadran kontrastı iyileşti; E6 kısmi.|
|accuracy0 ret |Çözüldü.|
|Gizlilikte aktifGPS gizli |Banner/Stop ile çözüldü.|
|Clipboard false/DOM |Çözüldü.|
|Gizlilik teknik metni |RAM/platform ayrımı iyi; HUD anlatımıE4 açık.|
|TS yapılandırma kapsamı |Komutlar geçiyor; strict veconfig kapsamı eksikliği sürüyor.|
|Kadran35 uç etiketi/0 yay |Çözüldü.|
|RawJSON ignore veproductionlogger |Koruma iyileşti, eski kanıtlar mevcut.|
|Bilinen V3 UX işleri |Save uyarı yeri veHUDautostart uygulandı.|

Kanıtlanmış yeni regresyonlar: durağan çift sayım(D2'nin yeni kısmı), yavaş yürüyüş mesafe kaybıE2, başka sekmeden reloadD3, eski HUD isteğinin yeni HUD'ı kapatmasıE1. HUDautostart sonrası gizlilik metni çelişkisiE4 de yeni davranış/doküman uyumsuzluğu. Bunlar fiziksel GNSS doğruluk sapması iddiası değildir.

Mimari hâlâ küçük uygulamaya uygun doğrudan React yaklaşımında. Yeni bağımlılık ve kurumsal katman yok. App 1396 satır; HEAD'e göre365 net satır büyüme. PWA'nın ayrı hook olması yararlı ama ölçüm/mesafe/süre akışının farklı state/ref'lere bölünmesi temel doğruluk riskini sürdürüyor. Öneri büyük refactor değil; ölçüm kabulü ve aralık muhasebesinin tek anlam taşıması.

Performans: anaJS 274,81KB/gzip84,21KB; CSS 26,00KB/gzip5,57KB; workbox-window 5,65KB/gzip2,20KB. Önceki raporJS260,46KB/gzip80,6KB idi; artış tek başına performans alarmı değil. GPS fix'leri ve1Hz süre state'i App'i yeniden render ediyor. Timer/listener cleanup'ları var; tracker/wake-lock ref'leri korunuyor. `useRef(new ...)` ifadeleri her render'da geçici nesne yaratabilse de bunun ölçülmüş performans problemi olduğu ileri sürülmüyor. Uzun süreli gerçek bellek profili, batarya veFPS ölçümü yapılmadı; GPS yüksek accuracy veekran açık tutma doğal enerji maliyetleri saha ölçümü gerektiriyor.

## K. Önceliklendirilmiş Son Düzeltme Listesi

| Öncelik | Gerekli iş | Kabul kanıtı |
|---|---|---|
|P1|D1: reddedilen mesafe segmentini kes; motor/App yeniden referans bilgisini eşleştir.|1km ret→uzak noktada bekleme→5m hareket; eski1km hiçbir zaman eklenmemeli.|
|P1|D2: timer/callback sürelerini tek kez tüket; ilk/recovery0 ağırlığı destekle.|Seyrek/sık0 callback'leri aynı süre politikasını üretmeli; ilk fix süre eklememeli; Stop/irregular aralık testleri.|
|P1|D3: PWA controller değişiminde aktif oturumun reload'unu engelle.|İki sekme, birinde ölçüm/geçmiş; diğerinde update; aktif state korunmalı.|
|P2|E1: eski HUD isteğinin yeni isteğe ait kaynakları kapatmasını önle.|A/B promise ters tamamlanması veexit/lock yarışı.|
|P2|E2: yavaş hareketin mesafe çapası politikasını motorla uyumlu yap.|GerçekApp8m/16s; accuracy4/5 varyantları; manuel test kopyası değil.|
|P2|E3: eski ama sıralıtimestamp için yaş politikası.|Eski ilkfix vegecikmiş ardışık fix güncel gösterilmemeli.|
|P2|E4/E5: izin anlatımı veheld durum mesajını gerçek davranışla eşleştir.|HUD'dan başlatma metni; ret anında güvenilir canlı okuma izlenimi vermeme.|
|P2|E6: düşük kontrastlı küçük metinleri düzelt.|Gerçek hesaplanan renklerle kontrast ölçümü.|
|P3|ARIA hedefi, README/test sayısı, lock sürümü, TS kapsamını toparla.|DOM hedefi mevcut; doküman/metadata tutarlı; ilgili tip kontrolü.|

Yeni özellik, profil sistemi, veritabanı, kalıcı konum geçmişi veya toplu bağımlılık yükseltmesi önerilmiyor. Kritik düzeltmeler için ek regresyonlar yukarıdaki test açıklarını kapatmalı; mevcut hatalı beklentiler sessizce yeşile uyarlanmamalı.

## L. Nihai Yayın Kararı

**V3 mevcut haliyle kararlı sürüm olarak onaylanmıyor.** Sebep teorik mükemmeliyetçilik değil; gerçekApp'te üretilen sahte mesafe, yanlış süre ağırlığı veaktif oturumun güncellemede kaybolmasıdır. D1–D3 yayın öncesi çözülmeli. Yeni özellik geliştirmeden, bu doğruluk veoturum koruma düzeltmeleri yapıldıktan sonra yayın hazırlığına dönmek makul.

HUD örtüşen istek, slow-walk mesafe, yanıltıcı gizlilik/rozet açıklamaları da küçük kapsamlı son düzeltme listesine alınmalı. App'i sırf satır sayısı için yeniden mimarileştirmek, bütün görsel sistemi değiştirmek veya yeni bağımlılık eklemek gerekmiyor. P3 düzenlemelerinin tamamı yayın engeli değildir.

Fiziksel cihazda özellikle:

1. **iPhone Safari ve iOS ana ekran PWA:** Başlat/HUD izin girişleri, fullscreen reddi halindeCSS HUD, portrait/landscape, safe-area, focus/çıkış, uygulama değiştirip geri dönüş.
2. **Android Chrome ve kurulu PWA:** Nativefullscreen geri/ESC eşdeğeri, yön kilidi bırakma, ekran uyku/WakeLock, düşük güç modu.
3. **GNSS saha:** Açık alanda duruş, masa üstü jitter,0,5m/s yürüyüş, bisiklet, araç dur-kalk ve kontrollü hızlanma/yavaşlama. Donanım speed null geçişleri kaydedilerek karşılaştırılmalı.
4. **Kesinti/tünel:**5–30s ve daha uzun kesinti, code2/3, geri dönüşte ilkfix, mesafe köprüsünün kesilmesi, izin iptali, Stop sonrası kesin durma.
5. **Yüksek hız:** Yalnız güvenli/yasal koşullarda referansla ölçüm; 250 tavanının beklenen ürün sınırı olarak görülmesi. Test için tehlikeli sürüş yapılmamalı.
6. **PWA:** İki gerçek sürüm, iki sekme/standalone istemci, aktif ölçüm veofflineonline geçişinde güncelleme; cache temizliği sonrası doğrudan/gizlilik erişimi.
7. **Kaynak kullanımı:**30–60dk oturumda batarya, sıcaklık, WakeLock veRAM; USB/ekran parlaklığının etkisini ayırarak ölçüm.

Bu liste yapılmış testler değil, kalan saha doğrulamasıdır. PlaywrightPixel5 gerçekAndroid veya iPhone testi olarak sunulmuyor.

## M. Git ve Değişiklik Durumu

HEAD: `f9de1f2a0825dcdf55c8243682f78f0cc697ee5f` (`docs & fix: denetim raporu, doğruluk dokümantasyonu ve mobil viewport iyileştirmesi`). Önceki raporda esas alınan V2 commit `7180dfcff0857900ba5673e0e9d191933e807250`; ikisi aynı snapshot değildir.

Başlangıçta **36 izlenen dosya değiştirilmiş**, **4 izlenmeyen dosya** vardı. Bunlar denetçinin yaptığı V3 değişiklikleri değildir:

```text
 M .gitignore
 M README.md
 M e2e/audit.spec.ts
 M e2e/speedgps.spec.ts
 M netlify.toml
 M package.json
 M src/App.css
 M src/App.tsx
 M src/components/HudView.css
 M src/components/HudView.tsx
 M src/components/PrivacyPolicy.css
 M src/components/PrivacyPolicy.tsx
 M src/components/SpeedometerGauge.css
 M src/components/SpeedometerGauge.tsx
 M src/utils/auditRegression.test.ts
 M src/utils/averageSpeedAccuracy.test.ts
 M src/utils/backgroundAndOutageRecovery.test.ts
 M src/utils/gpsDebugLogger.ts
 M src/utils/gpsReliability.test.ts
 M src/utils/gpsReliability.ts
 M src/utils/locationQuality.test.ts
 M src/utils/locationQuality.ts
 M src/utils/measurementSession.test.ts
 M src/utils/measurementSession.ts
 M src/utils/outageRecovery.ts
 M src/utils/smartHaversine.test.ts
 M src/utils/speedEngine.test.ts
 M src/utils/speedEngine.ts
 M src/utils/speedFilter.test.ts
 M src/utils/speedFilter.ts
 M src/utils/speedGaugeMath.test.ts
 M src/utils/speedGaugeMath.ts
 M src/utils/sprint5Step2.test.ts
 M tsconfig.app.json
 M tsconfig.e2e.json
 M vite.config.ts
?? AUDIT_V3_RECHECK_TR.md
?? src/utils/speedThresholdsAndTransitions.test.ts
?? src/utils/usePwaUpdate.test.ts
?? src/utils/usePwaUpdate.ts
```

Denetimin projede yazdığı tek teslim dosyası **bu rapordur**; başlangıçtaki aynı adlı taslak geçici dizinde saklandı. Çalıştırılan build/test araçları ignore edilen dist, node_modules geçici tip önbelleği vePlaywright sonuçları oluşturabilir. Kaynak/test değişikliği yapılmadı. Başlangıç `git diff --binary` ile son izlenen diff karşılaştırması aynı; eski audit raporunda diff yok.

Önceki denetimden korunanlar: `AUDIT_REPORT_TR.md`, `src/utils/auditRegression.test.ts`, `e2e/audit.spec.ts`, `audit-artifacts/e2e-audit.json`, `audit-artifacts/engine-evidence.json`, `audit-artifacts/hud-320.png`, `audit-artifacts/mobile-320.png`. Regresyon testlerindeki mevcut V3 düzenlemeler kullanıcı çalışma ağacında zaten vardı.

Test özetleri I bölümünde; komutların tümü gerçekten çalıştırıldı. Gönderilme riski açısından rawJSON kalıpları ignore ile doğrulandı; izlenen audit kanıtları ignore'dan etkilenmez. Yeni hook ve test dosyaları izlenmediği için daha sonra yapılacak bir yayında yalnız izlenen dosyaları commit etmek eksik V3 üretir; bu denetimde commit yapılmadı.
