import { test, expect } from '@playwright/test'

/**
 * Playwright E2E Mock Tipleri ve Window/Screen Genişletmeleri
 */
export interface MockCoordinates {
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading?: number | null
  altitude?: number | null
  altitudeAccuracy?: number | null
}

export interface MockPosition {
  coords: MockCoordinates
  timestamp: number
}

export type MockGeoListener = (position: MockPosition) => void

declare global {
  interface Window {
    __geoListeners: MockGeoListener[]
    __emitGps: (position: MockPosition) => void
    __fullscreenCallCount: number
    __exitFullscreenCallCount: number
    __orientationLocked: string | null
  }

  interface Element {
    webkitRequestFullscreen?: () => Promise<void>
  }

  interface Document {
    webkitExitFullscreen?: () => Promise<void>
  }
}

test.describe('SpeedGPS — Sprint 7: UI ve Fonksiyonel Testler', () => {
  test.beforeEach(async ({ page }) => {
    // LocalStorage ve clean state
    await page.addInitScript(() => {
      localStorage.clear()
    })
  })

  test('1. Uygulama başarıyla açılıyor, hız göstergesi ve istatistik kartları düzgün görünüyor', async ({
    page,
  }) => {
    await page.goto('/')

    // Başlık ve logo
    await expect(page.locator('.brand-title')).toHaveText(/SpeedGPS/)

    // Ana Hız Kartı ve başlangıç değeri ("--")
    const speedNumber = page.locator('.speed-number')
    await expect(speedNumber).toBeVisible()
    await expect(speedNumber).toHaveText('--')

    const speedUnit = page.locator('.speed-unit')
    await expect(speedUnit).toBeVisible()
    await expect(speedUnit).toHaveText('km/sa')

    // Durum rozeti (Başlangıçta "Durduruldu")
    const statusPill = page.locator('.status-pill')
    await expect(statusPill).toBeVisible()
    await expect(statusPill).toHaveText(/Durduruldu/)

    // Butonlar
    const startBtn = page.getByRole('button', { name: 'Başlat' })
    const saveSpeedBtn = page.getByRole('button', { name: 'Hızı Kaydet' })
    const stopBtn = page.getByRole('button', { name: 'Durdur' })

    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
    await expect(saveSpeedBtn).toBeVisible()
    await expect(stopBtn).not.toBeVisible() // Başlangıçta Durdur butonu görünmez

    // Oturum İstatistikleri Kartı
    const statsCard = page.locator('.stats-card')
    await expect(statsCard).toBeVisible()
    await expect(statsCard.getByText('Maksimum Hız')).toBeVisible()
    await expect(statsCard.getByText('Ortalama Hız')).toBeVisible()
    await expect(statsCard.getByText('Mesafe')).toBeVisible()
    await expect(statsCard.getByText('Süre')).toBeVisible()

    // Ölçüm Geçmişi Kartı
    const historyCard = page.locator('.history-card')
    await expect(historyCard).toBeVisible()
    await expect(historyCard.getByText('Henüz kaydedilmiş ölçüm bulunmuyor')).toBeVisible()
  })

  test('2. GPS izni reddedildiğinde doğru hata mesajı gösteriliyor', async ({ page }) => {
    // Geolocation API'sini PERMISSION_DENIED (kod 1) dönecek şekilde mock'la
    await page.addInitScript(() => {
      const mockGeolocation = {
        watchPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback | null | undefined
        ) => {
          if (error) {
            const err: GeolocationPositionError = {
              code: 1, // PERMISSION_DENIED
              message: 'User denied Geolocation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            }
            setTimeout(() => error(err), 50)
          }
          return 999
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
    })

    await page.goto('/')
    const startBtn = page.getByRole('button', { name: 'Başlat' })
    await startBtn.click()

    // Hata bildirimi banner'ı görünmeli
    const alertBanner = page.locator('.alert-error')
    await expect(alertBanner).toBeVisible()
    await expect(alertBanner).toContainText('Konum izni reddedildi')
    await expect(page.locator('.status-pill')).toHaveText(/GPS Hatası/)
    await expect(page.locator('.speed-number')).toHaveText('--')
  })

  test('3. Kontrollü mock verisi ile geçerli hız (örn. 54 km/sa) ve 0 km/sa hızı gösterilip kaydedilebiliyor', async ({
    page,
  }) => {
    // Geolocation mock tanımla (dışarıdan emit tetiklenebilen)
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 101
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      // Testten koordinat göndermek için global yardımcı
      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 15 m/s = 54 km/sa hız gönder (doğruluk: 8m - İyi)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 8,
          speed: 15.0, // 54 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    // Canlı hız kartı 54 göstermeli
    const speedNumber = page.locator('.speed-number')
    await expect(speedNumber).toHaveText('54')
    await expect(page.locator('.status-pill')).toHaveText(/GPS Aktif/)
    await expect(page.locator('.quality-badge')).toContainText('İyi')

    // "Hızı Kaydet" ile kaydet
    await page.getByRole('button', { name: 'Hızı Kaydet' }).click()

    // Bildirim ve geçmiş kontrolü
    const alertNotice = page.locator('.alert-notice')
    await expect(alertNotice).toBeVisible()
    await expect(alertNotice).toContainText('54.0 km/sa')
    await expect(alertNotice).toContainText('kaydedildi')

    const historyItems = page.locator('.history-item')
    await expect(historyItems).toHaveCount(1)
    await expect(historyItems.first().locator('.history-speed')).toHaveText('54.0')
    await expect(historyItems.first().locator('.history-unit')).toHaveText('km/sa')

    // Hızı Kaydet oturum istatistiklerini (maksimum hız) sıfırlamamalı
    await expect(page.locator('.stat-tile').first().locator('.stat-value')).toContainText('54')

    // Şimdi 0 m/s (0 km/sa) hız gönder (kırmızı ışıkta durma senaryosu)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 6,
          speed: 0.0, // 0 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 1000,
      })
    })

    // Canlı hız 0 olmalı ve sahte "--" yerine gerçek 0 gösterilmeli
    await expect(speedNumber).toHaveText('0')

    // 0 km/sa için "Hızı Kaydet" kaydı yap
    await page.getByRole('button', { name: 'Hızı Kaydet' }).click()
    await expect(historyItems).toHaveCount(2)
    await expect(historyItems.first().locator('.history-speed')).toHaveText('0.0')
    await expect(historyItems.first().locator('.history-unit')).toHaveText('km/sa')
  })

  test('4. GPS verisi bulunmadığında veya geçersiz olduğunda "--" gösteriliyor', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 102
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // coords.speed = null ve ilk nokta olduğunda henüz hız hesaplanamaz -> "--" kalmalı
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 15,
          speed: null,
          heading: null,
          altitude: null,
        },
        timestamp: Date.now(),
      })
    })

    const speedNumber = page.locator('.speed-number')
    await expect(speedNumber).toHaveText('--')
    await expect(page.locator('.speed-subtext')).toContainText('hız hesaplanıyor')
  })

  test('5. Ölçüm kaydedilip ardından geçmiş temizlenebiliyor', async ({ page }) => {
    // Geolocation mock ile canlı hız gönderip 2 ölçüm kaydedelim
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 105
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 1. Ölçüm (10 m/s = 36 km/sa)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 10.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })
    await page.getByRole('button', { name: 'Hızı Kaydet' }).click()

    // 2. Ölçüm (20 m/s = 72 km/sa)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 20.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 1000,
      })
    })
    await page.getByRole('button', { name: 'Hızı Kaydet' }).click()

    const historyItems = page.locator('.history-item')
    await expect(historyItems).toHaveCount(2)
    await expect(page.locator('.badge-counter')).toHaveText('2')

    // "Özeti Kopyala" butonunun aktif olduğunu doğrula ve tıkla
    const copyBtn = page.getByRole('button', { name: 'Özeti Kopyala' })
    await expect(copyBtn).toBeVisible()
    await expect(copyBtn).toBeEnabled()
    await copyBtn.click()

    // Bildirimin görüntülendiğini doğrula
    await expect(page.locator('.alert-notice')).toContainText('panoya kopyalandı')

    // "Temizle" butonuna tıkla
    const clearBtn = page.getByRole('button', { name: 'Temizle' })
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()

    // Geçmiş temizlenmeli, boş mesajı gelmeli ve Özeti Kopyala devre dışı kalmalı
    await expect(historyItems).toHaveCount(0)
    await expect(page.locator('.history-empty')).toBeVisible()
    await expect(clearBtn).not.toBeVisible()
    await expect(copyBtn).toBeDisabled()
  })

  test('6. Başlat ve Durdur butonları durumu doğru yönetiyor', async ({ page }) => {
    // Sinyal bekleme durumunda kalabilen mock geolocation
    await page.addInitScript(() => {
      const mockGeolocation = {
        watchPosition: () => 106,
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
    })

    await page.goto('/')

    const startBtn = page.getByRole('button', { name: 'Başlat' })
    const stopBtn = page.getByRole('button', { name: 'Durdur' })
    const statusPill = page.locator('.status-pill')

    // Başlangıç durumu: Tek büyük turuncu Başlat butonu görünür, Durdur gizlidir
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).not.toBeVisible()
    await expect(statusPill).toHaveText(/Durduruldu/)

    // Başlat butonuna tıkla
    await startBtn.click()

    // Ölçüm başladıktan sonra: Buton alanı iki eşit parçaya bölünür (50% / 50%)
    // Sol Başlat soluk ve disabled, sağ Durdur aktif kırmızı
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeDisabled()
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeEnabled()
    await expect(statusPill).toHaveText(/Sinyal Bekleniyor/)

    // Durdur butonuna tıkla
    await stopBtn.click()

    // Durdur sonrası: Tekrar tek, büyük turuncu Başlat butonuna dönülür, Durdur gizlenir
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).not.toBeVisible()
    await expect(statusPill).toHaveText(/Durduruldu/)
    await expect(page.locator('.speed-number')).toHaveText('--')
  })

  test('7. GPS kesintisinde eski hız canlıymış gibi gösterilmiyor ("--")', async ({ page }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 103
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 20 m/s = 72 km/sa canlı hız gönder
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 20.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    const speedNumber = page.locator('.speed-number')
    await expect(speedNumber).toHaveText('72')

    // 6 saniye GPS kesintisi bekle (STALE_DATA_TIMEOUT_MS = 5000ms eşiğini aşar)
    await page.waitForTimeout(6000)

    // Kesinti durumunda eski 72 değeri canlıymış gibi kalmamalı, "--" olmalı
    await expect(speedNumber).toHaveText('--')
    await expect(page.locator('.speed-subtext')).toContainText('sinyal bekleniyor')
  })

  test('8. Mobil ve masaüstü ekranlarda yatay taşma (horizontal overflow) veya bozuk buton oluşmuyor', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const mockGeolocation = {
        watchPosition: () => 108,
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
    })

    await page.goto('/')

    // Sayfa gövdesinin ve kök container'ın yatay taşma yapıp yapmadığını doğrula
    const isOverflowingHorizontally = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth
      const scrollWidth = document.documentElement.scrollWidth
      const bodyScrollWidth = document.body.scrollWidth
      return scrollWidth > docWidth || bodyScrollWidth > docWidth
    })

    expect(isOverflowingHorizontally).toBe(false)

    // Butonların görünür ve tıklanabilir olduğunu doğrula
    const startBtn = page.getByRole('button', { name: 'Başlat' })
    const saveSpeedBtn = page.getByRole('button', { name: 'Hızı Kaydet' })
    const stopBtn = page.getByRole('button', { name: 'Durdur' })

    const startBox = await startBtn.boundingBox()
    const saveSpeedBox = await saveSpeedBtn.boundingBox()

    expect(startBox).not.toBeNull()
    expect(saveSpeedBox).not.toBeNull()
    await expect(stopBtn).not.toBeVisible()

    // Başlangıçta Başlat butonu tüm genişliği kaplamalı ve dokunulabilir olmalı
    expect(startBox!.width).toBeGreaterThan(200)
    expect(startBox!.height).toBeGreaterThan(35)
    expect(saveSpeedBox!.width).toBeGreaterThan(50)

    // Başlat'a basıldığında 50/50 eşit iki buton oluşmalı
    await startBtn.click()
    await expect(stopBtn).toBeVisible()

    const activeStartBox = await startBtn.boundingBox()
    const activeStopBox = await stopBtn.boundingBox()
    expect(activeStartBox).not.toBeNull()
    expect(activeStopBox).not.toBeNull()
    expect(Math.abs(activeStartBox!.width - activeStopBox!.width)).toBeLessThanOrEqual(5)
    expect(Math.abs(activeStartBox!.height - activeStopBox!.height)).toBeLessThanOrEqual(2)
  })

  test('9. Gizlilik ve KVKK bağlantısı açılıyor, sayfa içeriği ve ana ekrana dönüş çalışıyor', async ({
    page,
  }) => {
    await page.goto('/')

    // Footer'daki Gizlilik ve KVKK bağlantısını bul ve tıkla
    const privacyLink = page.getByRole('link', { name: 'Gizlilik ve KVKK' })
    await expect(privacyLink).toBeVisible()
    await privacyLink.click()

    // URL /gizlilik olmalı ve başlık ile içerik kartı görünmeli
    await expect(page).toHaveURL(/.*\/gizlilik/)
    const title = page.locator('.privacy-title')
    await expect(title).toBeVisible()
    await expect(title).toContainText('Gizlilik Politikası ve KVKK Aydınlatma Metni')

    // Cihaz üzerinde işleme ve yerel odaklı mimari maddesi mevcut olmalı
    await expect(page.getByRole('heading', { name: /Konum \(GPS\) Verilerinin İşlenmesi/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Netlify/ })).toBeVisible()

    // Ana Ekrana Dön butonuna tıkla
    const backBtn = page.getByRole('button', { name: 'Ana Ekrana Dön' }).first()
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    // Ana sayfaya dönüldüğünü doğrula
    await expect(page.locator('.brand-title')).toBeVisible()
    await expect(page.locator('.speed-number')).toBeVisible()

    // Doğrudan /gizlilik adresine gidildiğinde de sayfa açılmalı
    await page.goto('/gizlilik')
    await expect(page.locator('.privacy-title')).toBeVisible()
  })

  test('10. Hız birimi seçici (km/sa, mph, m/s) anlık hız, istatistik ve geçmişi dinamik olarak dönüştürür', async ({
    page,
  }) => {
    // Geolocation mock tanımla (canlı 72 km/sa = 20 m/s hız gönderelim)
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 108
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 20 m/s = 72 km/sa
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 20.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    const speedNumber = page.locator('.speed-number')
    const speedUnitBadge = page.locator('.speed-unit').first()

    // Varsayılan: km/sa -> 72
    await expect(speedNumber).toHaveText('72')
    await expect(speedUnitBadge).toHaveText('km/sa')

    // "Hızı Kaydet" ile bir kayıt ekle
    await page.getByRole('button', { name: 'Hızı Kaydet' }).click()
    const historyItemSpeed = page.locator('.history-speed').first()
    const historyItemUnit = page.locator('.history-unit').first()
    await expect(historyItemSpeed).toHaveText('72.0')
    await expect(historyItemUnit).toHaveText('km/sa')

    // Birimi 'mph' olarak değiştir (72 * 0.621371 = 44.738... -> 45 mph)
    const mphBtn = page.getByRole('radio', { name: 'mph' })
    await expect(mphBtn).toBeVisible()
    await mphBtn.click()

    await expect(mphBtn).toHaveClass(/active/)
    await expect(speedNumber).toHaveText('45')
    await expect(speedUnitBadge).toHaveText('mph')
    await expect(historyItemSpeed).toHaveText('44.7')
    await expect(historyItemUnit).toHaveText('mph')

    // Birimi 'm/s' olarak değiştir (72 / 3.6 = 20 m/s)
    const msBtn = page.getByRole('radio', { name: 'm/s', exact: true })
    await expect(msBtn).toBeVisible()
    await msBtn.click()

    await expect(msBtn).toHaveClass(/active/)
    await expect(speedNumber).toHaveText('20')
    await expect(speedUnitBadge).toHaveText('m/s')
    await expect(historyItemSpeed).toHaveText('20.0')
    await expect(historyItemUnit).toHaveText('m/s')

    // "Özeti Kopyala" tıklandığında seçili birimin (m/s) kullanıldığını doğrula
    const copyBtn = page.getByRole('button', { name: 'Özeti Kopyala' })
    await copyBtn.click()
    await expect(page.locator('.alert-notice')).toContainText('m/s')
  })

  test('11. Sprint 3: Yürüyüş ve Koşu Temposu (min/km) doğru hesaplanıp gösteriliyor', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 109
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')

    // Başlangıçta Hız sekmesi aktif olmalı
    const speedTab = page.getByRole('tab', { name: 'Hız' })
    const paceTab = page.getByRole('tab', { name: 'Tempo' })
    await expect(speedTab).toBeVisible()
    await expect(paceTab).toBeVisible()
    await expect(speedTab).toHaveClass(/active/)
    await expect(paceTab).not.toHaveClass(/active/)

    // Ölçüm başlamadan önce Tempo sekmesine geçildiğinde '--:--' ve 'min/km' gösterilmeli
    await paceTab.click()
    await expect(paceTab).toHaveClass(/active/)
    const speedNumber = page.locator('.speed-number')
    const speedUnitBadge = page.locator('.speed-unit').first()
    await expect(speedNumber).toHaveText('--:--')
    await expect(speedUnitBadge).toHaveText('min/km')
    await expect(page.locator('.pace-badge-info')).toHaveText('min/km')

    // Başlat butonuna basarak ölçümü başlat
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 10 km/sa hız gönder (10 / 3.6 = 2.777778 m/s) -> 6:00 min/km
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 10 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    await expect(speedNumber).toHaveText('6:00')
    await expect(speedUnitBadge).toHaveText('min/km')

    // 5 km/sa hız gönder (5 / 3.6 = 1.388889 m/s) -> 12:00 min/km
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0083,
          longitude: 28.9785,
          accuracy: 5,
          speed: 5 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 1000,
      })
    })

    await expect(speedNumber).toHaveText('12:00')

    // 12 km/sa hız gönder (12 / 3.6 = 3.333333 m/s) -> 5:00 min/km
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0084,
          longitude: 28.9786,
          accuracy: 5,
          speed: 12 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 2000,
      })
    })

    await expect(speedNumber).toHaveText('5:00')

    // Hız moduna geri dönüldüğünde ölçümün devam ettiği, hızın km/sa olarak 12 gösterildiği doğrulanmalı
    await speedTab.click()
    await expect(speedTab).toHaveClass(/active/)
    await expect(speedNumber).toHaveText('12')
    await expect(speedUnitBadge).toHaveText('km/sa')

    // Tekrar Tempo moduna dön
    await paceTab.click()
    await expect(speedNumber).toHaveText('5:00')

    // Hız 0 olduğunda tempo '--:--' olmalı (sıfıra bölme hatası oluşmamalı)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0085,
          longitude: 28.9787,
          accuracy: 5,
          speed: 0.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 3000,
      })
    })

    await expect(speedNumber).toHaveText('--:--')
  })

  test('12. Sprint 4: Araç HUD Modu (ön cam yansıtma, tam ekran, yatay görünüm ve aynalama)', async ({
    page,
  }) => {
    // Geolocation ve Fullscreen / Orientation Mock
    await page.addInitScript(() => {
      window.__geoListeners = []
      window.__fullscreenCallCount = 0
      window.__exitFullscreenCallCount = 0
      window.__orientationLocked = null

      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 110
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }

      // Fullscreen API mock on Element & Document prototypes
      Element.prototype.requestFullscreen = async function () {
        window.__fullscreenCallCount += 1
      }
      Element.prototype.webkitRequestFullscreen = async function () {
        window.__fullscreenCallCount += 1
      }
      Document.prototype.exitFullscreen = async function () {
        window.__exitFullscreenCallCount += 1
      }
      Document.prototype.webkitExitFullscreen = async function () {
        window.__exitFullscreenCallCount += 1
      }

      // Screen Orientation API mock
      try {
        if (screen.orientation) {
          screen.orientation.lock = async (dir: string) => {
            window.__orientationLocked = dir
          }
          screen.orientation.unlock = () => {
            window.__orientationLocked = null
          }
        }
      } catch {
        // Ignore in restricted environments
      }
    })

    await page.goto('/')

    // HUD butonu görünür olmalı
    const hudBtn = page.getByRole('button', { name: 'Araç HUD Modunu Aç' })
    await expect(hudBtn).toBeVisible()

    // 1. Henüz GPS başlamamışken HUD açıldığında '--' ve 'km/sa' göstermeli
    await hudBtn.click()
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // Arka plan tamamen siyah (#000000) olmalı
    const overlayBg = await hudOverlay.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    )
    expect(overlayBg).toBe('rgb(0, 0, 0)')

    const hudSpeed = page.getByTestId('hud-speed')
    const hudUnit = page.getByTestId('hud-unit')
    const exitBtn = page.getByRole('button', { name: 'HUD modundan çık' })

    await expect(hudSpeed).toHaveText('--')
    await expect(hudUnit).toHaveText('km/sa')
    await expect(exitBtn).toBeVisible()

    // Çıkış butonu ASLA aynalanmamış olmalı (scaleX(-1) içermemeli)
    const exitBtnTransform = await exitBtn.evaluate(
      (el) => window.getComputedStyle(el).transform
    )
    expect(exitBtnTransform).toBe('none')

    // 2. HUD'dan Kapat butonu ile çıkış
    await exitBtn.click()
    await expect(hudOverlay).not.toBeVisible()

    // 3. Ölçümü başlat ve 54 km/sa (15 m/s) canlı hız verisi gönder
    await page.getByRole('button', { name: 'Başlat' }).click()
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 15.0, // 15 m/s = 54 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    // Ana ekranda hız 54 olmalı
    const mainSpeedNumber = page.locator('.speed-number')
    await expect(mainSpeedNumber).toHaveText('54')

    // 4. Tekrar HUD modunu aç
    await hudBtn.click()
    await expect(hudOverlay).toBeVisible()
    await expect(hudSpeed).toHaveText('54')
    await expect(hudUnit).toHaveText('km/sa')

    // Ön cam için aynalama (scaleX(-1)) uygulanmış olmalı
    const mirroredDisplay = page.locator('.hud-mirrored-display')
    const mirrorTransform = await mirroredDisplay.evaluate(
      (el) => window.getComputedStyle(el).transform
    )
    // scaleX(-1) CSS matrix representation: matrix(-1, 0, 0, 1, 0, 0)
    expect(mirrorTransform).toContain('-1')

    // 5. Birim değiştirme (HUD üzerinde dokunulduğunda birim döner: kmh -> mph -> ms)
    // 54 km/sa = ~33.55 mph -> 34 mph
    await mirroredDisplay.click()
    await expect(hudSpeed).toHaveText('34')
    await expect(hudUnit).toHaveText('mph')

    // 54 km/sa = 15 m/s
    await mirroredDisplay.click()
    await expect(hudSpeed).toHaveText('15')
    await expect(hudUnit).toHaveText('m/s')

    // 6. Gerçek 0 km/sa hız gönderimi HUD'da '0' olarak gösterilmeli
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0083,
          longitude: 28.9785,
          accuracy: 5,
          speed: 0.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 1000,
      })
    })

    await expect(hudSpeed).toHaveText('0')

    // 7. ESC tuşu ile HUD'dan çıkış
    await page.keyboard.press('Escape')
    await expect(hudOverlay).not.toBeVisible()

    // 8. Ana ekranda Tempo görünümüne geçilse bile HUD'da daima hız gösterilmeli
    const paceTab = page.getByRole('tab', { name: 'Tempo' })
    await paceTab.click()
    await expect(paceTab).toHaveClass(/active/)

    // 10 km/sa hız gönder (Tempo: 6:00 min/km)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0084,
          longitude: 28.9786,
          accuracy: 5,
          speed: 10 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 2000,
      })
    })

    // Ana ekranda tempo 6:00
    await expect(mainSpeedNumber).toHaveText('6:00')

    // HUD açıldığında tempo değil, hız gösterilmeli
    await hudBtn.click()
    await expect(hudOverlay).toBeVisible()
    // HUD birimi m/s kalmıştı (10 km/sa = 2.77 -> 3 m/s)
    await expect(hudSpeed).not.toHaveText('6:00')
    await expect(hudUnit).toHaveText('m/s')

    // Çıkış yapıldığında ana ekranın önceki 'Tempo' seçimini koruduğunu doğrula
    await exitBtn.click()
    await expect(hudOverlay).not.toBeVisible()
    await expect(paceTab).toHaveClass(/active/)
    await expect(mainSpeedNumber).toHaveText('6:00')

    // 9. Dikey ve yatay ekran boyutlarında taşma (overflow) olmaması
    // Dikey mobil görünüm (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 })
    await hudBtn.click()
    await expect(hudOverlay).toBeVisible()

    const portraitOverflow = await hudOverlay.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(portraitOverflow.scrollWidth).toBeLessThanOrEqual(portraitOverflow.clientWidth)
    expect(portraitOverflow.scrollHeight).toBeLessThanOrEqual(portraitOverflow.clientHeight)

    // Yatay mobil görünüm (844 x 390)
    await page.setViewportSize({ width: 844, height: 390 })
    const landscapeOverflow = await hudOverlay.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(landscapeOverflow.scrollWidth).toBeLessThanOrEqual(landscapeOverflow.clientWidth)
    expect(landscapeOverflow.scrollHeight).toBeLessThanOrEqual(landscapeOverflow.clientHeight)

    await exitBtn.click()
    await expect(hudOverlay).not.toBeVisible()
  })

  test('13. Sprint 5: Araba Kadranı (Yarım Daire Hız Göstergesi, dinamik yay ve ölçek uyumu)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 111
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')

    // 1. Kadran ve SVG başlangıçta görünür olmalı
    const gaugeContainer = page.locator('.speedometer-container')
    const gaugeSvg = page.locator('.speedometer-svg')
    const trackArc = page.locator('.gauge-track-arc')
    const activeArc = page.locator('.gauge-active-arc')
    const speedNumber = page.locator('.speed-number')

    await expect(gaugeContainer).toBeVisible()
    await expect(gaugeSvg).toBeVisible()
    await expect(trackArc).toBeVisible()
    await expect(activeArc).toBeVisible()

    // Başlangıçta GPS durdurulmuşken hız '--', aktif yay ise tamamen boş (0%) olmalı
    await expect(speedNumber).toHaveText('--')
    const initialDashArray = await activeArc.getAttribute('stroke-dasharray')
    const initialDashOffset = await activeArc.getAttribute('stroke-dashoffset')
    expect(Number(initialDashArray)).toBeGreaterThan(200)
    expect(Number(initialDashOffset)).toBeCloseTo(Number(initialDashArray), 1)

    // 2. 0, 20, 40, 60, 80, 100, 120 km/sa ölçek etiketleri kadran üzerinde yer almalı
    const tickLabels = page.locator('.gauge-tick-label')
    await expect(tickLabels).toHaveCount(7)
    await expect(tickLabels.nth(0)).toHaveText('0')
    await expect(tickLabels.nth(1)).toHaveText('20')
    await expect(tickLabels.nth(2)).toHaveText('40')
    await expect(tickLabels.nth(3)).toHaveText('60')
    await expect(tickLabels.nth(4)).toHaveText('80')
    await expect(tickLabels.nth(5)).toHaveText('100')
    await expect(tickLabels.nth(6)).toHaveText('120')

    // 3. Ölçümü başlat ve 60 km/sa (16.666667 m/s) hız gönder -> Rakam '60', yay %50 dolmalı
    await page.getByRole('button', { name: 'Başlat' }).click()
    const baseTime = Date.now()
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 60 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: t,
      })
    }, baseTime)

    await expect(speedNumber).toHaveText('60')
    const halfDashOffset = await activeArc.getAttribute('stroke-dashoffset')
    // 60 km/sa / 120 km/sa = 0.5 -> offset = arcLength * 0.5
    const totalLength = Number(initialDashArray)
    expect(Number(halfDashOffset)).toBeCloseTo(totalLength * 0.5, 0)

    // 4. 140 km/sa hız gönder (ölçeği aşan hız, 4 saniye zaman farkıyla fiziksel ivmelenme limitinde)
    // Rakam 140 göstermeli, yay %100'de sınırlanmalı (offset = 0)
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0084,
          longitude: 28.9786,
          accuracy: 5,
          speed: 140 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: t + 4000,
      })
    }, baseTime)

    await expect(speedNumber).toHaveText('140')
    const maxDashOffset = await activeArc.getAttribute('stroke-dashoffset')
    // Tam dolulukta offset 0 olmalı
    expect(Number(maxDashOffset)).toBeCloseTo(0, 1)

    // 5. Gerçek 0 km/sa gönder (durma senaryosu) -> Rakam '0', yay boş kalmalı
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0085,
          longitude: 28.9787,
          accuracy: 5,
          speed: 0.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: t + 5000,
      })
    }, baseTime)

    await expect(speedNumber).toHaveText('0')
    const zeroDashOffset = await activeArc.getAttribute('stroke-dashoffset')
    expect(Number(zeroDashOffset)).toBeCloseTo(Number(initialDashArray), 1)

    // Tekrar hızlanma: 60 km/sa gönder -> Tekrar dolmalı
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0086,
          longitude: 28.9788,
          accuracy: 5,
          speed: 60 / 3.6,
          heading: 90,
          altitude: 50,
        },
        timestamp: t + 8000,
      })
    }, baseTime)
    await expect(speedNumber).toHaveText('60')

    // 6. Birim değiştirme (mph seçimi) -> 60 km/sa ≈ 37 mph ve ölçek (0, 15, 30, 45, 60, 75)
    const mphBtn = page.getByRole('radio', { name: 'mph' })
    await mphBtn.click()
    await expect(speedNumber).toHaveText('37')
    await expect(tickLabels.nth(0)).toHaveText('0')
    await expect(tickLabels.nth(1)).toHaveText('15')
    await expect(tickLabels.nth(5)).toHaveText('75')

    // 7. Tempo moduna geçildiğinde kadran gizlenmeli ve tempo gösterimi görünmeli
    const paceTab = page.getByRole('tab', { name: 'Tempo' })
    await paceTab.click()
    await expect(gaugeContainer).not.toBeVisible()
    await expect(page.locator('.pace-number')).toBeVisible()

    // Tekrar Hız moduna dönüldüğünde kadran geri gelmeli
    const speedTab = page.getByRole('tab', { name: 'Hız' })
    await speedTab.click()
    await expect(gaugeContainer).toBeVisible()

    // 8. Mobil dar ekranda (360x640) taşma olmamalı
    await page.setViewportSize({ width: 360, height: 640 })
    const mainCard = page.locator('.speed-card')
    const overflowCheck = await mainCard.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(overflowCheck.scrollWidth).toBeLessThanOrEqual(overflowCheck.clientWidth)
  })

  test('15. Sprint 6: Ölçüm Butonları, 50/50 aktif düzen ve Hızı Kaydet oturum davranışı', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 115
        },
        clearWatch: () => {
          window.__geoListeners = []
        },
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')

    const startBtn = page.getByRole('button', { name: 'Başlat' })
    const saveSpeedBtn = page.getByRole('button', { name: 'Hızı Kaydet' })
    const stopBtn = page.getByRole('button', { name: 'Durdur' })

    // 1. Başlangıçta tek, büyük Başlat butonu görünür; Durdur görünmez
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).not.toBeVisible()

    // 2. Ölçüm başlamadan "Hızı Kaydet"e basılırsa kayıt yapılmaz ve uyarı verilir
    await saveSpeedBtn.click()
    await expect(page.locator('.alert-notice')).toContainText('Ölçüm durdurulduğu için hız kaydedilemiyor')
    await expect(page.locator('.history-item')).toHaveCount(0)

    // 3. "Başlat" butonuna basılır
    await startBtn.click()

    // 4. İki eşit buton oluşur: sol Başlat (disabled), sağ Durdur (aktif kırmızı)
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeDisabled()
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeEnabled()

    // 5. Canlı GPS verisi gönder (45 km/sa = 12.5 m/s)
    const baseTime = Date.now()
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 12.5,
          heading: 90,
          altitude: 50,
        },
        timestamp: t,
      })
    }, baseTime)

    await expect(page.locator('.speed-number')).toHaveText('45')

    // 6. "Hızı Kaydet" butonuna basılır
    await saveSpeedBtn.click()

    // Geçmişe 1. kayıt eklenir
    const historyItems = page.locator('.history-item')
    await expect(historyItems).toHaveCount(1)
    await expect(historyItems.first().locator('.history-speed')).toHaveText('45.0')
    await expect(page.locator('.alert-notice')).toContainText('Hız kaydedildi: #1 (45.0 km/sa)')

    // 7. Hızı Kaydet oturum istatistiklerini (maksimum hız 45 km/sa) sıfırlamamalı
    await expect(page.locator('.stat-tile').first().locator('.stat-value')).toContainText('45')

    // 8. Geçerli 0 km/sa verisi gönder ve kaydet
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 0.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: t + 1000,
      })
    }, baseTime)

    await expect(page.locator('.speed-number')).toHaveText('0')
    await saveSpeedBtn.click()
    await expect(historyItems).toHaveCount(2)
    await expect(historyItems.first().locator('.history-speed')).toHaveText('0.0')

    // 9. "Durdur" butonuna basılır
    await stopBtn.click()

    // Tekrar tek, büyük turuncu "Başlat" butonuna dönülür; Durdur gizlenir
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).not.toBeVisible()

    // Durdur sonrasında istatistikler ve geçmiş görünmeye devam eder
    await expect(page.locator('.stat-tile').first().locator('.stat-value')).toContainText('45')
    await expect(historyItems).toHaveCount(2)

    // 10. Yeniden "Başlat"a basıldığında yeni oturum başlar; ancak önceki geçmiş silinmez
    await startBtn.click()
    await expect(historyItems).toHaveCount(2)
  })
})



