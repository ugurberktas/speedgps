import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __task3Gps?: PositionCallback
    __task3Error?: PositionErrorCallback | null
    __task3WatchCount?: number
  }
}

const epoch = 1800000000000

async function emit(page: Page, second: number, meters: number, speed: number | null, accuracy = 5) {
  await page.evaluate(({ timestamp, meters, speed, accuracy }) => {
    window.__task3Gps?.({
      coords: {
        latitude: meters / 111194.92664455874, longitude: 0, speed, accuracy,
        altitude: null, altitudeAccuracy: null, heading: null, toJSON: () => ({}),
      },
      timestamp,
      toJSON: () => ({}),
    })
  }, { timestamp: epoch + second * 1000, meters, speed, accuracy })
}

async function step(page: Page, second: number, meters: number, speed: number | null, accuracy = 5) {
  await page.clock.runFor(1000)
  await emit(page, second, meters, speed, accuracy)
}

function distance(page: Page) {
  return page.locator('.stat-tile').nth(2).locator('.stat-value')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__task3WatchCount = 0
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
        window.__task3WatchCount!++
        window.__task3Gps = success
        window.__task3Error = error
        return 1
      },
      clearWatch: () => {},
    } })
  })
  await page.goto('/')
  await page.clock.install({ time: new Date(epoch) })
  await page.getByRole('button', { name: 'Başlat', exact: true }).click()
})

test('D1: rejected 1 km hardware jump never bridges into distance after remote stationary fixes', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await step(page, 1, 1000, 100)
  await expect(distance(page)).toHaveText('0 m')
  await expect(page.locator('.stat-tile').first()).toContainText('36')
  await page.getByRole('button', { name: 'Hızı Kaydet' }).click()
  await expect(page.locator('.history-item')).toHaveCount(0)

  for (let second = 2; second <= 16; second++) {
    await step(page, second, 1000, 10)
  }
  await expect(distance(page)).toHaveText('0 m')
  await expect(page.locator('.stat-tile').first()).toContainText('36')
  await step(page, 17, 1005, 10)
  await expect(distance(page)).toHaveText('5 m')
  await expect(page.locator('.speed-number')).toHaveText('36')
})

test('D1: Haversine jump reanchors at remote stationary fix and counts only later 5 m', async ({ page }) => {
  await emit(page, 0, 0, null)
  await step(page, 1, 0, null)
  await step(page, 2, 1000, null)
  await expect(distance(page)).toHaveText('0 m')
  for (let second = 3; second <= 15; second++) {
    await step(page, second, 1000, null)
  }
  await expect(distance(page)).toHaveText('0 m')
  await step(page, 16, 1005, null)
  await expect(distance(page)).toHaveText('5 m')
  await expect(page.locator('.speed-number')).not.toHaveText('240')
})

test('D1: implausible coordinate jump with otherwise valid hardware speed is not accepted later', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await step(page, 1, 1000, 10)
  await expect(distance(page)).toHaveText('0 m')
  await step(page, 2, 1000, 10)
  await expect(distance(page)).toHaveText('0 m')
  await step(page, 3, 1010, 10)
  await expect(distance(page)).toHaveText('10 m')
  await expect(page.locator('.speed-number')).toHaveText('36')
})

for (const accuracy of [4, 5]) {
  test(`E2: 0.5 m/s walk accumulates 8 m in 16 s at accuracy ${accuracy} m`, async ({ page }) => {
    await emit(page, 0, 0, null, accuracy)
    for (let second = 1; second <= 16; second++) {
      await step(page, second, second * 0.5, null, accuracy)
    }
    await expect(distance(page)).toHaveText('8 m')
    await expect(page.locator('.speed-number')).not.toHaveText('--')
  })
}

test('stationary zero-speed GPS jitter adds no distance', async ({ page }) => {
  await emit(page, 0, 0, 0)
  for (let second = 1; second <= 20; second++) {
    await step(page, second, second % 2 === 0 ? 0.8 : -0.8, 0)
  }
  await expect(page.locator('.speed-number')).toHaveText('0')
  await expect(distance(page)).toHaveText('0 m')
})

test('stationary Haversine jitter below accuracy does not accumulate distance', async ({ page }) => {
  await emit(page, 0, 0, null, 5)
  for (let second = 1; second <= 20; second++) {
    await step(page, second, second % 2 === 0 ? 0.8 : -0.8, null, 5)
  }
  await expect(page.locator('.speed-number')).toHaveText('0')
  await expect(distance(page)).toHaveText('0 m')
})

test('normal steady 42 km/h hardware readings keep speed and accumulate travel', async ({ page }) => {
  await emit(page, 0, 0, 42 / 3.6)
  for (let second = 1; second <= 10; second++) {
    await step(page, second, second * (42 / 3.6), 42 / 3.6)
  }
  await expect(page.locator('.speed-number')).toHaveText('42')
  await expect(distance(page)).toHaveText('117 m')
})

test('zero to movement to stop keeps traveled distance without jitter', async ({ page }) => {
  await emit(page, 0, 0, 0)
  await step(page, 1, 5, 5)
  await step(page, 2, 10, 5)
  await step(page, 3, 10, 0)
  await step(page, 4, 11, 0)
  await expect(page.locator('.speed-number')).toHaveText('0')
  await expect(distance(page)).toHaveText('10 m')
})

test('hardware to Haversine source transition keeps distance continuous', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await step(page, 1, 10, null)
  await step(page, 2, 20, null)
  await expect(distance(page)).toHaveText('20 m')
  await expect(page.locator('.speed-number')).toHaveText('36')
})

test('transient GPS outage does not bridge old and distant coordinates', async ({ page }) => {
  await emit(page, 0, 0, 10)
  await step(page, 1, 10, 10)
  await expect(distance(page)).toHaveText('10 m')
  await page.evaluate(() => window.__task3Error?.({
    code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
  }))
  await page.clock.runFor(20000)
  await emit(page, 21, 1000, 10)
  await expect(distance(page)).toHaveText('10 m')
  await step(page, 22, 1010, 10)
  await expect(distance(page)).toHaveText('20 m')
  expect(await page.evaluate(() => window.__task3WatchCount)).toBe(1)
})

