/**
 * SpeedGPS — Arka Plan ve GPS Kesinti Yönetimi
 * Sprint 6.4 / Adım 3
 *
 * Telefon ekranı kapandığında, tarayıcı arka plana geçtiğinde veya GPS sinyali kesildiğinde
 * (10–30 saniyelik kesintiler, tünel, zayıf uydu sinyali vb.) sahte hız, mesafe sıçraması
 * ve sürenin yanlış hesaplanmasını önleyen yardımcı fonksiyonlar.
 */

import { GPS_RELIABILITY_CONFIG } from './gpsReliability'

export interface OutageCheckInput {
  isOutageRecoveryFlagged: boolean
  isStale: boolean
  isPaused: boolean
  previousTimestamp?: number | null
  currentTimestamp: number
  staleTimeoutMs?: number
  isStationary?: boolean
}

/**
 * Yeni gelen GPS okumasının bir kesinti / arka plan sonrası toparlanma okuması
 * (ilk referans noktası) olarak değerlendirilip değerlendirilmeyeceğini belirler.
 */
export function shouldTriggerOutageRecovery(input: OutageCheckInput): boolean {
  if (input.isOutageRecoveryFlagged || input.isStale || input.isPaused) {
    return true
  }

  const defaultTimeout = input.isStationary
    ? GPS_RELIABILITY_CONFIG.STATIONARY_STALE_TIMEOUT_MS
    : GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS

  const timeout = input.staleTimeoutMs ?? defaultTimeout
  if (
    typeof input.previousTimestamp === 'number' &&
    input.previousTimestamp > 0 &&
    input.currentTimestamp - input.previousTimestamp > timeout
  ) {
    return true
  }

  return false
}

/**
 * Ölçüm süresinin (elapsedSeconds) artırılıp artırılmayacağını belirler.
 * Kesinti süreleri, arka planda duraklatılan süreler veya geçerli bir hızın
 * henüz ölçülemediği (hız null / --) durumlar geçerli ölçüm süresine dahil edilmez.
 */
export function canIncrementMeasurementDuration(
  gpsStatus: string,
  isPaused: boolean,
  isStale: boolean,
  hasValidMeasurement: boolean = true
): boolean {
  return gpsStatus === 'aktif' && !isPaused && !isStale && hasValidMeasurement
}

/**
 * Son GPS güncellemesinden bu yana geçen sürenin bayatlık (stale) sınırını aşıp aşmadığını denetler.
 * Durağan (0 km/sa) durumlarda mobil tarayıcıların güncellemeleri seyreltmesi normal kabul edilir.
 */
export function isGpsDataStale(
  lastFixTimestamp: number | null,
  currentTimestamp: number = Date.now(),
  staleTimeoutMs: number = GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS,
  isStationary: boolean = false
): boolean {
  if (lastFixTimestamp === null) {
    return false
  }
  const effectiveTimeout = isStationary
    ? GPS_RELIABILITY_CONFIG.STATIONARY_STALE_TIMEOUT_MS
    : staleTimeoutMs
  return currentTimestamp - lastFixTimestamp > effectiveTimeout
}
