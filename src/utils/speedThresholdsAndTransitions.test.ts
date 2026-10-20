/**
 * SpeedGPS — V3 Aşama 2 / Görev 5: GPS Eşikleri ve Hız Kaynağı Geçişleri Testleri
 * V3 Listesi: Maddeler 19 ve 20
 */

import { describe, it, expect } from 'vitest'
import { GpsSpeedTracker, resolveSpeed } from './speedEngine'
import { SpeedFilter } from './speedFilter'

describe('V3 Görev 5: GPS Eşikleri Politikası (Madde 19)', () => {
  it('1. Donanım hızında 1.0 km/sa altı ölü bölge gürültüsü 0 yapılır, 1.0 - 2.5 km/sa yavaş yürüyüş korunur', () => {
    const tracker = new GpsSpeedTracker()

    // 0.2 m/s (~0.72 km/sa) -> 1.0 km/sa altı donanım gürültüsü -> 0 km/sa'e çekilir
    const noiseRes = tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, speed: 0.2, accuracy: 5 },
      timestamp: 1000,
    })
    expect(noiseRes.speedKmh).toBe(0)
    expect(noiseRes.source).toBe('gps')

    // 0.4 m/s (~1.44 km/sa) -> 1.0 - 2.5 km/sa arası gerçek yavaş yürüyüş hızı -> korunur
    const slowWalkRes = tracker.processReading({
      coords: { latitude: 41.00001, longitude: 28.0, speed: 0.4, accuracy: 5 },
      timestamp: 2000,
    })
    expect(slowWalkRes.speedKmh).toBe(1.4)
    expect(slowWalkRes.source).toBe('gps')
  })

  it('2. 250 km/sa üzerindeki aşırı sıçramalar reddedilir ve önceki geçerli hız korunur', () => {
    const filter = new SpeedFilter()

    // İlk geçerli hız: 100 km/sa
    const initial = filter.filter(100, { source: 'gps' })
    expect(initial.filteredSpeedKmh).toBe(100)
    expect(initial.isSpikeRejected).toBe(false)

    // 300 km/sa sıçrama (> 250 km/sa eşiği) -> reddedilir, önceki 100 km/sa korunur
    const spike = filter.filter(300, { source: 'gps' })
    expect(spike.isSpikeRejected).toBe(true)
    expect(spike.filteredSpeedKmh).toBe(100)
  })

  it('3. İvmelenme sınırı: Fiziksel ivme eşiğini (15 m/s² = 54 km/sa/s) aşan ani değişimler reddedilir', () => {
    const filter = new SpeedFilter()

    // İlk hız: 50 km/sa
    filter.filter(50, { source: 'gps', timeDeltaSeconds: 1.0 })

    // 1 saniyede 50'den 130'a sıçrama (delta = 80 km/sa > max 54 km/sa) -> reddedilir
    const spikeRes = filter.filter(130, { source: 'gps', timeDeltaSeconds: 1.0 })
    expect(spikeRes.isSpikeRejected).toBe(true)
    expect(spikeRes.filteredSpeedKmh).toBe(50)

    // 1 saniyede 50'den 80'e normal ivmelenme (delta = 30 km/sa <= 54 km/sa) -> kabul edilir
    const normalRes = filter.filter(80, { source: 'gps', timeDeltaSeconds: 1.0 })
    expect(normalRes.isSpikeRejected).toBe(false)
    expect(normalRes.filteredSpeedKmh).toBe(80)
  })

  it('4. Haversine eşikleri: 25m üzeri zayıf doğruluk ve 500ms altı aralıklarda koordinatlardan hız türetilmez', () => {
    const prevPoint = { latitude: 41.0, longitude: 28.0, timestamp: 1000, accuracy: 10 }

    // Zayıf doğruluk (accuracy = 30m > 25m)
    const poorAccRes = resolveSpeed(
      {
        coords: { latitude: 41.0002, longitude: 28.0, accuracy: 30, speed: null },
        timestamp: 2000,
      },
      prevPoint
    )
    expect(poorAccRes.speedKmh).toBeNull()
    expect(poorAccRes.source).toBe('none')

    // 500 ms altı çok hızlı güncelleme (dt = 300 ms < 500 ms)
    const tooFastRes = resolveSpeed(
      {
        coords: { latitude: 41.0001, longitude: 28.0, accuracy: 10, speed: null },
        timestamp: 1300,
      },
      prevPoint
    )
    expect(tooFastRes.speedKmh).toBeNull()
    expect(tooFastRes.source).toBe('none')
  })

  it('5. Haversine durağanlık: 2.0 metre ve 2.5 km/sa altındaki koordinat dalgalanmaları 0 m ve 0 km/sa kalır', () => {
    const tracker = new GpsSpeedTracker()

    // t=0: İlk konum (speed null)
    tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, accuracy: 5, speed: null },
      timestamp: 1000,
    })

    // t=1: Masa üstünde 1 metrelik koordinat titremesi (< 2.0m eşiği)
    // 1 metre ~ 0.000009 derece enlem
    const jitterRes = tracker.processReading({
      coords: { latitude: 41.000009, longitude: 28.0, accuracy: 5, speed: null },
      timestamp: 2000,
    })
    expect(jitterRes.speedKmh).toBe(0)
    expect(jitterRes.source).toBe('haversine')
  })
})

describe('V3 Görev 5: Hız Kaynağı Geçişleri (Madde 20)', () => {
  it('1. Donanım hızından Haversine geçiş: Araç hareket halindeyken filtre gereksiz yere SIFIRLANMAZ ve sıçrama koruması sürer', () => {
    const tracker = new GpsSpeedTracker()

    // 1. GPS donanımıyla 54 km/sa seyir hızı (15 m/s)
    const gpsRes1 = tracker.processReading({
      coords: { latitude: 41.008, longitude: 28.978, accuracy: 5, speed: 15.0 },
      timestamp: 1000,
    })
    expect(gpsRes1.speedKmh).toBe(54)
    expect(gpsRes1.source).toBe('gps')

    // 2. Tünel/köprü öncesi son GPS okuması: 54 km/sa
    const gpsRes2 = tracker.processReading({
      coords: { latitude: 41.008135, longitude: 28.978, accuracy: 5, speed: 15.0 },
      timestamp: 2000,
    })
    expect(gpsRes2.speedKmh).toBe(54)
    expect(gpsRes2.source).toBe('gps')

    // 3. Geçiş anı: coords.speed aniden null oldu ama koordinatlar akıcı şekilde 15m ilerledi
    // 15m / 1s = 15 m/s = 54 km/sa. Kaynak haversine'e geçer, hız sürekliliği korunur
    const havResNormal = tracker.processReading({
      coords: { latitude: 41.00827, longitude: 28.978, accuracy: 5, speed: null },
      timestamp: 3000,
    })
    expect(havResNormal.source).toBe('haversine')
    expect(havResNormal.speedKmh).toBeCloseTo(54, 0)

    // 4. TEHLİKELİ GEÇİŞ TESTİ: Eğer filtre sıfırlanmış olsaydı, ilk Haversine okumasındaki
    // anormal sıçrama (|150 - 54| = 96 km/sa) ivme kontrolünü atlayıp kabul edilirdi.
    // Filtre hareket halindeyken korunmalı ve bu sıçrama reddedilmelidir!
    const tracker2 = new GpsSpeedTracker()
    tracker2.processReading({
      coords: { latitude: 41.008, longitude: 28.978, accuracy: 5, speed: 15.0 },
      timestamp: 1000,
    })
    tracker2.processReading({
      coords: { latitude: 41.008135, longitude: 28.978, accuracy: 5, speed: 15.0 },
      timestamp: 2000,
    })

    // coords.speed null oldu ve koordinat 50 metre (180 km/sa) fırladı (anormal sıçrama)
    // 50m enlem farkı ~ 0.00045 derece
    const havResSpike = tracker2.processReading({
      coords: { latitude: 41.008135 + 0.00045, longitude: 28.978, accuracy: 5, speed: null },
      timestamp: 3000,
    })
    // Sıçrama reddedilmeli, önceki 54 km/sa hızı korunmalıdır!
    expect(havResSpike.source).toBe('haversine')
    expect(havResSpike.speedKmh).toBe(54)
  })

  it('2. Durağan durumdan (0 km/sa) ilk harekete geçişte filtre temizlenir ve hızlı kalkış tepkisi verilir', () => {
    const tracker = new GpsSpeedTracker()

    // 1. Araç duruyor (0 km/sa)
    const stopRes = tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, accuracy: 5, speed: 0 },
      timestamp: 1000,
    })
    expect(stopRes.speedKmh).toBe(0)

    // 2. Dururken coords.speed null oldu ve 6 metre (21.6 km/sa) yer değiştirildi
    // 6 metre enlem ~ 0.000054 derece
    const moveRes = tracker.processReading({
      coords: { latitude: 41.000054, longitude: 28.0, accuracy: 5, speed: null },
      timestamp: 2000,
    })
    expect(moveRes.source).toBe('haversine')
    expect(moveRes.speedKmh).toBeGreaterThan(15)
  })

  it('3. Haversine modundan donanım hızına (coords.speed) dönüş sorunsuz ve pürüzsüz gerçekleşir', () => {
    const tracker = new GpsSpeedTracker()

    // 1. Başlangıçta coords.speed null (Haversine ile 36 km/sa seyrediyor)
    tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, accuracy: 5, speed: null },
      timestamp: 1000,
    })
    const havRes = tracker.processReading({
      coords: { latitude: 41.00009, longitude: 28.0, accuracy: 5, speed: null }, // 10m in 1s = 36 km/sa
      timestamp: 2000,
    })
    expect(havRes.source).toBe('haversine')
    expect(havRes.speedKmh).toBeCloseTo(36, 0)

    // 2. Donanım hızı geri geldi (coords.speed = 10 m/s = 36 km/sa)
    const gpsRes = tracker.processReading({
      coords: { latitude: 41.00018, longitude: 28.0, accuracy: 5, speed: 10.0 },
      timestamp: 3000,
    })
    expect(gpsRes.source).toBe('gps')
    expect(gpsRes.speedKmh).toBe(36)
  })

  it('4. Doğrudan 0 hız (coords.speed = 0) GPS donanımı olarak anında 0 döner, Haversine yapmaz', () => {
    const tracker = new GpsSpeedTracker()

    tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, accuracy: 5, speed: 10.0 },
      timestamp: 1000,
    })

    // coords.speed = 0 geldiğinde koordinat hafif kaysa bile GPS hızı önceliklidir
    const zeroRes = tracker.processReading({
      coords: { latitude: 41.00002, longitude: 28.0, accuracy: 5, speed: 0.0 },
      timestamp: 2000,
    })
    expect(zeroRes.speedKmh).toBe(0)
    expect(zeroRes.source).toBe('gps')
  })

  it('5. Düzensiz callback aralıkları (0.2s - 3.0s): Kısa aralıklar elenir, uzun aralıklarda orantılı ivme toleransı hesaplanır', () => {
    const filter = new SpeedFilter()
    filter.filter(36, { source: 'gps', timeDeltaSeconds: 1.0 })

    // dt = 0.2 saniye için taban tolerans 35 km/sa'dir (Math.max(15 * 0.2 * 3.6, 35) = 35)
    // 36'dan 65'e çıkış (+29 km/sa <= 35) kabul edilir
    const dtSmall = filter.filter(65, { source: 'gps', timeDeltaSeconds: 0.2 })
    expect(dtSmall.isSpikeRejected).toBe(false)
    expect(dtSmall.filteredSpeedKmh).toBe(65)

    // dt = 3.0 saniye için izin verilen ivme artışı: Math.max(15 * 3 * 3.6, 35) = 162 km/sa
    // 65'ten 150'ye çıkış (+85 km/sa <= 162) kabul edilir
    const dtLarge = filter.filter(150, { source: 'gps', timeDeltaSeconds: 3.0 })
    expect(dtLarge.isSpikeRejected).toBe(false)
    expect(dtLarge.filteredSpeedKmh).toBe(150)
  })
})
