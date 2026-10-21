import React, { useEffect } from 'react'
import './PrivacyPolicy.css'

interface PrivacyPolicyProps {
  onBackToHome: () => void
  isTracking?: boolean
  onStopMeasurement?: () => void
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({
  onBackToHome,
  isTracking = false,
  onStopMeasurement,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = 'Gizlilik ve KVKK — SpeedGPS'
    return () => {
      document.title = 'SpeedGPS'
    }
  }, [])

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault()
    onBackToHome()
  }

  return (
    <div className="privacy-page-container">
      <header className="privacy-header">
        <button
          type="button"
          onClick={handleBack}
          className="privacy-back-btn"
          aria-label="Ana ekrana dön"
        >
          <span className="privacy-back-arrow" aria-hidden="true">
            ←
          </span>
          <span>Ana Ekrana Dön</span>
        </button>
        <div className="privacy-brand-badge">SpeedGPS</div>
      </header>

      {/* Canlı Ölçüm Arka Plan Bilgilendirme ve Durdurma Çubuğu */}
      {isTracking && (
        <div
          className="privacy-active-tracking-banner"
          role="status"
          aria-live="polite"
          data-testid="privacy-active-tracking-banner"
        >
          <div className="privacy-active-tracking-info">
            <span className="privacy-tracking-dot" aria-hidden="true" />
            <span>Canlı GPS ölçümü arka planda çalışmaya devam ediyor.</span>
          </div>
          {onStopMeasurement && (
            <button
              type="button"
              className="privacy-stop-btn"
              onClick={onStopMeasurement}
              aria-label="Canlı GPS ölçümünü durdur"
            >
              Durdur
            </button>
          )}
        </div>
      )}

      <main className="privacy-card">
        <h1 className="privacy-title">Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
        <p className="privacy-subtitle">
          Son güncelleme: 21 Ekim 2026 • 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) Kapsamında
        </p>

        <section className="privacy-section">
          <h2>1. Veri Sorumlusu ve Hizmet Tanımı</h2>
          <p>
            İşbu bilgilendirme metni, web tabanlı anlık GPS hız göstergesi ve rota oturum takip
            uygulaması olan <strong>SpeedGPS</strong> tarafından sunulan hizmetlerde veri güvenliği ve
            şeffaflığı sağlamak amacıyla hazırlanmıştır.
          </p>
          <div className="privacy-info-callout">
            <strong>Önemli Bilgilendirme:</strong> SpeedGPS, ticari bir tüzel kişilik bünyesinde değil;
            bağımsız, açık kaynaklı ve yerel odaklı (client-only) bir yazılım projesi olarak
            yürütülmektedir. Projede özel bir merkezi veri sorumlusu sicili (VERBİS) veya ticari şirket
            unvanı bulunmamaktadır; hiçbir hukuki garanti veya taahhüt verilmemektedir.
          </div>
        </section>

        <section className="privacy-section">
          <h2>2. Konum (GPS) Verilerinin İşlenmesi: %100 Cihaz Üzerinde (Local-First)</h2>
          <p>
            SpeedGPS'in temel işlevi, hareket hızınızı (km/sa, mph veya m/s), oturum sürenizi ve kat ettiğiniz
            mesafeyi canlı olarak göstermektir. Bu amaçla tarayıcınızın standart W3C <code>Geolocation API</code>{' '}
            arayüzü kullanılır.
          </p>
          <ul>
            <li>
              <strong>Sunucuya İletilmez:</strong> Konum koordinatlarınız (enlem, boylam, rakım, anlık hız ve
              hata payı) hiçbir şekilde bir SpeedGPS sunucusuna veya harici bir analitik veritabanına{' '}
              <strong>aktarılmaz</strong>. Hız, mesafe, tempo ve filtreleme hesaplamalarının tamamı doğrudan
              cihazınızın tarayıcısında çalışır.
            </li>
            <li>
              <strong>Yalnızca Cihaz Belleğinde (RAM):</strong> Konum ve hız verileri yalnızca
              tarayıcınızın o anki çalışma oturumunda geçici bellek üzerinde işlenir. Sayfayı kapattığınızda
              veya yenilediğinizde geçici ölçüm verileri sıfırlanır.
            </li>
            <li>
              <strong>Ölçüm Geçmişi ve Özeti Kopyala:</strong> Canlı ölçüm esnasında "Hızı Kaydet" butonuna
              bastığınızda anlık hız ve saat bilgisi cihazınızın geçici durum belleğine eklenir. Kullanıcı dilediğinde
              "Özeti Kopyala" butonuna basarak bu kayıtların metin özetini kendi cihaz panosuna (clipboard) aktarabilir.
              Bu işlem tamamen yereldir ve herhangi bir sunucuya veri göndermez.
            </li>
            <li>
              <strong>Tarayıcı ve İşletim Sistemi Konum Sağlayıcıları:</strong> SpeedGPS uygulamasının kendisi konum
              verilerini hiçbir uzak sunucuya iletmez; ancak tarayıcınız ve işletim sisteminizin yerleşik Geolocation
              altyapısı (örneğin Apple Konum Servisleri veya Google Konum Doğruluğu gibi platform hizmetleri), cihazınızın
              konumunu belirleyebilmek amacıyla kendi işletim sistemi düzeyindeki ağ servislerini kullanabilir. Bu iletişim
              cihazınızın işletim sistemi ve tarayıcı gizlilik ayarlarına tabidir; SpeedGPS bu ağ trafiğinin tarafı veya yöneticisi değildir.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>3. Barındırma Sağlayıcısı (Netlify) ve Teknik Erişim Kayıtları</h2>
          <p>
            SpeedGPS uygulaması statik web dosyaları (HTML, CSS, JS) olarak <strong>Netlify</strong>{' '}
            altyapısı üzerinden sunulmaktadır.
          </p>
          <p>
            SpeedGPS'in GPS koordinatlarını cihaz içinde yerel olarak işlemesi ile Netlify'ın web barındırma hizmeti birbirinden
            tamamen bağımsızdır. İnternet mimarisinin doğal gereği olarak web sitesine bağlandığınızda Netlify sunucuları teknik
            erişim loglarını (IP adresi, istek zamanı, kullanıcı tarayıcı bilgisi / User-Agent vb.) ağ güvenliği, DDoS koruması
            ve içerik dağıtımı amacıyla standart protokoller uyarınca işleyebilir. Netlify hiçbir surette kullanıcının GPS konum
            koordinatlarına veya anlık hız verilerine erişemez.
          </p>
        </section>

        <section className="privacy-section">
          <h2>4. Çerezler, Üçüncü Taraf Takipçiler ve Geliştirici Araçları</h2>
          <p>
            SpeedGPS kaynak kodları incelendiğinde doğrulanabileceği üzere:
          </p>
          <ul>
            <li>
              Uygulamada <strong>hiçbir reklam, pazarlama veya kullanıcı takip çerezi</strong> (tracking cookies)
              kullanılmamaktadır.
            </li>
            <li>
              Google Analytics, Meta Pixel vb. üçüncü taraf profil çıkarma araçları projeye dahil edilmemiştir.
            </li>
            <li>
              Yalnızca uygulamanın çevrimdışı çalışabilmesi (PWA) için tarayıcının standart Service Worker önbelleği
              (uygulamanın arayüz dosyaları) kullanılır; bu önbellek kişisel veri veya konum bilgisi barındırmaz.
            </li>
            <li>
              <strong>Geliştirici Araçları (Yalnızca Geliştirme Ortamı):</strong> Uygulamanın geliştirici ortamında (DEV build)
              algoritma doğrulaması ve test amaçlı bir GPS Debug Paneli yer alır; bu panel geliştiricinin ham GPS verilerini
              JSON olarak indirmesine imkân tanır. Söz konusu geliştirici paneli ve dışa aktarma işlevi, üretim (production)
              derlemelerine dahil edilmez ve son kullanıcılara sunulmaz.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>5. Konum İzinlerinin Yönetimi ve Ölçümü Başlatma / Durdurma</h2>
          <p>
            SpeedGPS, açık rızanız ve tarayıcı onayınız olmadan konumunuza erişemez:
          </p>
          <ul>
            <li>
              Uygulama ilk açıldığında doğrudan konum izni istenmez. <strong>"Başlat"</strong> butonuna
              bastığınızda veya ölçüm kapalıyken <strong>"HUD"</strong> modunu açtığınızda tarayıcınız
              konum izni isteyebilir.
            </li>
            <li>
              Dilediğiniz an <strong>"Durdur"</strong> butonuna basarak canlı GPS takibini anında sonlandırabilirsiniz.
            </li>
            <li>
              Ölçüm kapalıyken HUD modu açılırsa GPS ölçümü otomatik başlar. Ölçüm zaten açıksa HUD aynı
              oturumu gösterir; ayrı bir konum izleme mekanizması başlatmaz. HUD'dan çıkmak ölçümü durdurmaz.
            </li>
            <li>
              Tarayıcınızın adres çubuğundaki site ayarları simgesine tıklayarak konum iznini dilediğiniz zaman tamamen engelleyebilir
              veya sıfırlayabilirsiniz.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>6. İlgili Kişi Hakları (KVKK Madde 11)</h2>
          <p>
            6698 sayılı Kanun'un 11. maddesi uyarınca herkes veri sorumlusuna başvurarak kişisel verilerinin
            işlenip işlenmediğini öğrenme, silinmesini isteme hakkına sahiptir. Ancak SpeedGPS sunucu
            tarafında hiçbir kişisel veri veya kimlik bilgisi depolamadığından, sistemlerimizde kimliğinizle
            eşleşen bir veri kaydı bulunmamaktadır. Tarayıcı önbelleğinizi temizleyerek cihazınızdaki tüm yerel
            izleri dilediğiniz an kaldırabilirsiniz.
          </p>
        </section>

        <section className="privacy-section">
          <h2>7. İletişim</h2>
          <p>
            Bu metin ve açık kaynak kodlu uygulama hakkındaki soru, öneri veya teknik bildirimlerinizi
            projenin resmi GitHub deposu üzerinden iletebilirsiniz:
          </p>
          <p>
            <a
              href="https://github.com/ugurberktas/speedgps"
              target="_blank"
              rel="noopener noreferrer"
              className="privacy-external-link"
            >
              github.com/ugurberktas/speedgps ↗
            </a>
          </p>
        </section>

        <div className="privacy-footer-back">
          <button type="button" onClick={handleBack} className="btn-primary-record">
            <span>Ana Ekrana Dön</span>
          </button>
        </div>
      </main>
    </div>
  )
}
