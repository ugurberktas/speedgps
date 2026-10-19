import { describe, it, expect } from 'vitest'
import { resolveSpeed, GpsSpeedTracker, type GpsReadingInput } from './speedEngine'
import { type GpsPoint } from './gpsMath'

describe('Speed Engine (resolveSpeed)', () => {
  it('1. Doğrudan GPS hızı: coords.speed mevcutsa bunu kullanır ve source gps olur', () => {
    const reading: GpsReadingInput = {
      coords: {
        latitude: 41.0082,
        longitude: 28.9784,
        speed: 10, // 10 m/s = 36 km/sa
      },
      timestamp: 10000,
    }

    const result = resolveSpeed(reading, null)
    expect(result.speedKmh).toBe(36)
    expect(result.speedMs).toBe(10)
    expect(result.source).toBe('gps')
    expect(result.newPoint).toEqual({
      latitude: 41.0082,
      longitude: 28.9784,
      timestamp: 10000,
    })
  })

  it('2. Geçerli 0 hız değeri: coords.speed = 0 olduğunda alternatif hesaplamaya geçmez, 0 km/sa döner', () => {
    const previousPoint: GpsPoint = {
      latitude: 41.0082,
      longitude: 28.9784,
      timestamp: 5000,
    }

    const reading: GpsReadingInput = {
      coords: {
        latitude: 41.0083, // Farklı bir koordinat olsa bile
        longitude: 28.9785,
        speed: 0, // Araç duruyor
      },
      timestamp: 10000,
    }

    const result = resolveSpeed(reading, previousPoint)
    expect(result.speedKmh).toBe(0)
    expect(result.speedMs).toBe(0)
    expect(result.source).toBe('gps')
  })

  it('3. İlk konum verisi: coords.speed null ise ve önceki konum yoksa hız null ve source none olur', () => {
    const reading: GpsReadingInput = {
      coords: {
        latitude: 41.0082,
        longitude: 28.9784,
        speed: null,
      },
      timestamp: 10000,
    }

    const result = resolveSpeed(reading, null)
    expect(result.speedKmh).toBeNull()
    expect(result.speedMs).toBeNull()
    expect(result.source).toBe('none')
    expect(result.newPoint).not.toBeNull()
  })

  it('4. Null hızda koordinat hesabı: coords.speed null ise Haversine ile alternatif hız hesaplar', () => {
    // 0,0 noktasından 0,1 noktasına (~111195 m), 3600 saniye (3,600,000 ms)
    // Hız: ~30.89 m/s = ~111.2 km/sa
    const previousPoint: GpsPoint = {
      latitude: 0,
      longitude: 0,
      timestamp: 1000000,
    }

    const reading: GpsReadingInput = {
      coords: {
        latitude: 0,
        longitude: 1,
        speed: null, // Doğrudan hız yok
      },
      timestamp: 4600000, // 3600 saniye sonra
    }

    const result = resolveSpeed(reading, previousPoint)
    expect(result.source).toBe('haversine')
    expect(result.speedKmh).not.toBeNull()
    expect(result.speedKmh).toBe(111.2)
  })

  it('5. Hatalı koordinatlar: Enlem/boylam sınır dışı veya NaN ise null döner ve previousPoint korunur', () => {
    const previousPoint: GpsPoint = {
      latitude: 41.0,
      longitude: 28.0,
      timestamp: 1000,
    }

    const invalidReading: GpsReadingInput = {
      coords: {
        latitude: 95, // Geçersiz enlem
        longitude: 28.0,
        speed: 15,
      },
      timestamp: 2000,
    }

    const result = resolveSpeed(invalidReading, previousPoint)
    expect(result.speedKmh).toBeNull()
    expect(result.source).toBe('none')
    expect(result.newPoint).toBe(previousPoint)
  })

  it('6. Hatalı zaman damgası: Zaman damgası geçmişe gidiyorsa veya aynıysa hız hesaplanamaz', () => {
    const previousPoint: GpsPoint = {
      latitude: 41.0,
      longitude: 28.0,
      timestamp: 5000,
    }

    const staleReading: GpsReadingInput = {
      coords: {
        latitude: 41.01,
        longitude: 28.01,
        speed: null,
      },
      timestamp: 4000, // Geçmiş zaman
    }

    const result = resolveSpeed(staleReading, previousPoint)
    expect(result.speedKmh).toBeNull()
    expect(result.source).toBe('none')
  })

  it('7. Durdurup yeniden başlatma mantığı: Önceki konum temizlendiğinde (null) ilk adımda Haversine devreye girmez', () => {
    // 1. Adım: İlk ölçüm
    const reading1: GpsReadingInput = {
      coords: { latitude: 41.0, longitude: 28.0, speed: null },
      timestamp: 1000,
    }
    const res1 = resolveSpeed(reading1, null)
    expect(res1.speedKmh).toBeNull()

    // 2. Adım: İkinci ölçüm (Haversine ile hesaplanır)
    const reading2: GpsReadingInput = {
      coords: { latitude: 41.001, longitude: 28.0, speed: null },
      timestamp: 10000,
    }
    const res2 = resolveSpeed(reading2, res1.newPoint)
    expect(res2.source).toBe('haversine')
    expect(res2.speedKmh).not.toBeNull()

    // 3. Adım: Ölçüm durduruldu ve yeniden başlatıldı -> previousPoint = null
    const res3AfterReset = resolveSpeed(reading2, null)
    expect(res3AfterReset.speedKmh).toBeNull()
    expect(res3AfterReset.source).toBe('none')
  })

  it('8. GPS hatası ve geçmiş temizliği: Hata sonrasında konum geçmişi temizlendiğinde sonraki ilk veri ilk konum gibi davranır', () => {
    // 1. Adım: Aktif veri akışı
    const reading1: GpsReadingInput = {
      coords: { latitude: 41.0, longitude: 28.0, speed: null },
      timestamp: 1000,
    }
    const res1 = resolveSpeed(reading1, null)
    expect(res1.speedKmh).toBeNull()

    const reading2: GpsReadingInput = {
      coords: { latitude: 41.002, longitude: 28.0, speed: null },
      timestamp: 5000,
    }
    const res2 = resolveSpeed(reading2, res1.newPoint)
    expect(res2.source).toBe('haversine')
    expect(res2.speedKmh).toBeGreaterThan(0)

    // 2. Adım: GPS Hatası oluştu (ör. TIMEOUT veya POSITION_UNAVAILABLE)
    // Hata durumunda lastPointRef.current = null ve speedSource = 'none' yapılır
    const previousPointAfterError = null

    // 3. Adım: Hata sonrası GPS yeniden veri gönderdiğinde önceki geçmişe göre hesap yapılmamalıdır
    const reading3AfterRecovery: GpsReadingInput = {
      coords: { latitude: 41.005, longitude: 28.0, speed: null },
      timestamp: 20000,
    }
    const resAfterRecovery = resolveSpeed(reading3AfterRecovery, previousPointAfterError)
    expect(resAfterRecovery.speedKmh).toBeNull()
    expect(resAfterRecovery.source).toBe('none')
    expect(resAfterRecovery.newPoint).not.toBeNull()
  })

  it('9. Negatif hız (-1) ve geçersiz GPS donanım sinyalleri: Haversine alternatifine geçer', () => {
    const previousPoint: GpsPoint = {
      latitude: 0,
      longitude: 0,
      timestamp: 1000,
    }

    // Donanım hız belirleyemediğinde -1 döndürebilir
    const readingWithNegativeSpeed: GpsReadingInput = {
      coords: {
        latitude: 0,
        longitude: 0.001,
        speed: -1,
      },
      timestamp: 4000,
    }

    const result = resolveSpeed(readingWithNegativeSpeed, previousPoint)
    expect(result.source).toBe('haversine')
    expect(result.speedKmh).not.toBeNull()
  })

  it('10. Güvenilmez konum doğruluğu (accuracy > 100m): Veri reddedilir, speed null döner ve önceki nokta korunur', () => {
    const previousPoint: GpsPoint = {
      latitude: 41.0,
      longitude: 28.0,
      timestamp: 1000,
    }

    const readingWithPoorAccuracy: GpsReadingInput = {
      coords: {
        latitude: 41.002,
        longitude: 28.002,
        accuracy: 250, // 100 metre eşiğinin üzerinde (aşırı sapmalı)
        speed: 30,
      },
      timestamp: 3000,
    }

    const result = resolveSpeed(readingWithPoorAccuracy, previousPoint)
    expect(result.speedKmh).toBeNull()
    expect(result.source).toBe('none')
    expect(result.newPoint).toBe(previousPoint)
  })

  it('11. Tekrarlanan zaman damgası: Mükerrer zaman damgalı GPS verileri reddedilir', () => {
    const previousPoint: GpsPoint = {
      latitude: 41.0,
      longitude: 28.0,
      timestamp: 5000,
    }

    const duplicateReading: GpsReadingInput = {
      coords: {
        latitude: 41.001,
        longitude: 28.0,
        speed: 10,
      },
      timestamp: 5000, // Aynı zaman damgası
    }

    const result = resolveSpeed(duplicateReading, previousPoint)
    expect(result.speedKmh).toBeNull()
    expect(result.source).toBe('none')
    expect(result.newPoint).toBe(previousPoint)
  })

  it('12. Geriye giden zaman damgası: Önceki zamandan küçük zaman damgaları reddedilir', () => {
    const previousPoint: GpsPoint = {
      latitude: 41.0,
      longitude: 28.0,
      timestamp: 5000,
    }

    const backwardReading: GpsReadingInput = {
      coords: {
        latitude: 41.001,
        longitude: 28.0,
        speed: 10,
      },
      timestamp: 4500, // Geriye gitmiş zaman damgası
    }

    const result = resolveSpeed(backwardReading, previousPoint)
    expect(result.speedKmh).toBeNull()
    expect(result.source).toBe('none')
    expect(result.newPoint).toBe(previousPoint)
  })

  it('13. Sinyal kesintisi sonrası toparlanma (Recovery): Kesinti sonrası reset yapıldığında ilk veri yeni referans olur ve yapay hız üretilmez', () => {
    const tracker = new GpsSpeedTracker()

    // 1. Normal veri
    tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, speed: 20 },
      timestamp: 1000,
    })

    // 2. Sinyal kesildi -> Watchdog devresinde reset() çağrılır
    tracker.reset()
    expect(tracker.getPreviousPoint()).toBeNull()

    // 3. Sinyal geri geldiğinde (Recovery) ilk veri taze referans noktası olur, hız hesaplanmaz
    const recoveryRes = tracker.processReading({
      coords: { latitude: 41.005, longitude: 28.0, speed: null },
      timestamp: 20000,
    })
    expect(recoveryRes.speedKmh).toBeNull()
    expect(recoveryRes.source).toBe('none')
    expect(tracker.getPreviousPoint()?.timestamp).toBe(20000)

    // 4. Recovery sonrası gelen ikinci veri normal akışta hız hesaplar
    const subsequentRes = tracker.processReading({
      coords: { latitude: 41.0052, longitude: 28.0, speed: null },
      timestamp: 22000,
    })
    expect(subsequentRes.source).toBe('haversine')
    expect(subsequentRes.speedKmh).not.toBeNull()
  })
})

describe('GpsSpeedTracker Sınıfı ve Oturum Yönetimi', () => {
  it('tüm yaşam döngüsünü (doğrudan hız, Haversine, 0 hız, durdurma ve GPS hatası) doğru yönetir', () => {
    const tracker = new GpsSpeedTracker()

    // 1. İlk veri (hız null)
    const res1 = tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, speed: null },
      timestamp: 1000,
    })
    expect(res1.speedKmh).toBeNull()
    expect(tracker.getSpeedSource()).toBe('none')
    expect(tracker.getCurrentSpeedKmh()).toBeNull()

    // 2. İkinci veri (null hız -> Haversine)
    const res2 = tracker.processReading({
      coords: { latitude: 41.002, longitude: 28.0, speed: null },
      timestamp: 6000,
    })
    expect(res2.source).toBe('haversine')
    expect(tracker.getSpeedSource()).toBe('haversine')
    expect(tracker.getCurrentSpeedKmh()).toBeGreaterThan(0)

    // 3. Üçüncü veri (coords.speed = 0 -> doğrudan 0 döner, Haversine yapmaz)
    const res3 = tracker.processReading({
      coords: { latitude: 41.005, longitude: 28.0, speed: 0 },
      timestamp: 10000,
    })
    expect(res3.speedKmh).toBe(0)
    expect(res3.source).toBe('gps')
    expect(tracker.getSpeedSource()).toBe('gps')

    // 4. Dördüncü veri (coords.speed = 15 -> doğrudan 54 km/sa)
    const res4 = tracker.processReading({
      coords: { latitude: 41.008, longitude: 28.0, speed: 15 },
      timestamp: 15000,
    })
    expect(res4.speedKmh).toBe(54)
    expect(res4.source).toBe('gps')

    // 5. Durduruldu (reset)
    tracker.reset()
    expect(tracker.getPreviousPoint()).toBeNull()
    expect(tracker.getSpeedSource()).toBe('none')
    expect(tracker.getCurrentSpeedKmh()).toBeNull()

    // 6. Yeniden başlatma sonrası ilk veri (Haversine devreye girmemeli)
    const res5 = tracker.processReading({
      coords: { latitude: 41.01, longitude: 28.0, speed: null },
      timestamp: 25000,
    })
    expect(res5.speedKmh).toBeNull()
    expect(res5.source).toBe('none')

    // 7. GPS Hatası oluştuğunda reset çağrılır
    tracker.reset()
    expect(tracker.getPreviousPoint()).toBeNull()
    expect(tracker.getSpeedSource()).toBe('none')
  })

  it('GpsSpeedTracker: 2.5 km/sa altındaki yavaş yürüyüşü korur ve donanım gürültüsünü süzer', () => {
    const tracker = new GpsSpeedTracker()

    // 0.2 m/s (~0.7 km/sa) donanım gürültüsü -> 0 km/sa'e sıfırlanır
    const noiseRes = tracker.processReading({
      coords: { latitude: 41.0, longitude: 28.0, speed: 0.2 },
      timestamp: 1000,
    })
    expect(noiseRes.speedKmh).toBe(0)
    expect(tracker.getCurrentSpeedKmh()).toBe(0)

    // 0.5 m/s (1.8 km/sa) gerçek yürüyüş hızı -> korunur, sıfırlanmaz
    const walkRes = tracker.processReading({
      coords: { latitude: 41.00001, longitude: 28.0, speed: 0.5 },
      timestamp: 2000,
    })
    expect(walkRes.speedKmh).toBe(1.8)
    expect(tracker.getCurrentSpeedKmh()).toBe(1.8)
  })

  it('Dururken Başlatma: coords.speed = 0 olduğunda ilk okumada anında 0 km/sa üretir', () => {
    const tracker = new GpsSpeedTracker()

    // Kullanıcı dururken Başlat'a bastı; GPS donanımı 0 m/s hız gönderdi
    const firstReading = tracker.processReading({
      coords: { latitude: 41.0082, longitude: 28.9784, speed: 0, accuracy: 10 },
      timestamp: 1000,
    })

    expect(firstReading.speedKmh).toBe(0)
    expect(firstReading.source).toBe('gps')
    expect(tracker.getCurrentSpeedKmh()).toBe(0)
  })

  it('Dururken Başlatma (coords.speed = null): İlk veride sahte 0 üretmez (null döner), ikinci veride 0 km/sa döner', () => {
    const tracker = new GpsSpeedTracker()

    // 1. Okuma: Donanım hız bildiremiyor (null). Önceki konum olmadığı için hız null olmalı, sahte 0 üretilmemelidir.
    const res1 = tracker.processReading({
      coords: { latitude: 41.0082, longitude: 28.9784, speed: null, accuracy: 15 },
      timestamp: 1000,
    })
    expect(res1.speedKmh).toBeNull()
    expect(res1.source).toBe('none')

    // 2. Okuma (1 saniye sonra): Kullanıcı tamamen hareketsiz, koordinat aynı.
    // Haversine ile hesaplanan hız 0 km/sa olur.
    const res2 = tracker.processReading({
      coords: { latitude: 41.0082, longitude: 28.9784, speed: null, accuracy: 15 },
      timestamp: 2000,
    })
    expect(res2.speedKmh).toBe(0)
    expect(res2.source).toBe('haversine')
    expect(tracker.getCurrentSpeedKmh()).toBe(0)
  })

  it('Yeni Ölçüm (kesintisiz takip): Aktif oturumda Yeni Ölçüm yapıldığında hız motoru sıfırlanmaz, 0 km/sa kesintisiz devam eder', () => {
    const tracker = new GpsSpeedTracker()

    // Dururken ilk iki okuma
    tracker.processReading({
      coords: { latitude: 41.0082, longitude: 28.9784, speed: null, accuracy: 15 },
      timestamp: 1000,
    })
    const res2 = tracker.processReading({
      coords: { latitude: 41.0082, longitude: 28.9784, speed: null, accuracy: 15 },
      timestamp: 2000,
    })
    expect(res2.speedKmh).toBe(0)

    // Yeni Ölçüm butonuna basıldı: Oturum istatistikleri sıfırlanır, fakat canlı tracker sıfırlanmaz
    // Bir sonraki okumada önceki nokta kaybolmadığı için hız null'a ('--') düşmez, 0 km/sa devam eder
    const resAfterRecord = tracker.processReading({
      coords: { latitude: 41.0082, longitude: 28.9784, speed: null, accuracy: 15 },
      timestamp: 3000,
    })
    expect(resAfterRecord.speedKmh).toBe(0)
    expect(tracker.getCurrentSpeedKmh()).toBe(0)
  })
})

