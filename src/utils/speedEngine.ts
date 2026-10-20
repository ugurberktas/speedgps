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
  calculateHaversineDistance,
  calculateSpeedMs,
  msToKmh,
} from './gpsMath'
import {
  GPS_RELIABILITY_CONFIG,
  calculateCombinedAccuracy,
  getEffectiveDistanceThreshold,
  isReliableGpsReading,
  isValidTimestampSequence,
} from './gpsReliability'
import { SpeedFilter } from './speedFilter'

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

export type SpeedMeasurementStatus = 'valid' | 'held' | 'rejected' | 'initial'

export interface SpeedCalculationResult {
  speedKmh: number | null
  speedMs: number | null
  source: SpeedSource
  newPoint: GpsPoint | null
  isAccepted: boolean
  isSpikeRejected?: boolean
  status: SpeedMeasurementStatus
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
      isAccepted: false,
      status: 'rejected',
    }
  }

  // 2. Zaman damgası sırası denetimi (aynı veya geriye giden zaman damgalarını reddet)
  if (previousPoint && !isValidTimestampSequence(previousPoint.timestamp, reading.timestamp)) {
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: previousPoint,
      isAccepted: false,
      status: 'rejected',
    }
  }

  const currentPoint: GpsPoint = {
    latitude: reading.coords.latitude,
    longitude: reading.coords.longitude,
    timestamp: reading.timestamp,
    ...(reading.coords.accuracy !== undefined ? { accuracy: reading.coords.accuracy } : {}),
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
      isAccepted: true,
      status: 'valid',
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
      isAccepted: false,
      status: 'initial',
    }
  }

  // Konum doğruluğu denetimi:
  // Noktalardan birinin doğruluğu MAX_HAVERSINE_ACCURACY_METERS (25m) üzerindeyse
  // koordinatlardan yapay hız türetilmez (sahte hız yerine null döner)
  const currentAccuracy = reading.coords.accuracy ?? null
  const previousAccuracy = previousPoint.accuracy ?? null

  if (
    (currentAccuracy !== null && currentAccuracy > GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS) ||
    (previousAccuracy !== null && previousAccuracy > GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS)
  ) {
    if (import.meta.env.DEV) {
      console.debug(
        `[SpeedGPS] Haversine hızı reddedildi: Zayıf konum doğruluğu (current: ${currentAccuracy ?? 'null'}m, prev: ${previousAccuracy ?? 'null'}m > ${GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS}m)`
      )
    }
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: currentPoint,
      isAccepted: false,
      status: 'rejected',
    }
  }

  const combinedAccuracy = calculateCombinedAccuracy(previousAccuracy, currentAccuracy)
  if (
    combinedAccuracy !== null &&
    combinedAccuracy > GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS
  ) {
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: currentPoint,
      isAccepted: false,
      status: 'rejected',
    }
  }

  // Zaman farkı denetimi:
  // İki nokta arasındaki süre MIN_HAVERSINE_TIME_DELTA_MS (500 ms) altındaysa
  // koordinat kuantizasyonu yapay sıçrama üretir -> güvenilir değil, null döner
  const timeDeltaMs = reading.timestamp - previousPoint.timestamp
  if (timeDeltaMs < GPS_RELIABILITY_CONFIG.MIN_HAVERSINE_TIME_DELTA_MS) {
    if (import.meta.env.DEV) {
      console.debug(
        `[SpeedGPS] Haversine hızı reddedildi: Zaman farkı çok kısa (dt=${timeDeltaMs}ms < ${GPS_RELIABILITY_CONFIG.MIN_HAVERSINE_TIME_DELTA_MS}ms)`
      )
    }
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: previousPoint,
      isAccepted: false,
      status: 'rejected',
    }
  }

  const distanceMeters = calculateHaversineDistance(previousPoint, currentPoint)
  if (distanceMeters === null) {
    return {
      speedKmh: null,
      speedMs: null,
      source: 'none',
      newPoint: currentPoint,
      isAccepted: false,
      status: 'rejected',
    }
  }

  const speedMs = calculateSpeedMs(distanceMeters, timeDeltaMs)
  if (speedMs !== null) {
    const rawKmh = msToKmh(speedMs)
    const speedKmh = rawKmh !== null ? Math.round(rawKmh * 10) / 10 : null

    return {
      speedKmh,
      speedMs,
      source: 'haversine',
      newPoint: currentPoint,
      isAccepted: true,
      status: 'valid',
    }
  }

  // Hesaplama başarısız olduysa
  return {
    speedKmh: null,
    speedMs: null,
    source: 'none',
    newPoint: currentPoint,
    isAccepted: false,
    status: 'rejected',
  }
}

/**
 * GPS Hız Takipçisi (Stateful Tracker)
 * Ölçüm oturumu boyunca önceki konumu, hızı ve kaynağı takip eder.
 * Anormal sıçramaları eler, durgunluk titremesini süzer ve yumuşatma uygular.
 * Durdurulduğunda, yeniden başlatıldığında veya hata oluştuğunda reset() ile geçmişi temizler.
 */
export class GpsSpeedTracker {
  private previousPoint: GpsPoint | null = null
  private speedSource: SpeedSource = 'none'
  private currentSpeedKmh: number | null = null
  private speedFilter: SpeedFilter = new SpeedFilter()
  private haversineAnchorPoint: GpsPoint | null = null
  private lastConfirmedHaversineSpeedKmh: number | null = null
  private maxDistFromAnchor: number = 0
  private lastProgressTimestamp: number = 0
  private isHaversineAnchorSuspect: boolean = false
  private lastRejectedHaversinePoint: GpsPoint | null = null

  public getSpeedFilter(): SpeedFilter {
    return this.speedFilter
  }

  public getPreviousPoint(): GpsPoint | null {
    return this.previousPoint
  }

  public getHaversineAnchorPoint(): GpsPoint | null {
    return this.haversineAnchorPoint
  }

  public getSpeedSource(): SpeedSource {
    return this.speedSource
  }

  public getCurrentSpeedKmh(): number | null {
    return this.currentSpeedKmh
  }

  public processReading(reading: GpsReadingInput): SpeedCalculationResult {
    const prevPointBefore = this.previousPoint
    const rawResult = resolveSpeed(reading, this.previousPoint)

    if (rawResult.source === 'none') {
      if (prevPointBefore === null) {
        this.previousPoint = rawResult.newPoint
      }
      this.speedSource = 'none'
      this.currentSpeedKmh = null
      if (
        reading.coords.accuracy &&
        reading.coords.accuracy > GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS
      ) {
        this.haversineAnchorPoint = null
        this.lastConfirmedHaversineSpeedKmh = null
        this.maxDistFromAnchor = 0
        this.lastProgressTimestamp = 0
      }
      return {
        ...rawResult,
        isAccepted: false,
        isSpikeRejected: false,
        status: prevPointBefore === null && rawResult.newPoint !== null ? 'initial' : 'rejected',
      }
    }

    const timeDeltaSeconds =
      prevPointBefore && reading.timestamp > prevPointBefore.timestamp
        ? (reading.timestamp - prevPointBefore.timestamp) / 1000
        : 1.0

    // 1. Doğrudan GPS hızı (coords.speed)
    if (rawResult.source === 'gps') {
      let distanceMeters: number | null = null
      if (prevPointBefore) {
        distanceMeters = calculateHaversineDistance(prevPointBefore, {
          latitude: reading.coords.latitude,
          longitude: reading.coords.longitude,
        })
      }

      const filterResult = this.speedFilter.filter(rawResult.speedKmh, {
        source: 'gps',
        timeDeltaSeconds,
        distanceMeters,
        accuracyMeters: reading.coords.accuracy,
      })

      if (import.meta.env.DEV) {
        if (filterResult.isSpikeRejected) {
          console.debug(
            `[SpeedGPS] Hız sıçraması reddedildi: raw=${rawResult.speedKmh} km/sa, source=gps`
          )
        } else if (filterResult.isStationaryClamped) {
          console.debug(
            `[SpeedGPS] Durgunluk/titreme sıfırlandı: raw=${rawResult.speedKmh} km/sa, source=gps`
          )
        }
      }

      if (filterResult.isSpikeRejected) {
        // Hız sıçraması reddedildi:
        // 1. Önceki konum referansı sıçrayan noktaya güncellenmez (prevPointBefore korunur)
        // 2. Çapa sıçrayan noktaya güncellenmez
        // 3. Ekranda tutulan hız korunur ama bu örnek YENİ bir geçerli ölçüm kabul edilmez (isAccepted: false)
        this.currentSpeedKmh = filterResult.filteredSpeedKmh
        return {
          speedKmh: filterResult.filteredSpeedKmh,
          speedMs:
            filterResult.filteredSpeedKmh !== null
              ? Math.round((filterResult.filteredSpeedKmh / 3.6) * 100) / 100
              : null,
          source: 'gps',
          newPoint: prevPointBefore,
          isAccepted: false,
          isSpikeRejected: true,
          status: 'held',
        }
      }

      // Geçerli okuma: önceki noktayı ve çapa referansını güncelle
      this.previousPoint = rawResult.newPoint
      this.speedSource = 'gps'
      this.haversineAnchorPoint = rawResult.newPoint
      this.lastConfirmedHaversineSpeedKmh = null
      this.maxDistFromAnchor = 0
      this.lastProgressTimestamp = rawResult.newPoint?.timestamp ?? 0
      this.currentSpeedKmh = filterResult.filteredSpeedKmh

      return {
        speedKmh: filterResult.filteredSpeedKmh,
        speedMs:
          filterResult.filteredSpeedKmh !== null
            ? Math.round((filterResult.filteredSpeedKmh / 3.6) * 100) / 100
            : null,
        source: 'gps',
        newPoint: rawResult.newPoint,
        isAccepted: true,
        isSpikeRejected: false,
        status: 'valid',
      }
    }

    // 2. Haversine Alternatif Hesabı (Çapa ve Biriktirme Modeli)
    const currentGpsPoint = rawResult.newPoint!
    if (!this.haversineAnchorPoint) {
      this.haversineAnchorPoint = prevPointBefore ?? currentGpsPoint
      this.maxDistFromAnchor = 0
      this.lastProgressTimestamp = currentGpsPoint.timestamp
    }

    // Şüpheli koordinat sıçraması karantinası ve yeniden referans edinme (Codex B3/P1 düzeltmesi):
    // Eğer önceki okumada çapa mesafesi aşırı sıçrama nedeniyle reddedildiyse ve cihaz bu yeni noktada sabit duruyorsa,
    // eski çapa ile yeni nokta arasındaki mesafeyi zaman geçtikçe seyrelterek sahte hıza dönüştürme!
    if (this.isHaversineAnchorSuspect && this.lastRejectedHaversinePoint) {
      const distFromRejected = calculateHaversineDistance(
        this.lastRejectedHaversinePoint,
        currentGpsPoint
      )
      const combinedAcc = calculateCombinedAccuracy(
        this.lastRejectedHaversinePoint.accuracy,
        reading.coords.accuracy
      )
      const threshold = getEffectiveDistanceThreshold(combinedAcc)

      // Cihaz reddedilen sıçrama noktasında duruyorsa (mesafe < eşik), yeni konumu sıfır hızla güvenle yeniden referans edin
      if (distFromRejected !== null && distFromRejected < threshold) {
        this.haversineAnchorPoint = currentGpsPoint
        this.maxDistFromAnchor = 0
        this.lastProgressTimestamp = currentGpsPoint.timestamp
        this.lastConfirmedHaversineSpeedKmh = 0
        this.currentSpeedKmh = 0
        this.isHaversineAnchorSuspect = false
        this.lastRejectedHaversinePoint = null
        this.previousPoint = rawResult.newPoint
        this.speedSource = 'haversine'

        return {
          speedKmh: 0,
          speedMs: 0,
          source: 'haversine',
          newPoint: rawResult.newPoint,
          isAccepted: true,
          isSpikeRejected: false,
          status: 'valid',
        }
      }
    }

    const distFromAnchor = this.haversineAnchorPoint
      ? calculateHaversineDistance(this.haversineAnchorPoint, currentGpsPoint)
      : null

    const timeFromAnchor =
      this.haversineAnchorPoint && currentGpsPoint.timestamp > this.haversineAnchorPoint.timestamp
        ? (currentGpsPoint.timestamp - this.haversineAnchorPoint.timestamp) / 1000
        : timeDeltaSeconds

    // Yeni bir ilerleme kaydedildiyse son ilerleme zaman damgasını güncelle
    if (distFromAnchor !== null && distFromAnchor > this.maxDistFromAnchor + 0.1) {
      this.maxDistFromAnchor = distFromAnchor
      this.lastProgressTimestamp = currentGpsPoint.timestamp
    }

    const timeWithoutProgress =
      this.lastProgressTimestamp > 0
        ? (currentGpsPoint.timestamp - this.lastProgressTimestamp) / 1000
        : 0

    const combinedAccuracy = calculateCombinedAccuracy(
      this.haversineAnchorPoint?.accuracy,
      reading.coords.accuracy
    )
    const effectiveDistanceThreshold = getEffectiveDistanceThreshold(combinedAccuracy)

    const hasBrokenThreshold =
      distFromAnchor !== null && distFromAnchor >= effectiveDistanceThreshold - 0.01

    if (hasBrokenThreshold) {
      // Hareketsizlik denetimi (Codex B3): Eşik aşılmış görünse dahi, eğer cihaz en az 3 saniyedir
      // hiçbir ilerleme kaydetmediyse ve durma durumundaysa, eski çapayı zamanla seyrelterek sahte hız üretme!
      if (
        timeWithoutProgress >= GPS_RELIABILITY_CONFIG.HAVERSINE_STATIONARY_TIMEOUT_SECONDS &&
        (!this.lastConfirmedHaversineSpeedKmh || this.lastConfirmedHaversineSpeedKmh === 0)
      ) {
        this.lastConfirmedHaversineSpeedKmh = 0
        this.haversineAnchorPoint = currentGpsPoint
        this.maxDistFromAnchor = 0
        this.lastProgressTimestamp = currentGpsPoint.timestamp
        this.currentSpeedKmh = 0
        this.previousPoint = rawResult.newPoint
        this.speedSource = 'haversine'
        this.isHaversineAnchorSuspect = false
        this.lastRejectedHaversinePoint = null

        return {
          speedKmh: 0,
          speedMs: 0,
          source: 'haversine',
          newPoint: rawResult.newPoint,
          isAccepted: true,
          isSpikeRejected: false,
          status: 'valid',
        }
      }

      // Çapa eşiği aşıldı: Gerçek yer değiştirme doğrulandı
      const displacementSpeedKmh =
        timeFromAnchor > 0 ? (distFromAnchor / timeFromAnchor) * 3.6 : rawResult.speedKmh

      // Sıfır / durma durumundan ilk doğrulanmış harekete geçişte önceki medyan geçmişini sıfırla.
      const wasStationary = this.currentSpeedKmh === null || this.currentSpeedKmh === 0
      if (wasStationary && (!this.lastConfirmedHaversineSpeedKmh || this.lastConfirmedHaversineSpeedKmh === 0)) {
        this.speedFilter.reset()
      }

      const filterResult = this.speedFilter.filter(displacementSpeedKmh, {
        source: 'haversine',
        timeDeltaSeconds: timeFromAnchor,
        distanceMeters: distFromAnchor,
        accuracyMeters: combinedAccuracy,
      })

      if (filterResult.isSpikeRejected) {
        this.isHaversineAnchorSuspect = true
        this.lastRejectedHaversinePoint = currentGpsPoint
        this.currentSpeedKmh = filterResult.filteredSpeedKmh
        return {
          speedKmh: filterResult.filteredSpeedKmh,
          speedMs:
            filterResult.filteredSpeedKmh !== null
              ? Math.round((filterResult.filteredSpeedKmh / 3.6) * 100) / 100
              : null,
          source: 'haversine',
          newPoint: prevPointBefore,
          isAccepted: false,
          isSpikeRejected: true,
          status: 'held',
        }
      }

      this.isHaversineAnchorSuspect = false
      this.lastRejectedHaversinePoint = null
      this.previousPoint = rawResult.newPoint
      this.speedSource = 'haversine'
      this.lastConfirmedHaversineSpeedKmh = filterResult.filteredSpeedKmh
      this.haversineAnchorPoint = currentGpsPoint
      this.maxDistFromAnchor = 0
      this.lastProgressTimestamp = currentGpsPoint.timestamp
      this.currentSpeedKmh = filterResult.filteredSpeedKmh

      return {
        speedKmh: filterResult.filteredSpeedKmh,
        speedMs:
          filterResult.filteredSpeedKmh !== null
            ? Math.round((filterResult.filteredSpeedKmh / 3.6) * 100) / 100
            : null,
        source: 'haversine',
        newPoint: rawResult.newPoint,
        isAccepted: true,
        isSpikeRejected: false,
        status: 'valid',
      }
    } else {
      // Çapa eşiği henüz aşılmadı: Konum hata payı dairesi içindeyiz
      this.previousPoint = rawResult.newPoint
      this.speedSource = 'haversine'
      this.isHaversineAnchorSuspect = false
      this.lastRejectedHaversinePoint = null

      if (
        this.lastConfirmedHaversineSpeedKmh !== null &&
        this.lastConfirmedHaversineSpeedKmh > 0
      ) {
        // Yürüyüş devam ediyordu. İlerleme durdu mu yoksa adımlar arasında mı?
        if (timeWithoutProgress >= GPS_RELIABILITY_CONFIG.HAVERSINE_STATIONARY_TIMEOUT_SECONDS) {
          // 3 saniyedir ilerleme kaydedilmedi -> Durdu kabul et
          this.lastConfirmedHaversineSpeedKmh = 0
          this.haversineAnchorPoint = currentGpsPoint
          this.maxDistFromAnchor = 0
          this.lastProgressTimestamp = currentGpsPoint.timestamp
          this.currentSpeedKmh = 0

          return {
            speedKmh: 0,
            speedMs: 0,
            source: 'haversine',
            newPoint: rawResult.newPoint,
            isAccepted: true,
            isSpikeRejected: false,
            status: 'valid',
          }
        } else {
          // Yürüyüş devam ediyor (çapa biriktirme aralığında)
          this.currentSpeedKmh = this.lastConfirmedHaversineSpeedKmh
          return {
            speedKmh: this.lastConfirmedHaversineSpeedKmh,
            speedMs: Math.round((this.lastConfirmedHaversineSpeedKmh / 3.6) * 100) / 100,
            source: 'haversine',
            newPoint: rawResult.newPoint,
            isAccepted: true,
            isSpikeRejected: false,
            status: 'valid',
          }
        }
      }

      // Kullanıcı duruyordu veya henüz doğrulanmış bir hareket başlamadı (desk jitter):
      // Gerçek duruş durumunda (distFromAnchor sıfıra yakın veya ilerleme yokken)
      // çapa referansını taze tut (Sorun B düzeltmesi: 60 saniye durduktan sonra hareket edince
      // 5 metreyi 60 saniyeye bölüp 0.3 km/sa üretmesini engelle).
      if (
        distFromAnchor === null ||
        distFromAnchor < 0.2 ||
        timeWithoutProgress >= GPS_RELIABILITY_CONFIG.HAVERSINE_STATIONARY_TIMEOUT_SECONDS
      ) {
        this.haversineAnchorPoint = currentGpsPoint
        this.maxDistFromAnchor = 0
        this.lastProgressTimestamp = currentGpsPoint.timestamp
      }

      this.lastConfirmedHaversineSpeedKmh = 0
      this.currentSpeedKmh = 0

      return {
        speedKmh: 0,
        speedMs: 0,
        source: 'haversine',
        newPoint: rawResult.newPoint,
        isAccepted: true,
        isSpikeRejected: false,
        status: 'valid',
      }
    }
  }

  public reset(): void {
    this.previousPoint = null
    this.speedSource = 'none'
    this.currentSpeedKmh = null
    this.haversineAnchorPoint = null
    this.lastConfirmedHaversineSpeedKmh = null
    this.maxDistFromAnchor = 0
    this.lastProgressTimestamp = 0
    this.isHaversineAnchorSuspect = false
    this.lastRejectedHaversinePoint = null
    this.speedFilter.reset()
  }
}

