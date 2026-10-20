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
    __emitGpsError?: (error: GeolocationPositionError) => void
    __activeWatchers?: Record<number, { success: MockGeoListener; error?: PositionErrorCallback | null }>
    __activeWatcherCount?: number
    __clearWatchCallCount?: number
    __lastClearedWatchId?: number | null
    __fullscreenCallCount: number
    __exitFullscreenCallCount: number
    __orientationLocked: string | null
    __orientationLockCallCount?: number
    __orientationUnlockCallCount?: number
    __watchCallCount?: number
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

    // Kesinti durumunda kullanıcıya yanıltıcı "GPS Aktif" rozeti gösterilmemeli, "Sinyal Bekleniyor..." olmalı
    await expect(page.locator('.status-pill')).toHaveText(/Sinyal Bekleniyor/)
    await expect(page.locator('.status-pill')).not.toHaveClass(/status-aktif/)
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

    // HUD açılışı ölçümü otomatik başlattı (V3 Madde 14)
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()

    // 3. 54 km/sa (15 m/s) canlı hız verisi gönder
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

    // 2. Ölçüm başlamadan "Hızı Kaydet"e basılırsa kayıt yapılmaz ve Ölçüm Geçmişi bölümünde uyarı verilir
    await saveSpeedBtn.click()
    const historyNotice = page.locator('.history-notice-banner')
    await expect(historyNotice).toBeVisible()
    await expect(historyNotice).toContainText(
      'Ölçüm durdurulduğu için hız kaydedilemiyor. Lütfen önce Başlat butonuna basın.'
    )
    await expect(page.locator('.alert-notice')).not.toBeVisible()
    await expect(page.locator('.history-item')).toHaveCount(0)

    // 3. "Başlat" butonuna basılır ve önceki kayıt uyarısı temizlenir
    await startBtn.click()
    await expect(historyNotice).not.toBeVisible()

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

  test('16. V3 Aşama 1: Özeti Kopyala hata yönetimi ve textarea temizliği', async ({ page }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 116
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

      // Clipboard API'yi ve execCommand'i hata dönecek şekilde mock'la
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            throw new Error('Clipboard access denied')
          },
        },
        configurable: true,
      })
      document.execCommand = () => false
    })

    await page.goto('/')

    // Canlı GPS başlat ve kayıt oluştur
    await page.getByRole('button', { name: 'Başlat' }).click()
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
    await expect(page.locator('.history-item')).toHaveCount(1)

    // "Özeti Kopyala" butonuna bas
    const copyBtn = page.getByRole('button', { name: 'Özeti Kopyala' })
    await copyBtn.click()

    // execCommand false döndüğü için başarı bildirimi DEĞİL, hata bildirimi görünmeli
    const alertNotice = page.locator('.alert-notice')
    await expect(alertNotice).toBeVisible()
    await expect(alertNotice).toContainText('Özet panoya kopyalanamadı')
    await expect(alertNotice).not.toContainText('panoya kopyalandı')

    // Geçici textarea öğesinin DOM'da kalmadığı (finally ile temizlendiği) doğrulanmalı
    const textareaCount = await page.locator('textarea').count()
    expect(textareaCount).toBe(0)
  })

  test('17. V3 Aşama 1: HUD birim senkronizasyonu ve çıkış sonrası birimin korunması', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 117
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

    // 1. Ana ekranda birimi 'mph' olarak seç
    const mphBtn = page.getByRole('radio', { name: 'mph' })
    await mphBtn.click()

    // 2. Canlı GPS başlat ve 72 km/sa (20 m/s) hız gönder (72 km/sa ≈ 45 mph)
    await page.getByRole('button', { name: 'Başlat' }).click()
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

    await expect(page.locator('.speed-number')).toHaveText('45')

    // 3. HUD modunu aç -> mph ve 45 göstermeli
    await page.getByRole('button', { name: 'Araç HUD Modunu Aç' }).click()
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()
    await expect(page.getByTestId('hud-speed')).toHaveText('45')
    await expect(page.getByTestId('hud-unit')).toHaveText('mph')

    // 4. HUD içindeyken birimi m/s olarak değiştir -> 20 ve m/s olmalı
    await page.locator('.hud-mirrored-display').click()
    await expect(page.getByTestId('hud-speed')).toHaveText('20')
    await expect(page.getByTestId('hud-unit')).toHaveText('m/s')

    // 5. HUD'dan çık -> ana ekranda seçili birim 'm/s' olarak korunmalı ve hız 20 olmalı
    await page.getByRole('button', { name: 'HUD modundan çık' }).click()
    await expect(hudOverlay).not.toBeVisible()
    await expect(page.locator('.speed-number')).toHaveText('20')
    await expect(page.locator('.speed-unit').first()).toHaveText('m/s')
  })

  test('18. V3 Aşama 2: Aktif ölçüm sırasında Gizlilik sayfasına geçiş, canlı durum bildirimi ve sayfadan Durdur kontrolü', async ({
    page,
  }) => {
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
      window.__emitGps = (pos: MockPosition) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')

    // 1. Ölçümü başlat ve geçerli hız gönder
    await page.getByRole('button', { name: 'Başlat' }).click()
    const now = Date.now()
    await page.evaluate((t) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 54 / 3.6,
          heading: 90,
          altitude: 40,
        },
        timestamp: t,
      })
    }, now)

    await expect(page.locator('.speed-number')).toHaveText('54')

    // 2. Gizlilik ve KVKK sayfasına geç
    await page.getByRole('link', { name: 'Gizlilik ve KVKK' }).click()
    await expect(page).toHaveURL(/.*\/gizlilik/)

    // 3. Arka planda aktif GPS ölçüm bildirim çubuğu ve Durdur butonu görünmeli
    const trackingBanner = page.locator('.privacy-active-tracking-banner')
    await expect(trackingBanner).toBeVisible()
    await expect(trackingBanner).toContainText('Canlı GPS ölçümü arka planda çalışmaya devam ediyor')

    const stopBtn = page.getByRole('button', { name: 'Canlı GPS ölçümünü durdur' })
    await expect(stopBtn).toBeVisible()

    // 4. Durdur butonuna tıkla -> bildirim çubuğu kapanmalı
    await stopBtn.click()
    await expect(trackingBanner).not.toBeVisible()

    // 5. Ana ekrana dön -> durdurulmuş durum ve kaydedilen hız istatistikleri korunmalı
    await page.getByRole('button', { name: 'Ana Ekrana Dön' }).first().click()
    await expect(page.locator('.brand-title')).toBeVisible()
    await expect(page.locator('.status-pill')).toContainText('Durduruldu')
  })

  test('19. V3 Aşama 2: Klavye erişilebilirliği (Hız/Tempo sekmeleri ve Hız Birimi ok tuşları ile geçiş)', async ({
    page,
  }) => {
    await page.goto('/')

    // 1. Hız sekmesine odaklan
    const speedTab = page.locator('#tab-mode-speed')
    await speedTab.focus()
    await expect(speedTab).toBeFocused()

    // 2. Sağ ok tuşuna bas -> Tempo sekmesine geçmeli
    await page.keyboard.press('ArrowRight')
    const paceTab = page.locator('#tab-mode-pace')
    await expect(paceTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.pace-badge-info')).toBeVisible()

    // 3. Sol ok tuşuna bas -> Hız sekmesine geri dönmeli
    await page.keyboard.press('ArrowLeft')
    await expect(speedTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.speed-unit-selector')).toBeVisible()

    // 4. Hız biriminde ok tuşları ile gezin
    const kmhRadio = page.locator('#radio-unit-kmh')
    await kmhRadio.focus()
    await expect(kmhRadio).toHaveAttribute('aria-checked', 'true')

    await page.keyboard.press('ArrowRight')
    const mphRadio = page.locator('#radio-unit-mph')
    await expect(mphRadio).toHaveAttribute('aria-checked', 'true')

    await page.keyboard.press('ArrowRight')
    const msRadio = page.locator('#radio-unit-ms')
    await expect(msRadio).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('SpeedGPS V3 — Aşama 2 / Görev 2: HUD Otomatik Başlatma ve Oturum Koruma', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })
  })

  test('1. Ölçüm kapalıyken HUD açıldığında otomatik başlar, bekleme durumu "--" ve sinyal metni gösterilir, GPS gelince canlı hız yansır', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return window.__geoListeners.length
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
      window.__emitGps = (position: MockPosition) => {
        window.__geoListeners.forEach((listener) => listener(position))
      }
    })

    await page.goto('/')

    // Başlangıçta ölçüm kapalıdır, tek büyük Başlat butonu vardır
    const startBtn = page.getByRole('button', { name: 'Başlat' })
    await expect(startBtn).toBeVisible()

    // HUD butonuna tıkla
    const hudBtn = page.getByRole('button', { name: 'HUD' })
    await hudBtn.click()

    // HUD açıldı
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // Henüz konum verisi alınmadığında HUD siyah boş bir ekran olmamalı:
    // büyük "--" değeri, doğru hız birimi ve "GPS sinyali bekleniyor" durumu
    const hudSpeed = page.getByTestId('hud-speed')
    const hudUnit = page.getByTestId('hud-unit')
    const hudStatus = page.getByTestId('hud-status')

    await expect(hudSpeed).toHaveText('--')
    await expect(hudUnit).toHaveText('km/sa')
    await expect(hudStatus).toContainText('GPS sinyali bekleniyor')

    // Canlı GPS verisi gönderildiğinde HUD filtrelenmiş canlı hızı göstermeli
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 20.0, // 20 m/s = 72 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    await expect(hudSpeed).toHaveText('72')
    await expect(hudStatus).not.toBeVisible()

    // 0 km/sa gönderildiğinde '0' olarak gösterilmeli
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

    // HUD'dan Kapat butonu ile çık
    const exitBtn = page.getByRole('button', { name: 'HUD modundan çık' })
    await exitBtn.click()
    await expect(hudOverlay).not.toBeVisible()

    // HUD'dan çıkmak ölçümü durdurmamalı, sıfırlamamalı
    // Ana ekranda Durdur butonu aktif olmalı ve Başlat butonu pasif olmalı
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
    await expect(page.locator('.btn-start-disabled')).toBeDisabled()
  })

  test('2. GPS izni reddedildiğinde HUD anlaşılır hata durumu gösterir ve kullanıcı çıkabilir', async ({
    page,
  }) => {
    // Geolocation PERMISSION_DENIED dönecek şekilde mock'la
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

    // Ölçüm kapalıyken doğrudan HUD butonuna tıkla
    const hudBtn = page.getByRole('button', { name: 'HUD' })
    await hudBtn.click()

    // HUD açılmalı, kırılgan zincire takılmamalı
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // İzin reddi durumu HUD içinde belirgin ve anlaşılır olmalı
    const hudStatus = page.getByTestId('hud-status')
    await expect(hudStatus).toContainText('Konum izni reddedildi')
    await expect(page.locator('.hud-top-error-badge')).toContainText('Konum izni reddedildi')

    // Kullanıcı uygulamadan çıkmak zorunda kalmadan HUD'ı kapatabilmeli
    const exitBtn = page.getByRole('button', { name: 'HUD modundan çık' })
    await exitBtn.click()
    await expect(hudOverlay).not.toBeVisible()

    // Ana ekranda hata uyarısı görünür ve sayfa kullanılabilir durumdadır
    await expect(page.locator('.alert-error')).toBeVisible()
  })

  test('3. Ölçüm zaten aktifken HUD açıldığında ikinci kez başlatmaz ve oturum istatistikleri korunur', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      window.__watchCallCount = 0
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__watchCallCount = (window.__watchCallCount || 0) + 1
          window.__geoListeners.push(success)
          return window.__geoListeners.length
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
      window.__emitGps = (position: MockPosition) => {
        window.__geoListeners.forEach((listener) => listener(position))
      }
    })

    await page.goto('/')

    // 1. Ana ekrandan başlat
    await page.getByRole('button', { name: 'Başlat' }).click()

    // İlk çağrı sayısı 1 olmalı
    const initialWatchCount = await page.evaluate(() => window.__watchCallCount)
    expect(initialWatchCount).toBe(1)

    // 2. Canlı GPS verisi gönder (90 km/sa = 25 m/s)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 25.0, // 90 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    // Ana ekranda hız 90 olmalı
    await expect(page.locator('.speed-number')).toHaveText('90')

    // 3. HUD butonuna tıkla
    await page.getByRole('button', { name: 'HUD' }).click()
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // Ölçüm zaten aktifken HUD'a geçmek ikinci kez GPS takibi başlatmamalı
    const postHudWatchCount = await page.evaluate(() => window.__watchCallCount)
    expect(postHudWatchCount).toBe(1)

    // Canlı hız HUD'da hemen 90 görünmeli
    const hudSpeed = page.getByTestId('hud-speed')
    const hudUnit = page.getByTestId('hud-unit')
    await expect(hudSpeed).toHaveText('90')
    await expect(hudUnit).toHaveText('km/sa')

    // 4. HUD içinden birimi döngü ile değiştir (km/sa -> mph)
    // 90 km/sa = ~55.92 mph -> 56 mph
    await page.locator('.hud-mirrored-display').click()
    await expect(hudSpeed).toHaveText('56')
    await expect(hudUnit).toHaveText('mph')

    // 5. HUD'dan çıkış yap
    await page.getByRole('button', { name: 'HUD modundan çık' }).click()
    await expect(hudOverlay).not.toBeVisible()

    // Oturum süresi, canlı takip, seçili hız birimi (mph) ve istatistikler korunmalı
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
    await expect(page.locator('.speed-number')).toHaveText('56')
    await expect(page.locator('#radio-unit-mph')).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('SpeedGPS V3 — Aşama 2 / Görev 3: HUD Fullscreen, Orientation ve Erişilebilirlik Düzeltmeleri', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })
  })

  test('1. Asenkron açılış/kapanış yarışı: requestFullscreen beklerken HUD kapatılırsa orientation.lock çağrılmaz ve tam ekran temizlenir', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      window.__fullscreenCallCount = 0
      window.__exitFullscreenCallCount = 0
      window.__orientationLockCallCount = 0
      window.__orientationUnlockCallCount = 0
      window.__orientationLocked = null

      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return window.__geoListeners.length
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      // Gecikmeli requestFullscreen mock'u (150ms gecikme)
      let activeFsElement: Element | null = null
      Element.prototype.requestFullscreen = function () {
        window.__fullscreenCallCount++
        return new Promise((resolve) => {
          setTimeout(() => {
            activeFsElement = document.documentElement
            Object.defineProperty(document, 'fullscreenElement', {
              get: () => activeFsElement,
              configurable: true,
            })
            resolve()
          }, 150)
        })
      }

      Document.prototype.exitFullscreen = function () {
        window.__exitFullscreenCallCount++
        activeFsElement = null
        Object.defineProperty(document, 'fullscreenElement', {
          get: () => null,
          configurable: true,
        })
        return Promise.resolve()
      }

      // Screen Orientation Mock
      const mockOrientation = {
        type: 'portrait-primary',
        angle: 0,
        lock: (orientation: string) => {
          window.__orientationLockCallCount = (window.__orientationLockCallCount || 0) + 1
          window.__orientationLocked = orientation
          return Promise.resolve()
        },
        unlock: () => {
          window.__orientationUnlockCallCount = (window.__orientationUnlockCallCount || 0) + 1
          window.__orientationLocked = null
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }
      Object.defineProperty(screen, 'orientation', {
        value: mockOrientation,
        configurable: true,
      })
    })

    await page.goto('/')

    // HUD'ı aç
    const hudBtn = page.getByRole('button', { name: 'HUD' })
    await hudBtn.click()

    // requestFullscreen 150ms bekliyor; hemen (30ms içinde) Kapat butonuna bas
    await page.waitForTimeout(30)
    const exitBtn = page.getByRole('button', { name: 'HUD modundan çık' })
    await exitBtn.click()

    // Fullscreen Promise'inin çözülmesini bekle (200ms)
    await page.waitForTimeout(200)

    // HUD kapalı kalmalı
    await expect(page.locator('.hud-overlay')).not.toBeVisible()

    // Asenkron yarış koruması: orientation.lock ASLA çağrılmamış olmalı
    const lockCount = await page.evaluate(() => window.__orientationLockCallCount)
    expect(lockCount).toBe(0)

    // Fullscreen açık kalmamış olmalı
    const isFullscreen = await page.evaluate(() => document.fullscreenElement !== null)
    expect(isFullscreen).toBe(false)
  })

  test('2. Fullscreen çıkış yönetimi: Native fullscreen çıkışı veya ESC ile HUD durumu senkronize kapanır', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      window.__fullscreenCallCount = 0
      window.__exitFullscreenCallCount = 0
      window.__orientationLocked = null

      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return window.__geoListeners.length
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      let activeFs: Element | null = null
      Element.prototype.requestFullscreen = function () {
        window.__fullscreenCallCount++
        activeFs = document.documentElement
        Object.defineProperty(document, 'fullscreenElement', {
          get: () => activeFs,
          configurable: true,
        })
        return Promise.resolve()
      }

      Document.prototype.exitFullscreen = function () {
        window.__exitFullscreenCallCount++
        activeFs = null
        Object.defineProperty(document, 'fullscreenElement', {
          get: () => null,
          configurable: true,
        })
        return Promise.resolve()
      }

      const mockOrientation = {
        lock: (orientation: string) => {
          window.__orientationLocked = orientation
          return Promise.resolve()
        },
        unlock: () => {
          window.__orientationLocked = null
        },
      }
      Object.defineProperty(screen, 'orientation', {
        value: mockOrientation,
        configurable: true,
      })
    })

    await page.goto('/')

    // HUD'ı aç
    await page.getByRole('button', { name: 'HUD' }).click()
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // Tarayıcının native fullscreen çıkışını simüle et (ESC veya tarayıcı butonu)
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => null,
        configurable: true,
      })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    // HUD otomatik olarak kapanmalı ve durum tutarlı kalmalı
    await expect(hudOverlay).not.toBeVisible()

    // Yön kilidi bırakılmış olmalı
    const lockedOrientation = await page.evaluate(() => window.__orientationLocked)
    expect(lockedOrientation).toBeNull()

    // Ölçüm oturumu kesilmemeli, Durdur butonu görünür kalmalı
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
  })

  test('3. Klavye odağı ve modal erişilebilirliği: Odak Kapat butonuna taşınır, arka plan aria-hidden olur, Tab focus trap çalışır ve ESC sonrası odak geri döner', async ({
    page,
  }) => {
    await page.goto('/')

    // 1. HUD butonuna odaklan
    const hudBtn = page.getByRole('button', { name: 'HUD' })
    await hudBtn.focus()
    await expect(hudBtn).toBeFocused()

    // 2. Enter ile HUD'ı aç
    await page.keyboard.press('Enter')
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // 3. Odak HUD içindeki "Kapat" butonuna taşınmış olmalı
    const exitBtn = page.getByRole('button', { name: 'HUD modundan çık' })
    await expect(exitBtn).toBeFocused()

    // 4. Arka plan içeriği (header, main, footer) aria-hidden olmalı
    await expect(page.locator('.speedgps-header')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('.speed-card')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('.speedgps-footer')).toHaveAttribute('aria-hidden', 'true')

    // 5. Focus Trap: Tab ile HUD içi sonraki öğeye (aynalanmış hız/birim) geç
    await page.keyboard.press('Tab')
    const mirroredDisplay = page.locator('.hud-mirrored-display')
    await expect(mirroredDisplay).toBeFocused()

    // Tab ile tekrar Kapat butonuna dönmeli (dışarı kaçmamalı)
    await page.keyboard.press('Tab')
    await expect(exitBtn).toBeFocused()

    // Shift+Tab ile geriye döngü testi
    await page.keyboard.press('Shift+Tab')
    await expect(mirroredDisplay).toBeFocused()

    // 6. Escape ile HUD'dan çıkış
    await page.keyboard.press('Escape')
    await expect(hudOverlay).not.toBeVisible()

    // Arka plan tekrar erişilebilir olmalı
    await expect(page.locator('.speedgps-header')).toHaveAttribute('aria-hidden', 'false')
    await expect(page.locator('.speed-card')).toHaveAttribute('aria-hidden', 'false')

    // 7. Odak önceki kontrole (HUD butonu) geri dönmeli
    await expect(hudBtn).toBeFocused()
  })

  test('4. Hızlı ardışık aç/kapa/aç senaryosunda yalnızca son istek geçerli kalır ve GPS oturumu korunur', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      window.__watchCallCount = 0

      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__watchCallCount = (window.__watchCallCount || 0) + 1
          window.__geoListeners.push(success)
          return window.__geoListeners.length
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
      window.__emitGps = (position: MockPosition) => {
        window.__geoListeners.forEach((listener) => listener(position))
      }
    })

    await page.goto('/')

    // Hızlı aç -> kapa -> aç
    const hudBtn = page.getByRole('button', { name: 'HUD' })
    await hudBtn.click()
    const exitBtn = page.getByRole('button', { name: 'HUD modundan çık' })
    await exitBtn.click()
    await hudBtn.click()

    // Sonuçta HUD açık kalmalı
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // Çift geolocation takibi başlatılmamış olmalı (yalnızca 1 watchPosition)
    const watchCount = await page.evaluate(() => window.__watchCallCount)
    expect(watchCount).toBe(1)

    // Canlı veri aktarımı HUD'da görünmeli
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 15.0, // 54 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    await expect(page.getByTestId('hud-speed')).toHaveText('54')
  })
})

test.describe('SpeedGPS V3 — Aşama 2 / Görev 4: GPS Accuracy ve Timestamp Sınır Durumları', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return window.__geoListeners.length
        },
        clearWatch: () => {},
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
      window.__emitGps = (position: MockPosition) => {
        window.__geoListeners.forEach((listener) => listener(position))
      }
    })
  })

  test('1. accuracy=0 geçerli bir sayı olarak kabul edilir ve "İyi" kalite rozetiyle canlı hız güncellenir', async ({
    page,
  }) => {
    await page.goto('/')

    // Ölçümü başlat
    await page.getByRole('button', { name: 'Başlat' }).click()

    const now = Date.now()
    // accuracy: 0 değeriyle geçerli 36 km/sa (10 m/s) veri gönder
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 0,
          speed: 10.0,
          heading: 90,
          altitude: 50,
        },
        timestamp,
      })
    }, now)

    // Hız 36 km/sa olmalı (accuracy=0 reddedilmemeli)
    await expect(page.locator('.speed-number')).toHaveText('36')

    // Konum kalitesi rozeti "İyi" olmalı ve title içinde ±0m yazmalı
    const qualityBadge = page.locator('.quality-badge')
    await expect(qualityBadge).toBeVisible()
    await expect(qualityBadge).toHaveClass(/quality-iyi/)
    await expect(qualityBadge).toContainText('İyi')
    await expect(qualityBadge).toHaveAttribute('title', /±0m/)
  })

  test('2. Negatif doğruluk (örn. -5) veya 100m üzerindeki aşırı sapmalı doğruluk reddedilir', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    const now = Date.now()
    // Negatif accuracy gönder
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: -5,
          speed: 15.0,
          heading: 90,
          altitude: 50,
        },
        timestamp,
      })
    }, now)

    // Reddedildiği için hız '--' kalmalı
    await expect(page.locator('.speed-number')).toHaveText('--')

    // 150 metre (100m üstü) accuracy gönder
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0083,
          longitude: 28.9785,
          accuracy: 150,
          speed: 15.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: timestamp + 1000,
      })
    }, now)

    // Hız yine '--' kalmalı
    await expect(page.locator('.speed-number')).toHaveText('--')
  })

  test('3. Tekrar eden veya geriye giden zaman damgaları reddedilir, sahte hız güncellemesi oluşmaz', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    const baseTime = Date.now()

    // 1. İlk geçerli okuma: 54 km/sa (15 m/s)
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 15.0,
          heading: 90,
          altitude: 50,
        },
        timestamp,
      })
    }, baseTime)

    await expect(page.locator('.speed-number')).toHaveText('54')

    // 2. Aynı (tekrarlanan) zaman damgasıyla 90 km/sa (25 m/s) gönder
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0085,
          longitude: 28.9787,
          accuracy: 5,
          speed: 25.0,
          heading: 90,
          altitude: 50,
        },
        timestamp, // baseTime ile aynı!
      })
    }, baseTime)

    // Tekrar eden zaman damgası reddedilmeli, hız 54 kalmalı (90'a çıkmamalı)
    await expect(page.locator('.speed-number')).toHaveText('54')

    // 3. Geriye giden (daha eski) zaman damgasıyla veri gönder
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0088,
          longitude: 28.9790,
          accuracy: 5,
          speed: 30.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: timestamp - 5000, // 5 saniye geçmiş!
      })
    }, baseTime)

    // Geriye giden zaman damgası da reddedilmeli, hız 54 kalmalı
    await expect(page.locator('.speed-number')).toHaveText('54')
  })

  test('4. Makul olmayan gelecek zamanlı veya eksik/NaN zaman damgaları koşulsuz kabul edilmez ve reddedilir', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    const now = Date.now()

    // 1 dakika gelecekteki zaman damgası (unreasonable future drift)
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 5,
          speed: 20.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: timestamp + 60000, // +60 saniye
      })
    }, now)

    // Reddedilmeli, hız '--' kalmalı
    await expect(page.locator('.speed-number')).toHaveText('--')

    // NaN veya 0 zaman damgalı veri
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
        timestamp: NaN as unknown as number,
      })
    })

    // Reddedilmeli
    await expect(page.locator('.speed-number')).toHaveText('--')
  })

  test('5. Normal sıralı okumalarda hız ve mesafe akıcı şekilde güncellenir', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    const now = Date.now()

    // Adım 1: 36 km/sa
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 8,
          speed: 10.0,
          heading: 90,
          altitude: 50,
        },
        timestamp,
      })
    }, now)
    await expect(page.locator('.speed-number')).toHaveText('36')

    // Adım 2: 72 km/sa (1 saniye sonra)
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.0084,
          longitude: 28.9786,
          accuracy: 6,
          speed: 20.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: timestamp + 1000,
      })
    }, now)
    await expect(page.locator('.speed-number')).toHaveText('72')
  })
})

test.describe('SpeedGPS V3 — Aşama 2 / Görev 6: PWA Güncelleme Yönetimi ve Netlify Güvenliği', () => {
  test('1. Normal yüklemede ve ölçüm sırasında gereksiz PWA güncelleme bildirimi gösterilmez', async ({
    page,
  }) => {
    await page.goto('/')
    // Başlangıçta güncelleme bildirimi olmamalı
    await expect(page.locator('.alert-pwa-update')).toHaveCount(0)

    // Ölçüm başlatıldığında da bildirim olmamalı
    await page.getByRole('button', { name: 'Başlat' }).click()
    await expect(page.locator('.alert-pwa-update')).toHaveCount(0)
  })

  test('2. /gizlilik rotası doğrudan açıldığında veya tıklandığında sorunsuz yüklenir ve ana ekrana döner', async ({
    page,
  }) => {
    await page.goto('/gizlilik')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Gizlilik Politikası')

    // Ana Ekrana Dön butonu
    const backBtn = page.locator('.privacy-back-btn')
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    await expect(page.locator('.brand-title')).toContainText('SpeedGPS')
  })

  test('3. netlify.toml güvenlik başlıkları (HSTS, CSP, Permissions-Policy) eksiksiz yapılandırılmıştır', async () => {
    const fs = await import('node:fs')
    const tomlContent = fs.readFileSync('netlify.toml', 'utf-8')

    // HSTS (Strict-Transport-Security)
    expect(tomlContent).toContain('Strict-Transport-Security')
    expect(tomlContent).toContain('max-age=31536000')

    // CSP (Content-Security-Policy)
    expect(tomlContent).toContain('Content-Security-Policy')
    expect(tomlContent).toContain("default-src 'self'")
    expect(tomlContent).toContain("worker-src 'self' blob:")
    expect(tomlContent).toContain("script-src 'self'")

    // Permissions-Policy (Geolocation ve Screen Wake Lock)
    expect(tomlContent).toContain('Permissions-Policy')
    expect(tomlContent).toContain('geolocation=(self)')
    expect(tomlContent).toContain('screen-wake-lock=(self)')
  })
})

test.describe('SpeedGPS V3 — Aşama 2 / Görev 7: E2E Test Güvenilirliği ve Kalite Kontrolü', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })
  })

  test('1. Gerçekçi Geolocation mock: watchPosition ve clearWatch yaşam döngüsü ve callback izolasyonu', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      let nextWatchId = 1
      const activeWatchers = new Map<number, { success: MockGeoListener; error?: PositionErrorCallback | null }>()
      window.__clearWatchCallCount = 0
      window.__lastClearedWatchId = null
      window.__activeWatcherCount = 0

      const mockGeolocation = {
        watchPosition: (success: MockGeoListener, error?: PositionErrorCallback | null) => {
          const id = nextWatchId++
          activeWatchers.set(id, { success, error })
          window.__activeWatcherCount = activeWatchers.size
          return id
        },
        clearWatch: (id: number) => {
          window.__clearWatchCallCount = (window.__clearWatchCallCount || 0) + 1
          window.__lastClearedWatchId = id
          activeWatchers.delete(id)
          window.__activeWatcherCount = activeWatchers.size
        },
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGps = (pos: MockPosition) => {
        activeWatchers.forEach(({ success }) => {
          success(pos)
        })
      }
    })

    await page.goto('/')

    // Başlangıçta watcher sayısı 0
    let watcherCount = await page.evaluate(() => window.__activeWatcherCount)
    expect(watcherCount).toBe(0)

    // Başlat butonuna bas
    await page.getByRole('button', { name: 'Başlat' }).click()

    // watchPosition çağrılmış olmalı, aktif watcher sayısı 1
    watcherCount = await page.evaluate(() => window.__activeWatcherCount)
    expect(watcherCount).toBe(1)

    // Canlı GPS verisi gönder (54 km/sa = 15 m/s)
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 6,
          speed: 15.0,
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now(),
      })
    })

    await expect(page.locator('.speed-number')).toHaveText('54')
    await expect(page.locator('.status-pill')).toHaveText(/Aktif/)

    // Ölçümü durdur
    await page.getByRole('button', { name: 'Durdur' }).click()

    // clearWatch çağrılmış olmalı, aktif watcher sayısı 0
    const clearCount = await page.evaluate(() => window.__clearWatchCallCount)
    const lastClearedId = await page.evaluate(() => window.__lastClearedWatchId)
    watcherCount = await page.evaluate(() => window.__activeWatcherCount)

    expect(clearCount).toBe(1)
    expect(lastClearedId).toBeGreaterThan(0)
    expect(watcherCount).toBe(0)

    // clearWatch çağrıldıktan sonra artık yeni GPS verisi gönderilse bile callback işletilmemeli
    await page.evaluate(() => {
      window.__emitGps({
        coords: {
          latitude: 41.0083,
          longitude: 28.9785,
          accuracy: 5,
          speed: 25.0, // 90 km/sa
          heading: 90,
          altitude: 50,
        },
        timestamp: Date.now() + 1000,
      })
    })

    // Hız 90'a çıkmamalı, '--' ve Durduruldu kalmalı
    await expect(page.locator('.speed-number')).toHaveText('--')
    await expect(page.locator('.status-pill')).toHaveText(/Durduruldu/)
  })

  test('2. Çoklu watcher sızıntısı tespiti: Hızlı başlat/durdur ve HUD geçişlerinde tekil watcher korunur', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      let nextWatchId = 100
      const activeWatchers = new Map<number, MockGeoListener>()
      window.__activeWatcherCount = 0

      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          const id = nextWatchId++
          activeWatchers.set(id, success)
          window.__activeWatcherCount = activeWatchers.size
          return id
        },
        clearWatch: (id: number) => {
          activeWatchers.delete(id)
          window.__activeWatcherCount = activeWatchers.size
        },
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })
      window.__emitGps = (pos: MockPosition) => {
        activeWatchers.forEach((listener) => listener(pos))
      }
    })

    await page.goto('/')

    // 1. Başlat -> 1 watcher
    await page.getByRole('button', { name: 'Başlat' }).click()
    expect(await page.evaluate(() => window.__activeWatcherCount)).toBe(1)

    // 2. HUD aç -> Halen 1 watcher (çift açılma yok)
    await page.getByRole('button', { name: 'HUD' }).click()
    await expect(page.locator('.hud-overlay')).toBeVisible()
    expect(await page.evaluate(() => window.__activeWatcherCount)).toBe(1)

    // 3. HUD kapat -> Halen 1 watcher
    await page.getByRole('button', { name: 'HUD modundan çık' }).click()
    await expect(page.locator('.hud-overlay')).not.toBeVisible()
    expect(await page.evaluate(() => window.__activeWatcherCount)).toBe(1)

    // 4. Durdur -> 0 watcher
    await page.getByRole('button', { name: 'Durdur' }).click()
    expect(await page.evaluate(() => window.__activeWatcherCount)).toBe(0)

    // 5. HUD üzerinden doğrudan başlatma -> 1 watcher
    await page.getByRole('button', { name: 'HUD' }).click()
    await expect(page.locator('.hud-overlay')).toBeVisible()
    expect(await page.evaluate(() => window.__activeWatcherCount)).toBe(1)

    // 6. HUD kapatıp Durdur'a bas -> 0 watcher
    await page.getByRole('button', { name: 'HUD modundan çık' }).click()
    await page.getByRole('button', { name: 'Durdur' }).click()
    expect(await page.evaluate(() => window.__activeWatcherCount)).toBe(0)
  })

  test('3. GPS hata kodlarının ayrı modellenmesi: PERMISSION_DENIED, POSITION_UNAVAILABLE ve TIMEOUT', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      let activeErrorCb: PositionErrorCallback | null = null

      const mockGeolocation = {
        watchPosition: (_success: MockGeoListener, error?: PositionErrorCallback | null) => {
          activeErrorCb = error || null
          return 707
        },
        clearWatch: () => {
          activeErrorCb = null
        },
        getCurrentPosition: () => {},
      }
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      })

      window.__emitGpsError = (err: GeolocationPositionError) => {
        if (activeErrorCb) {
          activeErrorCb(err)
        }
      }
    })

    await page.goto('/')

    // Senaryo A: PERMISSION_DENIED (Kod 1)
    await page.getByRole('button', { name: 'Başlat' }).click()
    await page.evaluate(() => {
      window.__emitGpsError?.({
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
    })
    await expect(page.locator('.alert-error')).toContainText('Konum izni reddedildi')
    await expect(page.locator('.status-pill')).toHaveText(/Hata/)

    // Senaryo B: POSITION_UNAVAILABLE (Kod 2)
    // Tekrar başlat
    await page.getByRole('button', { name: 'Başlat' }).click()
    await page.evaluate(() => {
      window.__emitGpsError?.({
        code: 2,
        message: 'Position unavailable',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
    })
    await expect(page.locator('.alert-error')).toContainText('GPS konumuna erişilemiyor')
    await expect(page.locator('.status-pill')).toHaveText(/Bekleniyor/)

    // Senaryo C: TIMEOUT (Kod 3)
    // Geçici kesintide watcher korunduğundan Başlat'a basmaya gerek olmadan aynı watcher üzerinden TIMEOUT alınır
    await page.evaluate(() => {
      window.__emitGpsError?.({
        code: 3,
        message: 'Timeout occurred',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
    })
    await expect(page.locator('.alert-error')).toContainText('GPS sinyali zaman aşımına uğradı')
    await expect(page.locator('.status-pill')).toHaveText(/Bekleniyor/)

    // Kesinti sırasında Durdur'a basılınca temizlik yapılır
    await page.getByRole('button', { name: 'Durdur' }).click()
    await expect(page.locator('.status-pill')).toHaveText(/Durduruldu/)
  })

  test('4. Fiziksel hareket doğruluğu: Mantıksal tutarlı GPS adımları ile mesafe ve hız entegrasyonu', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: MockGeoListener) => {
          window.__geoListeners.push(success)
          return 101
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
        window.__geoListeners.forEach((l) => l(pos))
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    const t0 = Date.now()

    // Adım 1 (t0): İlk referans konumu (10 m/s = 36 km/sa)
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.00820,
          longitude: 28.97840,
          accuracy: 5,
          speed: 10.0,
          heading: 0,
          altitude: 40,
        },
        timestamp,
      })
    }, t0)

    await expect(page.locator('.speed-number')).toHaveText('36')

    // Adım 2 (t0 + 2000ms): 20 metre kuzeyde tutarlı konum, hız 10 m/s
    // 20 metre kuzey = ~0.00018 derece enlem
    await page.evaluate((timestamp) => {
      window.__emitGps({
        coords: {
          latitude: 41.00838,
          longitude: 28.97840,
          accuracy: 5,
          speed: 10.0,
          heading: 0,
          altitude: 40,
        },
        timestamp: timestamp + 2000,
      })
    }, t0)

    // Hız 36 km/sa korunmalı
    await expect(page.locator('.speed-number')).toHaveText('36')
    // Mesafe ~20 m artmalı
    const distanceStat = page.locator('.stat-tile').nth(2).locator('.stat-value')
    await expect(distanceStat).toContainText('20 m')
  })

  test('5. Fullscreen ve Screen Orientation mock: fullscreenchange olayları ve orientation lock/unlock takibi', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__fullscreenCallCount = 0
      window.__exitFullscreenCallCount = 0
      window.__orientationLockCallCount = 0
      window.__orientationUnlockCallCount = 0
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

      let activeFs: Element | null = null

      Element.prototype.requestFullscreen = function () {
        window.__fullscreenCallCount++
        activeFs = document.documentElement
        Object.defineProperty(document, 'fullscreenElement', {
          get: () => activeFs,
          configurable: true,
        })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }

      Document.prototype.exitFullscreen = function () {
        window.__exitFullscreenCallCount++
        activeFs = null
        Object.defineProperty(document, 'fullscreenElement', {
          get: () => null,
          configurable: true,
        })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }

      const mockOrientation = {
        type: 'portrait-primary',
        angle: 0,
        lock: (orient: string) => {
          window.__orientationLockCallCount = (window.__orientationLockCallCount || 0) + 1
          window.__orientationLocked = orient
          return Promise.resolve()
        },
        unlock: () => {
          window.__orientationUnlockCallCount = (window.__orientationUnlockCallCount || 0) + 1
          window.__orientationLocked = null
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }
      Object.defineProperty(screen, 'orientation', {
        value: mockOrientation,
        configurable: true,
      })
    })

    await page.goto('/')

    // HUD'ı aç
    await page.getByRole('button', { name: 'HUD' }).click()
    const hudOverlay = page.locator('.hud-overlay')
    await expect(hudOverlay).toBeVisible()

    // Fullscreen ve orientation mock çağrıları kontrolü
    const fsCalls = await page.evaluate(() => window.__fullscreenCallCount)
    const lockCalls = await page.evaluate(() => window.__orientationLockCallCount)
    const lockedOrientation = await page.evaluate(() => window.__orientationLocked)

    expect(fsCalls).toBe(1)
    expect(lockCalls).toBe(1)
    expect(lockedOrientation).toBe('landscape')

    // Tarayıcıdan native fullscreen çıkışı simülasyonu (kullanıcı ESC'ye basmış gibi)
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => null,
        configurable: true,
      })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    // Native fullscreen çıkışında HUD temiz bir şekilde kapanmalı ve durum senkronize kalmalı
    await expect(hudOverlay).not.toBeVisible()

    // Orientation unlock çağrılmış olmalı
    const unlockCalls = await page.evaluate(() => window.__orientationUnlockCallCount)
    expect(unlockCalls).toBeGreaterThanOrEqual(1)

    // Arka plandaki GPS oturumu ve Durdur butonu korunmuş olmalı
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
  })
})

