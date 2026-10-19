import { describe, it, expect } from 'vitest'
import { GpsSpeedTracker, resolveSpeed, type GpsReadingInput } from './speedEngine'
import { SpeedFilter } from './speedFilter'
import { getEffectiveDistanceThreshold, GPS_RELIABILITY_CONFIG } from './gpsReliability'
import { updateSessionStats, INITIAL_SESSION_STATS } from './measurementSession'
import { calculateHaversineDistance, type Coordinates } from './gpsMath'

describe('SpeedGPS — Masa Başı GPS Sapması ve Yanlış Hız/Mesafe Düzeltmesi', () => {
  describe('1. Masa Başında Hareketsiz Durumda 86 km/sa ve 24 Metre Hatasının Engellenmesi', () => {
    it('Senaryo A: coords.speed null ve accuracy > 25m (zayıf doğruluk) olduğunda koordinatlardan hız üretilmez (null döner)', () => {
      // Masa başında tipik Wi-Fi konum doğruluğu: ~30 metre
      const p1: GpsReadingInput = {
        coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 30, speed: null },
        timestamp: 1000,
      }
      // 1 saniye sonra 24 metre öteye sapma (~86.4 km/sa yapay hız)
      const p2: GpsReadingInput = {
        coords: { latitude: 41.008415, longitude: 28.9784, accuracy: 30, speed: null },
        timestamp: 2000,
      }

      const tracker = new GpsSpeedTracker()
      const res1 = tracker.processReading(p1)
      expect(res1.speedKmh).toBeNull()

      const res2 = tracker.processReading(p2)
      // Accuracy > 25m olduğu için sahte hız üretilmez, null (ekranda '--') kalır
      expect(res2.speedKmh).toBeNull()
      expect(res2.source).toBe('none')
    })

    it('Senaryo B: accuracy <= 25m olsa bile yer değiştirme GPS hata payı içinde kalıyorsa (24m <= 25m) hız 0 km/sa olarak filtrelenir', () => {
      // Accuracy = 25m, yer değiştirme = 24m (hata payı içinde dalgalanma)
      const filter = new SpeedFilter()

      const result = filter.filter(86.4, {
        source: 'haversine',
        timeDeltaSeconds: 1.0,
        distanceMeters: 24.0,
        accuracyMeters: 25.0, // Hata payı 25m
      })

      // 24m < 25m olduğu için hareket yok sayılır ve 0 km/sa'e kenetlenir
      expect(result.filteredSpeedKmh).toBe(0)
      expect(result.isStationaryClamped).toBe(true)
    })

    it('Senaryo C: Önceki hız 0 km/sa iken 1 saniyede 86 km/sa sıçraması ivmelenme filtresi tarafından engellenir', () => {
      const filter = new SpeedFilter()

      // Kullanıcı duruyor (hız 0 km/sa)
      const zeroRes = filter.filter(0, { source: 'haversine', timeDeltaSeconds: 1.0 })
      expect(zeroRes.filteredSpeedKmh).toBe(0)

      // 1 saniye sonra 86 km/sa anormal sıçrama
      const spikeRes = filter.filter(86.4, {
        source: 'haversine',
        timeDeltaSeconds: 1.0,
        distanceMeters: 24.0,
        accuracyMeters: 10.0, // Doğruluk 10m olsa bile
      })

      // 0'dan 86 km/sa'e 1 saniyede çıkış fiziksel olarak imkansız olduğundan reddedilir
      expect(spikeRes.isSpikeRejected).toBe(true)
      expect(spikeRes.filteredSpeedKmh).toBe(0)
    })

    it('Senaryo D: Masa başı simülasyonu (14 saniye boyunca dururken mesafe 0m ve maks hız 0 kalır)', () => {
      let stats = { ...INITIAL_SESSION_STATS }
      let lastCoords: Coordinates | null = null
      const tracker = new GpsSpeedTracker()

      // Masa başında 14 saniye boyunca 1 saniye aralıklarla konum okumaları
      // Accuracy = 28m (zayıf Wi-Fi doğruluğu), koordinatlar 10-24m arasında dalgalanıyor
      const baseLat = 41.0082
      const baseLon = 28.9784

      for (let sec = 1; sec <= 14; sec++) {
        // Yapay dalgalanma
        const jitterLat = baseLat + (sec % 2 === 0 ? 0.0002 : -0.0001) // ~11-22m
        const currentCoords: Coordinates = { latitude: jitterLat, longitude: baseLon }

        const reading: GpsReadingInput = {
          coords: {
            latitude: jitterLat,
            longitude: baseLon,
            accuracy: 28, // > 25m
            speed: null,  // coords.speed yok
          },
          timestamp: sec * 1000,
        }

        const result = tracker.processReading(reading)
        expect(result.speedKmh).toBeNull() // Yapay hız yok!

        let deltaMeters = 0
        if (lastCoords) {
          const dist = calculateHaversineDistance(lastCoords, currentCoords)
          const effectiveThreshold = getEffectiveDistanceThreshold(
            result.source === 'haversine' ? reading.coords.accuracy : null
          )
          if (dist !== null && dist >= effectiveThreshold && (result.speedKmh ?? 0) > 0) {
            deltaMeters = dist
            lastCoords = currentCoords
          }
        } else {
          lastCoords = currentCoords
        }

        stats = updateSessionStats(stats, result.speedKmh, deltaMeters)
      }

      // 14 saniye sonunda kesinlikle 86 km/sa maks hız veya 24 metre mesafe birikmemeli!
      expect(stats.distanceMeters).toBe(0)
      expect(stats.maxSpeedKmh).toBeNull()
      expect(stats.avgSpeedKmh).toBeNull()
    })
  })

  describe('2. Doğrudan GPS Hızı ve Geçerli 0 km/sa Davranışı', () => {
    it('coords.speed = 0 olduğunda donanım hızı doğrudan kabul edilir, Haversine yapılmaz', () => {
      const p1: GpsReadingInput = {
        coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 15, speed: 0 },
        timestamp: 1000,
      }
      const p2: GpsReadingInput = {
        coords: { latitude: 41.0083, longitude: 28.9785, accuracy: 15, speed: 0 },
        timestamp: 2000,
      }

      const res = resolveSpeed(p2, { latitude: p1.coords.latitude, longitude: p1.coords.longitude, timestamp: 1000 })
      expect(res.speedKmh).toBe(0)
      expect(res.source).toBe('gps')
    })
  })

  describe('3. Güvenilir Gerçek Hareket (Açık Alan Yüksek Doğruluk)', () => {
    it('Açık alanda iyi doğrulukla (accuracy = 4m) hata payını aşan gerçek yer değiştirme (12m) kabul edilir', () => {
      const filter = new SpeedFilter()

      // 1 saniyede 12 metre ilerleme (~43.2 km/sa)
      const res = filter.filter(43.2, {
        source: 'haversine',
        timeDeltaSeconds: 1.0,
        distanceMeters: 12.0,
        accuracyMeters: 4.0, // 12m > 4m (hata payının çok üzerinde doğrulanmış hareket)
      })

      expect(res.filteredSpeedKmh).toBe(43.2)
      expect(res.isStationaryClamped).toBe(false)
    })
  })

  describe('4. getEffectiveDistanceThreshold Fonksiyonu', () => {
    it('accuracy sağlandığında hata payı ile 2.0 metre arasındaki maksimumu döner', () => {
      expect(getEffectiveDistanceThreshold(25)).toBe(25)
      expect(getEffectiveDistanceThreshold(10)).toBe(10)
      expect(getEffectiveDistanceThreshold(1.5)).toBe(GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS)
      expect(getEffectiveDistanceThreshold(null)).toBe(GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS)
      expect(getEffectiveDistanceThreshold(undefined)).toBe(GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS)
    })
  })
})
