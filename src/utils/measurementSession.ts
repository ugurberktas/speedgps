/**
 * SpeedGPS — Ölçüm Oturumu ve Kayıt Mantığı
 * Ölçüm Oturumu ve Hızı Kaydet Özelliği
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
  totalDurationSeconds?: number
  weightedSpeedSum?: number
}

export const INITIAL_SESSION_STATS: SessionStats = {
  maxSpeedKmh: null,
  avgSpeedKmh: null,
  speedSamplesCount: 0,
  speedSamplesSum: 0,
  distanceMeters: 0,
  totalDurationSeconds: 0,
  weightedSpeedSum: 0,
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
  isStale: boolean = false,
  isPaused: boolean = false,
  isRejected: boolean = false
): boolean {
  if (gpsStatus !== 'aktif') {
    return false
  }

  if (isStale || isPaused || isRejected) {
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
 * Ortalama hızı (km/sa) hesaplar.
 * Zaman ağırlıklı toplam hız ve geçerli aktif süreye dayanır.
 * Geçerli 0 km/sa ölçümleri ortalamaya dahil edilir (kırmızı ışık, duraklama vb.).
 */
export function calculateAverageSpeed(
  weightedSpeedSum: number,
  totalDurationSeconds: number
): number | null {
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
    return null
  }

  if (!Number.isFinite(weightedSpeedSum) || weightedSpeedSum < 0) {
    return 0
  }

  const avg = weightedSpeedSum / totalDurationSeconds
  return Math.round(avg * 10) / 10
}

/**
 * Toplam mesafe (metre) ve geçerli ölçüm süresi (saniye) üzerinden
 * ortalama hızı (km/sa) hesaplar (v = d / t * 3.6).
 * Ölçüm süresi ve mesafe ile tam tutarlılık sağlar.
 */
export function calculateAverageSpeedFromDistance(
  distanceMeters: number,
  durationSeconds: number
): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null
  }

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 0
  }

  const speedKmh = (distanceMeters / durationSeconds) * 3.6
  return Math.round(speedKmh * 10) / 10
}

/**
 * Canlı hız ve mesafe farkı ile oturum istatistiklerini günceller.
 * Düzensiz GPS örnekleme aralıkları (timeDeltaSeconds) verildiğinde
 * zaman ağırlıklı hız hesabı uygular; duraklamaları (0 km/sa) doğru ağırlıkla yansıtır.
 */
export function updateSessionStats(
  prevStats: SessionStats,
  currentSpeedKmh: number | null,
  distanceDeltaMeters: number,
  timeDeltaSeconds?: number,
  intervalSpeedKmh?: number | null
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

  // Geçerli zaman aralığı (saniye):
  // timeDeltaSeconds açıkça 0 geçilmişse (ilk fix veya recovery fix) 0 olarak kabul edilir.
  // Tanımsız (undefined) bırakılmışsa geriye dönük test uyumu için 1.0 saniye (1 Hz) kabul edilir.
  const validDt =
    typeof timeDeltaSeconds === 'number' && Number.isFinite(timeDeltaSeconds) && timeDeltaSeconds >= 0
      ? timeDeltaSeconds
      : 1.0

  const effectiveIntervalSpeed =
    typeof intervalSpeedKmh === 'number' && Number.isFinite(intervalSpeedKmh) && intervalSpeedKmh >= 0
      ? intervalSpeedKmh
      : currentSpeedKmh

  const nextCount = prevStats.speedSamplesCount + 1
  const nextSum = prevStats.speedSamplesSum + currentSpeedKmh

  const prevDuration =
    typeof prevStats.totalDurationSeconds === 'number'
      ? prevStats.totalDurationSeconds
      : prevStats.speedSamplesCount

  const prevWeightedSum =
    typeof prevStats.weightedSpeedSum === 'number'
      ? prevStats.weightedSpeedSum
      : prevStats.speedSamplesSum

  const nextDuration = prevDuration + validDt
  const nextWeightedSum = prevWeightedSum + effectiveIntervalSpeed * validDt
  const nextAvg = calculateAverageSpeed(nextWeightedSum, nextDuration)

  return {
    maxSpeedKmh: nextMax,
    avgSpeedKmh: nextAvg,
    speedSamplesCount: nextCount,
    speedSamplesSum: nextSum,
    distanceMeters: nextDistance,
    totalDurationSeconds: nextDuration,
    weightedSpeedSum: nextWeightedSum,
  }
}

/**
 * Yeni ölçüm oturumu için istatistikleri sıfırlar.
 */
export function resetSessionStats(): SessionStats {
  return { ...INITIAL_SESSION_STATS }
}

/**
 * Kaydedilen ölçüm geçmişini metin özeti olarak formatlar.
 * İsteğe bağlı olarak hedef hız birimi dönüştürmesini destekler.
 */
export function formatHistorySummary(
  items: SavedMeasurement[],
  options?: {
    unitLabel?: string
    convertFn?: (speedKmh: number) => number
  }
): string {
  if (!items || items.length === 0) {
    return ''
  }

  const unitLabel = options?.unitLabel || 'km/sa'
  const convertFn = options?.convertFn || ((v: number) => v)

  const lines = items.map((item) => {
    const displaySpeed = convertFn(item.speedKmh)
    return `#${item.id} | Saat: ${item.time} | Hız: ${displaySpeed.toFixed(1)} ${unitLabel}`
  })

  return `SpeedGPS Ölçüm Özeti (${items.length} Kayıt):\n` + lines.join('\n')
}

