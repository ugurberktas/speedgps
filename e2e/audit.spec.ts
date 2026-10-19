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
  test.fail(true, 'P1: rejected speed is returned as last valid speed and distance accepts the jump')
  await expect(page.locator('.stat-tile').nth(2).locator('.stat-value')).toHaveText('0 m')
})

test('audit: stopping during sparse stationary fixes must include elapsed stationary time in average', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await expect(page.locator('.speed-number')).toHaveText('36')
  await page.clock.runFor(1000)
  await emit(page, 1, 10, 0)
  await expect(page.locator('.speed-number')).toHaveText('0')
  await expect(page.locator('.stat-tile').nth(1)).toContainText('18.0')
  await page.clock.runFor(20000)
  await page.getByRole('button', { name: 'Durdur', exact: true }).click()
  await expect(page.locator('.stat-tile').nth(3)).toContainText('00:21')
  // The chosen treatment of the first fix may affect the exact result, but 18 is untenable.
  test.fail(true, 'P1: timer advances for 20 seconds but the mean remains unchanged')
  await expect(page.locator('.stat-tile').nth(1)).not.toContainText('18.0')
})

test('audit: transient timeout must keep watching for tunnel recovery', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await page.evaluate(() => window.__auditError?.({
    code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
  }))
  await expect(page.locator('.alert-error')).toContainText('Konum bilgisi bekleniyor')
  test.fail(true, 'P1: TIMEOUT clears the watcher despite the waiting message')
  expect(await page.evaluate(() => window.__auditClears)).toBe(0)
})

test('audit: null Haversine speeds must not count as measured duration indefinitely', async ({ page }) => {
  for (let t = 0; t <= 10; t++) {
    await emit(page, t, 0, null, 50)
    await page.clock.runFor(1000)
  }
  await expect(page.locator('.speed-number')).toHaveText('--')
  test.fail(true, 'P2: accepted coordinates refresh freshness although speed cannot be calculated')
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
