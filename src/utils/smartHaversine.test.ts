import { describe, it, expect } from 'vitest'
import {
  GpsSpeedTracker,
  resolveSpeed,
  type GpsReadingInput,
} from './speedEngine'
import {
  GPS_RELIABILITY_CONFIG,
  calculateCombinedAccuracy,
  getEffectiveDistanceThreshold,
} from './gpsReliability'
import {
  updateSessionStats,
  INITIAL_SESSION_STATS,
} from './measurementSession'
import { calculateHaversineDistance, type GpsPoint } from './gpsMath'

describe('SpeedGPS — Sprint 6.4 / Adım 2: Akıllı Haversine İyileştirmesi', () => {
  describe('1. calculateCombinedAccuracy ve getEffectiveDistanceThreshold', () => {
    it('İki noktanın doğruluğu mevcut olduğunda ortalamasını alır', () => {
      expect(calculateCombinedAccuracy(10, 20)).toBe(15)
      expect(calculateCombinedAccuracy(8, 12)).toBe(10)
    })

    it('Yalnızca bir noktanın doğruluğu varsa o değeri kullanır', () => {
      expect(calculateCombinedAccuracy(14, null)).toBe(14)
      expect(calculateCombinedAccuracy(null, 18)).toBe(18)
      expect(calculateCombinedAccuracy(undefined, 12)).toBe(12)
    })

    it('Hiçbir doğruluk değeri yoksa veya geçersizse null döner', () => {
      expect(calculateCombinedAccuracy(null, null)).toBeNull()
      expect(calculateCombinedAccuracy(undefined, undefined)).toBeNull()
      expect(calculateCombinedAccuracy(-5, 0)).toBeNull()
    })

    it('getEffectiveDistanceThreshold iki noktanın birleşik doğruluğuna göre dinamik eşik belirler', () => {
      // 8m ve 12m birleşik -> 10m hata payı eşiği
      expect(getEffectiveDistanceThreshold(8, 12)).toBe(10)
      // Doğruluk bilinmediğinde taban 2.0m eşiği korunur
      expect(getEffectiveDistanceThreshold(null, null)).toBe(
        GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS
      )
      // Doğruluk 1.5m (yüksek hassasiyet) olduğunda taban 2.0m eşiği uygulanır
      expect(getEffectiveDistanceThreshold(1.5, 1.5)).toBe(
        GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS
      )
    })
  })

  describe('2. Sabit Telefon ve GPS Koordinat Sıçraması (Hata Payı İçi Titreme)', () => {
    it('Telefon sabitken hata payı içinde kalan koordinat sıçramaları hız üretmez (0 km/sa kalır)', () => {
      const tracker = new GpsSpeedTracker()

      // Başlangıç konumu (accuracy = 10m)
      const p1: GpsReadingInput = {
        coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 10, speed: null },
        timestamp: 1000,
      }
      const res1 = tracker.processReading(p1)
      expect(res1.speedKmh).toBeNull() // İlk referans noktası

      // 1 saniye sonra 3 metrelik koordinat kayması (3m < 10m hata payı eşiği)
      // (1 derece lat ~111,195 m; 0.000027 lat ~3.0 m)
      const p2: GpsReadingInput = {
        coords: { latitude: 41.008227, longitude: 28.9784, accuracy: 10, speed: null },
        timestamp: 2000,
      }
      const res2 = tracker.processReading(p2)
      // Hata payı içinde dalgalanma olduğu için sahte hız üretilmez, 0 km/sa olarak kenetlenir
      expect(res2.speedKmh).toBe(0)
      expect(res2.source).toBe('haversine')
    })

    it('Masa başında 10 saniye boyunca dalgalanan koordinatlarda mesafe 0m ve maks hız 0 kalır', () => {
      const tracker = new GpsSpeedTracker()
      let stats = { ...INITIAL_SESSION_STATS }
      let lastCoords: GpsPoint | null = null

      const baseLat = 41.0082
      const baseLon = 28.9784

      for (let sec = 1; sec <= 10; sec++) {
        // ±4 metrelik masa başı GPS gürültüsü
        const jitterLat = baseLat + (sec % 2 === 0 ? 0.000035 : -0.00002) // ~2-4m
        const currentPoint: GpsPoint = {
          latitude: jitterLat,
          longitude: baseLon,
          timestamp: sec * 1000,
          accuracy: 12, // 12 metre doğruluk
        }

        const reading: GpsReadingInput = {
          coords: {
            latitude: jitterLat,
            longitude: baseLon,
            accuracy: 12,
            speed: null,
          },
          timestamp: sec * 1000,
        }

        const result = tracker.processReading(reading)

        let deltaMeters = 0
        if (lastCoords) {
          const dist = calculateHaversineDistance(lastCoords, currentPoint)
          const combinedAcc = calculateCombinedAccuracy(lastCoords.accuracy, reading.coords.accuracy)
          const effectiveThreshold = getEffectiveDistanceThreshold(
            result.source === 'haversine' ? combinedAcc : null
          )
          if (dist !== null && dist >= effectiveThreshold && (result.speedKmh ?? 0) > 0) {
            deltaMeters = dist
            lastCoords = currentPoint
          }
        } else {
          lastCoords = currentPoint
        }

        stats = updateSessionStats(stats, result.speedKmh, deltaMeters)
      }

      // Masa başında hiçbir zaman yapay mesafe veya hız kaydedilmez
      expect(stats.distanceMeters).toBe(0)
      expect(stats.maxSpeedKmh).toBe(0)
      expect(stats.avgSpeedKmh).toBe(0)
    })
  })

  describe('3. Zayıf Konum Doğruluğu (> 25m)', () => {
    it('Noktalardan birinin accuracy değeri 25m üzerindeyse Haversine sahte hız üretmez (null döner)', () => {
      const p1: GpsReadingInput = {
        coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 15, speed: null },
        timestamp: 1000,
      }
      // İkinci noktanın doğruluğu zayıf (30m)
      const p2: GpsReadingInput = {
        coords: { latitude: 41.0084, longitude: 28.9784, accuracy: 30, speed: null },
        timestamp: 2000,
      }

      const tracker = new GpsSpeedTracker()
      tracker.processReading(p1)
      const res2 = tracker.processReading(p2)

      expect(res2.speedKmh).toBeNull()
      expect(res2.source).toBe('none')
    })

    it('resolveSpeed: önceki noktanın doğruluğu 25m üzerindeyse hız null döner', () => {
      const prevPoint: GpsPoint = {
        latitude: 41.0082,
        longitude: 28.9784,
        timestamp: 1000,
        accuracy: 28, // > 25m
      }

      const reading: GpsReadingInput = {
        coords: { latitude: 41.0085, longitude: 28.9784, accuracy: 10, speed: null },
        timestamp: 2000,
      }

      const result = resolveSpeed(reading, prevPoint)
      expect(result.speedKmh).toBeNull()
      expect(result.source).toBe('none')
    })
  })

  describe('4. Yavaş Yürüyüş ve Çapa / Biriktirme Mekanizması', () => {
    it('1.8 km/sa (0.5 m/s) hızında yürüyüşte çapa mesafeyi biriktirir ve hız ile mesafe tutarlı şekilde üretilir', () => {
      const tracker = new GpsSpeedTracker()
      let stats = { ...INITIAL_SESSION_STATS }
      let lastCoords: GpsPoint | null = null

      // Accuracy = 4.0m -> Dinamik eşik = 4.0m
      // 0.5 m/s ile yürüyüşte 8 saniyede 4.0 metreye ulaşılır
      // 1 derece latitude ~111,195 m -> 0.5m ~ 0.0000045 derece
      const baseLat = 41.0082
      const baseLon = 28.9784
      const stepDegrees = (0.5 / 6371000) * (180 / Math.PI)

      let speedRecords: (number | null)[] = []
      let distanceRecords: number[] = []

      // 1. okuma: Başlangıç konumu (çapa referansı)
      tracker.processReading({
        coords: { latitude: baseLat, longitude: baseLon, accuracy: 4, speed: null },
        timestamp: 1000,
      })
      lastCoords = { latitude: baseLat, longitude: baseLon, timestamp: 1000, accuracy: 4 }

      for (let sec = 1; sec <= 16; sec++) {
        const currentLat = baseLat + sec * stepDegrees
        const timestamp = (sec + 1) * 1000
        const currentPoint: GpsPoint = {
          latitude: currentLat,
          longitude: baseLon,
          timestamp,
          accuracy: 4,
        }

        const reading: GpsReadingInput = {
          coords: {
            latitude: currentLat,
            longitude: baseLon,
            accuracy: 4,
            speed: null, // coords.speed yok; saf Haversine
          },
          timestamp,
        }

        const result = tracker.processReading(reading)
        speedRecords.push(result.speedKmh)

        let deltaMeters = 0
        if (lastCoords) {
          const dist = calculateHaversineDistance(lastCoords, currentPoint)
          const combinedAcc = calculateCombinedAccuracy(lastCoords.accuracy, reading.coords.accuracy)
          const effectiveThreshold = getEffectiveDistanceThreshold(
            result.source === 'haversine' ? combinedAcc : null
          )
          if (dist !== null && dist >= effectiveThreshold - 0.01 && (result.speedKmh ?? 0) > 0) {
            deltaMeters = dist
            lastCoords = currentPoint
          }
        } else {
          lastCoords = currentPoint
        }

        distanceRecords.push(deltaMeters)
        stats = updateSessionStats(stats, result.speedKmh, deltaMeters)
      }

      // 8. saniyede (4 metre aşıldığında) hareket doğrulanır ve hız ~1.8 km/sa olur
      expect(speedRecords[7]).toBeCloseTo(1.8, 1)

      // 16 saniye sonunda toplam mesafe tam 8.0 metre birikir (hiçbir mesafe kaybolmaz)
      expect(stats.distanceMeters).toBeCloseTo(8.0, 1)
      expect(stats.maxSpeedKmh).toBeCloseTo(1.8, 1)
      // İlk 7 saniye durağan (0 km/sa) ve sonraki 9 saniye yürüyüş (1.8 km/sa) ortalaması: ~1.0 km/sa
      expect(stats.avgSpeedKmh).toBeCloseTo(1.0, 1)
    })

    it('Yürüyüş durduğunda 3 saniye sonra hız güvenle 0 km/sa değerine düşer', () => {
      const tracker = new GpsSpeedTracker()

      const baseLat = 41.0082
      const baseLon = 28.9784
      const stepDegrees = (0.5 / 6371000) * (180 / Math.PI)

      // Başlangıç referansı (t = 1000)
      tracker.processReading({
        coords: { latitude: baseLat, longitude: baseLon, accuracy: 4, speed: null },
        timestamp: 1000,
      })

      // 8 saniye yürü (t = 2000 .. 9000; 4 metreye ulaş, hız 1.8 km/sa olsun)
      for (let sec = 1; sec <= 8; sec++) {
        tracker.processReading({
          coords: {
            latitude: baseLat + sec * stepDegrees,
            longitude: baseLon,
            accuracy: 4,
            speed: null,
          },
          timestamp: (sec + 1) * 1000,
        })
      }
      expect(tracker.getCurrentSpeedKmh()).toBeCloseTo(1.8, 1)

      // t = 10000 ve 11000'de duruldu (durduktan sonra 1s ve 2s geçti; < 3s, yürüyüş toleransı korunur)
      const stop1 = tracker.processReading({
        coords: {
          latitude: baseLat + 8 * stepDegrees,
          longitude: baseLon,
          accuracy: 4,
          speed: null,
        },
        timestamp: 10000,
      })
      expect(stop1.speedKmh).toBeCloseTo(1.8, 1)

      // t = 12000 (durduktan sonra 3 saniye geçti: 9000 -> 12000 = 3000ms >= 3s) -> Hız 0 km/sa'e düşer
      const stop3 = tracker.processReading({
        coords: {
          latitude: baseLat + 8 * stepDegrees,
          longitude: baseLon,
          accuracy: 4,
          speed: null,
        },
        timestamp: 12000,
      })
      expect(stop3.speedKmh).toBe(0)
      expect(tracker.getCurrentSpeedKmh()).toBe(0)
    })
  })

  describe('5. Normal Araç Hareketi (50 km/sa)', () => {
    it('Araç hızında (> 2m/sn) her saniye eşik aşılır ve anlık hız gecikmesiz üretilir', () => {
      const tracker = new GpsSpeedTracker()
      // 50 km/sa = 13.89 m/s
      // 13.89 m ~ 0.0001249 derece
      const baseLat = 41.0082
      const baseLon = 28.9784
      const stepDeg = 13.889 / 111195

      // 1. nokta
      tracker.processReading({
        coords: { latitude: baseLat, longitude: baseLon, accuracy: 5, speed: null },
        timestamp: 1000,
      })

      // 2. nokta (1 saniye sonra ~13.9 metre)
      const res2 = tracker.processReading({
        coords: { latitude: baseLat + stepDeg, longitude: baseLon, accuracy: 5, speed: null },
        timestamp: 2000,
      })
      expect(res2.source).toBe('haversine')
      expect(res2.speedKmh).toBeCloseTo(50, 0)

      // 3. nokta (2 saniye sonra)
      const res3 = tracker.processReading({
        coords: { latitude: baseLat + 2 * stepDeg, longitude: baseLon, accuracy: 5, speed: null },
        timestamp: 3000,
      })
      expect(res3.speedKmh).toBeCloseTo(50, 0)
    })
  })

  describe('6. coords.speed Önceliği ve Geçerli 0 km/sa', () => {
    it('coords.speed mevcut olduğunda Haversine yerine her zaman donanım hızı önceliklidir', () => {
      const tracker = new GpsSpeedTracker()

      // İlk nokta
      tracker.processReading({
        coords: { latitude: 41.0, longitude: 28.0, accuracy: 10, speed: 10 },
        timestamp: 1000,
      })

      // İkinci nokta: Koordinatlar 100 metre değişse bile coords.speed = 0 ise doğrudan 0 km/sa döner
      const res = tracker.processReading({
        coords: { latitude: 41.001, longitude: 28.0, accuracy: 10, speed: 0 },
        timestamp: 2000,
      })

      expect(res.source).toBe('gps')
      expect(res.speedKmh).toBe(0)
    })

    it('Dururken Başlatma: coords.speed = 0 ilk okumada anında geçerli 0 km/sa üretir', () => {
      const tracker = new GpsSpeedTracker()
      const res = tracker.processReading({
        coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 5, speed: 0 },
        timestamp: 1000,
      })

      expect(res.source).toBe('gps')
      expect(res.speedKmh).toBe(0)
    })
  })

  describe('7. Düzensiz GPS Güncelleme Aralıkları', () => {
    it('500 ms altındaki çok hızlı güncellemeler gürültüye karşı reddedilir (null döner)', () => {
      const tracker = new GpsSpeedTracker()

      // 1. nokta
      tracker.processReading({
        coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 5, speed: null },
        timestamp: 1000,
      })

      // 2. nokta: Yalnızca 200 ms sonra (timeDeltaMs = 200 < 500)
      const fastRes = tracker.processReading({
        coords: { latitude: 41.00825, longitude: 28.9784, accuracy: 5, speed: null },
        timestamp: 1200,
      })

      expect(fastRes.speedKmh).toBeNull()
      expect(fastRes.source).toBe('none')
    })

    it('2.5 saniyelik uzun aralıkta hız ve mesafe zaman farkına (dt) göre doğru ölçeklenir', () => {
      const tracker = new GpsSpeedTracker()
      // 50 km/sa hızla 2.5 saniyede kat edilen mesafe: 13.889 * 2.5 = 34.72 m
      const baseLat = 41.0082
      const baseLon = 28.9784
      const distDeg = 34.722 / 111195

      tracker.processReading({
        coords: { latitude: baseLat, longitude: baseLon, accuracy: 5, speed: null },
        timestamp: 1000,
      })

      const irregularRes = tracker.processReading({
        coords: { latitude: baseLat + distDeg, longitude: baseLon, accuracy: 5, speed: null },
        timestamp: 3500, // 2500 ms sonra
      })

      expect(irregularRes.source).toBe('haversine')
      expect(irregularRes.speedKmh).toBeCloseTo(50, 0)
    })
  })
})
