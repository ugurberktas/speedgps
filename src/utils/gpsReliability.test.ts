import { describe, it, expect } from 'vitest'
import {
  GPS_RELIABILITY_CONFIG,
  isValidAccuracy,
  isValidGpsTimestamp,
  calculateCombinedAccuracy,
  getEffectiveDistanceThreshold,
  isReliableGpsReading,
  isValidTimestampSequence,
  isGpsDataStale,
  type GpsReliabilityCheckInput,
} from './gpsReliability'

describe('GPS Reliability (gpsReliability)', () => {
  describe('Eşik Değerleri Yapılandırması', () => {
    it('güvenilirlik eşikleri tek bir yerde tanımlanmıştır', () => {
      expect(GPS_RELIABILITY_CONFIG.MAX_ACCEPTABLE_ACCURACY_METERS).toBe(100)
      expect(GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS).toBe(5000)
      expect(GPS_RELIABILITY_CONFIG.MAX_FUTURE_TIMESTAMP_DRIFT_MS).toBe(15000)
      expect(GPS_RELIABILITY_CONFIG.MAX_GPS_FIX_AGE_MS).toBe(10000)
    })
  })

  describe('isValidAccuracy (Konum Doğruluğu Denetimi)', () => {
    it('kabul edilebilir pozitif doğruluk değerlerini onaylar', () => {
      expect(isValidAccuracy(5)).toBe(true)
      expect(isValidAccuracy(25)).toBe(true)
      expect(isValidAccuracy(100)).toBe(true)
    })

    it('accuracy=0 değerini geçerli negatif-olmayan değer olarak onaylar', () => {
      expect(isValidAccuracy(0)).toBe(true)
    })

    it('sağlanmayan doğruluk değerlerinde geriye dönük uyumluluk sağlar', () => {
      expect(isValidAccuracy(null)).toBe(true)
      expect(isValidAccuracy(undefined)).toBe(true)
    })

    it('negatif veya sayısal olmayan değerleri reddeder', () => {
      expect(isValidAccuracy(-10)).toBe(false)
      expect(isValidAccuracy(NaN)).toBe(false)
      expect(isValidAccuracy(Infinity)).toBe(false)
    })

    it('100 metreyi aşan zayıf doğruluk değerlerini reddeder', () => {
      expect(isValidAccuracy(100.1)).toBe(false)
      expect(isValidAccuracy(250)).toBe(false)
      expect(isValidAccuracy(1500)).toBe(false)
    })
  })

  describe('isReliableGpsReading (Genel GPS Okuma Güvenilirliği)', () => {
    it('tüm alanları geçerli GPS okumasını doğrular', () => {
      const validReading: GpsReliabilityCheckInput = {
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 12,
          speed: 15,
        },
        timestamp: 1700000000000,
      }
      expect(isReliableGpsReading(validReading)).toBe(true)
    })

    it('callback varışına göre eski ölçümü reddeder, olağan gecikmeyi ve sınırı kabul eder', () => {
      const arrival = 1700000000000
      const reading: GpsReliabilityCheckInput = {
        coords: { latitude: 41, longitude: 28, accuracy: 5, speed: 0 },
        timestamp: arrival - 3600000,
      }
      expect(isReliableGpsReading(reading, arrival)).toBe(false)
      reading.timestamp = arrival - 10001
      expect(isReliableGpsReading(reading, arrival)).toBe(false)
      reading.timestamp = arrival - 10000
      expect(isReliableGpsReading(reading, arrival)).toBe(true)
      reading.timestamp = arrival - 3000
      expect(isReliableGpsReading(reading, arrival)).toBe(true)
      reading.timestamp = arrival
      expect(isReliableGpsReading(reading, arrival)).toBe(true)
    })

    it('sınır dışı koordinatları reddeder', () => {
      expect(
        isReliableGpsReading({
          coords: { latitude: 91, longitude: 28, accuracy: 10 },
          timestamp: 1000,
        })
      ).toBe(false)

      expect(
        isReliableGpsReading({
          coords: { latitude: 41, longitude: 181, accuracy: 10 },
          timestamp: 1000,
        })
      ).toBe(false)
    })

    it('geçersiz, sıfır veya negatif zaman damgalarını reddeder', () => {
      expect(
        isReliableGpsReading({
          coords: { latitude: 41, longitude: 28, accuracy: 10 },
          timestamp: 0,
        })
      ).toBe(false)

      expect(
        isReliableGpsReading({
          coords: { latitude: 41, longitude: 28, accuracy: 10 },
          timestamp: -500,
        })
      ).toBe(false)

      expect(
        isReliableGpsReading({
          coords: { latitude: 41, longitude: 28, accuracy: 10 },
          timestamp: NaN,
        })
      ).toBe(false)
    })

    it('güvenilmez veya aşırı sapmalı accuracy değerlerini reddeder', () => {
      expect(
        isReliableGpsReading({
          coords: { latitude: 41, longitude: 28, accuracy: 250 },
          timestamp: 1000,
        })
      ).toBe(false)

      expect(
        isReliableGpsReading({
          coords: { latitude: 41, longitude: 28, accuracy: -5 },
          timestamp: 1000,
        })
      ).toBe(false)
    })

    it('null veya eksik okumaları güvenle yönetir', () => {
      expect(isReliableGpsReading(null)).toBe(false)
      expect(isReliableGpsReading(undefined)).toBe(false)
      expect(isReliableGpsReading({} as unknown as GpsReliabilityCheckInput)).toBe(false)
    })
  })

  describe('isValidTimestampSequence (Zaman Damgası Sıralaması)', () => {
    it('zaman damgası ileriye gittiğinde true döner', () => {
      expect(isValidTimestampSequence(1000, 2000)).toBe(true)
      expect(isValidTimestampSequence(null, 1000)).toBe(true)
      expect(isValidTimestampSequence(undefined, 1000)).toBe(true)
    })

    it('aynı (tekrarlanan) zaman damgasını reddeder', () => {
      expect(isValidTimestampSequence(1000, 1000)).toBe(false)
    })

    it('geriye giden zaman damgasını reddeder', () => {
      expect(isValidTimestampSequence(2000, 1500)).toBe(false)
      expect(isValidTimestampSequence(5000, 1000)).toBe(false)
    })
  })

  describe('isGpsDataStale (GPS Verisi Bayatlık Denetimi)', () => {
    it('5 saniye (STALE_DATA_TIMEOUT_MS) içindeki verileri güncel kabul eder', () => {
      const now = 10000
      expect(isGpsDataStale(9000, now)).toBe(false) // 1 saniye önce
      expect(isGpsDataStale(6000, now)).toBe(false) // 4 saniye önce
      expect(isGpsDataStale(5001, now)).toBe(false) // 4.999 saniye önce
    })

    it('5 saniyeyi aşan kesintilerde veriyi bayat (stale) kabul eder', () => {
      const now = 10000
      expect(isGpsDataStale(4999, now)).toBe(true) // 5.001 saniye önce
      expect(isGpsDataStale(2000, now)).toBe(true) // 8 saniye önce
      expect(isGpsDataStale(null, now)).toBe(true) // Hiç veri yok
    })
  })

  describe('isValidGpsTimestamp (Zaman Damgası Geçerliliği ve Sınır Durumları)', () => {
    it('pozitif ve makul zaman damgalarını onaylar', () => {
      const wallTime = 100000
      expect(isValidGpsTimestamp(100000, wallTime)).toBe(true)
      expect(isValidGpsTimestamp(95000, wallTime)).toBe(true)
      // 15 saniyeye kadar olan gelecek zaman toleransını onaylar
      expect(isValidGpsTimestamp(115000, wallTime)).toBe(true)
    })

    it('sıfır, negatif ve sayısal olmayan zaman damgalarını reddeder', () => {
      expect(isValidGpsTimestamp(0)).toBe(false)
      expect(isValidGpsTimestamp(-500)).toBe(false)
      expect(isValidGpsTimestamp(NaN)).toBe(false)
      expect(isValidGpsTimestamp(Infinity)).toBe(false)
      expect(isValidGpsTimestamp(null)).toBe(false)
      expect(isValidGpsTimestamp(undefined)).toBe(false)
      expect(isValidGpsTimestamp('100000')).toBe(false)
    })

    it('makul olmayan gelecek zamanlı zaman damgalarını reddeder', () => {
      const wallTime = 100000
      // 15 saniyeden (MAX_FUTURE_TIMESTAMP_DRIFT_MS) daha ilerideki zaman
      expect(isValidGpsTimestamp(100000 + 15001, wallTime)).toBe(false)
      expect(isValidGpsTimestamp(100000 + 60000, wallTime)).toBe(false)
    })
  })

  describe('accuracy=0 ile Kombine Doğruluk ve Mesafe Eşiği', () => {
    it('accuracy=0 okumasını genel GPS okuma doğrulamada kabul eder', () => {
      const readingWithZeroAccuracy: GpsReliabilityCheckInput = {
        coords: {
          latitude: 41.0082,
          longitude: 28.9784,
          accuracy: 0,
          speed: 10,
        },
        timestamp: 1000,
      }
      expect(isReliableGpsReading(readingWithZeroAccuracy, 2000)).toBe(true)
    })

    it('calculateCombinedAccuracy accuracy=0 değerini doğru ortalar', () => {
      expect(calculateCombinedAccuracy(0, 10)).toBe(5)
      expect(calculateCombinedAccuracy(0, 0)).toBe(0)
      expect(calculateCombinedAccuracy(0, null)).toBe(0)
    })

    it('getEffectiveDistanceThreshold accuracy=0 olsa bile taban titreme eşiğini (2.0m) korur', () => {
      expect(getEffectiveDistanceThreshold(0, 0)).toBe(
        GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS
      )
      expect(getEffectiveDistanceThreshold(0, 1)).toBe(
        GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS
      )
      expect(getEffectiveDistanceThreshold(0, 10)).toBe(5)
    })
  })
})
