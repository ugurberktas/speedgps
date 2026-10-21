import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __task2Gps?: PositionCallback
    __task2WatchCount?: number
    __task2FullscreenPending?: Array<() => void>
    __task2FullscreenExitCount?: number
    __task2OrientationPending?: Array<() => void>
    __task2OrientationUnlockCount?: number
    __task2OrientationLocked?: boolean
    __task2NativeExit?: () => void
    __task2FinishExit?: () => void
    __task2FullscreenRequestCount?: number
  }
}

async function emitGps(page: Page, timestamp: number, meters: number, speed: number) {
  await page.evaluate(({ timestamp, meters, speed }) => {
    window.__task2Gps?.({
      coords: {
        latitude: meters / 111194.92664455874, longitude: 0, accuracy: 5, speed,
        altitude: null, altitudeAccuracy: null, heading: null, toJSON: () => ({}),
      },
      timestamp,
      toJSON: () => ({}),
    })
  }, { timestamp, meters, speed })
}

test('E3: old first and ordered delayed GPS fixes cannot become current readings', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: (success: PositionCallback) => { window.__task2Gps = success; return 1 },
      clearWatch: () => {},
    } })
  })
  await page.goto('/')
  const now = 1800000000000
  await page.clock.install({ time: new Date(now) })
  await page.getByRole('button', { name: 'Başlat', exact: true }).click()

  await emitGps(page, now - 3600000, 0, 10)
  await expect(page.locator('.speed-number')).toHaveText('--')
  await expect(page.locator('.stat-tile').first().locator('.stat-value')).toContainText('--')
  await expect(page.locator('.stat-tile').nth(2).locator('.stat-value')).toHaveText('0 m')

  await emitGps(page, now - 20000, 100, 10)
  await expect(page.locator('.speed-number')).toHaveText('--')
  await expect(page.locator('.stat-tile').nth(2).locator('.stat-value')).toHaveText('0 m')

  await emitGps(page, now, 0, 10)
  await expect(page.locator('.speed-number')).toHaveText('36')
  await expect(page.locator('.status-pill')).toContainText('GPS Aktif')

  await page.clock.runFor(20000)
  await emitGps(page, now + 1000, 100, 0)
  await expect(page.locator('.speed-number')).toHaveText('--')
  await expect(page.locator('.stat-tile').nth(2).locator('.stat-value')).toHaveText('0 m')

  await emitGps(page, now + 20000, 0, 0)
  await expect(page.locator('.speed-number')).toHaveText('0')
  await expect(page.locator('.status-pill')).toContainText('GPS Aktif')
})

test('E1: late fullscreen completion from A cannot close newer HUD B', async ({ page }) => {
  await page.addInitScript(() => {
    window.__task2WatchCount = 0
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: () => { window.__task2WatchCount!++; return 1 },
      clearWatch: () => {},
    } })

    let fullscreenElement: Element | null = null
    window.__task2FullscreenPending = []
    window.__task2FullscreenExitCount = 0
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
    Element.prototype.requestFullscreen = function () {
      return new Promise<void>((resolve) => {
        window.__task2FullscreenPending!.push(() => {
          fullscreenElement = document.documentElement
          document.dispatchEvent(new Event('fullscreenchange'))
          resolve()
        })
      })
    }
    Document.prototype.exitFullscreen = function () {
      window.__task2FullscreenExitCount!++
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }
    window.__task2NativeExit = () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    }
    Object.defineProperty(screen, 'orientation', { configurable: true, value: {
      lock: () => Promise.resolve(), unlock: () => {},
    } })
  })
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Araç HUD Modunu Aç' })
  const close = page.getByRole('button', { name: 'HUD modundan çık' })
  await open.click()
  await expect(close).toBeVisible()
  await close.click()
  await open.click()
  await expect.poll(() => page.evaluate(() => window.__task2FullscreenPending?.length)).toBe(2)

  await page.evaluate(() => window.__task2FullscreenPending![1]())
  await expect(page.locator('.hud-overlay')).toBeVisible()
  await page.evaluate(() => window.__task2FullscreenPending![0]())
  await expect(page.locator('.hud-overlay')).toBeVisible()
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  expect(await page.evaluate(() => window.__task2FullscreenExitCount)).toBe(0)
  expect(await page.evaluate(() => window.__task2WatchCount)).toBe(1)

  await page.evaluate(() => window.__task2NativeExit?.())
  await expect(page.locator('.hud-overlay')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
  expect(await page.evaluate(() => window.__task2WatchCount)).toBe(1)

  // Yeniden açılan istek de henüz beklerken kapatılırsa geç sonuç açık kalmamalı.
  await open.click()
  await expect.poll(() => page.evaluate(() => window.__task2FullscreenPending?.length)).toBe(3)
  await close.click()
  await page.evaluate(() => window.__task2FullscreenPending![2]())
  await expect(page.locator('.hud-overlay')).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false)
  expect(await page.evaluate(() => window.__task2WatchCount)).toBe(1)
})

test('E1: late orientation completion from A cannot unlock newer HUD B', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: () => 1, clearWatch: () => {},
    } })
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
    Element.prototype.requestFullscreen = function () {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }
    Document.prototype.exitFullscreen = function () {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }
    window.__task2OrientationPending = []
    window.__task2OrientationUnlockCount = 0
    window.__task2OrientationLocked = false
    Object.defineProperty(screen, 'orientation', { configurable: true, value: {
      lock: () => new Promise<void>((resolve) => {
        window.__task2OrientationPending!.push(() => {
          window.__task2OrientationLocked = true
          resolve()
        })
      }),
      unlock: () => {
        window.__task2OrientationUnlockCount!++
        window.__task2OrientationLocked = false
      },
    } })
  })
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Araç HUD Modunu Aç' })
  const close = page.getByRole('button', { name: 'HUD modundan çık' })
  await open.click()
  await expect.poll(() => page.evaluate(() => window.__task2OrientationPending?.length)).toBe(1)
  await close.click()
  await open.click()
  await expect.poll(() => page.evaluate(() => window.__task2OrientationPending?.length)).toBe(2)
  await page.evaluate(() => window.__task2OrientationPending![1]())
  await page.evaluate(() => window.__task2OrientationPending![0]())
  await expect(page.locator('.hud-overlay')).toBeVisible()
  expect(await page.evaluate(() => window.__task2OrientationLocked)).toBe(true)
  expect(await page.evaluate(() => window.__task2OrientationUnlockCount)).toBe(0)

  await close.click()
  expect(await page.evaluate(() => window.__task2OrientationLocked)).toBe(false)

  await open.click()
  await expect.poll(() => page.evaluate(() => window.__task2OrientationPending?.length)).toBe(3)
  await close.click()
  await page.evaluate(() => window.__task2OrientationPending![2]())
  await expect.poll(() => page.evaluate(() => window.__task2OrientationLocked)).toBe(false)
  await expect(page.locator('.hud-overlay')).not.toBeVisible()
})

test('E1: a delayed fullscreen exit finishes before the next HUD requests fullscreen', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: () => 1, clearWatch: () => {},
    } })
    let fullscreenElement: Element | null = null
    window.__task2FullscreenRequestCount = 0
    window.__task2OrientationUnlockCount = 0
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
    Element.prototype.requestFullscreen = function () {
      window.__task2FullscreenRequestCount!++
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }
    Document.prototype.exitFullscreen = function () {
      return new Promise<void>((resolve) => {
        window.__task2FinishExit = () => {
          fullscreenElement = null
          document.dispatchEvent(new Event('fullscreenchange'))
          resolve()
        }
      })
    }
    Object.defineProperty(screen, 'orientation', { configurable: true, value: {
      lock: () => Promise.resolve(),
      unlock: () => { window.__task2OrientationUnlockCount!++ },
    } })
  })
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Araç HUD Modunu Aç' })
  const close = page.getByRole('button', { name: 'HUD modundan çık' })
  await open.click()
  await expect.poll(() => page.evaluate(() => window.__task2FullscreenRequestCount)).toBe(1)
  await close.click()
  await open.click()
  expect(await page.evaluate(() => window.__task2FullscreenRequestCount)).toBe(1)
  await page.evaluate(() => window.__task2FinishExit?.())
  await expect.poll(() => page.evaluate(() => window.__task2FullscreenRequestCount)).toBe(2)
  expect(await page.evaluate(() => window.__task2OrientationUnlockCount)).toBe(1)
  await expect(page.locator('.hud-overlay')).toBeVisible()
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
})
