import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatDistance,
  canSaveMeasurement,
  createSavedMeasurement,
  updateSessionStats,
  resetSessionStats,
  INITIAL_SESSION_STATS,
} from './measurementSession'

describe('measurementSession Utilities', () => {
  describe('canSaveMeasurement', () => {
    it('GPS aktif ve geçerli pozitif hız olduğunda true döner', () => {
      expect(canSaveMeasurement(45, 'aktif')).toBe(true)
      expect(canSaveMeasurement(120.5, 'aktif')).toBe(true)
    })

    it('gerçek 0 km/sa geçerli bir ölçümdür ve kaydedilebilir', () => {
      expect(canSaveMeasurement(0, 'aktif')).toBe(true)
    })

    it('GPS aktif değilse (durduruldu, bekleniyor, hata) kayıt yapılamaz', () => {
      expect(canSaveMeasurement(50, 'durduruldu')).toBe(false)
      expect(canSaveMeasurement(50, 'bekleniyor')).toBe(false)
      expect(canSaveMeasurement(50, 'hata')).toBe(false)
    })

    it('hız verisi null, tanımsız veya negatif olduğunda kayıt yapılamaz', () => {
      expect(canSaveMeasurement(null, 'aktif')).toBe(false)
      expect(canSaveMeasurement(NaN, 'aktif')).toBe(false)
      expect(canSaveMeasurement(-1, 'aktif')).toBe(false)
      expect(canSaveMeasurement(-0.1, 'aktif')).toBe(false)
    })

    it('veri bayat (isStale = true) olduğunda hız pozitif olsa bile kayıt engellenir', () => {
      expect(canSaveMeasurement(50, 'aktif', true)).toBe(false)
      expect(canSaveMeasurement(0, 'aktif', true)).toBe(false)
      expect(canSaveMeasurement(50, 'aktif', false)).toBe(true)
    })
  })

  describe('createSavedMeasurement', () => {
    it('ölçüm numarası, saat ve yuvarlanmış hızı içeren kayıt üretir', () => {
      const fixedDate = new Date(2026, 9, 19, 14, 30, 45)
      const record = createSavedMeasurement(1, 88.42, fixedDate)

      expect(record.id).toBe(1)
      expect(record.time).toBe('14:30:45')
      expect(record.speedKmh).toBe(88.4)
    })
  })

  describe('updateSessionStats', () => {
    it('maksimum ve ortalama hız ile kat edilen mesafeyi doğru biriktirir', () => {
      let stats = INITIAL_SESSION_STATS

      // 1. Örnek: 40 km/sa, 50 metre mesafe
      stats = updateSessionStats(stats, 40, 50)
      expect(stats.maxSpeedKmh).toBe(40)
      expect(stats.avgSpeedKmh).toBe(40)
      expect(stats.distanceMeters).toBe(50)

      // 2. Örnek: 60 km/sa, 100 metre mesafe
      stats = updateSessionStats(stats, 60, 100)
      expect(stats.maxSpeedKmh).toBe(60)
      expect(stats.avgSpeedKmh).toBe(50) // (40 + 60) / 2
      expect(stats.distanceMeters).toBe(150)

      // 3. Örnek: 0 km/sa (araç durdu), 0 metre
      stats = updateSessionStats(stats, 0, 0)
      expect(stats.maxSpeedKmh).toBe(60)
      expect(stats.avgSpeedKmh).toBe(33.3) // (40 + 60 + 0) / 3 = 33.33 -> 33.3
      expect(stats.distanceMeters).toBe(150)
    })

    it('hız null olduğunda sadece mesafeyi günceller, hız ortalamasını bozmaz', () => {
      const stats = updateSessionStats(INITIAL_SESSION_STATS, null, 25)
      expect(stats.maxSpeedKmh).toBeNull()
      expect(stats.avgSpeedKmh).toBeNull()
      expect(stats.distanceMeters).toBe(25)
    })
  })

  describe('resetSessionStats', () => {
    it('oturum istatistiklerini temiz başlangıç durumuna döndürür', () => {
      const stats = updateSessionStats(INITIAL_SESSION_STATS, 80, 500)
      expect(stats.maxSpeedKmh).toBe(80)
      const reset = resetSessionStats()

      expect(reset.maxSpeedKmh).toBeNull()
      expect(reset.avgSpeedKmh).toBeNull()
      expect(reset.distanceMeters).toBe(0)
      expect(reset.speedSamplesCount).toBe(0)
    })
  })

  describe('formatDuration', () => {
    it('saniyeyi MM:SS formatında biçimlendirir', () => {
      expect(formatDuration(0)).toBe('00:00')
      expect(formatDuration(45)).toBe('00:45')
      expect(formatDuration(125)).toBe('02:05')
    })

    it('1 saati aşan süreleri HH:MM:SS formatında biçimlendirir', () => {
      expect(formatDuration(3665)).toBe('01:01:05')
      expect(formatDuration(7200)).toBe('02:00:00')
    })

    it('geçersiz veya negatif sürelerde 00:00 döner', () => {
      expect(formatDuration(-10)).toBe('00:00')
      expect(formatDuration(NaN)).toBe('00:00')
    })
  })

  describe('formatDistance', () => {
    it('1000m altını metre olarak gösterir', () => {
      expect(formatDistance(0)).toBe('0 m')
      expect(formatDistance(450.4)).toBe('450 m')
      expect(formatDistance(999)).toBe('999 m')
    })

    it('1000m ve üzerini km olarak 2 basamakla gösterir', () => {
      expect(formatDistance(1000)).toBe('1.00 km')
      expect(formatDistance(1520)).toBe('1.52 km')
      expect(formatDistance(10450)).toBe('10.45 km')
    })
  })
})
