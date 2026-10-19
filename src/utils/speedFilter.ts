/**
 * SpeedGPS — GPS Hız Filtreleme Modülü
 * Sprint 4 / Adım 2
 */

import { GPS_RELIABILITY_CONFIG, getEffectiveDistanceThreshold } from './gpsReliability'
import { type SpeedSource } from './speedEngine'

export interface FilterSpeedOptions {
  source: SpeedSource
  timeDeltaSeconds?: number | null
  distanceMeters?: number | null
  accuracyMeters?: number | null
}

export interface SpeedFilterResult {
  filteredSpeedKmh: number | null
  isSpikeRejected: boolean
  isStationaryClamped: boolean
}

/**
 * Sayı dizisinin medyanını hesaplar.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * GPS Hız Filtresi Sınıfı
 * Anormal sıçramaları (spikes), durağan konum titremesini (jitter) ve koordinat gürültüsünü süzer.
 */
export class SpeedFilter {
  private lastAcceptedSpeedKmh: number | null = null
  private medianWindow: number[] = []
  private emaSpeedKmh: number | null = null

  public getLastAcceptedSpeed(): number | null {
    return this.lastAcceptedSpeedKmh
  }

  public getEmaSpeed(): number | null {
    return this.emaSpeedKmh
  }

  public getMedianWindow(): number[] {
    return [...this.medianWindow]
  }

  /**
   * Filtre durumunu temizler (Başlat, Durdur, Yeni Ölçüm işlemlerinde çağrılır).
   */
  public reset(): void {
    this.lastAcceptedSpeedKmh = null
    this.medianWindow = []
    this.emaSpeedKmh = null
  }

  /**
   * Ham hız değerini süzgeçten geçirir ve filtrelenmiş güvenilir hız sonucunu döner.
   */
  public filter(
    rawSpeedKmh: number | null,
    options: FilterSpeedOptions
  ): SpeedFilterResult {
    // 1. Ölçüm yoksa doğrudan null döner
    if (rawSpeedKmh === null || !Number.isFinite(rawSpeedKmh) || rawSpeedKmh < 0) {
      return {
        filteredSpeedKmh: null,
        isSpikeRejected: false,
        isStationaryClamped: false,
      }
    }

    const { source, timeDeltaSeconds, distanceMeters, accuracyMeters } = options

    // 2. Maksimum Gerçekçi Kara Hızı Denetimi (> 250 km/sa)
    if (rawSpeedKmh > GPS_RELIABILITY_CONFIG.MAX_REALISTIC_SPEED_KMH) {
      return {
        filteredSpeedKmh: this.lastAcceptedSpeedKmh,
        isSpikeRejected: true,
        isStationaryClamped: false,
      }
    }

    // 3. Sabit Konum ve GPS Jitter / Titreme Filtresi
    // - source === 'gps': Platform GPS hızında (coords.speed) 1.0 km/sa altı donanım gürültüsü/ölü bölge kabul edilir;
    //   1.0 - 2.5 km/sa arasındaki gerçek yavaş yürüyüş hızları korunur.
    // - source === 'haversine': Konum değişimi GPS hata payından veya taban 2.0 metreden küçükse jitter kabul edilir.
    //   Doğrulanmış yer değiştirme eşiği aşılmadığı sürece koordinatlardan yapay hareket üretilmez.
    const effectiveDistanceThreshold = getEffectiveDistanceThreshold(
      source === 'haversine' ? accuracyMeters : null
    )

    const hasSignificantDistance =
      distanceMeters !== undefined &&
      distanceMeters !== null &&
      distanceMeters >= effectiveDistanceThreshold

    const isStationaryDistance =
      source === 'haversine' &&
      distanceMeters !== undefined &&
      distanceMeters !== null &&
      distanceMeters < effectiveDistanceThreshold

    const isStationarySpeed =
      source === 'gps'
        ? rawSpeedKmh < GPS_RELIABILITY_CONFIG.STATIONARY_GPS_SPEED_THRESHOLD_KMH
        : !hasSignificantDistance &&
          rawSpeedKmh < GPS_RELIABILITY_CONFIG.STATIONARY_DRIFT_SPEED_THRESHOLD_KMH

    if (rawSpeedKmh === 0 || isStationaryDistance || isStationarySpeed) {
      this.lastAcceptedSpeedKmh = 0
      this.emaSpeedKmh = 0
      this.medianWindow.push(0)
      if (this.medianWindow.length > GPS_RELIABILITY_CONFIG.MEDIAN_FILTER_WINDOW_SIZE) {
        this.medianWindow.shift()
      }

      return {
        filteredSpeedKmh: 0,
        isSpikeRejected: false,
        isStationaryClamped: rawSpeedKmh > 0,
      }
    }

    // 4. İvmelenme ve Anormal Hız Sıçraması (Spike) Denetimi
    // NOT: Önceki kabul edilen hız 0 km/sa olsa dahi (dururken ani sıçrama), fiziksel sınırların
    // üzerindeki hız artışları (ör. 1 saniyede 0'dan 86 km/sa'e sıçrama) reddedilir!
    if (this.lastAcceptedSpeedKmh !== null) {
      const dt =
        timeDeltaSeconds && timeDeltaSeconds > 0 && Number.isFinite(timeDeltaSeconds)
          ? timeDeltaSeconds
          : 1.0

      const maxAcc =
        source === 'haversine'
          ? GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCELERATION_MS2
          : GPS_RELIABILITY_CONFIG.MAX_ACCELERATION_MS2

      // İzin verilen maksimum hız değişimi (km/sa): a * dt * 3.6
      // Düşük hızlardaki kalkışlar için taban tolerans (en az 35 km/sa)
      const allowedDeltaKmh = Math.max(maxAcc * dt * 3.6, 35)

      const speedDiff = Math.abs(rawSpeedKmh - this.lastAcceptedSpeedKmh)
      if (speedDiff > allowedDeltaKmh) {
        // Fiziksel sınırları aşan sıçrama -> reddet, önceki kabul edilen hızı koru
        return {
          filteredSpeedKmh: this.lastAcceptedSpeedKmh,
          isSpikeRejected: true,
          isStationaryClamped: false,
        }
      }
    }

    // 5. Kaynak Bazlı Filtreleme ve Yumuşatma
    let resultSpeed = rawSpeedKmh

    if (source === 'haversine') {
      // Haversine konum dalgalanmalarına karşı medyan filtresi
      this.medianWindow.push(rawSpeedKmh)
      if (this.medianWindow.length > GPS_RELIABILITY_CONFIG.MEDIAN_FILTER_WINDOW_SIZE) {
        this.medianWindow.shift()
      }
      const medianSpeed = calculateMedian(this.medianWindow)

      // Hafif EMA Yumuşatma
      if (this.emaSpeedKmh === null || this.emaSpeedKmh === 0) {
        this.emaSpeedKmh = medianSpeed
      } else {
        const alpha = GPS_RELIABILITY_CONFIG.EMA_SMOOTHING_ALPHA
        this.emaSpeedKmh = alpha * medianSpeed + (1 - alpha) * this.emaSpeedKmh
      }

      resultSpeed = this.emaSpeedKmh
    } else {
      // Doğrudan GPS hızı (coords.speed — donanım/sensör füzyonu) platform düzeyinde filtrelenmiştir;
      // Gecikme eklemeden doğrudan kullanılır
      this.medianWindow.push(rawSpeedKmh)
      if (this.medianWindow.length > GPS_RELIABILITY_CONFIG.MEDIAN_FILTER_WINDOW_SIZE) {
        this.medianWindow.shift()
      }
      this.emaSpeedKmh = rawSpeedKmh
      resultSpeed = rawSpeedKmh
    }

    const finalSpeed = Math.round(resultSpeed * 10) / 10
    this.lastAcceptedSpeedKmh = finalSpeed

    return {
      filteredSpeedKmh: finalSpeed,
      isSpikeRejected: false,
      isStationaryClamped: false,
    }
  }
}
