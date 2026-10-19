import { describe, it, expect } from 'vitest'
import {
  convertSpeedFromKmh,
  formatSpeedValue,
  getSpeedUnitLabel,
  calculatePaceSecondsFromKmh,
  formatPaceFromKmh,
  SPEED_UNITS,
} from './speedUnits'
import { formatHistorySummary } from './measurementSession'

describe('speedUnits Utilities', () => {
  describe('convertSpeedFromKmh', () => {
    it('km/sa biriminde değeri olduğu gibi korur', () => {
      expect(convertSpeedFromKmh(100, 'kmh')).toBe(100)
      expect(convertSpeedFromKmh(0, 'kmh')).toBe(0)
    })

    it('1 km/sa = 0.621371 mph doğruluğu ile mph dönüşümü yapar', () => {
      const speedKmh = 100
      const mph = convertSpeedFromKmh(speedKmh, 'mph')
      expect(mph).toBeCloseTo(62.1371, 4)
    })

    it('1 km/sa = 1/3.6 m/s doğruluğu ile m/s dönüşümü yapar', () => {
      // 36 km/sa = 10 m/s
      expect(convertSpeedFromKmh(36, 'ms')).toBeCloseTo(10.0, 5)
      // 72 km/sa = 20 m/s
      expect(convertSpeedFromKmh(72, 'ms')).toBeCloseTo(20.0, 5)
    })

    it('gerçek 0 km/sa değeri tüm birimlerde tam olarak 0 döner', () => {
      expect(convertSpeedFromKmh(0, 'kmh')).toBe(0)
      expect(convertSpeedFromKmh(0, 'mph')).toBe(0)
      expect(convertSpeedFromKmh(0, 'ms')).toBe(0)
    })

    it('null ve geçersiz hızlar için null döner', () => {
      expect(convertSpeedFromKmh(null, 'kmh')).toBeNull()
      expect(convertSpeedFromKmh(null, 'mph')).toBeNull()
      expect(convertSpeedFromKmh(null, 'ms')).toBeNull()
      expect(convertSpeedFromKmh(NaN, 'kmh')).toBeNull()
    })
  })

  describe('formatSpeedValue', () => {
    it('belirtilen basamak sayısına göre yuvarlayıp string döner', () => {
      // 100 km/sa = 62.1371 mph
      expect(formatSpeedValue(100, 'mph', 0)).toBe('62')
      expect(formatSpeedValue(100, 'mph', 1)).toBe('62.1')
      // 36 km/sa = 10 m/s
      expect(formatSpeedValue(36, 'ms', 0)).toBe('10')
      expect(formatSpeedValue(36, 'ms', 1)).toBe('10.0')
      // 0 km/sa
      expect(formatSpeedValue(0, 'kmh', 0)).toBe('0')
    })

    it('geçersiz veya null hızlar için "--" döner', () => {
      expect(formatSpeedValue(null, 'kmh', 0)).toBe('--')
      expect(formatSpeedValue(null, 'mph', 1)).toBe('--')
      expect(formatSpeedValue(null, 'ms', 0)).toBe('--')
    })
  })

  describe('getSpeedUnitLabel', () => {
    it('birim etiketlerini doğru sembollerle döner', () => {
      expect(getSpeedUnitLabel('kmh')).toBe('km/sa')
      expect(getSpeedUnitLabel('mph')).toBe('mph')
      expect(getSpeedUnitLabel('ms')).toBe('m/s')
    })
  })

  describe('formatHistorySummary with SpeedUnit conversion', () => {
    it('seçili birim katsayısıyla kopyalama özetini doğru biçimlendirir', () => {
      const items = [
        { id: 1, time: '14:30:00', speedKmh: 36.0 }, // 10 m/s veya ~22.4 mph
      ]

      // kmh
      const summaryKmh = formatHistorySummary(items, {
        unitLabel: SPEED_UNITS.kmh.unitLabel,
        convertFn: (v) => convertSpeedFromKmh(v, 'kmh') ?? v,
      })
      expect(summaryKmh).toContain('36.0 km/sa')

      // m/s
      const summaryMs = formatHistorySummary(items, {
        unitLabel: SPEED_UNITS.ms.unitLabel,
        convertFn: (v) => convertSpeedFromKmh(v, 'ms') ?? v,
      })
      expect(summaryMs).toContain('10.0 m/s')

      // mph (36 * 0.621371 = 22.369 -> 22.4)
      const summaryMph = formatHistorySummary(items, {
        unitLabel: SPEED_UNITS.mph.unitLabel,
        convertFn: (v) => convertSpeedFromKmh(v, 'mph') ?? v,
      })
      expect(summaryMph).toContain('22.4 mph')
    })
  })

  describe('Pace (Tempo) Calculations', () => {
    it('doğru min/km tempo değerleri üretir', () => {
      // 5 km/sa -> 12:00 min/km (3600 / 5 = 720 sn = 12 dk)
      expect(formatPaceFromKmh(5)).toBe('12:00')

      // 10 km/sa -> 6:00 min/km (3600 / 10 = 360 sn = 6 dk)
      expect(formatPaceFromKmh(10)).toBe('6:00')

      // 12 km/sa -> 5:00 min/km (3600 / 12 = 300 sn = 5 dk)
      expect(formatPaceFromKmh(12)).toBe('5:00')

      // 6 km/sa -> 10:00 min/km
      expect(formatPaceFromKmh(6)).toBe('10:00')

      // 8.5 km/sa -> 3600 / 8.5 = 423.52 -> 424 sn = 7 dk 04 sn -> '7:04'
      expect(formatPaceFromKmh(8.5)).toBe('7:04')
    })

    it('sıfır, negatif veya geçersiz hızlarda sıfıra bölme hatası oluşturmaz ve "--:--" döner', () => {
      expect(formatPaceFromKmh(0)).toBe('--:--')
      expect(formatPaceFromKmh(null)).toBe('--:--')
      expect(formatPaceFromKmh(NaN)).toBe('--:--')
      expect(formatPaceFromKmh(-5)).toBe('--:--')
      expect(formatPaceFromKmh(0.2)).toBe('--:--') // Durma eşiği altı
    })

    it('calculatePaceSecondsFromKmh saniye cinsinden doğru süre döner', () => {
      expect(calculatePaceSecondsFromKmh(10)).toBe(360)
      expect(calculatePaceSecondsFromKmh(0)).toBeNull()
      expect(calculatePaceSecondsFromKmh(null)).toBeNull()
    })
  })
})
