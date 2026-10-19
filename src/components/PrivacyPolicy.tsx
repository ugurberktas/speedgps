import React, { useEffect } from 'react'
import './PrivacyPolicy.css'

interface PrivacyPolicyProps {
  onBackToHome: () => void
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBackToHome }) => {
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

      <main className="privacy-card">
        <h1 className="privacy-title">Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
        <p className="privacy-subtitle">
          Son güncelleme: 20 Ekim 2026 • 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) Kapsamında
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
            unvanı bulunmamaktadır.
          </div>
        </section>

        <section className="privacy-section">
          <h2>2. Konum (GPS) Verilerinin İşlenmesi: %100 Cihaz Üzerinde (Local-First)</h2>
          <p>
            SpeedGPS'in temel işlevi, hareket hızınızı (km/sa), oturum sürenizi ve kat ettiğiniz mesafeyi
            göstermektir. Bu amaçla tarayıcınızın standart <code>Geolocation API</code> arayüzü kullanılır.
          </p>
          <ul>
            <li>
              <strong>Sunucuya İletilmez:</strong> Konum koordinatlarınız (enlem, boylam, rakım, hız ve
              doğruluk payı) hiçbir şekilde bir SpeedGPS sunucusuna veya üçüncü taraf bir analitik
              veritabanına <strong>aktarılmaz</strong>.
            </li>
            <li>
              <strong>Yalnızca Cihaz Belleğinde (RAM):</strong> Konum ve hız verileri yalnızca
              tarayıcınızın o anki çalışma oturumunda geçici olarak işlenir. Sayfayı kapattığınızda veya
              yenilediğinizde geçici ölçüm verileri sıfırlanır.
            </li>
            <li>
              <strong>Ölçüm Geçmişi ve Kayıtlar:</strong> Canlı ölçüm esnasında "Hızı Kaydet" butonuna
              bastığınızda hız ve saat bilgisi cihazınızın geçici durum belleğine kaydedilir; sunucuya
              veya harici disk alanına gönderilmez.
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
            Uygulamanın kendisi hiçbir kullanıcı verisi toplamazken; internet mimarisinin doğal gereği
            olarak web sitesine bağlandığınızda barındırma sağlayıcısı (Netlify) sunucuları teknik erişim
            loglarını (IP adresi, istek zamanı, kullanıcı tarayıcı bilgisi / User-Agent vb.) ağ güvenliği,
            DDoS koruması ve içerik dağıtımı amacıyla standart protokoller uyarınca işleyebilir. Bu teknik
            günlüklerin işlenmesi doğrudan Netlify'ın kendi gizlilik ve güvenlik politikalarına tabidir.
          </p>
        </section>

        <section className="privacy-section">
          <h2>4. Çerezler (Cookies) ve Üçüncü Taraf Takipçiler</h2>
          <p>
            SpeedGPS kaynak kodları incelendiğinde doğrulanabileceği üzere:
          </p>
          <ul>
            <li>
              Uygulamada <strong>hiçbir reklam, pazarlama veya kullanıcı takip çerezi</strong> (tracking
              cookies) kullanılmamaktadır.
            </li>
            <li>
              Google Analytics, Meta Pixel vb. üçüncü taraf profil çıkarma araçları projeye dahil
              edilmemiştir.
            </li>
            <li>
              Yalnızca uygulamanın çevrimdışı çalışabilmesi (PWA) için tarayıcının standart Service
              Worker önbelleği (uygulamanın arayüz dosyaları) kullanılır; bu önbellek kişisel veri veya
              konum bilgisi barındırmaz.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>5. Konum İzinlerinin Yönetimi ve Ölçümü Durdurma</h2>
          <p>
            SpeedGPS, açık rızanız ve tarayıcı onayınız olmadan konumunuza erişemez:
          </p>
          <ul>
            <li>
              Uygulama açıldığında veya <strong>"Başlat"</strong> butonuna bastığınızda tarayıcınız konum
              erişimi izni talep eder.
            </li>
            <li>
              Dilediğiniz an <strong>"Durdur"</strong> butonuna basarak anlık GPS takibini sonlandırabilirsiniz.
            </li>
            <li>
              Tarayıcınızın adres çubuğundaki kilit / site ayarları simgesine tıklayarak konum iznini
              tamamen engelleyebilir veya sıfırlayabilirsiniz.
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
