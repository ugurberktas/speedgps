# SpeedGPS 🧭⚡

Gerçek zamanlı, güvenilir ve gizlilik odaklı modern web tabanlı GPS hız göstergesi (Speedometer) ve rota oturum takip uygulaması.

SpeedGPS; araç sürüşü, bisiklet, koşu veya yürüyüş aktivitelerinde anlık hızınızı, maksimum ve ortalama hızınızı, kat ettiğiniz mesafeyi ve süreyi yüksek doğrulukla takip etmenizi sağlar.

---

## 🌟 Öne Çıkan Özellikler

- **Hibrit Hız Motoru:**
  - Cihazınızın donanım GPS/GNSS Doppler hızını (`coords.speed`) öncelikli kullanır.
  - Donanım hızı desteklenmediğinde veya null olduğunda akıllı ve filtrelenmiş Haversine formülüyle koordinatlardan güvenilir hız üretir.
- **Akıllı Gürültü ve Titreme Koruması (Stationary Jitter Protection):**
  - Masa başında veya kırmızı ışıkta beklerken meydana gelen GPS sapmalarını (örneğin dururken sahte 80+ km/sa sıçramaları veya yapay mesafe artışlarını) engeller.
  - Zayıf doğruluklu (>25m) sıçramaları eler, gerçek 0 km/sa değerini korur.
- **Kesinti ve Arka Plan Yönetimi (Outage Recovery):**
  - Uygulama arka plana geçtiğinde ölçümü duraklatır.
  - Geri dönüldüğünde veya tünel çıkışı gibi uzun GPS kesintilerinde eski koordinatları yeni noktalarla birleştirerek yapay hız patlaması üretmez.
- **Screen Wake Lock API:**
  - Ölçüm devam ederken ekranın kararmasını veya kapanmasını otomatik olarak önler.
- **Konum Kalitesi Göstergesi:**
  - Anlık GPS hata payını (`coords.accuracy`) analiz ederek "İyi (≤10m)", "Orta (10–25m)" ve "Zayıf (>25m)" durumunu kullanıcıya şeffafça gösterir.
- **Zaman Ağırlıklı Ortalama Hız & İstatistikler:**
  - GPS örneklerinin düzensiz gelmesi durumunda dahi süreyi ve duraklama anlarını hesaba katan integral tabanlı doğru ortalama hız hesabı.
- **Ölçüm Geçmişi & Özeti Kopyala:**
  - Anlık ölçümleri tek dokunuşla kaydetme, sayaç kontrolü ve tek tıkla panoya metin özeti kopyalama.
- **Progressive Web App (PWA):**
  - Mobil cihazlarda ana ekrana eklenebilir, tam ekran yerel uygulama deneyimi sunar.

---

## 🛠️ Kullanılan Teknolojiler

- **Frontend:** React 19, TypeScript
- **Derleme & Paketleme:** Vite 8, `vite-plugin-pwa`
- **Tasarım:** Modern, sıcak beyaz-turuncu kurumsal Vanilla CSS
- **Test:** Vitest (Birim ve Entegrasyon Testleri), Playwright (E2E & UI Testleri)
- **Linter & Kalite:** Oxlint

---

## 🚀 Yerel Kurulum ve Çalıştırma

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları izleyin:

```bash
# Depoyu klonlayın ve proje dizinine geçin
cd speedGPS

# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev
```

Uygulama varsayılan olarak `http://localhost:5173` adresinde çalışacaktır.

### Testleri Çalıştırma

```bash
# Vitest birim ve entegrasyon testleri (170+ test)
npm test

# Playwright E2E UI testleri (Masaüstü ve Mobil)
npm run test:e2e

# Linter kontrolü
npm run lint

# Üretim (production) derlemesi
npm run build
```

---

## 📍 GPS İzinleri ve Platform Kullanımı

Tarayıcıların Geolocation API erişim politikası gereği, GPS kullanımı için güvenli bağlantı (HTTPS veya localhost) ve kullanıcı onayı şarttır.

### 📱 iPhone / Safari Kullanımı
1. Safari üzerinden uygulamayı açtığınızda gelen *"Konumunuza erişmek istiyor"* uyarısına **İzin Ver** deyin.
2. Ayarlar > Gizlilik ve Güvenlik > Konum Servisleri > Safari Siteleri bölümünde konumun **Açık** ve mümkünse **Tam Konum** seçili olduğundan emin olun.
3. Safari paylaşım butonuna basıp **"Ana Ekrana Ekle"** diyerek SpeedGPS'i bağımsız PWA uygulaması olarak yükleyebilirsiniz.

### 🤖 Android / Chrome Kullanımı
1. Uygulamayı açtığınızda beliren konum izni istemine **İzin Ver** (Uygulamayı kullanırken) seçeneğini işaretleyin.
2. Cihazınızın Konum ayarlarında **"Google Konum Doğruluğu"** modunun açık olması hızlı GPS kilitlenmesi sağlar.
3. Chrome menüsünden **"Uygulamayı Yükle"** veya **"Ana Ekrana Ekle"** seçeneğiyle PWA olarak kurabilirsiniz.

---

## ⚠️ Ölçüm Sınırlamaları ve Önemli Bilgilendirme

> [!IMPORTANT]
> **Deneysel Yazılım Uyarısı:**
> SpeedGPS web tabanlı bir Geolocation arayüzü kullanır. Cihazın GPS yonga setine, uydu sinyal kalitesine, hava koşullarına, yüksek binalara (şehir kanyonu etkisi), tünellere ve işletim sisteminin güç tasarrufu kısıtlamalarına bağlı olarak anlık ölçümlerde gecikme veya doğruluk sapmaları yaşanabilir.
> 
> Hız göstergesi yalnızca bilgilendirme ve sportif takip amaçlıdır. Araç göstergesi veya yasal hız sınırlandırma cihazı yerine kullanılamaz. Sürüş güvenliği daima kullanıcının kendi sorumluluğundadır.

---

## 🌐 Netlify Dağıtım Yapılandırması

SpeedGPS, Netlify üzerinde doğrudan statik web uygulaması olarak barındırılabilir. Proje kökünde hazır bulunan [netlify.toml](file:///Users/ugurberktas/Desktop/speedGPS/netlify.toml) yapılandırması sayesinde tüm yönlendirme ve önbellek kuralları otomatiktir.

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Production branch:** `main`
- **SPA Yönlendirmesi:** `/*` -> `/index.html` (HTTP 200)
- **Önbellek Stratejisi:** Service Worker (`sw.js`) ve PWA manifest (`manifest.webmanifest`) dosyaları için `no-cache`, derlenmiş varlıklar (`/assets/*`) için uzun vadeli immutable önbellekleme tanımlıdır.
- **Canlı Adres:** [https://speedgps.netlify.app](https://speedgps.netlify.app/)

---

## 🔒 Gizlilik Politikası

- **%100 İstemci Taraflı (Local-First):** Konum koordinatları (enlem, boylam, rakım, hız) **yalnızca tarayıcınızın belleğinde** işlenir.
- **Sunucuya Aktarılmaz:** SpeedGPS'in herhangi bir sunucu arka ucu (backend), analitik takipçisi, reklam ağı veya üçüncü taraf veri toplayıcısı bulunmamaktadır.
- **Kalıcı İz Yoktur:** Ölçümler oturum bazlıdır; çerezlerde veya uzak veritabanlarında kişisel konum geçmişi tutulmaz.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) kapsamında açık kaynak olarak geliştirilmiştir.
