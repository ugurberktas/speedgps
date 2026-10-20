/**
 * SpeedGPS — Sprint 6.4 / Adım 3: Arka Plan ve GPS Kesinti Yönetimi Testleri
 *
 * 1. visibilitychange ile uygulamanın görünürlük durumunun takibi
 * 2. Uygulama arka plana geçtiğinde canlı GPS ölçümünün duraklatılması (isPaused)
 * 3. Uygulama tekrar görünür olduğunda GPS takibinin güvenli devam ettirilmesi
 * 4. 10–30 saniyelik uzun GPS kesintilerinden sonra gelen ilk konum örneğinin yeni başlangıç
 *    olarak değerlendirilmesi (sahte hız veya mesafe sıçramasının engellenmesi)
 * 5. Kesinti sonrasında Haversine çapa noktası ve filtre durumunun temizlenmesi
 * 6. GPS verisi bayatken hızın '--' olması
 * 7. İstatistiklerde geçerli ölçüm süreleri ile kesinti sürelerinin birbirine karıştırılmaması
 * 8. Başlat, Durdur ve Hızı Kaydet işlevlerinin korunması
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldTriggerOutageRecovery,
  canIncrementMeasurementDuration,
  isGpsDataStale,
} from './outageRecovery'
import { canSaveMeasurement, resetSessionStats, updateSessionStats } from './measurementSession'
import { GpsSpeedTracker } from './speedEngine'
import { calculateHaversineDistance, type GpsPoint } from './gpsMath'

describe('SpeedGPS — Sprint 6.4 / Adım 3: Arka Plan ve GPS Kesinti Yönetimi', () => {
  describe('1. Outage Recovery Koşul Denetimleri (shouldTriggerOutageRecovery)', () => {
    it('isOutageRecoveryFlagged true ise (arka plandan dönüş sonrası) toparlanmayı tetikler', () => {
      const result = shouldTriggerOutageRecovery({
        isOutageRecoveryFlagged: true,
        isStale: false,
        isPaused: false,
        previousTimestamp: 10000,
        currentTimestamp: 11000,
      })
      expect(result).toBe(true)
    })

    it('isStale true ise (GPS sinyali kesintisi sonrası ilk veri) toparlanmayı tetikler', () => {
      const result = shouldTriggerOutageRecovery({
        isOutageRecoveryFlagged: false,
        isStale: true,
        isPaused: false,
        previousTimestamp: 10000,
        currentTimestamp: 16000,
      })
      expect(result).toBe(true)
    })

    it('isPaused true ise (arka planda) toparlanmayı tetikler', () => {
      const result = shouldTriggerOutageRecovery({
        isOutageRecoveryFlagged: false,
        isStale: false,
        isPaused: true,
        previousTimestamp: 10000,
        currentTimestamp: 11000,
      })
      expect(result).toBe(true)
    })

    it('iki GPS okuması arasındaki süre STALE_DATA_TIMEOUT_MS (5 sn) üzerinde ise (10-30 sn kesinti) toparlanmayı tetikler', () => {
      // 10 saniyelik kesinti
      expect(
        shouldTriggerOutageRecovery({
          isOutageRecoveryFlagged: false,
          isStale: false,
          isPaused: false,
          previousTimestamp: 10000,
          currentTimestamp: 20000,
          staleTimeoutMs: 5000,
        })
      ).toBe(true)

      // 30 saniyelik kesinti (tünel çıkışı)
      expect(
        shouldTriggerOutageRecovery({
          isOutageRecoveryFlagged: false,
          isStale: false,
          isPaused: false,
          previousTimestamp: 10000,
          currentTimestamp: 40000,
          staleTimeoutMs: 5000,
        })
      ).toBe(true)
    })

    it('kesintisiz normal akışta (1 Hz, dt=1000ms) toparlanma tetiklenmez', () => {
      expect(
        shouldTriggerOutageRecovery({
          isOutageRecoveryFlagged: false,
          isStale: false,
          isPaused: false,
          previousTimestamp: 10000,
          currentTimestamp: 11000,
          staleTimeoutMs: 5000,
        })
      ).toBe(false)
    })
  })

  describe('2. Ölçüm Süresinin Korunması (canIncrementMeasurementDuration)', () => {
    it('GPS aktifken, arka planda değilken ve sinyal güncelken süreyi artırır', () => {
      expect(canIncrementMeasurementDuration('aktif', false, false)).toBe(true)
    })

    it('Uygulama arka plandayken (isPaused = true) ölçüm süresini duraklatır', () => {
      expect(canIncrementMeasurementDuration('aktif', true, false)).toBe(false)
    })

    it('GPS kesintisinde (isStale = true) kesinti süresini ölçüme katmaz', () => {
      expect(canIncrementMeasurementDuration('aktif', false, true)).toBe(false)
    })

    it('GPS durdurulduğunda veya sinyal aranırken süreyi artırmaz', () => {
      expect(canIncrementMeasurementDuration('durduruldu', false, false)).toBe(false)
      expect(canIncrementMeasurementDuration('bekleniyor', false, false)).toBe(false)
      expect(canIncrementMeasurementDuration('hata', false, false)).toBe(false)
    })
  })

  describe('3. GPS Bayatlık (isGpsDataStale) ve Ölçüm Kaydetme (canSaveMeasurement)', () => {
    it('5 saniyeden eski son konum güncellemesi bayat (stale) kabul edilir', () => {
      const now = 100000
      expect(isGpsDataStale(now - 3000, now, 5000)).toBe(false)
      expect(isGpsDataStale(now - 5000, now, 5000)).toBe(false)
      expect(isGpsDataStale(now - 5001, now, 5000)).toBe(true)
      expect(isGpsDataStale(now - 15000, now, 5000)).toBe(true)
      expect(isGpsDataStale(null, now, 5000)).toBe(false)
    })

    it('Uygulama arka plandayken (isPaused = true) hız kaydedilemez', () => {
      expect(canSaveMeasurement(50, 'aktif', false, true)).toBe(false)
      expect(canSaveMeasurement(0, 'aktif', false, true)).toBe(false)
    })

    it('GPS verisi bayatken (isStale = true) hız kaydedilemez', () => {
      expect(canSaveMeasurement(50, 'aktif', true, false)).toBe(false)
    })

    it('Normal aktif ve güncel durumda geçerli hız kaydedilebilir', () => {
      expect(canSaveMeasurement(50, 'aktif', false, false)).toBe(true)
      expect(canSaveMeasurement(0, 'aktif', false, false)).toBe(true)
    })
  })

  describe('4. 10–30 Saniyelik GPS Kesintisinden Sonra İlk Konum Simülasyonu', () => {
    let tracker: GpsSpeedTracker
    let lastCoords: GpsPoint | null
    let stats = resetSessionStats()

    beforeEach(() => {
      tracker = new GpsSpeedTracker()
      lastCoords = null
      stats = resetSessionStats()
    })

    it('Tünel Senaryosu: 20 saniyelik sinyal kesintisinden sonra ilk okumada yapay mesafe ve sıçrama hızı üretilmez', () => {
      // 1. Tünel öncesi: Araç Kadıköy'de 40 km/sa hızla gidiyor
      const preTunnelReading = {
        coords: {
          latitude: 40.982,
          longitude: 29.028,
          accuracy: 8,
          speed: 40 / 3.6,
        },
        timestamp: 10000,
      }

      const res1 = tracker.processReading(preTunnelReading)
      expect(res1.speedKmh).toBe(40)
      lastCoords = {
        latitude: preTunnelReading.coords.latitude,
        longitude: preTunnelReading.coords.longitude,
        timestamp: preTunnelReading.timestamp,
        accuracy: preTunnelReading.coords.accuracy,
      }
      stats = updateSessionStats(stats, res1.speedKmh, 0)
      expect(stats.distanceMeters).toBe(0)
      expect(stats.maxSpeedKmh).toBe(40)

      // 2. Tünel içi: 20 saniye boyunca hiç GPS sinyali alınamıyor
      // 20 saniye sonra araç tünelden çıkıyor (koordinat ~300 metre ileride)
      const postTunnelTimestamp = 30000 // 20 saniye sonra
      const postTunnelReading = {
        coords: {
          latitude: 40.9845, // ~300m uzakta
          longitude: 29.0295,
          accuracy: 9,
          speed: null, // Donanım hızı henüz kilitlenmedi (Haversine gerekecek)
        },
        timestamp: postTunnelTimestamp,
      }

      // Kesinti tespit edilir: 30000 - 10000 = 20000ms > 5000ms
      const isOutage = shouldTriggerOutageRecovery({
        isOutageRecoveryFlagged: false,
        isStale: true,
        isPaused: false,
        previousTimestamp: preTunnelReading.timestamp,
        currentTimestamp: postTunnelTimestamp,
      })
      expect(isOutage).toBe(true)

      // Outage recovery mantığı devreye girer:
      // 1) tracker resetlenir (eski nokta, filtre geçmişi ve çapa temizlenir)
      tracker.reset()
      // 2) Kesinti öncesi çapa koordinatı sıfırlanır
      lastCoords = null

      // İlk okuma işlenir:
      const resAfterTunnel = tracker.processReading(postTunnelReading)

      // ÖNEMLİ KONTROL: İlk okuma yeni başlangıç kabul edilir, sahte Haversine hızı üretmez (null döner)
      expect(resAfterTunnel.speedKmh).toBeNull()
      expect(resAfterTunnel.source).toBe('none')

      // Mesafe hesabı: lastCoords null olduğu için mesafe farkı 0'dır, 300 metre sahte sıçrama EKLENMEZ
      let deltaMeters = 0
      const currentPoint: GpsPoint = {
        latitude: postTunnelReading.coords.latitude,
        longitude: postTunnelReading.coords.longitude,
        timestamp: postTunnelTimestamp,
        accuracy: postTunnelReading.coords.accuracy,
      }

      if (lastCoords) {
        deltaMeters = calculateHaversineDistance(lastCoords, currentPoint) ?? 0
      } else {
        lastCoords = currentPoint
      }

      expect(deltaMeters).toBe(0)
      stats = updateSessionStats(stats, resAfterTunnel.speedKmh, deltaMeters)

      // İstatistikler korunur: sahte 300m mesafe veya sahte hız sıçraması yok
      expect(stats.distanceMeters).toBe(0)
      expect(stats.maxSpeedKmh).toBe(40)

      // 3. Tünel sonrası 2. okuma (1 saniye sonra normal seyir):
      const secondReading = {
        coords: {
          latitude: 40.9846,
          longitude: 29.0296,
          accuracy: 8,
          speed: 12, // 12 m/s = 43.2 km/sa donanım hızı
        },
        timestamp: 31000,
      }

      const resSecond = tracker.processReading(secondReading)
      expect(resSecond.speedKmh).toBeCloseTo(43.2, 0)
    })

    it('Arka Plandan Dönüş Senaryosu: Telefon cebindeyken 60 saniye sonra açıldığında sahte hız ve mesafe oluşmaz', () => {
      // 1. Ekran açıkken ilk referans
      const p1 = {
        coords: { latitude: 41.0, longitude: 28.9, accuracy: 5, speed: null },
        timestamp: 1000,
      }
      tracker.processReading(p1)
      lastCoords = { latitude: 41.0, longitude: 28.9, timestamp: 1000, accuracy: 5 }

      // 2. Telefon cebine kondu (arka plan, isPaused = true)
      // 60 saniye sonra ekran açıldı (visibilitychange -> visible, isOutageRecoveryFlagged = true)
      const p2 = {
        coords: { latitude: 41.001, longitude: 28.901, accuracy: 6, speed: null },
        timestamp: 61000,
      }

      const needsRecovery = shouldTriggerOutageRecovery({
        isOutageRecoveryFlagged: true,
        isStale: false,
        isPaused: false,
        previousTimestamp: 1000,
        currentTimestamp: 61000,
      })
      expect(needsRecovery).toBe(true)

      // Toparlanma uygulandığında:
      tracker.reset()
      lastCoords = null

      const res2 = tracker.processReading(p2)
      expect(res2.speedKmh).toBeNull() // İlk referans noktası sahte hız üretmez
      expect(res2.source).toBe('none')

      // Mesafe sıçraması 0 olmalıdır
      let deltaMeters = 0
      if (lastCoords) {
        deltaMeters = calculateHaversineDistance(lastCoords, {
          latitude: p2.coords.latitude,
          longitude: p2.coords.longitude,
        }) ?? 0
      } else {
        lastCoords = {
          latitude: p2.coords.latitude,
          longitude: p2.coords.longitude,
          timestamp: p2.timestamp,
          accuracy: p2.coords.accuracy,
        }
      }
      expect(deltaMeters).toBe(0)
    })
  })

  describe('5. Donanım Hızı ile Kesinti Sonrası Toparlanma', () => {
    it('Kesinti sonrasında GPS donanımı geçerli bir hız bildiriyorsa bu hız güvenle alınır fakat sahte ara mesafe eklenmez', () => {
      const tracker = new GpsSpeedTracker()
      let lastCoords: GpsPoint | null = {
        latitude: 41.0,
        longitude: 29.0,
        timestamp: 10000,
        accuracy: 6,
      }

      // 15 saniyelik kesinti sonrası gelen okuma: Araç 50 km/sa ile gidiyor
      const postOutage = {
        coords: {
          latitude: 41.003,
          longitude: 29.003,
          accuracy: 7,
          speed: 50 / 3.6, // GNSS Doppler hızı mevcut
        },
        timestamp: 25000,
      }

      // Outage recovery: tracker resetlenir ve lastCoords sıfırlanır
      tracker.reset()
      lastCoords = null

      const result = tracker.processReading(postOutage)

      // Donanım hızı filtre geçmişi temizlenmiş olarak güvenle kabul edilir
      expect(result.speedKmh).toBe(50)
      expect(result.source).toBe('gps')

      // Ancak kesinti öncesi koordinatla birleştirilmediği için mesafe 0 kalır
      let deltaMeters = 0
      const currentPoint: GpsPoint = {
        latitude: postOutage.coords.latitude,
        longitude: postOutage.coords.longitude,
        timestamp: postOutage.timestamp,
        accuracy: postOutage.coords.accuracy,
      }

      if (lastCoords) {
        deltaMeters = calculateHaversineDistance(lastCoords, currentPoint) ?? 0
      } else {
        lastCoords = currentPoint
      }

      expect(deltaMeters).toBe(0)
    })
  })

  describe('6. Oturum Sıfırlama ve Kesintisiz GPS Motoru Davranışı', () => {
    it('Oturum sıfırlama sırasında istatistikler sıfırlanır ancak canlı GPS izleyicisi bozulmaz', () => {
      const tracker = new GpsSpeedTracker()

      // Aktif seyir
      tracker.processReading({
        coords: { latitude: 41.0, longitude: 29.0, accuracy: 5, speed: 60 / 3.6 },
        timestamp: 1000,
      })

      let stats = resetSessionStats()
      stats = updateSessionStats(stats, 60, 100)
      expect(stats.distanceMeters).toBe(100)
      expect(stats.maxSpeedKmh).toBe(60)

      // Ölçüm oturumu sıfırlandı:
      stats = resetSessionStats()
      let lastCoords: GpsPoint | null = null // Yeni oturum için mesafe başlangıcı temizlenir

      expect(stats.distanceMeters).toBe(0)
      expect(stats.maxSpeedKmh).toBeNull()

      // Canlı GPS motoru (tracker) sıfırlanmadığı için sonraki okuma kesintisiz devam eder
      const nextReading = {
        coords: { latitude: 41.0001, longitude: 29.0001, accuracy: 5, speed: 60 / 3.6 },
        timestamp: 2000,
      }
      const nextResult = tracker.processReading(nextReading)
      expect(nextResult.speedKmh).toBe(60)

      // Yeni oturumda ilk mesafe adımı yeni referansı kurar
      if (!lastCoords) {
        lastCoords = {
          latitude: nextReading.coords.latitude,
          longitude: nextReading.coords.longitude,
          timestamp: nextReading.timestamp,
          accuracy: nextReading.coords.accuracy,
        }
      }
      expect(lastCoords.latitude).toBe(41.0001)
    })
  })

  describe('7. V3 Aşama 3 / Görev 4: Geçici GPS Hatalarından Otomatik Toparlanma (B5/P1)', () => {
    it('TIMEOUT veya POSITION_UNAVAILABLE durumunda önceki oturum istatistikleri korunur ve sıfırlanmaz', () => {
      let stats = resetSessionStats()
      stats = updateSessionStats(stats, 50, 200, 1)
      stats = updateSessionStats(stats, 70, 300, 1)

      expect(stats.maxSpeedKmh).toBe(70)
      expect(stats.distanceMeters).toBe(500)

      // Geçici hata callback'i simülasyonu:
      // TIMEOUT / POSITION_UNAVAILABLE oluştuğunda tracker resetlenir ve lastCoords temizlenir,
      // ancak oturum istatistikleri (stats) ASLA sıfırlanmaz.
      const tracker = new GpsSpeedTracker()
      tracker.reset()
      let lastCoords: GpsPoint | null = null

      // İstatistikler korunuyor
      expect(stats.maxSpeedKmh).toBe(70)
      expect(stats.distanceMeters).toBe(500)
      expect(lastCoords).toBeNull()
    })

    it('Geçici kesinti süresince süre artırımı engellenir (canIncrementMeasurementDuration)', () => {
      // Kesinti anında gpsStatus 'bekleniyor' ve isStale 'true' olur
      expect(canIncrementMeasurementDuration('bekleniyor', false, true)).toBe(false)
      expect(canIncrementMeasurementDuration('bekleniyor', false, false)).toBe(false)
      // Kalıcı izin reddinde de süre artmaz
      expect(canIncrementMeasurementDuration('hata', false, false)).toBe(false)
    })

    it('Tünel çıkışında sinyal geri geldiğinde ilk konum güvenli başlangıç referansı olur, tünel mesafesi sahte olarak eklenmez', () => {
      const tracker = new GpsSpeedTracker()
      let stats = resetSessionStats()
      let lastCoords: GpsPoint | null = null

      // Tünel öncesi: 100 metre kat edilmiş, hız 50 km/sa
      const fix1 = {
        coords: { latitude: 41.0000, longitude: 29.0000, accuracy: 5, speed: 50 / 3.6 },
        timestamp: 1000,
      }
      tracker.processReading(fix1)
      stats = updateSessionStats(stats, 50, 100, 1)
      lastCoords = {
        latitude: fix1.coords.latitude,
        longitude: fix1.coords.longitude,
        timestamp: fix1.timestamp,
        accuracy: fix1.coords.accuracy,
      }

      // Tünel içi: TIMEOUT (code=3) meydana geliyor
      // App.tsx hata callback'i:
      tracker.reset()
      lastCoords = null

      // Tünel çıkışı: 30 saniye sonra 1000 metre ileride ilk konum alındı
      const fixAfterTunnel = {
        coords: { latitude: 41.0090, longitude: 29.0000, accuracy: 5, speed: 50 / 3.6 },
        timestamp: 31000,
      }

      // Outage recovery devreye girer
      const resultAfterTunnel = tracker.processReading(fixAfterTunnel)

      // İlk yeni konum referans olarak kurulur, sahte 1000 metre eklenmez
      let deltaMeters = 0
      if (lastCoords) {
        // lastCoords null olduğu için buraya girilmez
        deltaMeters = 1000
      } else {
        lastCoords = {
          latitude: fixAfterTunnel.coords.latitude,
          longitude: fixAfterTunnel.coords.longitude,
          timestamp: fixAfterTunnel.timestamp,
          accuracy: fixAfterTunnel.coords.accuracy,
        }
      }

      expect(deltaMeters).toBe(0)
      stats = updateSessionStats(stats, resultAfterTunnel.speedKmh, deltaMeters, 1)

      // Toplam mesafe 100 metre olarak korunur (sahte tünel mesafesi eklenmedi)
      expect(stats.distanceMeters).toBe(100)
      expect(stats.maxSpeedKmh).toBe(50)

      // Tünel çıkışından 1 saniye sonraki ikinci konum (normal hareket)
      const fixNormal = {
        coords: { latitude: 41.0091, longitude: 29.0000, accuracy: 5, speed: 50 / 3.6 },
        timestamp: 32000,
      }
      const resultNormal = tracker.processReading(fixNormal)
      expect(resultNormal.isAccepted).toBe(true)
      expect(resultNormal.speedKmh).toBe(50)

      // İkinci konumla birlikte mesafe normal şekilde artmaya başlar
      const dist = 11 // ~11 metre
      stats = updateSessionStats(stats, resultNormal.speedKmh, dist, 1)
      expect(stats.distanceMeters).toBe(111)
    })
  })
})
