import { test, expect } from '@playwright/test'

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
    const recordBtn = page.getByRole('button', { name: 'Yeni Ölçüm' })
    const startBtn = page.getByRole('button', { name: 'Başlat' })
    const stopBtn = page.getByRole('button', { name: 'Durdur' })

    await expect(recordBtn).toBeVisible()
    await expect(startBtn).toBeVisible()
    await expect(stopBtn).toBeVisible()
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).toBeDisabled() // Başlangıçta durduruldu olduğu için devre dışı

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
        watchPosition: (success: PositionCallback) => {
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
      window.__emitGps = (pos: any) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 15 m/s = 54 km/sa hız gönder (doğruluk: 8m - İyi)
    await page.evaluate(() => {
      ;(window as any).__emitGps({
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

    // "Yeni Ölçüm" ile kaydet
    await page.getByRole('button', { name: 'Yeni Ölçüm' }).click()

    // Bildirim ve geçmiş kontrolü
    const alertNotice = page.locator('.alert-notice')
    await expect(alertNotice).toBeVisible()
    await expect(alertNotice).toContainText('54 km/sa')
    await expect(alertNotice).toContainText('kaydedildi')

    const historyItems = page.locator('.history-item')
    await expect(historyItems).toHaveCount(1)
    await expect(historyItems.first().locator('.history-speed')).toHaveText('54.0')
    await expect(historyItems.first().locator('.history-unit')).toHaveText('km/sa')

    // Şimdi 0 m/s (0 km/sa) hız gönder (kırmızı ışıkta durma senaryosu)
    await page.evaluate(() => {
      ;(window as any).__emitGps({
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

    // 0 km/sa için "Yeni Ölçüm" kaydı yap
    await page.getByRole('button', { name: 'Yeni Ölçüm' }).click()
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
        watchPosition: (success: PositionCallback) => {
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

      window.__emitGps = (pos: any) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // coords.speed = null ve ilk nokta olduğunda henüz hız hesaplanamaz -> "--" kalmalı
    await page.evaluate(() => {
      ;(window as any).__emitGps({
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
        watchPosition: (success: PositionCallback) => {
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

      window.__emitGps = (pos: any) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 1. Ölçüm (10 m/s = 36 km/sa)
    await page.evaluate(() => {
      ;(window as any).__emitGps({
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
    await page.getByRole('button', { name: 'Yeni Ölçüm' }).click()

    // 2. Ölçüm (20 m/s = 72 km/sa)
    await page.evaluate(() => {
      ;(window as any).__emitGps({
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
    await page.getByRole('button', { name: 'Yeni Ölçüm' }).click()

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

    // Başlangıç durumu
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).toBeDisabled()
    await expect(statusPill).toHaveText(/Durduruldu/)

    // Başlat
    await startBtn.click()
    await expect(startBtn).toBeDisabled()
    await expect(stopBtn).toBeEnabled()
    await expect(statusPill).toHaveText(/Sinyal Bekleniyor/)

    // Durdur
    await stopBtn.click()
    await expect(startBtn).toBeEnabled()
    await expect(stopBtn).toBeDisabled()
    await expect(statusPill).toHaveText(/Durduruldu/)
    await expect(page.locator('.speed-number')).toHaveText('--')
  })

  test('7. GPS kesintisinde eski hız canlıymış gibi gösterilmiyor ("--")', async ({ page }) => {
    await page.addInitScript(() => {
      window.__geoListeners = []
      const mockGeolocation = {
        watchPosition: (success: PositionCallback) => {
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

      window.__emitGps = (pos: any) => {
        for (const listener of window.__geoListeners) {
          listener(pos)
        }
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Başlat' }).click()

    // 20 m/s = 72 km/sa canlı hız gönder
    await page.evaluate(() => {
      ;(window as any).__emitGps({
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
    const recordBtn = page.getByRole('button', { name: 'Yeni Ölçüm' })
    const startBtn = page.getByRole('button', { name: 'Başlat' })
    const stopBtn = page.getByRole('button', { name: 'Durdur' })

    const recordBox = await recordBtn.boundingBox()
    const startBox = await startBtn.boundingBox()
    const stopBox = await stopBtn.boundingBox()

    expect(recordBox).not.toBeNull()
    expect(startBox).not.toBeNull()
    expect(stopBox).not.toBeNull()

    // Genişlik ve yükseklik kontrolü (kesilmiş veya 0 boyutlu olmamalı)
    expect(recordBox!.width).toBeGreaterThan(100)
    expect(recordBox!.height).toBeGreaterThan(30)
    expect(startBox!.width).toBeGreaterThan(40)
    expect(stopBox!.width).toBeGreaterThan(40)
  })
})
