/**
 * SpeedGPS — Hız Birimi ve Dönüşüm Yardımcıları
 * Desteklenen birimler: km/sa (varsayılan), mph, m/s
 *
 * Dönüşüm Katsayıları:
 * 1 km/sa = 0.621371 mph
 * 1 km/sa = 1 / 3.6 m/s
 */

export type SpeedUnit = 'kmh' | 'mph' | 'ms'

export interface SpeedUnitOption {
  id: SpeedUnit
  label: string
  unitLabel: string
}

export const SPEED_UNITS: Record<SpeedUnit, SpeedUnitOption> = {
  kmh: {
    id: 'kmh',
    label: 'km/sa',
    unitLabel: 'km/sa',
  },
  mph: {
    id: 'mph',
    label: 'mph',
    unitLabel: 'mph',
  },
  ms: {
    id: 'ms',
    label: 'm/s',
    unitLabel: 'm/s',
  },
}

export const SPEED_UNIT_OPTIONS: SpeedUnitOption[] = [
  SPEED_UNITS.kmh,
  SPEED_UNITS.mph,
  SPEED_UNITS.ms,
]

const KMH_TO_MPH = 0.621371
const KMH_TO_MS = 1 / 3.6

/**
 * Dahili km/sa hız değerini hedef birime dönüştürür.
 * null veya tanımsız değerler için null döner.
 */
export function convertSpeedFromKmh(speedKmh: number | null, targetUnit: SpeedUnit): number | null {
  if (speedKmh === null || !Number.isFinite(speedKmh)) {
    return null
  }

  if (speedKmh === 0) {
    return 0
  }

  switch (targetUnit) {
    case 'mph':
      return speedKmh * KMH_TO_MPH
    case 'ms':
      return speedKmh * KMH_TO_MS
    case 'kmh':
    default:
      return speedKmh
  }
}

/**
 * Hız değerini hedef birimde ekranda gösterilecek formatta biçimlendirir.
 * decimals: ondalık basamak sayısı (varsayılan: 0)
 * Geçersiz hızlar için '--' döner.
 */
export function formatSpeedValue(
  speedKmh: number | null,
  unit: SpeedUnit,
  decimals: number = 0
): string {
  const converted = convertSpeedFromKmh(speedKmh, unit)
  if (converted === null) {
    return '--'
  }
  return converted.toFixed(decimals)
}

/**
 * Belirtilen birimin sembolünü döner ('km/sa', 'mph', 'm/s').
 */
export function getSpeedUnitLabel(unit: SpeedUnit): string {
  return SPEED_UNITS[unit]?.unitLabel ?? 'km/sa'
}

/**
 * km/sa hız değerini dak/km (min/km) cinsinden saniye değerine dönüştürür.
 * 1 km/sa = 60 dak/km = 3600 saniye/km
 * Pace (saniye/km) = 3600 / speedKmh
 * Geçersiz, 0 veya negatif hızlar için null döner (sıfıra bölme engellenir).
 */
export function calculatePaceSecondsFromKmh(speedKmh: number | null): number | null {
  if (
    speedKmh === null ||
    !Number.isFinite(speedKmh) ||
    speedKmh <= 0.3 // Çok düşük / durma hızlarında tempo hesaplanmaz
  ) {
    return null
  }

  return 3600 / speedKmh
}

/**
 * km/sa cinsinden hızı 'MM:SS' veya 'H:MM:SS' formatında min/km temposuna dönüştürür.
 * Hız sıfır veya geçersizse '--:--' döner.
 * Örnekler:
 * 5 km/sa -> '12:00'
 * 10 km/sa -> '6:00'
 * 12 km/sa -> '5:00'
 */
export function formatPaceFromKmh(speedKmh: number | null): string {
  const paceSeconds = calculatePaceSecondsFromKmh(speedKmh)
  if (paceSeconds === null) {
    return '--:--'
  }

  const totalSecs = Math.round(paceSeconds)
  const minutes = Math.floor(totalSecs / 60)
  const seconds = totalSecs % 60

  const pad = (num: number) => num.toString().padStart(2, '0')

  return `${minutes}:${pad(seconds)}`
}

