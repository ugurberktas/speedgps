import { describe, it, expect } from 'vitest'
import {
  getLocationQuality,
  getActiveLocationQuality,
  LOCATION_QUALITY_THRESHOLDS,
} from './locationQuality'

describe('GPS Konum Kalitesi Modülü (Sprint 6 / Adım 2)', () => {
  describe('getLocationQuality', () => {
    it('1. ≤10 m doğruluk için "İyi" (yeşil) seviyesini dönmelidir', () => {
      // Tam sınır (10 m)
      const q10 = getLocationQuality(10)
      expect(q10).toEqual({
        level: 'iyi',
        label: 'İyi',
        accuracyMeters: 10,
      })

      // 10 m altı (ör. 5 m, 2.5 m)
      const q5 = getLocationQuality(5)
      expect(q5?.level).toBe('iyi')
      expect(q5?.label).toBe('İyi')

      const q1 = getLocationQuality(1)
      expect(q1?.level).toBe('iyi')
    })

    it('2. >10 m ile 25 m arası doğruluk için "Orta" (sarı) seviyesini dönmelidir', () => {
      // 10 m hemen üzeri (10.1 m)
      const qJustAbove = getLocationQuality(10.1)
      expect(qJustAbove?.level).toBe('orta')
      expect(qJustAbove?.label).toBe('Orta')

      // 18 m
      const qMid = getLocationQuality(18)
      expect(qMid?.level).toBe('orta')
      expect(qMid?.label).toBe('Orta')

      // Tam sınır (25 m)
      const q25 = getLocationQuality(25)
      expect(q25).toEqual({
        level: 'orta',
        label: 'Orta',
        accuracyMeters: 25,
      })
    })

    it('3. >25 m doğruluk için "Zayıf" (kırmızı) seviyesini dönmelidir', () => {
      // 25 m hemen üzeri (25.1 m)
      const qJustAbove25 = getLocationQuality(25.1)
      expect(qJustAbove25?.level).toBe('zayif')
      expect(qJustAbove25?.label).toBe('Zayıf')

      // 50 m
      const q50 = getLocationQuality(50)
      expect(q50?.level).toBe('zayif')

      // 95 m
      const q95 = getLocationQuality(95)
      expect(q95?.level).toBe('zayif')
      expect(q95?.accuracyMeters).toBe(95)
    })

    it('4. accuracy=0 geçerli bir doğruluk değeridir ve "İyi" (±0m) dönmelidir', () => {
      const q0 = getLocationQuality(0)
      expect(q0).toEqual({
        level: 'iyi',
        label: 'İyi',
        accuracyMeters: 0,
      })
    })

    it('5. Geçersiz, negatif veya eksik doğruluk verilerinde null dönmelidir', () => {
      expect(getLocationQuality(null)).toBeNull()
      expect(getLocationQuality(undefined)).toBeNull()
      expect(getLocationQuality(-5)).toBeNull()
      expect(getLocationQuality(Number.NaN)).toBeNull()
      expect(getLocationQuality(Number.POSITIVE_INFINITY)).toBeNull()
    })

    it('5. Eşik sabitleri doğru tanımlanmış olmalıdır', () => {
      expect(LOCATION_QUALITY_THRESHOLDS.GOOD_ACCURACY_METERS).toBe(10)
      expect(LOCATION_QUALITY_THRESHOLDS.MODERATE_ACCURACY_METERS).toBe(25)
    })
  })

  describe('getActiveLocationQuality', () => {
    it('6. GPS aktif ve veri taze olduğunda kalite bilgisini dönmelidir', () => {
      const result = getActiveLocationQuality(8, 'aktif', false)
      expect(result).not.toBeNull()
      expect(result?.level).toBe('iyi')
      expect(result?.label).toBe('İyi')
    })

    it('7. GPS kapalıyken (durduruldu) eski kalite aktifmiş gibi gösterilmemeli (null dönmeli)', () => {
      const result = getActiveLocationQuality(5, 'durduruldu', false)
      expect(result).toBeNull()
    })

    it('8. GPS sinyal ararken (bekleniyor) veya hata durumundayken null dönmelidir', () => {
      expect(getActiveLocationQuality(5, 'bekleniyor', false)).toBeNull()
      expect(getActiveLocationQuality(5, 'hata', false)).toBeNull()
    })

    it('9. GPS verisi bayatladığında (isStale = true) eski kalite aktifmiş gibi gösterilmemelidir', () => {
      // 5 metre çok iyi bir doğruluk olsa bile veri bayatsa (stale) gösterilmemelidir
      const result = getActiveLocationQuality(5, 'aktif', true)
      expect(result).toBeNull()
    })

    it('10. GPS aktif ve accuracy=0 olduğunda İyi kalite rozeti dönmeli; geçersiz değerlerde null dönmelidir', () => {
      expect(getActiveLocationQuality(0, 'aktif', false)).toEqual({
        level: 'iyi',
        label: 'İyi',
        accuracyMeters: 0,
      })
      expect(getActiveLocationQuality(null, 'aktif', false)).toBeNull()
      expect(getActiveLocationQuality(-5, 'aktif', false)).toBeNull()
      expect(getActiveLocationQuality(NaN, 'aktif', false)).toBeNull()
    })
  })
})
