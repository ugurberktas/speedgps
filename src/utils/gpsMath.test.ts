import { describe, it, expect } from 'vitest'
import {
  calculateHaversineDistance,
  calculateSpeedMs,
  msToKmh,
  calculateSpeedBetweenPoints,
  isValidCoordinate,
  type Coordinates,
  type GpsPoint,
} from './gpsMath'

describe('gpsMath Utility Functions', () => {
  describe('isValidCoordinate', () => {
    it('geçerli enlem ve boylam çiftini doğrular', () => {
      expect(isValidCoordinate({ latitude: 41.0082, longitude: 28.9784 })).toBe(true)
      expect(isValidCoordinate({ latitude: 0, longitude: 0 })).toBe(true)
      expect(isValidCoordinate({ latitude: -90, longitude: 180 })).toBe(true)
      expect(isValidCoordinate({ latitude: 90, longitude: -180 })).toBe(true)
    })

    it('sınırları aşan veya geçersiz koordinatları reddeder', () => {
      expect(isValidCoordinate({ latitude: 90.1, longitude: 28.0 })).toBe(false)
      expect(isValidCoordinate({ latitude: -91, longitude: 28.0 })).toBe(false)
      expect(isValidCoordinate({ latitude: 41.0, longitude: 180.1 })).toBe(false)
      expect(isValidCoordinate({ latitude: 41.0, longitude: -181 })).toBe(false)
      expect(isValidCoordinate({ latitude: NaN, longitude: 28.0 })).toBe(false)
      expect(isValidCoordinate({ latitude: 41.0, longitude: Infinity })).toBe(false)
      expect(isValidCoordinate(null)).toBe(false)
      expect(isValidCoordinate(undefined)).toBe(false)
      expect(isValidCoordinate({} as unknown as Coordinates)).toBe(false)
    })
  })

  describe('calculateHaversineDistance', () => {
    it('aynı koordinat verildiğinde tam 0 metre döner', () => {
      const coord = { latitude: 41.0082, longitude: 28.9784 }
      expect(calculateHaversineDistance(coord, coord)).toBe(0)

      const identical = { latitude: 41.0082, longitude: 28.9784 }
      expect(calculateHaversineDistance(coord, identical)).toBe(0)
    })

    it('bilinen iki coğrafi nokta arasındaki mesafeyi doğru hesaplar', () => {
      // İstanbul Ayasofya (41.0086, 28.9802) ve Taksim Meydanı (41.0370, 28.9858)
      // Bilinen mesafe: ~3180m (3.18 km)
      const ayasofya: Coordinates = { latitude: 41.0086, longitude: 28.9802 }
      const taksim: Coordinates = { latitude: 41.0370, longitude: 28.9858 }

      const distance = calculateHaversineDistance(ayasofya, taksim)
      expect(distance).not.toBeNull()
      // Yaklaşık 3180m ± 30m tolerans
      expect(distance).toBeGreaterThan(3150)
      expect(distance).toBeLessThan(3210)
    })

    it('ekvatorda 1 derecelik boylam mesafesini (~111.19 km) doğru hesaplar', () => {
      const p1: Coordinates = { latitude: 0, longitude: 0 }
      const p2: Coordinates = { latitude: 0, longitude: 1 }

      const distance = calculateHaversineDistance(p1, p2)
      expect(distance).not.toBeNull()
      // 111,195 metre civarı
      expect(Math.round(distance!)).toBe(111195)
    })

    it('geçersiz veya eksik girdilerde null döner', () => {
      expect(calculateHaversineDistance(null, { latitude: 41, longitude: 28 })).toBeNull()
      expect(calculateHaversineDistance({ latitude: 41, longitude: 28 }, undefined)).toBeNull()
      expect(
        calculateHaversineDistance(
          { latitude: 100, longitude: 28 },
          { latitude: 41, longitude: 28 }
        )
      ).toBeNull()
      expect(
        calculateHaversineDistance(
          { latitude: 41, longitude: 28 },
          { latitude: NaN, longitude: 28 }
        )
      ).toBeNull()
    })
  })

  describe('calculateSpeedMs', () => {
    it('geçerli mesafe ve zaman farkından m/s cinsinden hızı doğru hesaplar', () => {
      // 100 metre / 10 saniye (10000 ms) = 10 m/s
      expect(calculateSpeedMs(100, 10000)).toBe(10)
      // 50 metre / 2 saniye (2000 ms) = 25 m/s
      expect(calculateSpeedMs(50, 2000)).toBe(25)
      // 0 metre / 5 saniye (5000 ms) = 0 m/s (duruyor)
      expect(calculateSpeedMs(0, 5000)).toBe(0)
    })

    it('sıfır veya negatif zaman farklarında null döner', () => {
      expect(calculateSpeedMs(100, 0)).toBeNull()
      expect(calculateSpeedMs(100, -1000)).toBeNull()
    })

    it('negatif veya geçersiz mesafelerde null döner', () => {
      expect(calculateSpeedMs(-10, 1000)).toBeNull()
      expect(calculateSpeedMs(NaN, 1000)).toBeNull()
      expect(calculateSpeedMs(Infinity, 1000)).toBeNull()
    })

    it('null veya undefined girdilerde sahte değer üretmez, null döner', () => {
      expect(calculateSpeedMs(null, 1000)).toBeNull()
      expect(calculateSpeedMs(100, null)).toBeNull()
      expect(calculateSpeedMs(undefined, undefined)).toBeNull()
      expect(calculateSpeedMs(100, NaN)).toBeNull()
    })
  })

  describe('msToKmh', () => {
    it('m/s hızını km/sa hızına doğru dönüştürür (1 m/s = 3.6 km/sa)', () => {
      expect(msToKmh(10)).toBe(36)
      expect(msToKmh(25)).toBe(90)
      expect(msToKmh(0)).toBe(0)
      // 27.7777 m/s ≈ 100 km/sa
      expect(Math.round(msToKmh(27.7777778)!)).toBe(100)
    })

    it('negatif hız, NaN, null veya tanımsız değerlerde null döner', () => {
      expect(msToKmh(-5)).toBeNull()
      expect(msToKmh(NaN)).toBeNull()
      expect(msToKmh(Infinity)).toBeNull()
      expect(msToKmh(null)).toBeNull()
      expect(msToKmh(undefined)).toBeNull()
    })
  })

  describe('calculateSpeedBetweenPoints', () => {
    it('iki GPS noktası arasındaki m/s hızını doğru hesaplar', () => {
      // Ekvatorda 1 derecelik boylam (~111195 m), 3600 saniye (1 saat = 3,600,000 ms)
      // Hız = ~30.8875 m/s
      const p1: GpsPoint = { latitude: 0, longitude: 0, timestamp: 1000000 }
      const p2: GpsPoint = { latitude: 0, longitude: 1, timestamp: 4600000 }

      const speed = calculateSpeedBetweenPoints(p1, p2)
      expect(speed).not.toBeNull()
      expect(Math.round(speed! * 10) / 10).toBe(30.9)
    })

    it('zaman damgası ileri gitmemişse veya aynıysa null döner', () => {
      const p1: GpsPoint = { latitude: 41, longitude: 28, timestamp: 2000 }
      const p2: GpsPoint = { latitude: 41.01, longitude: 28.01, timestamp: 2000 }
      expect(calculateSpeedBetweenPoints(p1, p2)).toBeNull()

      const p3: GpsPoint = { latitude: 41.01, longitude: 28.01, timestamp: 1000 }
      expect(calculateSpeedBetweenPoints(p1, p3)).toBeNull()
    })

    it('geçersiz nokta veya eksik verilerde null döner', () => {
      expect(calculateSpeedBetweenPoints(null, null)).toBeNull()
      expect(
        calculateSpeedBetweenPoints(
          { latitude: 41, longitude: 28, timestamp: 1000 },
          { latitude: 95, longitude: 28, timestamp: 2000 }
        )
      ).toBeNull()
      expect(
        calculateSpeedBetweenPoints(
          { latitude: 41, longitude: 28, timestamp: NaN },
          { latitude: 41.01, longitude: 28.01, timestamp: 2000 }
        )
      ).toBeNull()
    })
  })
})
