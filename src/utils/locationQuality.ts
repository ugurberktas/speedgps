/**
 * SpeedGPS — GPS Konum Kalitesi Modülü
 * Sprint 6 / Adım 2
 *
 * coords.accuracy verisini temel alarak konum doğruluğu seviyesini belirler.
 * NOT: Bu değer hız doğruluğunu değil, konum doğruluğunu temsil eder.
 */

export type LocationQualityLevel = 'iyi' | 'orta' | 'zayif'

export interface LocationQualityInfo {
  level: LocationQualityLevel
  label: 'İyi' | 'Orta' | 'Zayıf'
  accuracyMeters: number
}

/**
 * Konum Kalitesi Eşikleri:
 * ≤ 10 m: İyi (yeşil)
 * > 10–25 m: Orta (sarı)
 * > 25 m: Zayıf (kırmızı)
 */
export const LOCATION_QUALITY_THRESHOLDS = {
  GOOD_ACCURACY_METERS: 10,
  MODERATE_ACCURACY_METERS: 25,
} as const

/**
 * coords.accuracy değerine göre konum kalitesi bilgisini döner.
 * Geçersiz veya negatif doğruluk değerlerinde null döner.
 */
export function getLocationQuality(
  accuracy: number | null | undefined
): LocationQualityInfo | null {
  if (
    accuracy === null ||
    accuracy === undefined ||
    typeof accuracy !== 'number' ||
    !Number.isFinite(accuracy) ||
    accuracy <= 0
  ) {
    return null
  }

  if (accuracy <= LOCATION_QUALITY_THRESHOLDS.GOOD_ACCURACY_METERS) {
    return {
      level: 'iyi',
      label: 'İyi',
      accuracyMeters: accuracy,
    }
  }

  if (accuracy <= LOCATION_QUALITY_THRESHOLDS.MODERATE_ACCURACY_METERS) {
    return {
      level: 'orta',
      label: 'Orta',
      accuracyMeters: accuracy,
    }
  }

  return {
    level: 'zayif',
    label: 'Zayıf',
    accuracyMeters: accuracy,
  }
}

/**
 * Uygulama durumuna (GPS durumu, bayatlık, doğruluk) göre aktif konum kalitesini belirler.
 * GPS aktif değilse (durduruldu, bekleniyor, hata) veya veri bayatsa (isStale)
 * eski kalite aktifmiş gibi gösterilmez, null döner.
 */
export function getActiveLocationQuality(
  accuracy: number | null | undefined,
  gpsStatus: string,
  isStale: boolean
): LocationQualityInfo | null {
  if (gpsStatus !== 'aktif' || isStale) {
    return null
  }

  return getLocationQuality(accuracy)
}
