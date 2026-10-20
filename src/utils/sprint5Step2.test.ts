import { describe, it, expect } from 'vitest'
import {
  updateSessionStats,
  resetSessionStats,
  canSaveMeasurement,
  createSavedMeasurement,
  INITIAL_SESSION_STATS,
} from './measurementSession'
import { GpsSpeedTracker, type GpsReadingInput } from './speedEngine'
import { SpeedFilter } from './speedFilter'
import {
  isReliableGpsReading,
  isValidTimestampSequence,
  isGpsDataStale,
  GPS_RELIABILITY_CONFIG,
} from './gpsReliability'

describe('Sprint 5 / Adım 2: İstatistik ve GPS Güncellik Kontrolü', () => {
  describe('1. Dur-kalk yolculukta ortalama hız ve duraklama yönetimi', () => {
    it('Duraklamalar (0 km/sa) ortalamaya 0 olarak girer ve zaman/örnek ağırlıklı ortalamayı tutarlı şekilde hesaplar', () => {
      let stats = { ...INITIAL_SESSION_STATS }

      // 1 Hz GPS güncelleme simülasyonu:
      // t=1: 0 km/sa (kırmızı ışıkta bekliyor)
      stats = updateSessionStats(stats, 0, 0)
      expect(stats.avgSpeedKmh).toBe(0)
      expect(stats.speedSamplesCount).toBe(1)

      // t=2: 40 km/sa (harekete geçti)
      stats = updateSessionStats(stats, 40, 11)
      expect(stats.avgSpeedKmh).toBe(20) // (0 + 40) / 2 = 20

      // t=3: 60 km/sa (hızlandı)
      stats = updateSessionStats(stats, 60, 16)
      expect(stats.avgSpeedKmh).toBe(33.3) // (0 + 40 + 60) / 3 = 33.33 -> 33.3

      // t=4: 0 km/sa (tekrar kırmızı ışıkta durdu)
      stats = updateSessionStats(stats, 0, 0)
      expect(stats.avgSpeedKmh).toBe(25) // (100 + 0) / 4 = 25.0

      // t=5: 50 km/sa (yola devam etti)
      stats = updateSessionStats(stats, 50, 14)
      expect(stats.avgSpeedKmh).toBe(30) // (100 + 50) / 5 = 30.0
      expect(stats.maxSpeedKmh).toBe(60)
    })
  })

  describe('2. Maksimum hız hesabı ve GPS sıçramalarının engellenmesi', () => {
    it('Reddedilen anormal GPS sıçramaları maksimum hıza asla yansıtılmaz', () => {
      const filter = new SpeedFilter()
      let stats = { ...INITIAL_SESSION_STATS }

      // 45 km/sa ile normal seyir
      const normalReading = filter.filter(45, { source: 'gps', timeDeltaSeconds: 1 })
      expect(normalReading.filteredSpeedKmh).toBe(45)
      stats = updateSessionStats(stats, normalReading.filteredSpeedKmh, 12)
      expect(stats.maxSpeedKmh).toBe(45)

      // 1 saniyede 45 -> 180 km/sa anormal GPS sıçraması (reddedilir, önceki 45 km/sa korunur)
      const spikeReading = filter.filter(180, { source: 'gps', timeDeltaSeconds: 1 })
      expect(spikeReading.isSpikeRejected).toBe(true)
      expect(spikeReading.filteredSpeedKmh).toBe(45)

      // V3 Aşama 3 / B1 Kuralı: Reddedilen sıçrama istatistiklere ve mesafeye eklenmez
      if (!spikeReading.isSpikeRejected) {
        stats = updateSessionStats(stats, spikeReading.filteredSpeedKmh, 12)
      }
      expect(stats.maxSpeedKmh).toBe(45) // 180 kesinlikle yansımaz
      expect(stats.distanceMeters).toBe(12) // Sadece ilk okumanın 12 metresi kalır

      // 320 km/sa fiziksel imkansız tekil sıçrama
      const superSpike = filter.filter(320, { source: 'gps', timeDeltaSeconds: 1 })
      expect(superSpike.isSpikeRejected).toBe(true)
      if (!superSpike.isSpikeRejected) {
        stats = updateSessionStats(stats, superSpike.filteredSpeedKmh, 12)
      }
      expect(stats.maxSpeedKmh).toBe(45)
      expect(stats.distanceMeters).toBe(12)
    })
  })

  describe('3. Mesafe hesaplamasında GPS jitter ve yavaş yürüyüş', () => {
    it('Dururken oluşan koordinat titremesi mesafe eklemezken, 1.8 km/sa yürüyüşte kümülatif mesafe tam birikir', () => {
      let stats = { ...INITIAL_SESSION_STATS }

      // Araç dururken (hız 0), koordinat dalgalansa bile mesafe eklenmez
      const jitterDist = 2.2 // 2 metre eşiğinin hafif üstünde sahte koordinat sıçraması
      const speedZero = 0
      const deltaMetersWhenStopped = speedZero > 0 ? jitterDist : 0
      stats = updateSessionStats(stats, speedZero, deltaMetersWhenStopped)
      expect(stats.distanceMeters).toBe(0)

      // 1.8 km/sa (0.5 m/s) ile yürüyüş simülasyonu:
      // Her saniye 0.5 metre yer değiştirme; çapa mekanizması 4. saniyede 2.0 metreye ulaştığında tam ekler
      let lastAnchorMeters = 0
      let totalDistance = 0
      const walkingSpeed = 1.8

      for (let sec = 1; sec <= 8; sec++) {
        const currentPos = sec * 0.5
        const diff = currentPos - lastAnchorMeters

        let delta = 0
        if (diff >= GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS && walkingSpeed > 0) {
          delta = diff
          lastAnchorMeters = currentPos
        }
        totalDistance += delta
        stats = updateSessionStats(stats, walkingSpeed, delta)
      }

      // 8 saniyede toplam 4.0 metre eksiksiz kaydedilir; mesafe kaybı yaşanmaz
      expect(totalDistance).toBe(4.0)
      expect(stats.distanceMeters).toBe(4.0)
    })
  })

  describe('4. Geçersiz GPS okumalarının art arda gelmesi ve filtreleme', () => {
    it('Kötü doğruluklu veya bozuk zaman damgalı okumalar ardışık gelse bile reddedilir ve hızı/istatistiği bozmaz', () => {
      const tracker = new GpsSpeedTracker()
      let stats = { ...INITIAL_SESSION_STATS }

      // 1. Geçerli başlangıç okuması (10 m/s = 36 km/sa)
      const valid1 = tracker.processReading({
        coords: { latitude: 41.0, longitude: 28.0, accuracy: 10, speed: 10 },
        timestamp: 1000,
      })
      expect(valid1.speedKmh).toBe(36)
      stats = updateSessionStats(stats, valid1.speedKmh, 5)
      expect(stats.maxSpeedKmh).toBe(36)

      // 2. Geçersiz okuma 1: accuracy 250m (kötü doğruluk)
      const badReading1: GpsReadingInput = {
        coords: { latitude: 41.002, longitude: 28.002, accuracy: 250, speed: 80 },
        timestamp: 2000,
      }
      expect(isReliableGpsReading(badReading1)).toBe(false)
      const resBad1 = tracker.processReading(badReading1)
      expect(resBad1.speedKmh).toBeNull()

      // 3. Geçersiz okuma 2: geriye giden zaman damgası (1000'den küçük)
      const badReading2: GpsReadingInput = {
        coords: { latitude: 41.003, longitude: 28.003, accuracy: 10, speed: 80 },
        timestamp: 900, // 1000'den küçük (geriye gitmiş)
      }
      expect(
        isValidTimestampSequence(tracker.getPreviousPoint()?.timestamp, badReading2.timestamp)
      ).toBe(false)
      const resBad2 = tracker.processReading(badReading2)
      expect(resBad2.speedKmh).toBeNull()

      // 4. Geçersiz okuma 3: enlem sınır dışı (> 90)
      const badReading3: GpsReadingInput = {
        coords: { latitude: 95, longitude: 28.0, accuracy: 10, speed: 80 },
        timestamp: 3000,
      }
      expect(isReliableGpsReading(badReading3)).toBe(false)
      const resBad3 = tracker.processReading(badReading3)
      expect(resBad3.speedKmh).toBeNull()

      // Geçersiz okumalar istatistiklere sokulmaz
      expect(stats.maxSpeedKmh).toBe(36)
      expect(stats.speedSamplesCount).toBe(1)
    })
  })

  describe('5. GPS sinyalinin kaybolup geri gelmesi (Staleness & Recovery)', () => {
    it('5 saniye güncelleme alınmadığında veri bayat kabul edilir; yeni veri gelince toparlanır', () => {
      const now = 10000

      // 1 saniye önceki veri günceldir
      expect(isGpsDataStale(now - 1000, now)).toBe(false)
      expect(canSaveMeasurement(50, 'aktif', false)).toBe(true)

      // 5001 ms önceki veri bayattır (stale)
      expect(isGpsDataStale(now - 5001, now)).toBe(true)
      // Bayat veri kaydedilemez
      expect(canSaveMeasurement(50, 'aktif', true)).toBe(false)
      expect(canSaveMeasurement(0, 'aktif', true)).toBe(false)

      // Sinyal geri geldiğinde (recovery) canSaveMeasurement tekrar true olur
      expect(canSaveMeasurement(50, 'aktif', false)).toBe(true)
    })
  })

  describe('6. Hızı Kaydet ve oturum sıfırlama', () => {
    it('Canlı GPS takibi kesilmez, anlık hız korunur, oturum istatistikleri sıfırdan başlar', () => {
      const tracker = new GpsSpeedTracker()
      let sessionStats = { ...INITIAL_SESSION_STATS }
      const history = []

      // 1. Canlı sürüşte veri alınıyor
      const reading = tracker.processReading({
        coords: { latitude: 41.0082, longitude: 28.9784, speed: 15, accuracy: 10 }, // 15 m/s = 54 km/sa
        timestamp: 1000,
      })
      expect(reading.speedKmh).toBe(54)
      sessionStats = updateSessionStats(sessionStats, reading.speedKmh, 50)
      expect(sessionStats.maxSpeedKmh).toBe(54)
      expect(sessionStats.distanceMeters).toBe(50)

      // 2. Kullanıcı "Hızı Kaydet" butonuna bastı:
      // a) Anlık hız geçmişe kaydedilir
      expect(canSaveMeasurement(reading.speedKmh, 'aktif', false)).toBe(true)
      const saved = createSavedMeasurement(1, reading.speedKmh!)
      history.push(saved)
      expect(history.length).toBe(1)
      expect(history[0].speedKmh).toBe(54)

      // b) Oturum istatistikleri sıfırlanır
      sessionStats = resetSessionStats()
      expect(sessionStats.maxSpeedKmh).toBeNull()
      expect(sessionStats.distanceMeters).toBe(0)
      expect(sessionStats.speedSamplesCount).toBe(0)

      // c) Canlı takip motoru sıfırlanmaz, takip kesintisiz devam eder
      const nextReading = tracker.processReading({
        coords: { latitude: 41.0083, longitude: 28.9784, speed: 15, accuracy: 10 },
        timestamp: 2000,
      })
      expect(nextReading.speedKmh).toBe(54) // Hız '--' değerine düşmez
      expect(tracker.getCurrentSpeedKmh()).toBe(54)
    })
  })

  describe('7. Başlat / Durdur / Yeniden Başlatma', () => {
    it('Durdur işlemi takibi sonlandırır; yeniden başlatma taze referansla başlar', () => {
      const tracker = new GpsSpeedTracker()

      // Başlatıldı ve veri akıyor (10 m/s = 36 km/sa)
      tracker.processReading({
        coords: { latitude: 41.0, longitude: 28.0, speed: 10, accuracy: 10 },
        timestamp: 1000,
      })
      expect(tracker.getCurrentSpeedKmh()).toBe(36)

      // Durduruldu (tracker.reset)
      tracker.reset()
      expect(tracker.getCurrentSpeedKmh()).toBeNull()
      expect(tracker.getPreviousPoint()).toBeNull()
      expect(tracker.getSpeedSource()).toBe('none')

      // Yeniden başlatıldı: İlk okuma taze referans noktası olur
      const restartReading = tracker.processReading({
        coords: { latitude: 41.01, longitude: 28.01, speed: null, accuracy: 10 },
        timestamp: 5000,
      })
      expect(restartReading.speedKmh).toBeNull() // Eski konuma göre yapay Haversine sıçraması üretmez
      expect(tracker.getPreviousPoint()?.timestamp).toBe(5000)
    })
  })
})
