/**
 * SpeedGPS — Sprint 6.4 / Adım 4: Ortalama Hız ve İstatistik Doğruluğu Testleri
 *
 * Kontrol Listesi:
 * 1. Eşit (1 Hz) ve düzensiz (0.2s, 0.5s, 1.5s, 3.0s) GPS örnekleme aralıkları
 * 2. Dur-kalk yolculuk (kırmızı ışıkta bekleme ve duraklamaların ağırlıklı etkisi)
 * 3. Sabit hızda örnekleme sıklığından bağımsız doğru ortalama
 * 4. Yavaş yürüyüş (çapa ve biriktirme ile tutarlı istatistikler)
 * 5. GPS kesintisi (tünel veya arka plandaki belirsiz sürenin ortalamayı bozmaması)
 * 6. Geçerli 0 km/sa ölçümünün ortalamaya dahil edilmesi
 * 7. Oturum sıfırlama (canlı GPS motorunun korunması)
 * 8. Mesafe, süre ve ortalama hızın birbirleriyle tutarlılığı
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  updateSessionStats,
  resetSessionStats,
  calculateAverageSpeed,
  calculateAverageSpeedFromDistance,
  type SessionStats,
} from './measurementSession'
import { GpsSpeedTracker } from './speedEngine'

describe('SpeedGPS — Sprint 6.4 / Adım 4: Ortalama Hız ve İstatistik Doğruluğu', () => {
  let stats: SessionStats

  beforeEach(() => {
    stats = resetSessionStats()
  })

  describe('1. Eşit ve Düzensiz GPS Örnekleme Aralıkları (Uniform vs Non-uniform Sampling)', () => {
    it('Eşit aralıklarda (1 Hz, dt=1s) zaman ağırlıklı ortalama hız aritmetik ortalama ile örtüşür', () => {
      // 10 saniye 40 km/sa
      stats = updateSessionStats(stats, 40, 11, 1.0)
      stats = updateSessionStats(stats, 40, 11, 1.0)
      // 10 saniye 60 km/sa
      stats = updateSessionStats(stats, 60, 16, 1.0)
      stats = updateSessionStats(stats, 60, 16, 1.0)

      // Toplam süre = 4s, toplam ağırlık = 40*2 + 60*2 = 200 -> ort = 50.0 km/sa
      expect(stats.avgSpeedKmh).toBe(50.0)
      expect(stats.maxSpeedKmh).toBe(60.0)
      expect(stats.totalDurationSeconds).toBe(4.0)
    })

    it('Düzensiz aralıklarda (ör. hızlı patlama vs yavaş güncelleme) aritmetik ortalama sapmasını önler', () => {
      // Senaryo:
      // Araç 1 saniye boyunca 100 km/sa hız yaptı, ancak GPS alıcısı bu 1 saniyede 5 örnek gönderdi (her 0.2 saniyede bir).
      for (let i = 0; i < 5; i++) {
        stats = updateSessionStats(stats, 100, 5.5, 0.2)
      }
      expect(stats.totalDurationSeconds).toBeCloseTo(1.0, 1)

      // Ardından araç 4 saniye boyunca 20 km/sa hızla gitti, ancak GPS sadece 1 örnek gönderdi (dt=4.0s).
      stats = updateSessionStats(stats, 20, 22.2, 4.0)
      expect(stats.totalDurationSeconds).toBeCloseTo(5.0, 1)

      // Basit aritmetik ortalama olsaydı: (100*5 + 20) / 6 = 520 / 6 = 86.6 km/sa çıkardı!
      // Gerçek fiziksel zaman ağırlıklı ortalama:
      // Toplam ağırlıklı hız = 100 * 1.0s + 20 * 4.0s = 100 + 80 = 180 (km/sa * s)
      // Toplam süre = 5.0 s
      // Ortalama hız = 180 / 5.0 = 36.0 km/sa!
      expect(stats.avgSpeedKmh).toBe(36.0)
    })

    it('Tekil bir hız sıçraması çok kısa bir süreye aitse ortalamayı aşırı saptırmaz', () => {
      // 10 saniye boyunca 50 km/sa ile seyir (dt=10s tek örnek veya 10x 1s)
      stats = updateSessionStats(stats, 50, 138, 10.0)
      expect(stats.avgSpeedKmh).toBe(50.0)

      // 0.1 saniyelik anlık 90 km/sa
      stats = updateSessionStats(stats, 90, 2.5, 0.1)

      // (50 * 10 + 90 * 0.1) / 10.1 = 509 / 10.1 = 50.39 -> 50.4 km/sa
      expect(stats.avgSpeedKmh).toBe(50.4)
      expect(stats.maxSpeedKmh).toBe(90.0)
    })
  })

  describe('2. Dur-Kalk Yolculuk ve Kırmızı Işıkta Bekleme (0 km/sa Etkisi)', () => {
    it('Kırmızı ışıkta bekleme süresi ortalama hızı orantılı şekilde düşürür', () => {
      // 1. Araç 60 saniye boyunca 60 km/sa hızla 1000 metre gitti
      stats = updateSessionStats(stats, 60, 1000, 60.0)
      expect(stats.avgSpeedKmh).toBe(60.0)
      expect(stats.distanceMeters).toBe(1000)

      // 2. Kırmızı ışığa geldi ve 40 saniye boyunca tamamen durdu (0 km/sa)
      stats = updateSessionStats(stats, 0, 0, 40.0)

      // Toplam süre = 100 saniye, toplam mesafe = 1000 metre
      // Ortalama hız = (60 * 60 + 0 * 40) / 100 = 3600 / 100 = 36.0 km/sa
      // Mesafe / süre ile: 1000m / 100s = 10 m/s = 36.0 km/sa!
      expect(stats.avgSpeedKmh).toBe(36.0)
      expect(stats.maxSpeedKmh).toBe(60.0)
      expect(stats.distanceMeters).toBe(1000)
    })

    it('Çoklu dur-kalk serisinde geçerli 0 km/sa değerleri ortalamayı doğru ağırlıklandırır', () => {
      // t=1..5 (5 sn): 30 km/sa
      stats = updateSessionStats(stats, 30, 41, 5.0)
      // t=6..10 (5 sn): 0 km/sa (durdu)
      stats = updateSessionStats(stats, 0, 0, 5.0)
      // t=11..15 (5 sn): 50 km/sa
      stats = updateSessionStats(stats, 50, 69, 5.0)
      // t=16..20 (5 sn): 0 km/sa (durdu)
      stats = updateSessionStats(stats, 0, 0, 5.0)

      // Toplam süre = 20s
      // Ağırlık = 30*5 + 0*5 + 50*5 + 0*5 = 150 + 250 = 400
      // Ortalama = 400 / 20 = 20.0 km/sa
      expect(stats.avgSpeedKmh).toBe(20.0)
      expect(stats.maxSpeedKmh).toBe(50.0)
    })
  })

  describe('3. Sabit Hız ve Yavaş Yürüyüş', () => {
    it('Sabit hızda (ör. 80 km/sa) farklı aralıklarda örnekleme olsa bile ortalama değişmez', () => {
      stats = updateSessionStats(stats, 80, 22, 1.0)
      stats = updateSessionStats(stats, 80, 44, 2.0)
      stats = updateSessionStats(stats, 80, 11, 0.5)
      stats = updateSessionStats(stats, 80, 66, 3.0)

      expect(stats.avgSpeedKmh).toBe(80.0)
      expect(stats.maxSpeedKmh).toBe(80.0)
    })

    it('Yavaş yürüyüş hızında (3.5 km/sa) ortalama hız tutarlı şekilde birikir', () => {
      // 10 saniye yürüyüş: ~9.7 metre
      stats = updateSessionStats(stats, 3.5, 9.7, 10.0)
      expect(stats.avgSpeedKmh).toBe(3.5)
      expect(stats.maxSpeedKmh).toBe(3.5)
      expect(stats.distanceMeters).toBe(9.7)
    })
  })

  describe('4. Hareketsizken Ölçüm Başlatma (Geçerli 0 km/sa)', () => {
    it('Kullanıcı hareketsizken başladığında ortalama hız null veya 0 kalır; hata üretmez', () => {
      // Henüz hiç ölçüm yokken
      expect(stats.avgSpeedKmh).toBeNull()

      // İlk örnek: duruyor (0 km/sa)
      stats = updateSessionStats(stats, 0, 0, 1.0)
      expect(stats.avgSpeedKmh).toBe(0.0)
      expect(stats.maxSpeedKmh).toBe(0.0)
      expect(stats.distanceMeters).toBe(0)

      // 5 saniye daha durdu
      stats = updateSessionStats(stats, 0, 0, 5.0)
      expect(stats.avgSpeedKmh).toBe(0.0)
      expect(stats.distanceMeters).toBe(0)
    })
  })

  describe('5. GPS Kesintisi ve Geçersiz Ölçümlerin Elenmesi', () => {
    it('Hız null olduğunda (ör. kesinti veya ilk referans) ortalama hız bozulmaz', () => {
      stats = updateSessionStats(stats, 50, 50, 3.0)
      expect(stats.avgSpeedKmh).toBe(50.0)

      // Kesinti veya referans: hız null
      stats = updateSessionStats(stats, null, 0)
      expect(stats.avgSpeedKmh).toBe(50.0)
      expect(stats.maxSpeedKmh).toBe(50.0)
    })

    it('Tünel veya kesinti süresi (ör. 20 saniye) ortalama hız hesaplamasına sahte sıfır olarak eklenmez', () => {
      // Araç tünel öncesi 10 saniye boyunca 60 km/sa ile gitti
      stats = updateSessionStats(stats, 60, 166, 10.0)
      expect(stats.avgSpeedKmh).toBe(60.0)

      // Tünel içi: GPS sinyali yok. 20 saniyelik kesinti sırasında updateSessionStats çağrılmaz
      // Tünel çıkışı: ilk okuma null referans olarak alınır
      stats = updateSessionStats(stats, null, 0)
      expect(stats.avgSpeedKmh).toBe(60.0)

      // Tünel sonrası araç 60 km/sa ile devam ediyor (10s)
      stats = updateSessionStats(stats, 60, 166, 10.0)

      // Tüneldeki bilinmeyen 20 saniye ortalamaya sahte 0 olarak KARIŞMAZ
      // Ortalama hız 60.0 km/sa olarak korunur!
      expect(stats.avgSpeedKmh).toBe(60.0)
    })
  })

  describe('6. Mesafe, Süre ve Ortalama Hız Tutarlılığı (v = d / t)', () => {
    it('calculateAverageSpeedFromDistance ile zaman ağırlıklı ortalama hız aynı sonucu verir', () => {
      const distanceMeters = 1500 // 1.5 km
      const durationSeconds = 90 // 1.5 dakika

      const avgFromDist = calculateAverageSpeedFromDistance(distanceMeters, durationSeconds)
      // (1500 / 90) * 3.6 = 16.666... * 3.6 = 60.0 km/sa
      expect(avgFromDist).toBe(60.0)

      // Zaman ağırlıklı ile karşılaştırma:
      const weightedSum = 60.0 * 90 // 5400
      const avgFromWeight = calculateAverageSpeed(weightedSum, durationSeconds)
      expect(avgFromWeight).toBe(60.0)

      expect(avgFromDist).toBe(avgFromWeight)
    })

    it('Mesafe veya süre sıfır veya negatif olduğunda güvenli sonuç döner', () => {
      expect(calculateAverageSpeedFromDistance(0, 10)).toBe(0.0)
      expect(calculateAverageSpeedFromDistance(100, 0)).toBeNull()
      expect(calculateAverageSpeedFromDistance(-10, 10)).toBe(0.0)
      expect(calculateAverageSpeed(0, 0)).toBeNull()
      expect(calculateAverageSpeed(-50, 10)).toBe(0.0)
    })
  })

  describe('7. Oturum Sıfırlama ve GPS Motorunun Korunması', () => {
    it('resetSessionStats oturum istatistiklerini temizler, ancak tracker nesnesi canlı kalır', () => {
      const tracker = new GpsSpeedTracker()
      tracker.processReading({
        coords: { latitude: 41.0, longitude: 29.0, accuracy: 5, speed: 70 / 3.6 },
        timestamp: 1000,
      })

      stats = updateSessionStats(stats, 70, 200, 10.0)
      expect(stats.avgSpeedKmh).toBe(70.0)
      expect(stats.distanceMeters).toBe(200)

      // Oturum sıfırlandı
      stats = resetSessionStats()
      expect(stats.avgSpeedKmh).toBeNull()
      expect(stats.maxSpeedKmh).toBeNull()
      expect(stats.distanceMeters).toBe(0)
      expect(stats.totalDurationSeconds).toBe(0)
      expect(stats.weightedSpeedSum).toBe(0)

      // Canlı tracker sıfırlanmadığı için sonraki hız okuması kesintisiz gelir
      const nextRes = tracker.processReading({
        coords: { latitude: 41.0001, longitude: 29.0001, accuracy: 5, speed: 70 / 3.6 },
        timestamp: 2000,
      })
      expect(nextRes.speedKmh).toBe(70.0)
    })
  })
})
