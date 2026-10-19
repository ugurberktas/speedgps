/**
 * SpeedGPS — GPS Veri Güvenilirliği ve Doğrulama Modülü
 * Sprint 4 / Adım 1
 */

import { isValidCoordinate, type Coordinates } from './gpsMath'

/**
 * GPS Güvenilirlik Eşikleri ve Açıklamaları
 */
export const GPS_RELIABILITY_CONFIG = {
  /**
   * Maksimum Kabul Edilebilir Konum Doğruluğu (Metre):
   * coords.accuracy değeri, cihazın hesapladığı konumun %68 güvenilirlikle bu yarıçap içinde
   * olduğunu belirtir. Bu değer doğrudan hız doğruluğu değildir (hız değeri platform/cihaz
   * tarafından GNSS alıcı donanımı, Doppler kayması veya sensör füzyonu ile sağlanabilir);
   * ancak konum doğruluğu 100 metrenin üzerine çıktığında (zayıf uydu geometrisi, baz istasyonu veya IP tahmini),
   * iki nokta arasındaki Haversine mesafesi ve hız hesabı güvenilemeyecek kadar büyük sıçramalara
   * maruz kalır. Bu nedenle 100 metreden kötü konum doğruluğuna sahip veriler reddedilir.
   */
  MAX_ACCEPTABLE_ACCURACY_METERS: 100,

  /**
   * GPS Verisi Bayatlık / Zaman Aşımı Süresi (Milisaniye):
   * GPS alıcıları standart olarak saniyede yaklaşık 1 güncelleme (1 Hz) üretir.
   * Cihaz tünele, otoparka girdiğinde veya sinyal kesildiğinde ekranda son hız donup kalmamalıdır.
   * 5000 ms (5 saniye) boyunca yeni geçerli bir GPS güncellemesi alınamazsa veriler bayat (stale)
   * kabul edilir, hız göstergesi '--' durumuna geçer ve kullanıcıya sinyal bekleniyor bilgisi verilir.
   */
  STALE_DATA_TIMEOUT_MS: 5000,

  /**
   * Sprint 4 / Adım 2: Hız Filtreleme Eşikleri
   * NOT: Bu eşikler fiziksel kurallar ve literatüre dayalı başlangıç varsayımlarıdır;
   * gerçek saha testleriyle taşıt/kullanıcı profiline göre kalibre edilebilir şekilde tasarlanmıştır.
   */

  /**
   * Maksimum Gerçekçi Kara Hızı (km/sa):
   * Kara araçları için fiziksel üst sınır kabulü. Bu sınırın üzerindeki tekil sıçramalar
   * GPS uydu yansıması (multipath) veya donanım hatası kabul edilerek elenir.
   * Başlangıç varsayımı: 250 km/sa.
   */
  MAX_REALISTIC_SPEED_KMH: 250,

  /**
   * Doğrudan GPS İçin Maksimum İvmelenme Eşiği (m/s²):
   * Standart kara taşıtlarında 1 saniyede ~54 km/sa (15 m/s) üzerinde hız artışı/azalışı
   * fiziksel olarak imkansızdır. Bu eşiğin üzerindeki ani değişimler sıçrama kabul edilir.
   * Başlangıç varsayımı: 15 m/s² (~54 km/sa/sn).
   */
  MAX_ACCELERATION_MS2: 15,

  /**
   * Haversine (Koordinat Farkı) İçin Maksimum İvmelenme Eşiği (m/s²):
   * Koordinat farkından türetilen hız konum kaymalarına daha duyarlı olduğundan
   * daha sıkı bir ivme sınırı uygulanır.
   * Başlangıç varsayımı: 12 m/s² (~43 km/sa/sn).
   */
  MAX_HAVERSINE_ACCELERATION_MS2: 12,

  /**
   * Doğrudan GPS (coords.speed) Durgunluk Titreme Eşiği (km/sa):
   * Platform/donanım hızında 1.0 km/sa altındaki değerler donanım gürültüsü kabul edilerek sıfırlanır.
   * 1.0 - 2.5 km/sa arasındaki yavaş yürüyüş hızları (ör. 1.2 - 2.4 km/sa) gerçek hareket olarak korunur.
   * Başlangıç varsayımı: 1.0 km/sa.
   */
  STATIONARY_GPS_SPEED_THRESHOLD_KMH: 1.0,

  /**
   * Koordinat Kayması (Haversine) Durgunluk Titreme Hız Eşiği (km/sa):
   * Cihaz masa üstünde veya ışıkta dururken GPS konumunun 1-3 metre dalgalanması yapay
   * 1-4 km/sa koordinat hızları oluşturabilir. Doğrulanmış yer değiştirme (>= 2m) bulunmadığında
   * bu eşiğin altındaki koordinat hızları 0 km/sa kabul edilir.
   * Başlangıç varsayımı: 2.5 km/sa.
   */
  STATIONARY_DRIFT_SPEED_THRESHOLD_KMH: 2.5,

  /**
   * Sabit Konum Mesafe Titreme Eşiği (Metre):
   * İki konum arasındaki Haversine mesafesi bu değerin altındaysa hareket yok sayılır (0 m).
   * Başlangıç varsayımı: 2.0 metre.
   */
  STATIONARY_DISTANCE_THRESHOLD_METERS: 2.0,

  /**
   * EMA (Üstel Hareketli Ortalama) Yumuşatma Katsayısı (Alfa):
   * [0, 1] aralığında; 1'e yakın değerler anlık tepkiyi korur ve gecikmeyi önler.
   * 0.75 değeri doğal bir yumuşatma sunarken hız değişimlerini geciktirmez.
   * Başlangıç varsayımı: 0.75.
   */
  EMA_SMOOTHING_ALPHA: 0.75,

  /**
   * Medyan Filtresi Pencere Boyutu:
   * Tekil anormal sıçramaları (spike) elemek için son N örneğin medyanı değerlendirilir.
   * Başlangıç varsayımı: 3 örnek (minimum gecikme ile tekil sıçramaları anında süzer).
   */
  MEDIAN_FILTER_WINDOW_SIZE: 3,
} as const

/**
 * coords.accuracy değerinin geçerli ve kabul edilebilir olup olmadığını denetler.
 * Değer sağlanmamışsa (null veya undefined) geriye dönük uyumluluk gereği geçerli kabul edilir.
 * Sağlanmışsa pozitif, sonlu bir sayı olmalı ve 100 metre eşiğini aşmamalıdır.
 */
export function isValidAccuracy(accuracy: number | null | undefined): boolean {
  if (accuracy === undefined || accuracy === null) {
    return true
  }

  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) {
    return false
  }

  if (accuracy <= 0) {
    return false
  }

  if (accuracy > GPS_RELIABILITY_CONFIG.MAX_ACCEPTABLE_ACCURACY_METERS) {
    return false
  }

  return true
}

export interface GpsReliabilityCheckInput {
  coords: {
    latitude: number
    longitude: number
    accuracy?: number | null
    speed?: number | null
  }
  timestamp: number
}

/**
 * GPS okumasının temel sayısal ve mantıksal geçerliliğini denetler:
 * 1. coords ve timestamp alanlarının varlığı
 * 2. Enlem (-90..90) ve boylam (-180..180) sınırları
 * 3. Zaman damgasının pozitif ve sonlu bir sayı olması
 * 4. Konum doğruluğunun (accuracy) sınırları aşmaması
 */
export function isReliableGpsReading(
  reading: GpsReliabilityCheckInput | null | undefined
): boolean {
  if (!reading || !reading.coords) {
    return false
  }

  const { latitude, longitude, accuracy } = reading.coords
  const timestamp = reading.timestamp

  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return false
  }

  const coord: Coordinates = { latitude, longitude }
  if (!isValidCoordinate(coord)) {
    return false
  }

  if (!isValidAccuracy(accuracy)) {
    return false
  }

  return true
}

/**
 * İki zaman damgasının sırasını denetler.
 * Aynı veya geriye giden (current <= previous) zaman damgalarını reddeder.
 */
export function isValidTimestampSequence(
  previousTimestamp: number | null | undefined,
  currentTimestamp: number
): boolean {
  if (previousTimestamp === null || previousTimestamp === undefined) {
    return true
  }

  return currentTimestamp > previousTimestamp
}

/**
 * Son GPS güncellemesinin bayat (stale) olup olmadığını kontrol eder.
 */
export function isGpsDataStale(
  lastUpdateTimestamp: number | null | undefined,
  currentNow: number = Date.now(),
  timeoutMs: number = GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS
): boolean {
  if (lastUpdateTimestamp === null || lastUpdateTimestamp === undefined) {
    return true
  }

  return currentNow - lastUpdateTimestamp > timeoutMs
}
