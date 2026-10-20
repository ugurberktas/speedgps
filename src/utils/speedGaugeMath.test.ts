import { describe, it, expect } from 'vitest'
import {
  calculateGaugeProgress,
  calculateArcLength,
  calculateDashOffset,
  getArcPoint,
  GAUGE_SCALES,
} from './speedGaugeMath'

describe('speedGaugeMath Utilities', () => {
  describe('calculateGaugeProgress', () => {
    it('0 km/sa hızda progress 0 olmalıdır', () => {
      expect(calculateGaugeProgress(0, 'kmh', true)).toBe(0)
    })

    it('null, NaN veya geçersiz durumlarda progress 0 olmalıdır', () => {
      expect(calculateGaugeProgress(null, 'kmh', true)).toBe(0)
      expect(calculateGaugeProgress(NaN, 'kmh', true)).toBe(0)
      expect(calculateGaugeProgress(-10, 'kmh', true)).toBe(0)
      expect(calculateGaugeProgress(60, 'kmh', false)).toBe(0) // isValid = false (stale, paused veya durduruldu)
    })

    it('km/sa biriminde doğru oran hesaplar (0 - 120 km/sa ölçeği)', () => {
      // 60 km/sa -> 50%
      expect(calculateGaugeProgress(60, 'kmh', true)).toBeCloseTo(0.5, 4)
      // 30 km/sa -> 25%
      expect(calculateGaugeProgress(30, 'kmh', true)).toBeCloseTo(0.25, 4)
      // 120 km/sa -> 100%
      expect(calculateGaugeProgress(120, 'kmh', true)).toBe(1)
    })

    it('120 km/sa üzeri hızlarda 1.0 ile sınırlanır (taşma olmaz)', () => {
      expect(calculateGaugeProgress(140, 'kmh', true)).toBe(1)
      expect(calculateGaugeProgress(200, 'kmh', true)).toBe(1)
    })

    it('mph biriminde doğru oran hesaplar (0 - 75 mph ölçeği)', () => {
      // 60 km/sa ≈ 37.28 mph -> 37.28 / 75 ≈ 0.497
      const progressMph = calculateGaugeProgress(60, 'mph', true)
      expect(progressMph).toBeGreaterThan(0.48)
      expect(progressMph).toBeLessThan(0.52)

      // 120 km/sa ≈ 74.56 mph -> ≈ 0.994
      expect(calculateGaugeProgress(120, 'mph', true)).toBeCloseTo(0.994, 2)
    })

    it('m/s biriminde doğru oran hesaplar (0 - 35 m/s ölçeği)', () => {
      // 72 km/sa = 20 m/s -> 20 / 35 ≈ 0.5714
      expect(calculateGaugeProgress(72, 'ms', true)).toBeCloseTo(20 / 35, 3)
    })
  })

  describe('calculateArcLength & calculateDashOffset', () => {
    it('yarım daire yay uzunluğu pi * R olmalıdır', () => {
      const radius = 100
      expect(calculateArcLength(radius)).toBeCloseTo(Math.PI * 100, 4)
    })

    it('progress 0 iken dashOffset yay uzunluğuna eşit olmalıdır (tamamen boş)', () => {
      const arcLength = 314.159
      expect(calculateDashOffset(0, arcLength)).toBe(arcLength)
    })

    it('progress 1 iken dashOffset 0 olmalıdır (tamamen dolu)', () => {
      const arcLength = 314.159
      expect(calculateDashOffset(1, arcLength)).toBe(0)
    })

    it('progress 0.5 iken dashOffset yay uzunluğunun yarısı olmalıdır', () => {
      const arcLength = 314.159
      expect(calculateDashOffset(0.5, arcLength)).toBeCloseTo(arcLength * 0.5, 4)
    })
  })

  describe('getArcPoint', () => {
    it('fraction 0 iken sol uç noktayı (180 derece) vermelidir', () => {
      // cx = 150, cy = 140, R = 100 -> angle π -> x = 150 - 100 = 50, y = 140
      const pt = getArcPoint(150, 140, 100, 0)
      expect(pt.x).toBe(50)
      expect(pt.y).toBe(140)
    })

    it('fraction 0.5 iken tepe noktasını (90 derece) vermelidir', () => {
      // angle π/2 -> x = 150, y = 140 - 100 = 40
      const pt = getArcPoint(150, 140, 100, 0.5)
      expect(pt.x).toBe(150)
      expect(pt.y).toBe(40)
    })

    it('fraction 1 iken sağ uç noktayı (0 derece) vermelidir', () => {
      // angle 0 -> x = 150 + 100 = 250, y = 140
      const pt = getArcPoint(150, 140, 100, 1)
      expect(pt.x).toBe(250)
      expect(pt.y).toBe(140)
    })
  })

  describe('GAUGE_SCALES', () => {
    it('km/sa ölçeği 0, 20, 40, 60, 80, 100, 120 adımlarını içermelidir', () => {
      expect(GAUGE_SCALES.kmh.ticks).toEqual([0, 20, 40, 60, 80, 100, 120])
      expect(GAUGE_SCALES.kmh.max).toBe(120)
    })

    it('m/s ölçeği 0, 10, 20, 30, 35 adımlarını içermelidir', () => {
      expect(GAUGE_SCALES.ms.ticks).toEqual([0, 10, 20, 30, 35])
      expect(GAUGE_SCALES.ms.max).toBe(35)
    })
  })
})
