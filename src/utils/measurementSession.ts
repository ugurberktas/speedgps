/**
 * SpeedGPS — Ölçüm Oturumu ve Kayıt Mantığı
 * UI Yenileme & Yeni Ölçüm Özelliği
 */

export interface SavedMeasurement {
  id: number
  time: string
  speedKmh: number
}

export interface SessionStats {
  maxSpeedKmh: number | null
  avgSpeedKmh: number | null
  speedSamplesCount: number
  speedSamplesSum: number
  distanceMeters: number
}

export const INITIAL_SESSION_STATS: SessionStats = {
  maxSpeedKmh: null,
  avgSpeedKmh: null,
  speedSamplesCount: 0,
  speedSamplesSum: 0,
  distanceMeters: 0,
}

/**
 * Süreyi (saniye) MM:SS veya HH:MM:SS formatına dönüştürür.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00'
  }

  const s = Math.floor(totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60

  const pad = (num: number) => num.toString().padStart(2, '0')

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

/**
 * Mesafeyi (metre) okunabilir formata dönüştürür.
 * 1000m altı 'X m', 1000m ve üzeri 'X.XX km' döner.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) {
    return '0 m'
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  const km = meters / 1000
  return `${km.toFixed(2)} km`
}

/**
 * Ölçümün kaydedilebilir olup olmadığını doğrular.
 * GPS aktif olmalı, veri bayat (stale) olmamalı ve hız null/geçersiz olmamalıdır.
 * Gerçek 0 km/sa geçerli bir ölçümdür.
 */
export function canSaveMeasurement(
  speedKmh: number | null,
  gpsStatus: string,
  isStale: boolean = false
): boolean {
  if (gpsStatus !== 'aktif') {
    return false
  }

  if (isStale) {
    return false
  }

  if (speedKmh === null || typeof speedKmh !== 'number' || !Number.isFinite(speedKmh)) {
    return false
  }

  return speedKmh >= 0
}

/**
 * Yeni bir kayıt nesnesi üretir.
 */
export function createSavedMeasurement(
  id: number,
  speedKmh: number,
  date: Date = new Date()
): SavedMeasurement {
  const pad = (num: number) => num.toString().padStart(2, '0')
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

  return {
    id,
    time: timeStr,
    speedKmh: Math.round(speedKmh * 10) / 10,
  }
}

/**
 * Canlı hız ve mesafe farkı ile oturum istatistiklerini günceller.
 */
export function updateSessionStats(
  prevStats: SessionStats,
  currentSpeedKmh: number | null,
  distanceDeltaMeters: number
): SessionStats {
  const validDistanceDelta =
    Number.isFinite(distanceDeltaMeters) && distanceDeltaMeters > 0
      ? distanceDeltaMeters
      : 0

  const nextDistance = prevStats.distanceMeters + validDistanceDelta

  if (currentSpeedKmh === null || !Number.isFinite(currentSpeedKmh) || currentSpeedKmh < 0) {
    return {
      ...prevStats,
      distanceMeters: nextDistance,
    }
  }

  const nextMax =
    prevStats.maxSpeedKmh !== null
      ? Math.max(prevStats.maxSpeedKmh, currentSpeedKmh)
      : currentSpeedKmh

  const nextCount = prevStats.speedSamplesCount + 1
  const nextSum = prevStats.speedSamplesSum + currentSpeedKmh
  const nextAvg = Math.round((nextSum / nextCount) * 10) / 10

  return {
    maxSpeedKmh: nextMax,
    avgSpeedKmh: nextAvg,
    speedSamplesCount: nextCount,
    speedSamplesSum: nextSum,
    distanceMeters: nextDistance,
  }
}

/**
 * Yeni ölçüm oturumu için istatistikleri sıfırlar.
 */
export function resetSessionStats(): SessionStats {
  return { ...INITIAL_SESSION_STATS }
}
