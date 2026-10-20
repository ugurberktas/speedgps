import { type SpeedUnit, convertSpeedFromKmh } from './speedUnits'

export interface GaugeScaleConfig {
  max: number
  ticks: number[]
}

export const GAUGE_SCALES: Record<SpeedUnit, GaugeScaleConfig> = {
  kmh: {
    max: 120,
    ticks: [0, 20, 40, 60, 80, 100, 120],
  },
  mph: {
    max: 75,
    ticks: [0, 15, 30, 45, 60, 75],
  },
  ms: {
    max: 35,
    ticks: [0, 10, 20, 30, 35],
  },
}

/**
 * Anlık hız ve seçili birime göre kadran doluluk oranını (0.0 - 1.0) hesaplar.
 * Hız null, NaN, negatif veya geçersizse 0 döner.
 * Maksimum ölçeği aşan hızlarda 1.0 ile sınırlanır (taşma olmaz).
 */
export function calculateGaugeProgress(
  speedKmh: number | null,
  unit: SpeedUnit = 'kmh',
  isValid: boolean = true
): number {
  if (!isValid || speedKmh === null || !Number.isFinite(speedKmh) || speedKmh <= 0) {
    return 0
  }

  const converted = convertSpeedFromKmh(speedKmh, unit)
  if (converted === null || converted <= 0) {
    return 0
  }

  const scale = GAUGE_SCALES[unit] ?? GAUGE_SCALES.kmh
  const fraction = converted / scale.max

  return Math.min(1, Math.max(0, fraction))
}

/**
 * Yarım daire yay uzunluğunu (π * r) hesaplar.
 */
export function calculateArcLength(radius: number): number {
  return Math.PI * radius
}

/**
 * Doluluk oranına göre stroke-dashoffset değerini hesaplar.
 * progress: 0 -> offset = arcLength (tamamen boş)
 * progress: 1 -> offset = 0 (tamamen dolu)
 */
export function calculateDashOffset(progress: number, arcLength: number): number {
  const clampedProgress = Math.min(1, Math.max(0, progress))
  return arcLength * (1 - clampedProgress)
}

/**
 * Yarım daire üzerinde belirtilen orana (0 = sol/180°, 1 = sağ/0°) denk gelen (x, y) koordinatlarını hesaplar.
 */
export function getArcPoint(
  cx: number,
  cy: number,
  radius: number,
  fraction: number
): { x: number; y: number } {
  const angleRad = Math.PI * (1 - Math.min(1, Math.max(0, fraction)))
  return {
    x: Number((cx + radius * Math.cos(angleRad)).toFixed(2)),
    y: Number((cy - radius * Math.sin(angleRad)).toFixed(2)),
  }
}
