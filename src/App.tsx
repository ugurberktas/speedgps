import { useState, useEffect, useRef } from 'react'
import { GpsSpeedTracker, type SpeedSource } from './utils/speedEngine'
import { calculateHaversineDistance, type GpsPoint } from './utils/gpsMath'
import {
  GPS_RELIABILITY_CONFIG,
  calculateCombinedAccuracy,
  getEffectiveDistanceThreshold,
  isReliableGpsReading,
  isValidTimestampSequence,
  type GpsReliabilityCheckInput,
} from './utils/gpsReliability'
import {
  type SavedMeasurement,
  type SessionStats,
  INITIAL_SESSION_STATS,
  formatDuration,
  formatDistance,
  canSaveMeasurement,
  createSavedMeasurement,
  updateSessionStats,
  resetSessionStats,
  formatHistorySummary,
} from './utils/measurementSession'
import { WakeLockManager } from './utils/wakeLock'
import { getActiveLocationQuality } from './utils/locationQuality'
import { gpsDebugLogger } from './utils/gpsDebugLogger'
import { GpsDebugPanel } from './components/GpsDebugPanel'
import {
  shouldTriggerOutageRecovery,
  canIncrementMeasurementDuration,
  isGpsDataStale,
} from './utils/outageRecovery'
import './App.css'

export type GpsStatus = 'durduruldu' | 'bekleniyor' | 'aktif' | 'hata'

const STATUS_LABELS: Record<GpsStatus, string> = {
  durduruldu: 'Durduruldu',
  bekleniyor: 'Sinyal Bekleniyor...',
  aktif: 'GPS Aktif',
  hata: 'GPS Hatası',
}

function App() {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('durduruldu')
  const [speedKmh, setSpeedKmh] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null)
  const [speedSource, setSpeedSource] = useState<SpeedSource>('none')
  const [isStale, setIsStale] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [isOutageRecovery, setIsOutageRecovery] = useState<boolean>(false)
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null)

  // Oturum istatistikleri ve süre
  const [sessionStats, setSessionStats] = useState<SessionStats>(INITIAL_SESSION_STATS)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  // Ölçüm Geçmişi
  const [history, setHistory] = useState<SavedMeasurement[]>([])
  const nextIdRef = useRef<number>(1)

  // GPS & Durum Refs
  const watchIdRef = useRef<number | null>(null)
  const trackerRef = useRef<GpsSpeedTracker>(new GpsSpeedTracker())
  const lastCoordsRef = useRef<GpsPoint | null>(null)
  const lastFixTimestampRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockManager>(new WakeLockManager())
  const gpsStatusRef = useRef<GpsStatus>(gpsStatus)
  const isPausedRef = useRef<boolean>(false)
  const isStaleRef = useRef<boolean>(false)
  const isOutageRecoveryRef = useRef<boolean>(false)
  const currentSpeedKmhRef = useRef<number | null>(null)

  useEffect(() => {
    gpsStatusRef.current = gpsStatus
  }, [gpsStatus])

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    isStaleRef.current = isStale
  }, [isStale])

  useEffect(() => {
    currentSpeedKmhRef.current = speedKmh
  }, [speedKmh])

  // Süre Sayacı ve GPS Bayatlık (Staleness) Denetleyicisi
  useEffect(() => {
    if (gpsStatus !== 'aktif') {
      return
    }

    const interval = setInterval(() => {
      // Yalnızca aktif, arka planda olmayan ve kesintide olmayan sürelerde sayacı artır
      if (canIncrementMeasurementDuration(gpsStatusRef.current, isPausedRef.current, isStaleRef.current)) {
        setElapsedSeconds((prev) => prev + 1)
      }

      const isStationary = currentSpeedKmhRef.current === 0

      // GPS güncellemeleri kesildiğinde son hızı ekranda tutma, '--' yap
      // Durağanken (0 km/sa) tarayıcının güncellemeleri seyreltmesi arıza değildir; esnek eşik kullanılır
      if (
        lastFixTimestampRef.current !== null &&
        isGpsDataStale(
          lastFixTimestampRef.current,
          Date.now(),
          GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS,
          isStationary
        )
      ) {
        setIsStale(true)
        isStaleRef.current = true
        setIsOutageRecovery(true)
        isOutageRecoveryRef.current = true
        setSpeedKmh(null)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [gpsStatus])

  // Görünürlük Yönetimi (visibilitychange), Wake Lock ve Temizlik
  useEffect(() => {
    const tracker = trackerRef.current
    const wakeLock = wakeLockRef.current

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') {
        return
      }

      const isHidden = document.visibilityState === 'hidden'
      const isTracking =
        gpsStatusRef.current === 'aktif' || gpsStatusRef.current === 'bekleniyor'

      if (isHidden) {
        // Uygulama arka plana geçtiğinde canlı GPS ölçümünün güvenilir şekilde devam edeceğini varsayma. Ölçümü duraklat.
        if (isTracking) {
          setIsPaused(true)
          isPausedRef.current = true
          setIsOutageRecovery(true)
          isOutageRecoveryRef.current = true
          setSpeedKmh(null)
        }
      } else {
        // Uygulama tekrar görünür olduğunda GPS takibini güvenli şekilde devam ettir
        setIsPaused(false)
        isPausedRef.current = false
        if (isTracking) {
          setIsOutageRecovery(true)
          isOutageRecoveryRef.current = true
          // Wake Lock'u güvenle yeniden talep et
          void wakeLock.requestLock()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      tracker.reset()
      wakeLock.destroy()
      lastCoordsRef.current = null
      lastFixTimestampRef.current = null
    }
  }, [])

  // GPS Takibini Başlat
  const startTracking = () => {
    if (watchIdRef.current !== null) {
      return
    }

    trackerRef.current.reset()
    lastCoordsRef.current = null
    lastFixTimestampRef.current = null
    setIsStale(false)
    isStaleRef.current = false
    setIsPaused(false)
    isPausedRef.current = false
    setIsOutageRecovery(false)
    isOutageRecoveryRef.current = false
    setSessionStats(resetSessionStats())
    setElapsedSeconds(0)
    setSpeedKmh(null)
    setSpeedSource('none')
    setCurrentAccuracy(null)
    setErrorMessage(null)
    setFeedbackNotice(null)
    setGpsStatus('bekleniyor')

    // Screen Wake Lock talep et (tarayıcı destekliyorsa ekran açık tutulur)
    void wakeLockRef.current.requestLock()

    if (!('geolocation' in navigator)) {
      setErrorMessage('Tarayıcınız Geolocation API özelliğini desteklemiyor.')
      setGpsStatus('hata')
      return
    }

    try {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          // 1. Uygulama arka plandaysa canlı GPS ölçümünün güvenilir olduğunu varsayma
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            isOutageRecoveryRef.current = true
            return
          }

          const timestamp =
            typeof position.timestamp === 'number' &&
            Number.isFinite(position.timestamp) &&
            position.timestamp > 0
              ? position.timestamp
              : Date.now()

          const readingInput: GpsReliabilityCheckInput = {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              speed: position.coords.speed,
            },
            timestamp,
          }

          // Yalnızca kabul edilen, geçerli konum okumalarında güncellik zaman damgasını yenile
          const prevTimestamp = trackerRef.current.getPreviousPoint()?.timestamp
          const isAcceptedReading =
            isReliableGpsReading(readingInput) &&
            isValidTimestampSequence(prevTimestamp, timestamp)

          if (!isAcceptedReading) {
            // Geçersiz / güvenilmez okuma: güncellik zaman damgası YENİLENMEZ
            setSpeedKmh(null)
            setSpeedSource('none')
            setCurrentAccuracy(null)

            if (import.meta.env.DEV) {
              let reason = 'Güvenilir olmayan GPS örneği'
              if (
                position.coords.accuracy &&
                position.coords.accuracy > GPS_RELIABILITY_CONFIG.MAX_ACCEPTABLE_ACCURACY_METERS
              ) {
                reason = `Doğruluk kabul sınırını aştı (±${position.coords.accuracy.toFixed(1)}m > ${GPS_RELIABILITY_CONFIG.MAX_ACCEPTABLE_ACCURACY_METERS}m)`
              } else if (!isValidTimestampSequence(prevTimestamp, timestamp)) {
                reason = 'Aynı veya geriye giden zaman damgası reddedildi'
              }

              gpsDebugLogger.logSample({
                timestamp,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy ?? null,
                speed: position.coords.speed ?? null,
                speedKmh: null,
                heading: position.coords.heading ?? null,
                altitude: position.coords.altitude ?? null,
                source: 'none',
                status: 'rejected',
                reason,
              })
            }
            return
          }

          // 2. KESİNTİ VE ARKA PLAN SONRASI İLK OKUMA KONTROLÜ (Outage Recovery)
          // Uzun GPS kesintilerinden (örn. 10-30s) veya arka plandan sonra gelen ilk konum örneğini
          // yeni hesaplama başlangıcı olarak değerlendir. Kesinti öncesi konumla birleştirerek
          // sahte hız veya mesafe üretme.
          const isStationary = currentSpeedKmhRef.current === 0
          const needsOutageRecovery = shouldTriggerOutageRecovery({
            isOutageRecoveryFlagged: isOutageRecoveryRef.current,
            isStale: isStaleRef.current,
            isPaused: isPausedRef.current,
            previousTimestamp: prevTimestamp,
            currentTimestamp: timestamp,
            staleTimeoutMs: isStationary
              ? GPS_RELIABILITY_CONFIG.STATIONARY_STALE_TIMEOUT_MS
              : GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS,
            isStationary,
          })

          if (needsOutageRecovery) {
            // Kesinti sonrasında Haversine çapa noktası ve hız filtrelerinin geçmiş durumunu temizle
            trackerRef.current.reset()
            lastCoordsRef.current = null
            setIsOutageRecovery(false)
            isOutageRecoveryRef.current = false
          }

          // Kabul edilen okuma: güncellik zaman damgasını yenile ve bayatlığı/duraklatmayı kaldır
          setGpsStatus('aktif')
          setErrorMessage(null)
          lastFixTimestampRef.current = Date.now()
          setIsStale(false)
          isStaleRef.current = false
          setIsPaused(false)
          isPausedRef.current = false
          setIsOutageRecovery(false)
          isOutageRecoveryRef.current = false
          setCurrentAccuracy(
            typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null
          )

          // Hız motoru ile hızı hesapla (doğruluk, koordinat ve zaman kontrolleri dahil)
          const result = trackerRef.current.processReading(readingInput)

          if (import.meta.env.DEV) {
            const isAccepted = result.speedKmh !== null
            let reason: string | undefined
            if (!isAccepted) {
              if (
                result.source === 'none' &&
                (position.coords.accuracy ?? 0) > GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS
              ) {
                reason = `Haversine hızı reddedildi: Doğruluk zayıf (±${position.coords.accuracy?.toFixed(1)}m > ${GPS_RELIABILITY_CONFIG.MAX_HAVERSINE_ACCURACY_METERS}m)`
              } else {
                reason = 'İlk konum referansı veya hız hesaplanamadı'
              }
            }

            gpsDebugLogger.logSample({
              timestamp,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? null,
              speed: position.coords.speed ?? null,
              speedKmh: result.speedKmh,
              heading: position.coords.heading ?? null,
              altitude: position.coords.altitude ?? null,
              source: result.source,
              status: isAccepted ? 'accepted' : 'rejected',
              reason,
            })
          }

          // Yalnızca geçerli bir hız üretilmişse istatistikleri ve mesafeyi güncelle
          if (result.speedKmh !== null) {
            setSpeedSource(result.source)
            setSpeedKmh(result.speedKmh)

            let deltaMeters = 0
            const currentPoint: GpsPoint = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp,
              accuracy: position.coords.accuracy ?? null,
            }

            if (lastCoordsRef.current) {
              const dist = calculateHaversineDistance(lastCoordsRef.current, currentPoint)
              const combinedAccuracy = calculateCombinedAccuracy(
                lastCoordsRef.current.accuracy,
                position.coords.accuracy
              )
              const effectiveThreshold = getEffectiveDistanceThreshold(
                result.source === 'haversine' ? combinedAccuracy : null
              )
              // Sabit konum titremesi: mesafe hata payı/eşik altındaysa veya hız 0 ise yapay mesafe ekleme
              if (
                dist !== null &&
                dist >= effectiveThreshold - 0.01 &&
                result.speedKmh > 0
              ) {
                deltaMeters = dist
                lastCoordsRef.current = currentPoint
              }
            } else {
              lastCoordsRef.current = currentPoint
            }

            // Düzensiz GPS örnekleme aralıkları için zaman farkı (timeDeltaSeconds) hesabı:
            // Kesinti sonrası ilk okuma değilse ve geçerli bir önceki zaman damgası varsa
            // gerçek zaman farkını kullan; aksi halde 1.0 saniye varsayılan aralık kullan.
            const maxAllowedGapMs =
              isStationary || result.speedKmh === 0
                ? GPS_RELIABILITY_CONFIG.STATIONARY_STALE_TIMEOUT_MS
                : GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS

            const timeDeltaSeconds =
              !needsOutageRecovery &&
              prevTimestamp &&
              timestamp > prevTimestamp &&
              timestamp - prevTimestamp <= maxAllowedGapMs
                ? (timestamp - prevTimestamp) / 1000
                : 1.0

            setSessionStats((prev) =>
              updateSessionStats(prev, result.speedKmh, deltaMeters, timeDeltaSeconds)
            )
          } else {
            // Henüz ilk okuma veya hesaplanma aşamasında sahte 0 gösterme, null tut
            setSpeedKmh(null)
            setSpeedSource('none')
            // İlk referans noktasını mesafenin sonraki adımda doğru hesaplanabilmesi için kaydet
            if (!lastCoordsRef.current) {
              lastCoordsRef.current = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                timestamp,
                accuracy: position.coords.accuracy ?? null,
              }
            }
          }
        },
        (error: GeolocationPositionError) => {
          let message = 'Bilinmeyen bir GPS hatası oluştu.'
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message =
                'Konum izni reddedildi. Hız ölçümü için lütfen tarayıcınızdan konum erişimine izin verin.'
              break
            case error.POSITION_UNAVAILABLE:
              message =
                'GPS konumuna erişilemiyor. Lütfen GPS bağlantınızı veya açık alanda olup olmadığınızı kontrol edin.'
              break
            case error.TIMEOUT:
              message =
                'GPS sinyali zaman aşımına uğradı. Konum bilgisi bekleniyor.'
              break
          }

          trackerRef.current.reset()
          lastCoordsRef.current = null
          lastFixTimestampRef.current = null
          setIsStale(false)
          isStaleRef.current = false
          setIsPaused(false)
          isPausedRef.current = false
          setIsOutageRecovery(false)
          isOutageRecoveryRef.current = false
          setCurrentAccuracy(null)
          setErrorMessage(message)
          setGpsStatus('hata')
          setSpeedKmh(null)
          setSpeedSource('none')

          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current)
            watchIdRef.current = null
          }

          void wakeLockRef.current.releaseLock()
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        }
      )

      watchIdRef.current = id
    } catch {
      trackerRef.current.reset()
      lastCoordsRef.current = null
      lastFixTimestampRef.current = null
      setIsStale(false)
      isStaleRef.current = false
      setIsPaused(false)
      isPausedRef.current = false
      setIsOutageRecovery(false)
      isOutageRecoveryRef.current = false
      setCurrentAccuracy(null)
      setErrorMessage('GPS takibi başlatılırken beklenmeyen bir hata oluştu.')
      setGpsStatus('hata')
      setSpeedKmh(null)
      setSpeedSource('none')
      void wakeLockRef.current.releaseLock()
    }
  }

  // GPS Takibini Durdur
  const stopTracking = () => {
    void wakeLockRef.current.releaseLock()

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    trackerRef.current.reset()
    lastCoordsRef.current = null
    lastFixTimestampRef.current = null
    setIsStale(false)
    isStaleRef.current = false
    setIsPaused(false)
    isPausedRef.current = false
    setIsOutageRecovery(false)
    isOutageRecoveryRef.current = false
    setCurrentAccuracy(null)
    setGpsStatus('durduruldu')
    setSpeedKmh(null)
    setSpeedSource('none')
  }

  // Yeni Ölçüm Butonu Mantığı
  const handleNewMeasurement = () => {
    // 1. GPS ölçümü yoksa, geçersizse, bayatlamışsa (stale) veya arka planda duraklatılmışsa kayıt oluşturma
    if (!canSaveMeasurement(speedKmh, gpsStatus, isStale, isPaused)) {
      if (isPaused) {
        setFeedbackNotice(
          'Uygulama arka planda duraklatıldı. Yeni ölçüm kaydetmek için lütfen uygulamayı ekranda tutun.'
        )
      } else if (isStale) {
        setFeedbackNotice(
          'GPS güncellemesi kesildi veya veri güncel değil. Yeni ölçüm kaydetmek için GPS sinyali bekleniyor.'
        )
      } else {
        setFeedbackNotice(
          'Geçerli bir hız ölçümü bulunmuyor. Yeni ölçüm kaydetmek için GPS aktif olmalı ve güncel hız verisi alınmalıdır.'
        )
      }
      return
    }

    // 2. Geçerli anlık hızı (0 dahil) kaydet
    const validSpeed = speedKmh as number
    const newRecord = createSavedMeasurement(nextIdRef.current, validSpeed)
    nextIdRef.current += 1

    setHistory((prev) => [newRecord, ...prev])

    // 3. Mevcut oturum istatistiklerini sıfırla; eski konum örneklerini yeni oturuma karıştırma
    setSessionStats(resetSessionStats())
    setElapsedSeconds(0)
    lastCoordsRef.current = null

    setFeedbackNotice(
      `Ölçüm #${newRecord.id} (${newRecord.speedKmh} km/sa) kaydedildi. Yeni oturum başlatıldı.`
    )
  }

  // Geçmişi Temizle Butonu
  const handleClearHistory = () => {
    setHistory([])
    nextIdRef.current = 1
  }

  // Özeti Kopyala Butonu
  const handleCopySummary = async () => {
    if (history.length === 0) {
      return
    }

    const summaryText = formatHistorySummary(history)
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(summaryText)
      } else {
        // Fallback for environments where navigator.clipboard is unavailable
        const textarea = document.createElement('textarea')
        textarea.value = summaryText
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setFeedbackNotice(`Ölçüm özeti (${history.length} kayıt) panoya kopyalandı.`)
    } catch {
      setFeedbackNotice('Özet panoya kopyalanamadı. Lütfen tekrar deneyin.')
    }
  }

  const isTracking = gpsStatus === 'aktif' || gpsStatus === 'bekleniyor'
  const locationQuality = getActiveLocationQuality(currentAccuracy, gpsStatus, isStale || isPaused)

  return (
    <div className="speedgps-app">
      {/* Üst Başlık ve GPS Durumu */}
      <header className="speedgps-header">
        <div className="brand-wrapper">
          <h1 className="brand-title">
            SpeedGPS
            <span className="brand-accent-dot" aria-hidden="true" />
          </h1>
          <span className="brand-tag">v3.0</span>
        </div>

        <div className="header-status-group">
          <div className={`status-pill status-${isPaused ? 'bekleniyor' : gpsStatus}`}>
            <span className="status-dot" aria-hidden="true" />
            <span>{isPaused ? 'Ölçüm Duraklatıldı' : STATUS_LABELS[gpsStatus]}</span>
          </div>

          {locationQuality && (
            <div
              className={`quality-badge quality-${locationQuality.level}`}
              title={`Konum kalitesi: ${locationQuality.label} (±${locationQuality.accuracyMeters.toFixed(0)}m, hız doğruluğu değildir)`}
            >
              <span className="quality-dot" aria-hidden="true" />
              <span className="quality-label">
                Konum kalitesi: <strong>{locationQuality.label}</strong>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Hata Bildirimi */}
      {errorMessage && (
        <div className="alert-banner alert-error" role="alert">
          <div>
            <strong>GPS Uyarısı: </strong>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Bilgilendirme ve Yeni Ölçüm Bildirimi */}
      {feedbackNotice && (
        <div className="alert-banner alert-notice" role="status">
          <span className="alert-notice-text">{feedbackNotice}</span>
          <button
            type="button"
            className="alert-dismiss-btn"
            onClick={() => setFeedbackNotice(null)}
            aria-label="Bildirimi kapat"
          >
            ✕
          </button>
        </div>
      )}

      {/* Ana Hız Kartı */}
      <main className="speed-card" aria-label="Anlık Hız Göstergesi">
        <div className="speed-display-box">
          <span className="speed-number">
            {speedKmh !== null && !isStale && !isPaused ? speedKmh.toFixed(0) : '--'}
          </span>
          <span className="speed-unit">km/sa</span>
        </div>

        <div className="speed-subtext">
          {gpsStatus === 'durduruldu' && 'Ölçümü başlatmak için Başlat butonuna basın.'}
          {gpsStatus === 'bekleniyor' && 'GPS sinyali aranıyor...'}
          {gpsStatus === 'aktif' && isPaused && 'Uygulama arka planda: Ölçüm duraklatıldı.'}
          {gpsStatus === 'aktif' && !isPaused && isStale && 'GPS sinyali aranıyor (sinyal bekleniyor)...'}
          {gpsStatus === 'aktif' && !isPaused && !isStale && isOutageRecovery && 'GPS konumu güncelleniyor...'}
          {gpsStatus === 'aktif' && !isPaused && !isStale && !isOutageRecovery && speedKmh === null && 'GPS sinyali bekleniyor (hız hesaplanıyor)...'}
          {gpsStatus === 'aktif' && !isPaused && !isStale && !isOutageRecovery && speedKmh !== null && (
            <span>
              Canlı ölçüm güncelleniyor ({speedSource === 'haversine' ? 'Haversine hesabı' : 'GPS donanımı'})
            </span>
          )}
          {gpsStatus === 'hata' && 'GPS hatası nedeniyle ölçüm yapılamıyor.'}
        </div>
      </main>

      {/* Kontrol Butonları */}
      <section className="controls-container" aria-label="Ölçüm Kontrolleri">
        <button
          type="button"
          className="btn-primary-record"
          onClick={handleNewMeasurement}
        >
          <span>Yeni Ölçüm</span>
        </button>

        <div className="secondary-buttons-row">
          <button
            type="button"
            className="btn-secondary btn-start-action"
            onClick={startTracking}
            disabled={isTracking}
          >
            Başlat
          </button>
          <button
            type="button"
            className="btn-secondary btn-stop-action"
            onClick={stopTracking}
            disabled={gpsStatus === 'durduruldu'}
          >
            Durdur
          </button>
        </div>
      </section>

      {/* Oturum İstatistikleri */}
      <section className="stats-card" aria-label="Oturum İstatistikleri">
        <div className="section-header">
          <h2 className="section-title">Oturum İstatistikleri</h2>
        </div>

        <div className="stats-grid">
          <div className="stat-tile">
            <span className="stat-label">Maksimum Hız</span>
            <div className="stat-value">
              <span>
                {sessionStats.maxSpeedKmh !== null
                  ? sessionStats.maxSpeedKmh.toFixed(0)
                  : '--'}
              </span>
              <span className="stat-unit">km/sa</span>
            </div>
          </div>

          <div className="stat-tile">
            <span className="stat-label">Ortalama Hız</span>
            <div className="stat-value">
              <span>
                {sessionStats.avgSpeedKmh !== null
                  ? sessionStats.avgSpeedKmh.toFixed(1)
                  : '--'}
              </span>
              <span className="stat-unit">km/sa</span>
            </div>
          </div>

          <div className="stat-tile">
            <span className="stat-label">Mesafe</span>
            <div className="stat-value">
              <span>{formatDistance(sessionStats.distanceMeters)}</span>
            </div>
          </div>

          <div className="stat-tile">
            <span className="stat-label">Süre</span>
            <div className="stat-value">
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Ölçüm Geçmişi */}
      <section className="history-card" aria-label="Ölçüm Geçmişi">
        <div className="section-header">
          <div className="brand-wrapper">
            <h2 className="section-title">Ölçüm Geçmişi</h2>
            {history.length > 0 && (
              <span className="badge-counter">{history.length}</span>
            )}
          </div>

          <div className="history-header-actions">
            <button
              type="button"
              className="btn-copy-history"
              onClick={handleCopySummary}
              disabled={history.length === 0}
              title={history.length === 0 ? 'Kopyalanacak ölçüm bulunmuyor' : 'Ölçüm özetini panoya kopyala'}
            >
              Özeti Kopyala
            </button>
            {history.length > 0 && (
              <button
                type="button"
                className="btn-clear-history"
                onClick={handleClearHistory}
              >
                Temizle
              </button>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="history-empty">
            Henüz kaydedilmiş ölçüm bulunmuyor. Canlı hız ölçülürken "Yeni Ölçüm" butonuna
            basarak anlık hızınızı kaydedebilirsiniz.
          </div>
        ) : (
          <ul className="history-list">
            {history.map((item) => (
              <li key={item.id} className="history-item">
                <div className="history-item-left">
                  <span className="history-id-tag">#{item.id}</span>
                  <span className="history-time">{item.time}</span>
                </div>
                <div className="history-item-right">
                  <span className="history-speed">{item.speedKmh.toFixed(1)}</span>
                  <span className="history-unit">km/sa</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Geliştirici GPS Debug Paneli (Yalnızca Dev Ortamında) */}
      {import.meta.env.DEV && <GpsDebugPanel />}

      {/* Alt Bilgi */}
      <footer className="speedgps-footer">
        <p>
          GPS ölçümleri deneyseldir; cihaz donanımına ve çevresel koşullara göre doğruluk farklılıkları gösterebilir.
          Konum verileri hiçbir sunucuya gönderilmez, yalnızca tarayıcınızda işlenir.
        </p>
      </footer>
    </div>
  )
}

export default App
