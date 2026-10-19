/**
 * SpeedGPS — GPS Hız ve Mesafe Hesaplama Fonksiyonları
 * Sprint 3 / Adım 1
 */

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface GpsPoint extends Coordinates {
  timestamp: number // Milisaniye cinsinden zaman damgası (Date.now() / epoch ms)
  accuracy?: number | null // Konum hata payı / doğruluğu (metre cinsinden, %68 güvenilirlik yarıçapı)
}

/** Dünya yarıçapı (metre cinsinden - WGS-84 ortalama) */
export const EARTH_RADIUS_METERS = 6371000

/**
 * Koordinatın geçerli bir enlem (-90..90) ve boylam (-180..180) olup olmadığını denetler.
 */
export function isValidCoordinate(coord: Coordinates | null | undefined): boolean {
  if (!coord || typeof coord !== 'object') {
    return false
  }

  const { latitude, longitude } = coord

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return false
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false
  }

  if (latitude < -90 || latitude > 90) {
    return false
  }

  if (longitude < -180 || longitude > 180) {
    return false
  }

  return true
}

/**
 * İki koordinat arasındaki küresel mesafeyi Haversine formülü ile metre cinsinden hesaplar.
 * Geçersiz koordinatlarda null döner; sahte değer üretmez.
 */
export function calculateHaversineDistance(
  coord1: Coordinates | null | undefined,
  coord2: Coordinates | null | undefined
): number | null {
  if (!isValidCoordinate(coord1) || !isValidCoordinate(coord2)) {
    return null
  }

  const c1 = coord1 as Coordinates
  const c2 = coord2 as Coordinates

  // Aynı koordinatlar için doğrudan 0 metre
  if (c1.latitude === c2.latitude && c1.longitude === c2.longitude) {
    return 0
  }

  const toRad = (degrees: number) => (degrees * Math.PI) / 180

  const dLat = toRad(c2.latitude - c1.latitude)
  const dLon = toRad(c2.longitude - c1.longitude)
  const lat1Rad = toRad(c1.latitude)
  const lat2Rad = toRad(c2.latitude)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  // Kayan nokta hatalarına karşı 'a' değerini [0, 1] aralığına sınırla
  const clampedA = Math.min(Math.max(a, 0), 1)
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA))

  const distance = EARTH_RADIUS_METERS * c

  if (!Number.isFinite(distance) || distance < 0) {
    return null
  }

  return distance
}

/**
 * Mesafe (metre) ve zaman farkından (milisaniye) m/s cinsinden hız hesaplar.
 * Sıfır veya negatif zaman farkında, negatif mesafede ve tanımsız değerlerde null döner.
 */
export function calculateSpeedMs(
  distanceMeters: number | null | undefined,
  timeDeltaMs: number | null | undefined
): number | null {
  if (
    distanceMeters === null ||
    distanceMeters === undefined ||
    timeDeltaMs === null ||
    timeDeltaMs === undefined
  ) {
    return null
  }

  if (!Number.isFinite(distanceMeters) || !Number.isFinite(timeDeltaMs)) {
    return null
  }

  // Negatif mesafe geçersizdir
  if (distanceMeters < 0) {
    return null
  }

  // Zaman farkı pozitif olmalıdır (sıfır veya negatif zaman kabul edilmez)
  if (timeDeltaMs <= 0) {
    return null
  }

  const timeDeltaSeconds = timeDeltaMs / 1000
  const speed = distanceMeters / timeDeltaSeconds

  if (!Number.isFinite(speed) || speed < 0) {
    return null
  }

  return speed
}

/**
 * m/s hız değerini km/sa değerine dönüştürür.
 * (1 m/s = 3.6 km/sa)
 * Geçersiz, negatif veya tanımsız değerlerde null döner.
 */
export function msToKmh(speedMs: number | null | undefined): number | null {
  if (speedMs === null || speedMs === undefined) {
    return null
  }

  if (!Number.isFinite(speedMs) || speedMs < 0) {
    return null
  }

  const kmh = speedMs * 3.6

  if (!Number.isFinite(kmh) || kmh < 0) {
    return null
  }

  return kmh
}

/**
 * İki GPS noktası ve zaman damgası arasından m/s cinsinden hız hesaplar.
 * Noktalar, koordinatlar veya zaman farkı geçersizse null döner.
 */
export function calculateSpeedBetweenPoints(
  point1: GpsPoint | null | undefined,
  point2: GpsPoint | null | undefined
): number | null {
  if (!point1 || !point2) {
    return null
  }

  if (!isValidCoordinate(point1) || !isValidCoordinate(point2)) {
    return null
  }

  if (
    typeof point1.timestamp !== 'number' ||
    typeof point2.timestamp !== 'number' ||
    !Number.isFinite(point1.timestamp) ||
    !Number.isFinite(point2.timestamp)
  ) {
    return null
  }

  const timeDeltaMs = point2.timestamp - point1.timestamp
  if (timeDeltaMs <= 0) {
    return null
  }

  const distanceMeters = calculateHaversineDistance(point1, point2)
  if (distanceMeters === null) {
    return null
  }

  return calculateSpeedMs(distanceMeters, timeDeltaMs)
}
