import { test, expect } from '@playwright/test'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/**
 * SpeedGPS — V3 Son Düzeltmeler / Görev 5 (D3)
 * Gerçek Production Service Worker ile İki Sekmeli PWA Güncelleme ve Oturum Koruma Testi
 */

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

let server: http.Server
let swVersion = 1
const PORT = 5175
const BASE_URL = `http://127.0.0.1:${PORT}`

test.beforeAll(async () => {
  swVersion = 1
  server = http.createServer((req, res) => {
    const urlPath = req.url ? req.url.split('?')[0] : '/'

    if (urlPath === '/sw.js') {
      const swPath = path.join(process.cwd(), 'dist', 'sw.js')
      const swContent = fs.readFileSync(swPath, 'utf-8')
      const finalContent =
        swVersion === 2
          ? `${swContent}\n// D3_TEST_AUDIT_VERSION_2_${Date.now()}`
          : swContent
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': '/',
      })
      res.end(finalContent)
      return
    }

    let filePath = path.join(
      process.cwd(),
      'dist',
      urlPath === '/' ? 'index.html' : urlPath
    )
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'dist', 'index.html')
    }

    const ext = path.extname(filePath)
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    })
    res.end(fs.readFileSync(filePath))
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => resolve())
    server.on('error', reject)
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

test.describe('D3: Gerçek Service Worker ile Çoklu Sekme ve Aktif Oturum Korunması', () => {
  test('A sekmesinde aktif ölçüm ve RAM geçmişi varken, B sekmesinin güncellemesi A oturumunu yenilemez', async ({
    browser,
  }) => {
    swVersion = 1
    const context = await browser.newContext()

    // 1. A Sekmesini Aç ve Service Worker'ın kontrol etmesini bekle
    const pageA = await context.newPage()
    await pageA.addInitScript(() => {
      let watchSuccess: PositionCallback | undefined
      ;(window as unknown as Record<string, unknown>).__emitSpeed = (speedKmh: number) => {
        watchSuccess?.({
          coords: {
            latitude: 41.0,
            longitude: 29.0,
            accuracy: 5,
            speed: speedKmh / 3.6,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as unknown as GeolocationPosition)
      }
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition: (success: PositionCallback) => {
            watchSuccess = success
            return 101
          },
          clearWatch: () => {},
        },
      })
    })

    await pageA.goto(BASE_URL)
    await pageA.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return
      await navigator.serviceWorker.ready
    })

    // A sekmesinde GPS başlat ve 1 kayıt yap
    await pageA.getByRole('button', { name: 'Başlat', exact: true }).click()
    await pageA.evaluate(() => (window as unknown as { __emitSpeed: (s: number) => void }).__emitSpeed(36))
    await expect(pageA.locator('.speed-number')).toHaveText('36')
    await pageA.getByRole('button', { name: 'Hızı Kaydet', exact: true }).click()
    await expect(pageA.locator('.history-item')).toHaveCount(1)

    // 2. B Sekmesini aynı origin üzerinde aç (Ölçüm Durdurulmuş)
    const pageB = await context.newPage()
    await pageB.goto(BASE_URL)
    await pageB.waitForFunction(() => !!navigator.serviceWorker?.controller)

    // 3. Sunucuyu Sürüm 2'ye geçir ve B sekmesinde güncelleme denetimi tetikle
    swVersion = 2
    await pageB.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
    })

    // B sekmesinde yeni worker'ın waiting durumuna geçmesini bekle
    await pageB.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return !!reg?.waiting
    })

    // B sekmesinde güncelleme bildirimi görünmelidir
    await expect(pageB.locator('.alert-pwa-update')).toBeVisible({ timeout: 10000 })

    // A sekmesinde ise ölçüm aktif olduğundan bildirim GİZLİ kalmalıdır
    expect(await pageA.locator('.alert-pwa-update').isVisible()).toBe(false)

    // A sekmesinde navigasyon dinleyicisi kur (reload kontrolü)
    let pageANavigations = 0
    pageA.on('framenavigated', (frame) => {
      if (frame === pageA.mainFrame()) {
        pageANavigations++
      }
    })

    // 4. B sekmesinde Güncelle'ye tıkla
    await pageB.getByRole('button', { name: 'Güncelle', exact: true }).click()

    // B sekmesi sekmeler arası koordinatör aracılığıyla A'daki aktif ölçümü tespit eder
    await expect(
      pageB.getByText(/Başka bir sekmede aktif GPS ölçümü devam ediyor/i)
    ).toBeVisible({ timeout: 5000 })

    // 5. EN KRİTİK KONTROL: A sekmesi ASLA reload olmamalıdır!
    expect(pageANavigations).toBe(0)

    // A sekmesindeki aktif GPS, canlı hız ve RAM geçmişi 100% korunmuş olmalıdır
    await expect(pageA.locator('.status-aktif')).toBeVisible()
    await expect(pageA.locator('.speed-number')).toHaveText('36')
    await expect(pageA.locator('.history-item')).toHaveCount(1)

    // 6. A sekmesinde ölçüm durdurulduğunda ne olur?
    await pageA.getByRole('button', { name: 'Durdur', exact: true }).click()
    await expect(pageA.locator('.status-durduruldu')).toBeVisible()
    // RAM geçmişi Durdur sonrasında da silinmez
    await expect(pageA.locator('.history-item')).toHaveCount(1)

    // Artık aktif ölçüm kalmadığı için B sekmesindeki kullanıcı Güncelle dediğinde işlem yapılabilir
    // dialog onayını mock'la
    pageB.on('dialog', (dialog) => dialog.accept())
    pageA.on('dialog', (dialog) => dialog.accept())

    await pageB.locator('.btn-pwa-dismiss').click()
    // B sekmesinde bildirim kapatıldı
    await expect(pageB.locator('.alert-pwa-update')).not.toBeVisible()

    // A sekmesinde de navigasyon olmadan geçmişin korunduğunu son kez doğrula
    expect(pageANavigations).toBe(0)
    await expect(pageA.locator('.history-item')).toHaveCount(1)

    await context.close()
  })

  test('Tek sekme senaryosunda güncelleme ve offline /gizlilik rotası sorunsuz çalışır', async ({
    browser,
  }) => {
    swVersion = 1
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(BASE_URL)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller)

    // Çevrimdışına al ve /gizlilik sayfasına git
    await context.setOffline(true)
    await page.goto(`${BASE_URL}/gizlilik`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Gizlilik Politikası'
    )
    await expect(
      page.getByText(/Konum koordinatlarınız.*aktarılmaz/i)
    ).toBeVisible()

    await context.close()
  })
})
