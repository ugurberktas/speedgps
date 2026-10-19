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
   * olduğunu belirtir. Bu değer doğrudan Doppler hız doğruluğu değildir; ancak konum doğruluğu
   * 100 metrenin üzerine çıktığında (zayıf uydu geometrisi, baz istasyonu veya IP tahmini),
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
