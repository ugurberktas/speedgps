import { test, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    __auditSuccess?: PositionCallback
    __auditError?: PositionErrorCallback | null
    __auditClears: number
  }
}

async function emit(page: Page, seconds: number, meters: number, speed: number | null, accuracy = 5) {
  await page.evaluate(({ seconds, meters, speed, accuracy }) => {
    window.__auditSuccess?.({
      coords: { latitude: meters / 111194.92664455874, longitude: 0, speed, accuracy,
        altitude: null, altitudeAccuracy: null, heading: null, toJSON: () => ({}) },
      timestamp: 1800000000000 + seconds * 1000,
      toJSON: () => ({}),
    })
  }, { seconds, meters, speed, accuracy })
}

// Expected failures document desired behavior without changing the measurement engine.
// Remove test.fail() when the associated audit finding is fixed.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__auditClears = 0
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
        window.__auditSuccess = success
        window.__auditError = error
        return 123
      },
      clearWatch: () => { window.__auditClears++; window.__auditSuccess = undefined },
    } })
  })
  await page.goto('/')
  await page.clock.install({ time: new Date(1800000000000) })
  await page.getByRole('button', { name: 'Başlat', exact: true }).click()
})

test('audit: rejected speed spike must not add a one-kilometre coordinate jump', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await page.clock.runFor(1000)
  await emit(page, 1, 1000, 100)
  await expect(page.locator('.speed-number')).toHaveText('36')
  await expect(page.locator('.stat-tile').nth(2).locator('.stat-value')).toHaveText('0 m')
})

test('held and repeated GPS readings show validation until a new valid fix arrives', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await expect(page.locator('.status-pill')).toContainText('GPS Aktif')

  await page.clock.runFor(1000)
  await emit(page, 1, 1000, 100)
  await expect(page.locator('.speed-number')).toHaveText('36')
  await expect(page.locator('.status-pill')).toContainText('GPS Doğrulanıyor')
  await expect(page.locator('.status-pill')).not.toHaveClass(/status-aktif/)
  await expect(page.locator('.speed-subtext')).toContainText('son hız gösteriliyor')
  await expect(page.locator('.speed-subtext')).not.toContainText('Canlı ölçüm güncelleniyor')
  await page.getByRole('button', { name: 'Hızı Kaydet', exact: true }).click()
  await expect(page.locator('.history-item')).toHaveCount(0)

  await page.clock.runFor(1000)
  await emit(page, 2, 20, 10)
  await expect(page.locator('.status-pill')).toContainText('GPS Aktif')
  await expect(page.locator('.speed-subtext')).toContainText('Canlı ölçüm güncelleniyor')

  await emit(page, 2, 500, 100)
  await expect(page.locator('.speed-number')).toHaveText('36')
  await expect(page.locator('.status-pill')).toContainText('GPS Doğrulanıyor')

  await page.clock.runFor(1000)
  await emit(page, 3, 20, 0)
  await expect(page.locator('.speed-number')).toHaveText('0')
  await expect(page.locator('.status-pill')).toContainText('GPS Aktif')
})

test('privacy text, mode panel and orange text contrast match the current interface', async ({ page }) => {
  const speedTab = page.getByRole('tab', { name: 'Hız' })
  const paceTab = page.getByRole('tab', { name: 'Tempo' })
  const panel = page.getByRole('tabpanel')
  await expect(speedTab).toHaveAttribute('aria-controls', 'speed-display-panel')
  await expect(panel).toHaveAttribute('id', 'speed-display-panel')
  await expect(panel).toHaveAttribute('aria-labelledby', 'tab-mode-speed')
  await speedTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(paceTab).toHaveAttribute('aria-selected', 'true')
  await expect(panel).toHaveAttribute('aria-labelledby', 'tab-mode-pace')

  await page.keyboard.press('ArrowLeft')
  await expect(speedTab).toHaveAttribute('aria-selected', 'true')
  await expect(panel).toHaveAttribute('aria-labelledby', 'tab-mode-speed')
  await page.getByRole('button', { name: 'Durdur', exact: true }).click()
  const ratios = await page.evaluate(() => {
    const toRgb = (value: string) => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const scaled = v / 255
        return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (one: number[], two: number[]) => {
      const a = luminance(one)
      const b = luminance(two)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    const selected = getComputedStyle(document.querySelector<HTMLElement>('.unit-toggle-btn.active')!)
    const start = getComputedStyle(document.querySelector<HTMLElement>('.btn-primary-start')!)
    const endpoints = start.backgroundImage.match(/rgb\(\d+,\s*\d+,\s*\d+\)/g) ?? []
    const white = toRgb(start.color)
    return {
      selected: contrast(toRgb(selected.color), toRgb(selected.backgroundColor)),
      gradient: endpoints.map((value) => contrast(white, toRgb(value))),
    }
  })
  expect(ratios.selected).toBeGreaterThanOrEqual(4.5)
  expect(ratios.gradient).toHaveLength(2)
  expect(ratios.gradient.every((ratio) => ratio >= 4.5)).toBe(true)

  await page.getByRole('link', { name: 'Gizlilik ve KVKK' }).click()
  await expect(page.getByText(/ölçüm kapalıyken.*HUD.*modunu açtığınızda/i)).toBeVisible()
  await expect(page.getByText(/HUD modu açılırsa GPS ölçümü otomatik başlar/i)).toBeVisible()
  await expect(page.getByText(/ayrı bir konum izleme mekanizması başlatmaz/i)).toBeVisible()
})

test('audit: stopping during sparse stationary fixes must include elapsed stationary time in average', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await expect(page.locator('.speed-number')).toHaveText('36')
  await page.clock.runFor(1000)
  await emit(page, 1, 10, 0)
  await expect(page.locator('.speed-number')).toHaveText('0')
  // t0->t1 arasında 1 saniye geçmiştir; ilk 36 km/sa hızı bu 1 saniyelik aralığa uygulanır.
  // Ortalama hız 36.0 km/sa'dir (eski hatalı testteki gibi hayalî 2. saniye eklenip 18.0 yapılmaz).
  await expect(page.locator('.stat-tile').nth(1)).toContainText('36.0')
  await page.clock.runFor(20000)
  await page.getByRole('button', { name: 'Durdur', exact: true }).click()
  await expect(page.locator('.stat-tile').nth(3)).toContainText('00:21')
  // 21 saniye sonunda pay=36, payda=21 saniye -> ortalama 1.7 km/sa (18.0 donması yok, çift sayım yok)
  await expect(page.locator('.stat-tile').nth(1)).toContainText('1.7')
})

test('audit: transient timeout must keep watching for tunnel recovery', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await page.evaluate(() => window.__auditError?.({
    code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
  }))
  await expect(page.locator('.alert-error')).toContainText('Konum bilgisi bekleniyor')
  expect(await page.evaluate(() => window.__auditClears)).toBe(0)
})

test('audit: null Haversine speeds must not count as measured duration indefinitely', async ({ page }) => {
  for (let t = 0; t <= 10; t++) {
    await emit(page, t, 0, null, 50)
    await page.clock.runFor(1000)
  }
  await expect(page.locator('.speed-number')).toHaveText('--')
  await expect(page.locator('.stat-tile').nth(3)).toContainText('00:00')
})

test('audit: stop removes watcher and preserves recorded history on restart', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await page.getByRole('button', { name: 'Hızı Kaydet', exact: true }).click()
  await page.getByRole('button', { name: 'Durdur', exact: true }).click()
  expect(await page.evaluate(() => window.__auditClears)).toBe(1)
  await page.getByRole('button', { name: 'Başlat', exact: true }).click()
  await expect(page.locator('.history-item')).toHaveCount(1)
  await expect(page.locator('.stat-tile').first()).toContainText('--')
})

test('audit: unsupported Geolocation releases a pending wake lock', async ({ page }) => {
  await page.getByRole('button', { name: 'Durdur', exact: true }).click()
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
    Reflect.deleteProperty(Object.getPrototypeOf(navigator), 'geolocation')
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
      request: async () => ({
        released: false,
        addEventListener: () => {},
        release: async () => { document.body.dataset.auditWakeReleased = 'true' },
      }),
    } })
  })
  await page.getByRole('button', { name: 'Başlat', exact: true }).click()
  await expect(page.locator('.alert-error')).toContainText('desteklemiyor')
  await expect(page.locator('body')).toHaveAttribute('data-audit-wake-released', 'true')
})
