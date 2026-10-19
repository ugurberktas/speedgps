import { describe, it, expect } from 'vitest'
import { SpeedFilter, calculateMedian } from './speedFilter'
import { updateSessionStats, INITIAL_SESSION_STATS } from './measurementSession'
import { GPS_RELIABILITY_CONFIG } from './gpsReliability'

describe('GPS Speed Filter (speedFilter)', () => {
  describe('calculateMedian', () => {
    it('boş dizide 0 döner', () => {
      expect(calculateMedian([])).toBe(0)
    })

    it('tek elemanlı dizide o elemanı döner', () => {
      expect(calculateMedian([45])).toBe(45)
    })

    it('3 elemanlı dizinin ortanca değerini bulur', () => {
      expect(calculateMedian([10, 80, 20])).toBe(20)
      expect(calculateMedian([50, 40, 60])).toBe(50)
      // Ani sıçramayı eler: 40, 180, 42 -> 42
      expect(calculateMedian([40, 180, 42])).toBe(42)
    })

    it('çift elemanlı dizide ortadaki iki sayının ortalamasını alır', () => {
      expect(calculateMedian([10, 20])).toBe(15)
    })
  })

  describe('SpeedFilter — Sıçrama, Jitter ve Yumuşatma', () => {
    it('1. Normal hızlanma ve yavaşlama: Doğal hız değişimleri gecikmesiz kabul edilir', () => {
      const filter = new SpeedFilter()

      // 0 -> 15 -> 30 -> 45 km/sa (1 sn aralıklarla normal hızlanma)
      const res1 = filter.filter(15, { source: 'gps', timeDeltaSeconds: 1 })
      expect(res1.filteredSpeedKmh).toBe(15)
      expect(res1.isSpikeRejected).toBe(false)

      const res2 = filter.filter(30, { source: 'gps', timeDeltaSeconds: 1 })
      expect(res2.filteredSpeedKmh).toBe(30)

      const res3 = filter.filter(45, { source: 'gps', timeDeltaSeconds: 1 })
      expect(res3.filteredSpeedKmh).toBe(45)

      // Yavaşlama: 45 -> 25 -> 0 km/sa
      const res4 = filter.filter(25, { source: 'gps', timeDeltaSeconds: 1 })
      expect(res4.filteredSpeedKmh).toBe(25)

      const res5 = filter.filter(0, { source: 'gps', timeDeltaSeconds: 1 })
      expect(res5.filteredSpeedKmh).toBe(0)
    })

    it('2. Ani ve gerçekçi olmayan GPS sıçramaları (Spikes): Fiziksel sınırları aşan hızlar reddedilir', () => {
      const filter = new SpeedFilter()

      // 40 km/sa ile seyir halinde
      filter.filter(40, { source: 'gps', timeDeltaSeconds: 1 })

      // Anormal sıçrama: 1 saniyede 40'tan 180 km/sa'e (140 km/sa/sn ivme)
      const spikeRes = filter.filter(180, { source: 'gps', timeDeltaSeconds: 1 })
      expect(spikeRes.isSpikeRejected).toBe(true)
      // Önceki kabul edilen hız korunur
      expect(spikeRes.filteredSpeedKmh).toBe(40)

      // Maksimum gerçekçi sınırın (> 250 km/sa) üzerindeki tekil sıçramalar doğrudan reddedilir
      const superSpike = filter.filter(320, { source: 'gps', timeDeltaSeconds: 1 })
      expect(superSpike.isSpikeRejected).toBe(true)
      expect(superSpike.filteredSpeedKmh).toBe(40)
    })

    it('3. Sabit konum ve GPS jitter: 2.5 km/sa altındaki koordinat dalgalanmaları 0 km/sa kabul edilir', () => {
      const filter = new SpeedFilter()

      // Telefon masa üstünde dururken GPS konumunun 1-2 metre dalgalanmasıyla oluşan 1.8 km/sa hız
      const jitterRes = filter.filter(1.8, { source: 'haversine', timeDeltaSeconds: 1 })
      expect(jitterRes.filteredSpeedKmh).toBe(0)
      expect(jitterRes.isStationaryClamped).toBe(true)

      // 0.8 km/sa doğrudan hız
      const directJitter = filter.filter(0.8, { source: 'gps', timeDeltaSeconds: 1 })
      expect(directJitter.filteredSpeedKmh).toBe(0)
      expect(directJitter.isStationaryClamped).toBe(true)
    })

    it('4. Geçerli 0 km/sa değeri bozulmadan korunur', () => {
      const filter = new SpeedFilter()
      const zeroRes = filter.filter(0, { source: 'gps', timeDeltaSeconds: 1 })
      expect(zeroRes.filteredSpeedKmh).toBe(0)
      expect(zeroRes.isStationaryClamped).toBe(false)
    })

    it('5. Null GPS hızı ve Haversine alternatifi: Haversine hızında medyan ve EMA yumuşatma uygulanır', () => {
      const filter = new SpeedFilter()

      // Haversine okumaları (Platform GPS hızı coords.speed null)
      // 1. Örnek: 40 km/sa
      const h1 = filter.filter(40, { source: 'haversine', timeDeltaSeconds: 1 })
      expect(h1.filteredSpeedKmh).toBe(40)

      // 2. Örnek: 50 km/sa -> [40, 50] medyanı 45, EMA: 0.75*45 + 0.25*40 = 43.8
      const h2 = filter.filter(50, { source: 'haversine', timeDeltaSeconds: 1 })
      expect(h2.filteredSpeedKmh).toBe(43.8)

      // 3. Örnek: Haversine tekil sıçraması (120 km/sa yerine önceki trend korunur)
      const h3Spike = filter.filter(120, { source: 'haversine', timeDeltaSeconds: 1 })
      expect(h3Spike.isSpikeRejected).toBe(true)
    })

    it('6. GPS sinyal kaybı ve yeniden gelmesi (Recovery): Null girdide null döner, sinyal dönünce taze başlar', () => {
      const filter = new SpeedFilter()

      filter.filter(50, { source: 'gps', timeDeltaSeconds: 1 })

      // Sinyal kesildi -> null hız
      const nullRes = filter.filter(null, { source: 'gps', timeDeltaSeconds: 1 })
      expect(nullRes.filteredSpeedKmh).toBeNull()

      // Sinyal geri geldiğinde filtre sıfırlanıp taze hızla devam edebilir
      filter.reset()
      const recoveryRes = filter.filter(35, { source: 'gps', timeDeltaSeconds: 1 })
      expect(recoveryRes.filteredSpeedKmh).toBe(35)
      expect(recoveryRes.isSpikeRejected).toBe(false)
    })

    it('7. Yeni Ölçüm sonrası filtre durumunun sıfırlanması: reset() tüm dahili hafızayı temizler', () => {
      const filter = new SpeedFilter()

      filter.filter(60, { source: 'haversine', timeDeltaSeconds: 1 })
      filter.filter(65, { source: 'haversine', timeDeltaSeconds: 1 })
      expect(filter.getLastAcceptedSpeed()).not.toBeNull()
      expect(filter.getMedianWindow().length).toBeGreaterThan(0)
      expect(filter.getEmaSpeed()).not.toBeNull()

      // Yeni Ölçüm yapıldı
      filter.reset()
      expect(filter.getLastAcceptedSpeed()).toBeNull()
      expect(filter.getMedianWindow()).toEqual([])
      expect(filter.getEmaSpeed()).toBeNull()
    })
  })

  describe('Sprint 5 / Adım 1: Ölçüm Mantığı, Sınır Durumları ve İstatistik Bütünlüğü', () => {
    describe('1. 2.5 km/sa Altındaki Gerçek Yürüyüş Hızlarının Korunumu', () => {
      it('Platform GPS hızında (coords.speed) 1.0 - 2.5 km/sa arası gerçek yürüyüş hızları sıfırlanmaz', () => {
        const filter = new SpeedFilter()

        // 1.2 km/sa yavaş adımlarla yürüyüş
        const slow1 = filter.filter(1.2, { source: 'gps', timeDeltaSeconds: 1 })
        expect(slow1.filteredSpeedKmh).toBe(1.2)
        expect(slow1.isStationaryClamped).toBe(false)

        // 1.8 km/sa normal sakin yürüyüş
        const slow2 = filter.filter(1.8, { source: 'gps', timeDeltaSeconds: 1 })
        expect(slow2.filteredSpeedKmh).toBe(1.8)
        expect(slow2.isStationaryClamped).toBe(false)

        // 2.2 km/sa yürüyüş
        const slow3 = filter.filter(2.2, { source: 'gps', timeDeltaSeconds: 1 })
        expect(slow3.filteredSpeedKmh).toBe(2.2)
        expect(slow3.isStationaryClamped).toBe(false)
      })

      it('Haversine hızında >= 2.0 metre doğrulanmış yer değiştirme olduğunda 2.5 km/sa altı hız korunur', () => {
        const filter = new SpeedFilter()

        // 5 saniyede 2.5 metre yürüyüş (0.5 m/s = 1.8 km/sa)
        const walkHaversine = filter.filter(1.8, {
          source: 'haversine',
          timeDeltaSeconds: 5,
          distanceMeters: 2.5,
        })
        expect(walkHaversine.filteredSpeedKmh).toBe(1.8)
        expect(walkHaversine.isStationaryClamped).toBe(false)
      })
    })

    describe('2. Sabit Konum ve Durgunluk Titremesi', () => {
      it('Platform GPS hızında 1.0 km/sa altındaki donanım gürültüsü 0 km/sa olarak sıfırlanır', () => {
        const filter = new SpeedFilter()

        const noise1 = filter.filter(0.4, { source: 'gps', timeDeltaSeconds: 1 })
        expect(noise1.filteredSpeedKmh).toBe(0)
        expect(noise1.isStationaryClamped).toBe(true)

        const noise2 = filter.filter(0.9, { source: 'gps', timeDeltaSeconds: 1 })
        expect(noise2.filteredSpeedKmh).toBe(0)
        expect(noise2.isStationaryClamped).toBe(true)
      })

      it('Haversine mesafe titremesi (< 2.0m) hız 2.5 km/sa altında olduğunda 0 km/sa yapılır', () => {
        const filter = new SpeedFilter()

        const jitter = filter.filter(1.5, {
          source: 'haversine',
          timeDeltaSeconds: 1,
          distanceMeters: 0.8,
        })
        expect(jitter.filteredSpeedKmh).toBe(0)
        expect(jitter.isStationaryClamped).toBe(true)
      })

      it('Sabit konumda hız 0 iken koordinat dalgalanmaları yapay mesafe eklemez', () => {
        let stats = { ...INITIAL_SESSION_STATS }

        // Araç kırmızı ışıkta veya masa başında: hız 0, koordinat 1.2 metre dalgalandı
        const speedKmh = 0
        const deltaMeters = 0 // hız 0 veya mesafe < 2m olduğundan App.tsx deltaMeters = 0 üretir

        stats = updateSessionStats(stats, speedKmh, deltaMeters)
        expect(stats.distanceMeters).toBe(0)
        expect(stats.maxSpeedKmh).toBe(0)
      })
    })

    describe('3. 2 Metrelik Mesafe Filtresinin Kümülatif Korunumu (Yavaş Harekette Mesafe Kaybı Testi)', () => {
      it('1.8 km/sa hızında adım adım yürüyüşte kümülatif 2 metreye ulaşıldığında tam mesafe kaydedilir', () => {
        // App.tsx içerisindeki lastCoordsRef mantığını simüle eden kümülatif test:
        // Kullanıcı saniyede 0.5 metre ilerliyor (1.8 km/sa)
        let lastAnchoredMeters = 0
        let totalRecordedMeters = 0
        let stats = { ...INITIAL_SESSION_STATS }
        const speedKmh = 1.8 // Gerçek yürüyüş hızı (artık 0'a sıfırlanmıyor)

        // 8 saniye boyunca her saniye 0.5 metre ilerleme
        for (let second = 1; second <= 8; second++) {
          const currentPositionMeters = second * 0.5
          const distFromAnchor = currentPositionMeters - lastAnchoredMeters

          let deltaMeters = 0
          if (
            distFromAnchor >= GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS &&
            speedKmh > 0
          ) {
            deltaMeters = distFromAnchor
            lastAnchoredMeters = currentPositionMeters
          }

          totalRecordedMeters += deltaMeters
          stats = updateSessionStats(stats, speedKmh, deltaMeters)

          // 1-3. saniyeler: dist < 2.0m -> delta = 0, anchor sabit kalır
          if (second < 4) {
            expect(deltaMeters).toBe(0)
            expect(totalRecordedMeters).toBe(0)
          }
          // 4. saniye: dist = 2.0m -> delta = 2.0m, kümülatif mesafe tam 2.0m olur!
          if (second === 4) {
            expect(deltaMeters).toBe(2.0)
            expect(totalRecordedMeters).toBe(2.0)
          }
          // 8. saniye: dist tekrar 2.0m -> toplam kaydedilen mesafe tam 4.0 metre olur!
          if (second === 8) {
            expect(deltaMeters).toBe(2.0)
            expect(totalRecordedMeters).toBe(4.0)
          }
        }

        // 8 saniye boyunca toplam 4.0 metre eksiksiz kaydedilmiştir, kayıp yoktur
        expect(stats.distanceMeters).toBe(4.0)
        expect(stats.maxSpeedKmh).toBe(1.8)
      })
    })

    describe('4. Normal Araç Hareketi ve İvmelenme/Yavaşlama', () => {
      it('Dur-kalk ve kademeli araç hızlanması (0 -> 120 km/sa) hiçbir adımı reddetmeden kabul eder', () => {
        const filter = new SpeedFilter()
        const speedProfile = [0, 15, 35, 60, 90, 120]

        for (const speed of speedProfile) {
          const res = filter.filter(speed, { source: 'gps', timeDeltaSeconds: 1 })
          expect(res.filteredSpeedKmh).toBe(speed)
          expect(res.isSpikeRejected).toBe(false)
        }
      })

      it('Sert ama gerçekçi araç frenlemesi (120 -> 0 km/sa) reddedilmez', () => {
        const filter = new SpeedFilter()

        // 120 km/sa ile seyir
        filter.filter(120, { source: 'gps', timeDeltaSeconds: 1 })

        // 120 -> 75 km/sa (fark 45 km/sa <= 54 km/sa sınırı)
        const decel1 = filter.filter(75, { source: 'gps', timeDeltaSeconds: 1 })
        expect(decel1.isSpikeRejected).toBe(false)
        expect(decel1.filteredSpeedKmh).toBe(75)

        // 75 -> 35 km/sa
        const decel2 = filter.filter(35, { source: 'gps', timeDeltaSeconds: 1 })
        expect(decel2.isSpikeRejected).toBe(false)
        expect(decel2.filteredSpeedKmh).toBe(35)

        // 35 -> 0 km/sa
        const decel3 = filter.filter(0, { source: 'gps', timeDeltaSeconds: 1 })
        expect(decel3.isSpikeRejected).toBe(false)
        expect(decel3.filteredSpeedKmh).toBe(0)
      })
    })

    describe('5. GPS Sıçramaları ve İstatistik Bütünlüğü', () => {
      it('Ani sıçramalar reddedilir ve maksimum/ortalama hız istatistiklerini kirletmez', () => {
        const filter = new SpeedFilter()
        let stats = { ...INITIAL_SESSION_STATS }

        // 40 km/sa ile normal seyir
        const normalRes = filter.filter(40, { source: 'gps', timeDeltaSeconds: 1 })
        expect(normalRes.filteredSpeedKmh).toBe(40)
        stats = updateSessionStats(stats, normalRes.filteredSpeedKmh, 11)

        expect(stats.maxSpeedKmh).toBe(40)
        expect(stats.avgSpeedKmh).toBe(40)

        // 1 saniyede 40 -> 190 km/sa anormal GPS sıçraması
        const spikeRes = filter.filter(190, { source: 'gps', timeDeltaSeconds: 1 })
        expect(spikeRes.isSpikeRejected).toBe(true)
        // Filtrelenmiş hız önceki kabul edilen güvenilir hızı korur
        expect(spikeRes.filteredSpeedKmh).toBe(40)

        // İstatistiğe giren hız 40 km/sa'dir, 190 km/sa kesinlikle girmez
        stats = updateSessionStats(stats, spikeRes.filteredSpeedKmh, 11)
        expect(stats.maxSpeedKmh).toBe(40)
        expect(stats.avgSpeedKmh).toBe(40)

        // 250 km/sa üzeri fiziksel imkansız tekil sıçrama (320 km/sa)
        const superSpike = filter.filter(320, { source: 'gps', timeDeltaSeconds: 1 })
        expect(superSpike.isSpikeRejected).toBe(true)
        expect(superSpike.filteredSpeedKmh).toBe(40)

        stats = updateSessionStats(stats, superSpike.filteredSpeedKmh, 11)
        expect(stats.maxSpeedKmh).toBe(40)
      })
    })
  })
})

