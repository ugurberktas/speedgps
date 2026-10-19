import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WakeLockManager } from './wakeLock'

describe('WakeLockManager (Sprint 6 / Adım 1)', () => {
  let originalNavigator: unknown
  let originalDocument: unknown

  type Listener = () => void

  class MockDocument {
    public visibilityState: 'visible' | 'hidden' = 'visible'
    private listeners: Record<string, Listener[]> = {}

    public addEventListener(event: string, callback: Listener) {
      if (!this.listeners[event]) {
        this.listeners[event] = []
      }
      this.listeners[event].push(callback)
    }

    public removeEventListener(event: string, callback: Listener) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback)
      }
    }

    public dispatchEvent(_event?: unknown): boolean {
      if (this.listeners['visibilitychange']) {
        this.listeners['visibilitychange'].forEach((cb) => cb())
      }
      return true
    }
  }

  class MockWakeLockSentinel {
    public released: boolean = false
    public type: string = 'screen'
    private listeners: Record<string, Listener[]> = {}

    public addEventListener(event: string, callback: Listener) {
      if (!this.listeners[event]) {
        this.listeners[event] = []
      }
      this.listeners[event].push(callback)
    }

    public removeEventListener(event: string, callback: Listener) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback)
      }
    }

    public async release(): Promise<void> {
      this.released = true
      if (this.listeners['release']) {
        this.listeners['release'].forEach((cb) => cb())
      }
    }

    // Test yardımcı metodu: Tarayıcının/sistemin kilidi arka planda serbest bırakmasını simüle eder
    public simulateSystemRelease() {
      this.released = true
      if (this.listeners['release']) {
        this.listeners['release'].forEach((cb) => cb())
      }
    }
  }

  let mockDoc: MockDocument

  beforeEach(() => {
    originalNavigator = globalThis.navigator
    originalDocument = (globalThis as unknown as { document?: unknown }).document

    mockDoc = new MockDocument()
    Object.defineProperty(globalThis, 'document', {
      value: mockDoc,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    })
  })

  it('1. Tarayıcı desteğini doğru tespit etmelidir', () => {
    const manager = new WakeLockManager()

    // Desteklenmeyen durum: wakeLock özelliği yok
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })
    expect(manager.isSupported()).toBe(false)

    // Desteklenen durum: wakeLock.request mevcut
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: {
          request: vi.fn(),
        },
      },
      configurable: true,
      writable: true,
    })
    expect(manager.isSupported()).toBe(true)
  })

  it('2. Başlat ile Wake Lock talep edilmeli ve aktif hâle gelmelidir', async () => {
    const sentinel = new MockWakeLockSentinel()
    const requestMock = vi.fn().mockResolvedValue(sentinel)

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()
    expect(manager.isActive()).toBe(false)

    const result = await manager.requestLock()

    expect(result).toBe(true)
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock).toHaveBeenCalledWith('screen')
    expect(manager.isActive()).toBe(true)
  })

  it('3. Durdur ile Wake Lock serbest bırakılmalıdır (release)', async () => {
    const sentinel = new MockWakeLockSentinel()
    const releaseSpy = vi.spyOn(sentinel, 'release')
    const requestMock = vi.fn().mockResolvedValue(sentinel)

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()
    await manager.requestLock()
    expect(manager.isActive()).toBe(true)

    await manager.releaseLock()

    expect(releaseSpy).toHaveBeenCalledTimes(1)
    expect(manager.isActive()).toBe(false)
  })

  it('4. Tarayıcı API desteklemediğinde çökmemeli ve false dönmelidir', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()
    expect(manager.isSupported()).toBe(false)

    const result = await manager.requestLock()
    expect(result).toBe(false)
    expect(manager.isActive()).toBe(false)

    // releaseLock da hata fırlatmamalıdır
    await expect(manager.releaseLock()).resolves.toBeUndefined()
  })

  it('5. İstek reddedildiğinde (NotAllowedError / izin yok) uygulama çökmemelidir', async () => {
    const requestMock = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()
    const result = await manager.requestLock()

    expect(result).toBe(false)
    expect(manager.isActive()).toBe(false)
  })

  it('6. Tekrarlanan Başlat işlemlerinde gereksiz mükerrer istek oluşturmamalıdır', async () => {
    const sentinel = new MockWakeLockSentinel()
    const requestMock = vi.fn().mockResolvedValue(sentinel)

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()

    await manager.requestLock()
    expect(requestMock).toHaveBeenCalledTimes(1)

    // Zaten aktifken ikinci kez çağrıldığında tekrar navigator.wakeLock.request çağrılmamalıdır
    const secondCall = await manager.requestLock()
    expect(secondCall).toBe(true)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('7. Sayfa arka plana geçtiğinde kilit bırakılmalı, tekrar görünür olduğunda ve ölçüm aktifse yeniden talep edilmelidir', async () => {
    let currentSentinel = new MockWakeLockSentinel()
    const requestMock = vi.fn().mockImplementation(async () => {
      currentSentinel = new MockWakeLockSentinel()
      return currentSentinel
    })

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()
    let isTracking = true

    manager.initVisibilityListener(() => isTracking)

    // İlk başlatma
    await manager.requestLock()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(manager.isActive()).toBe(true)

    // Sayfa arka plana geçiyor (tarayıcı sentineli otomatik release eder)
    mockDoc.visibilityState = 'hidden'
    currentSentinel.simulateSystemRelease()
    expect(manager.isActive()).toBe(false)

    // Sayfa yeniden görünür oluyor (ölçüm hâlâ aktif)
    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent()

    // Asenkron istek için microtask kuyruğunu bekle
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(requestMock).toHaveBeenCalledTimes(2)
    expect(manager.isActive()).toBe(true)

    // Ölçüm durdurulmuşken sayfa tekrar görünür olursa talep EDİLMEMELİDİR
    isTracking = false
    currentSentinel.simulateSystemRelease()

    mockDoc.dispatchEvent()
    await new Promise((resolve) => setTimeout(resolve, 10))

    // requestMock çağrı sayısı artmamalıdır (hâlâ 2)
    expect(requestMock).toHaveBeenCalledTimes(2)
    expect(manager.isActive()).toBe(false)
  })

  it('8. Hızlı Başlat/Durdur yarış durumunda bekleyen asenkron istek kilidi açık bırakmamalıdır', async () => {
    let resolveRequestPromise!: (val: MockWakeLockSentinel) => void
    const pendingPromise = new Promise<MockWakeLockSentinel>((resolve) => {
      resolveRequestPromise = resolve
    })

    const sentinel = new MockWakeLockSentinel()
    const releaseSpy = vi.spyOn(sentinel, 'release')
    const requestMock = vi.fn().mockReturnValue(pendingPromise)

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()

    // 1. Kullanıcı Başlat'a bastı (istek asenkron bekliyor)
    const requestPromise = manager.requestLock()
    expect(manager.isActive()).toBe(false)

    // 2. Kullanıcı hemen Durdur'a bastı (henüz promise çözülmedi)
    await manager.releaseLock()

    // 3. Tarayıcının wakeLock isteği daha sonra çözüldü
    resolveRequestPromise(sentinel)
    const result = await requestPromise

    // Sentinel hemen otomatik olarak serbest bırakılmalı ve kilit kapalı kalmalıdır
    expect(result).toBe(false)
    expect(releaseSpy).toHaveBeenCalledTimes(1)
    expect(manager.isActive()).toBe(false)
  })

  it('9. Bileşen kapatıldığında (destroy) listener kaldırılmalı ve kilit temizlenmelidir', async () => {
    const sentinel = new MockWakeLockSentinel()
    const releaseSpy = vi.spyOn(sentinel, 'release')
    const requestMock = vi.fn().mockResolvedValue(sentinel)

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: requestMock },
      },
      configurable: true,
      writable: true,
    })

    const manager = new WakeLockManager()
    let isTracking = true
    manager.initVisibilityListener(() => isTracking)

    await manager.requestLock()
    expect(manager.isActive()).toBe(true)

    // destroy çağrısı
    manager.destroy()

    expect(releaseSpy).toHaveBeenCalledTimes(1)
    expect(manager.isActive()).toBe(false)

    // destroy sonrası visibilitychange tetiklendiğinde tekrar talep OLMAMALIDIR
    mockDoc.dispatchEvent()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(requestMock).toHaveBeenCalledTimes(1)
  })
})
