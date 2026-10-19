import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GpsDebugLogger, GPS_DEBUG_CONFIG } from './gpsDebugLogger'

describe('GpsDebugLogger Modülü (Sprint 6.4 / Adım 1)', () => {
  let logger: GpsDebugLogger

  beforeEach(() => {
    logger = new GpsDebugLogger(true) // Test için açık olarak başlat
  })

  afterEach(() => {
    logger.clear()
    vi.restoreAllMocks()
  })

  it('1. GPS örneğini tüm meta verileriyle (lat, lon, accuracy, speed, heading, altitude, source, status, reason) kaydetmelidir', () => {
    logger.logSample({
      timestamp: 1700000000000,
      latitude: 41.0082,
      longitude: 28.9784,
      accuracy: 8.5,
      speed: 12.5,
      speedKmh: 45.0,
      heading: 180,
      altitude: 120.4,
      source: 'gps',
      status: 'accepted',
      reason: 'Valid GPS fix',
    })

    expect(logger.getSampleCount()).toBe(1)
    const sample = logger.getLatestSample()
    expect(sample).not.toBeNull()
    expect(sample?.id).toBe(1)
    expect(sample?.latitude).toBe(41.0082)
    expect(sample?.longitude).toBe(28.9784)
    expect(sample?.accuracy).toBe(8.5)
    expect(sample?.speed).toBe(12.5)
    expect(sample?.speedKmh).toBe(45.0)
    expect(sample?.heading).toBe(180)
    expect(sample?.altitude).toBe(120.4)
    expect(sample?.source).toBe('gps')
    expect(sample?.status).toBe('accepted')
    expect(sample?.reason).toBe('Valid GPS fix')
    expect(sample?.isoTime).toBe(new Date(1700000000000).toISOString())
  })

  it('2. Reddedilen GPS örneklerini ve ret gerekçesini doğru kaydetmelidir', () => {
    logger.logSample({
      timestamp: 1700000001000,
      latitude: 41.0083,
      longitude: 28.9785,
      accuracy: 65, // Zayıf doğruluk
      speed: null,
      speedKmh: null,
      heading: null,
      altitude: null,
      source: 'none',
      status: 'rejected',
      reason: 'Accuracy 65m exceeds threshold 25m for Haversine speed',
    })

    const sample = logger.getLatestSample()
    expect(sample?.status).toBe('rejected')
    expect(sample?.reason).toContain('Accuracy 65m')
    expect(sample?.source).toBe('none')
    expect(sample?.speedKmh).toBeNull()
  })

  it('3. Bellekteki kayıtlar MAX_SAMPLES sınırını aşmamalı, en eskileri silmelidir', () => {
    const max = GPS_DEBUG_CONFIG.MAX_SAMPLES

    // max + 50 adet kayıt ekle
    for (let i = 1; i <= max + 50; i++) {
      logger.logSample({
        timestamp: 1000 + i,
        latitude: 41.0,
        longitude: 28.0,
        accuracy: 5,
        speed: i,
        speedKmh: i * 3.6,
        heading: 0,
        altitude: 10,
        source: 'gps',
        status: 'accepted',
      })
    }

    expect(logger.getSampleCount()).toBe(max)
    const samples = logger.getSamples()
    // İlk örnek (silinmeyen en eski) id'si 51 olmalı (1..50 silindi)
    expect(samples[0].id).toBe(51)
    // Son örnek id'si max + 50 olmalı
    expect(samples[samples.length - 1].id).toBe(max + 50)
  })

  it('4. clear() fonksiyonu tüm kayıtları temizlemeli ve sayacı sıfırlamalıdır', () => {
    logger.logSample({
      timestamp: 1000,
      latitude: 41.0,
      longitude: 28.0,
      accuracy: 5,
      speed: 10,
      speedKmh: 36,
      heading: null,
      altitude: null,
      source: 'gps',
      status: 'accepted',
    })
    expect(logger.getSampleCount()).toBe(1)

    logger.clear()
    expect(logger.getSampleCount()).toBe(0)
    expect(logger.getLatestSample()).toBeNull()
  })

  it('5. exportJson() geçerli ve biçimlendirilmiş bir JSON metni üretmelidir', () => {
    logger.logSample({
      timestamp: 1700000000000,
      latitude: 41.0082,
      longitude: 28.9784,
      accuracy: 10,
      speed: 5,
      speedKmh: 18,
      heading: 90,
      altitude: 50,
      source: 'gps',
      status: 'accepted',
    })

    const json = logger.exportJson()
    const parsed = JSON.parse(json)

    expect(parsed.totalSamples).toBe(1)
    expect(parsed.samples).toHaveLength(1)
    expect(parsed.samples[0].latitude).toBe(41.0082)
    expect(parsed.exportedAt).toBeDefined()
  })

  it('6. downloadJson() tarayıcı ortamında Blob oluşturup indirme tetiklemelidir', () => {
    logger.logSample({
      timestamp: 1000,
      latitude: 41.0,
      longitude: 28.0,
      accuracy: 5,
      speed: 10,
      speedKmh: 36,
      heading: null,
      altitude: null,
      source: 'gps',
      status: 'accepted',
    })

    // DOM mock
    const clickMock = vi.fn()
    const appendChildMock = vi.fn()
    const removeChildMock = vi.fn()
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()

    const mockAnchor = {
      href: '',
      download: '',
      click: clickMock,
    }

    const mockDoc = {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
    }

    const originalDoc = (globalThis as unknown as { document?: unknown }).document
    const originalWin = (globalThis as unknown as { window?: unknown }).window
    const originalURL = globalThis.URL

    Object.defineProperty(globalThis, 'document', {
      value: mockDoc,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    })
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    })

    try {
      const result = logger.downloadJson('test.json')

      expect(result).toBe(true)
      expect(mockAnchor.download).toBe('test.json')
      expect(mockAnchor.href).toBe('blob:mock-url')
      expect(clickMock).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')
    } finally {
      Object.defineProperty(globalThis, 'document', {
        value: originalDoc,
        configurable: true,
        writable: true,
      })
      Object.defineProperty(globalThis, 'window', {
        value: originalWin,
        configurable: true,
        writable: true,
      })
      globalThis.URL = originalURL
    }
  })

  it('7. Production modunda (enabled: false) hiçbir kayıt tutulmamalı (sıfır ek yük)', () => {
    const prodLogger = new GpsDebugLogger(false) // Devre dışı
    expect(prodLogger.isEnabled()).toBe(false)

    prodLogger.logSample({
      timestamp: 1000,
      latitude: 41.0,
      longitude: 28.0,
      accuracy: 5,
      speed: 10,
      speedKmh: 36,
      heading: 0,
      altitude: 0,
      source: 'gps',
      status: 'accepted',
    })

    expect(prodLogger.getSampleCount()).toBe(0)
    expect(prodLogger.getSamples()).toEqual([])
    expect(prodLogger.getLatestSample()).toBeNull()
  })
})
