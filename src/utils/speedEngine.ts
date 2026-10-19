/**
 * SpeedGPS — GPS Hız Motoru (Speed Engine)
 * Sprint 3 / Adım 2
 *
 * GPS okumalarını işler:
 * 1. Öncelikle doğrudan `coords.speed` değerini kullanır (0 m/s geçerli bir hızdır).
 * 2. `coords.speed` null veya geçersizse iki konum ve zaman damgasından Haversine ile alternatif hız hesaplar.
 * 3. İlk konum verisinde veya hesaplama yapılamadığında null döner.
 * 4. Hız kaynağını ('gps' | 'haversine' | 'none') takip eder.
 */

import {
  type GpsPoint,
  calculateSpeedBetweenPoints,
  msToKmh,
} from './gpsMath'
import {
  isReliableGpsReading,
  isValidTimestampSequence,
} from './gpsReliability'

export type SpeedSource = 'gps' | 'haversine' | 'none'

export interface GpsReadingInput {
  coords: {
    latitude: number
    longitude: number
    accuracy?: number | null
    speed?: number | null
  }
  timestamp: number
}

export interface SpeedCalculationResult {
  speedKmh: number | null
  speedMs: number | null
  source: SpeedSource
  newPoint: GpsPoint | null
}

/**
 * Gelen GPS okumasını ve önceki geçerli noktayı değerlendirerek güncel hızı ve kaynağını belirler.
 */
export function resolveSpeed(
  reading: GpsReadingInput,
  previousPoint: GpsPoint | null
): SpeedCalculationResult {
  // 1. Koordinat, doğruluk ve zaman damgası geçerlilik denetimi
  if (!isReliableGpsReading(reading)) {
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: previousPoint,
    }
  }

  // 2. Zaman damgası sırası denetimi (aynı veya geriye giden zaman damgalarını reddet)
  if (previousPoint && !isValidTimestampSequence(previousPoint.timestamp, reading.timestamp)) {
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: previousPoint,
    }
  }

  const currentPoint: GpsPoint = {
    latitude: reading.coords.latitude,
    longitude: reading.coords.longitude,
    timestamp: reading.timestamp,
  }

  const rawSpeed = reading.coords.speed
  // 0 geçerli bir ölçümdür (araç/kullanıcı duruyor).
  const hasDirectGpsSpeed =
    rawSpeed !== null &&
    rawSpeed !== undefined &&
    Number.isFinite(rawSpeed) &&
    rawSpeed >= 0

  // 3. Doğrudan GPS hızı mevcutsa öncelikli olarak kullan
  if (hasDirectGpsSpeed) {
    const rawKmh = msToKmh(rawSpeed)
    const speedKmh = rawKmh !== null ? Math.round(rawKmh * 10) / 10 : null

    return {
      speedKmh,
      speedMs: rawSpeed,
      source: 'gps',
      newPoint: currentPoint,
    }
  }

  // 4. Doğrudan GPS hızı yoksa Haversine ile alternatif hesaplama yap
  // İlk veri ise veya önceki geçerli konum yoksa hız hesaplanamaz
  if (!previousPoint) {
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: currentPoint,
    }
  }

  const speedMs = calculateSpeedBetweenPoints(previousPoint, currentPoint)

  if (speedMs !== null) {
    const rawKmh = msToKmh(speedMs)
    const speedKmh = rawKmh !== null ? Math.round(rawKmh * 10) / 10 : null

    return {
      speedKmh,
      speedMs,
      source: 'haversine',
      newPoint: currentPoint,
    }
  }

  // Hesaplama başarısız olduysa
  return {
    speedKmh: null,
    speedMs: null,
    source: 'none',
    newPoint: currentPoint,
  }
}

/**
 * GPS Hız Takipçisi (Stateful Tracker)
 * Ölçüm oturumu boyunca önceki konumu, hızı ve kaynağı takip eder.
 * Durdurulduğunda, yeniden başlatıldığında veya hata oluştuğunda reset() ile geçmişi temizler.
 */
export class GpsSpeedTracker {
  private previousPoint: GpsPoint | null = null
  private speedSource: SpeedSource = 'none'
  private currentSpeedKmh: number | null = null

  public getPreviousPoint(): GpsPoint | null {
    return this.previousPoint
  }

  public getSpeedSource(): SpeedSource {
    return this.speedSource
  }

  public getCurrentSpeedKmh(): number | null {
    return this.currentSpeedKmh
  }

  public processReading(reading: GpsReadingInput): SpeedCalculationResult {
    const result = resolveSpeed(reading, this.previousPoint)
    this.previousPoint = result.newPoint
    this.speedSource = result.source
    this.currentSpeedKmh = result.speedKmh
    return result
  }

  public reset(): void {
    this.previousPoint = null
    this.speedSource = 'none'
    this.currentSpeedKmh = null
  }
}

