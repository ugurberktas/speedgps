import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatDistance,
  canSaveMeasurement,
  createSavedMeasurement,
  updateSessionStats,
  resetSessionStats,
  formatHistorySummary,
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

  describe('Dururken Ölçüm Başlatma ve 0 km/sa Senaryoları', () => {
    it('1. Dururken 0 km/sa: Geçerli 0 değeri Yeni Ölçüm ile kaydedilebilir ve falsy olarak reddedilmez', () => {
      const speedKmh = 0
      const gpsStatus = 'aktif'
      const isStale = false

      // canSaveMeasurement 0 değerini geçerli kabul etmelidir
      expect(canSaveMeasurement(speedKmh, gpsStatus, isStale)).toBe(true)

      // createSavedMeasurement 0 değerini hatasız nesneye dönüştürür
      const record = createSavedMeasurement(1, speedKmh)
      expect(record.id).toBe(1)
      expect(record.speedKmh).toBe(0)

      // updateSessionStats 0 değerini istatistiklere işler
      const stats = updateSessionStats(INITIAL_SESSION_STATS, 0, 0)
      expect(stats.maxSpeedKmh).toBe(0)
      expect(stats.avgSpeedKmh).toBe(0)
      expect(stats.distanceMeters).toBe(0)
      expect(stats.speedSamplesCount).toBe(1)
    })

    it('2. Hareket hâlinde geçerli hız: Araç ve yürüyüş hızları Yeni Ölçüm ile kaydedilir', () => {
      // 54 km/sa araç hızı
      expect(canSaveMeasurement(54, 'aktif', false)).toBe(true)
      const recordCar = createSavedMeasurement(1, 54)
      expect(recordCar.speedKmh).toBe(54)

      // 1.8 km/sa yavaş yürüyüş hızı
      expect(canSaveMeasurement(1.8, 'aktif', false)).toBe(true)
      const recordWalk = createSavedMeasurement(2, 1.8)
      expect(recordWalk.speedKmh).toBe(1.8)
    })

    it('3. GPS verisi yok / bayat / geçersiz: Asla 0 olarak kaydedilmez, canSaveMeasurement reddeder', () => {
      // GPS hız verisi null (ilk konum alınıyor veya sinyal yok)
      expect(canSaveMeasurement(null, 'aktif', false)).toBe(false)

      // GPS verisi bayatlamış (tünel, sinyal kaybı)
      expect(canSaveMeasurement(0, 'aktif', true)).toBe(false)
      expect(canSaveMeasurement(50, 'aktif', true)).toBe(false)

      // GPS henüz aranıyor veya durdurulmuş
      expect(canSaveMeasurement(0, 'bekleniyor', false)).toBe(false)
      expect(canSaveMeasurement(0, 'durduruldu', false)).toBe(false)

      // Geçersiz değerler (NaN, negatif)
      expect(canSaveMeasurement(NaN, 'aktif', false)).toBe(false)
      expect(canSaveMeasurement(-1, 'aktif', false)).toBe(false)
    })

    it('4. Yeni Ölçüm sonrası oturum sıfırlama: İstatistikler sıfırlanır ancak kayıtlı geçmiş korunur', () => {
      let stats = updateSessionStats(INITIAL_SESSION_STATS, 60, 200)
      expect(stats.maxSpeedKmh).toBe(60)

      // Oturum sıfırlanır
      stats = resetSessionStats()
      expect(stats.maxSpeedKmh).toBeNull()
      expect(stats.avgSpeedKmh).toBeNull()
      expect(stats.distanceMeters).toBe(0)
      expect(stats.speedSamplesCount).toBe(0)
    })
  })

  describe('formatHistorySummary', () => {
    it('boş geçmiş için boş metin döner', () => {
      expect(formatHistorySummary([])).toBe('')
    })

    it('kayıtlı ölçümleri formatlı özet metnine dönüştürür', () => {
      const sampleHistory = [
        { id: 1, time: '14:30:10', speedKmh: 42.4 },
        { id: 2, time: '14:31:05', speedKmh: 0.0 },
      ]
      const summary = formatHistorySummary(sampleHistory)

      expect(summary).toContain('SpeedGPS Ölçüm Özeti (2 Kayıt):')
      expect(summary).toContain('#1 | Saat: 14:30:10 | Hız: 42.4 km/sa')
      expect(summary).toContain('#2 | Saat: 14:31:05 | Hız: 0.0 km/sa')
    })
  })
})
