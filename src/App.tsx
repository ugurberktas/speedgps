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
import {
  type SpeedUnit,
  SPEED_UNIT_OPTIONS,
  formatSpeedValue,
  getSpeedUnitLabel,
  convertSpeedFromKmh,
  formatPaceFromKmh,
} from './utils/speedUnits'
import { PrivacyPolicy } from './components/PrivacyPolicy'
import { HudView } from './components/HudView'
import { SpeedometerGauge } from './components/SpeedometerGauge'
import './App.css'

export type GpsStatus = 'durduruldu' | 'bekleniyor' | 'aktif' | 'hata'

const STATUS_LABELS: Record<GpsStatus, string> = {
  durduruldu: 'Durduruldu',
  bekleniyor: 'Sinyal Bekleniyor...',
  aktif: 'GPS Aktif',
  hata: 'GPS Hatası',
}

function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname
    }
    return '/'
  })

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path)
      setCurrentPath(path)
    }
  }

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('durduruldu')
  const [speedKmh, setSpeedKmh] = useState<number | null>(null)
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>('kmh')
  const [displayMode, setDisplayMode] = useState<'speed' | 'pace'>('speed')
  const [isHudOpen, setIsHudOpen] = useState<boolean>(false)
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

  // Hızı Kaydet Butonu Mantığı (Sprint 6)
  const handleSaveSpeed = () => {
    // 1. GPS ölçümü yoksa, geçersizse, bayatlamışsa (stale) veya arka planda duraklatılmışsa kayıt oluşturma
    if (!canSaveMeasurement(speedKmh, gpsStatus, isStale, isPaused)) {
      if (gpsStatus === 'durduruldu') {
        setFeedbackNotice(
          'Ölçüm durdurulduğu için hız kaydedilemiyor. Lütfen önce Başlat butonuna basın.'
        )
      } else if (isPaused) {
        setFeedbackNotice(
          'Uygulama arka planda duraklatıldı. Hız kaydetmek için lütfen uygulamayı ekranda tutun.'
        )
      } else if (isStale) {
        setFeedbackNotice(
          'GPS güncellemesi kesildi veya veri güncel değil. Hız kaydetmek için GPS sinyali bekleniyor.'
        )
      } else {
        setFeedbackNotice(
          'Geçerli bir hız ölçümü bulunmuyor. Hız kaydetmek için GPS aktif olmalı ve güncel hız verisi alınmalıdır.'
        )
      }
      return
    }

    // 2. Geçerli anlık hızı (0 dahil) kaydet
    const validSpeed = speedKmh as number
    const newRecord = createSavedMeasurement(nextIdRef.current, validSpeed)
    nextIdRef.current += 1

    setHistory((prev) => [newRecord, ...prev])

    // NOT: Hızı Kaydet oturum istatistiklerini (süre, mesafe, maks/ortalama hız) sıfırlamaz.
    // Canlı GPS takibi kesintisiz devam eder.

    const unitLabel = getSpeedUnitLabel(speedUnit)
    const displayRecordedSpeed = formatSpeedValue(newRecord.speedKmh, speedUnit, 1)

    setFeedbackNotice(
      `Hız kaydedildi: #${newRecord.id} (${displayRecordedSpeed} ${unitLabel})`
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

    const unitLabel = getSpeedUnitLabel(speedUnit)
    const summaryText = formatHistorySummary(history, {
      unitLabel,
      convertFn: (v) => convertSpeedFromKmh(v, speedUnit) ?? v,
    })
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
      setFeedbackNotice(`Ölçüm özeti (${history.length} kayıt, ${unitLabel}) panoya kopyalandı.`)
    } catch {
      setFeedbackNotice('Özet panoya kopyalanamadı. Lütfen tekrar deneyin.')
    }
  }

  // Araç HUD Modu Açılış Mantığı (Tam ekran ve yön kilidi korumalı)
  const handleOpenHud = async () => {
    setIsHudOpen(true)

    // 1. Tarayıcı destekliyorsa Fullscreen API ile tam ekranı dene
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {})
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        await (document.documentElement as any).webkitRequestFullscreen().catch(() => {})
      }
    } catch {
      // Fullscreen desteklenmediğinde sessizce devam et
    }

    // 2. Destekleniyorsa Screen Orientation API ile landscape yönünü iste
    try {
      if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
        await (screen.orientation as any).lock('landscape').catch(() => {})
      }
    } catch {
      // Desteklenmeyen veya reddedilen (örn. iOS Safari) durumlarda sessizce devam et
    }
  }

  // Araç HUD Modu Kapanış Mantığı
  const handleCloseHud = async () => {
    setIsHudOpen(false)

    // 1. Tam ekrandan güvenle çık
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {})
      } else if ((document as any).webkitFullscreenElement) {
        await (document as any).webkitExitFullscreen().catch(() => {})
      }
    } catch {
      // Sessizce devam et
    }

    // 2. Ekran yönü kilidini kaldır
    try {
      if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
        screen.orientation.unlock()
      }
    } catch {
      // Sessizce devam et
    }
  }

  // Hız Birimini Döndür (HUD ekranından dokunulduğunda)
  const handleCycleSpeedUnit = () => {
    setSpeedUnit((prev) => {
      if (prev === 'kmh') return 'mph'
      if (prev === 'mph') return 'ms'
      return 'kmh'
    })
  }

  const isTracking = gpsStatus === 'aktif' || gpsStatus === 'bekleniyor'
  const locationQuality = getActiveLocationQuality(currentAccuracy, gpsStatus, isStale || isPaused)

  if (currentPath === '/gizlilik') {
    return <PrivacyPolicy onBackToHome={() => navigateTo('/')} />
  }

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

      {/* Ana Hız / Tempo Kartı */}
      <main className="speed-card" aria-label={displayMode === 'pace' ? 'Anlık Tempo Göstergesi' : 'Anlık Hız Göstergesi'}>
        {/* Görünüm Modu ve Birim Seçici Üst Barı */}
        <div className="card-top-controls">
          {/* Hız / Tempo Görünüm Seçici */}
          <div className="mode-selector" role="tablist" aria-label="Görünüm Modu">
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === 'speed'}
              className={`mode-toggle-btn ${displayMode === 'speed' ? 'active' : ''}`}
              onClick={() => setDisplayMode('speed')}
            >
              Hız
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === 'pace'}
              className={`mode-toggle-btn ${displayMode === 'pace' ? 'active' : ''}`}
              onClick={() => setDisplayMode('pace')}
            >
              Tempo
            </button>
          </div>

          {/* Sağ Kontroller Grubu: Hız Birimi ve HUD Butonu */}
          <div className="card-top-right-group">
            {/* Hız Birimi Seçici (Yalnızca Hız Modunda) */}
            {displayMode === 'speed' ? (
              <div className="speed-unit-selector" role="radiogroup" aria-label="Hız Birimi">
                {SPEED_UNIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={speedUnit === opt.id}
                    className={`unit-toggle-btn ${speedUnit === opt.id ? 'active' : ''}`}
                    onClick={() => setSpeedUnit(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="pace-badge-info" title="Yürüyüş ve koşu temposu (min/km)">
                min/km
              </div>
            )}

            {/* Araç HUD Modu Butonu */}
            <button
              type="button"
              className="hud-trigger-btn"
              onClick={handleOpenHud}
              aria-label="Araç HUD Modunu Aç"
              title="Ön cama yansıtma modu (HUD)"
            >
              HUD
            </button>
          </div>
        </div>

        {/* Hız Modunda Araba Kadranı (Yarım Daire Hız Göstergesi) / Tempo Modunda Dijital Tempo */}
        {displayMode === 'speed' ? (
          <SpeedometerGauge
            speedKmh={speedKmh}
            speedUnit={speedUnit}
            isSpeedValid={speedKmh !== null && !isStale && !isPaused && gpsStatus === 'aktif'}
            formattedSpeed={
              speedKmh !== null && !isStale && !isPaused
                ? formatSpeedValue(speedKmh, speedUnit, 0)
                : '--'
            }
            unitLabel={getSpeedUnitLabel(speedUnit)}
          />
        ) : (
          <div className="speed-display-box">
            <span className="speed-number pace-number">
              {speedKmh !== null && !isStale && !isPaused
                ? formatPaceFromKmh(speedKmh)
                : '--:--'}
            </span>
            <span className="speed-unit">min/km</span>
          </div>
        )}

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
        {!isTracking ? (
          <button
            type="button"
            className="btn-primary-start"
            onClick={startTracking}
          >
            <span>Başlat</span>
          </button>
        ) : (
          <div className="active-controls-row">
            <button
              type="button"
              className="btn-action-half btn-start-disabled"
              disabled
              aria-disabled="true"
            >
              <span>Başlat</span>
            </button>
            <button
              type="button"
              className="btn-action-half btn-stop-active"
              onClick={stopTracking}
            >
              <span>Durdur</span>
            </button>
          </div>
        )}
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
                {formatSpeedValue(sessionStats.maxSpeedKmh, speedUnit, 0)}
              </span>
              <span className="stat-unit">{getSpeedUnitLabel(speedUnit)}</span>
            </div>
          </div>

          <div className="stat-tile">
            <span className="stat-label">Ortalama Hız</span>
            <div className="stat-value">
              <span>
                {formatSpeedValue(sessionStats.avgSpeedKmh, speedUnit, 1)}
              </span>
              <span className="stat-unit">{getSpeedUnitLabel(speedUnit)}</span>
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
              className="btn-save-speed"
              onClick={handleSaveSpeed}
              title="Anlık geçerli hızı geçmişe kaydet"
            >
              Hızı Kaydet
            </button>
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
            Henüz kaydedilmiş ölçüm bulunmuyor. Canlı hız ölçülürken "Hızı Kaydet" butonuna
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
                  <span className="history-speed">
                    {formatSpeedValue(item.speedKmh, speedUnit, 1)}
                  </span>
                  <span className="history-unit">{getSpeedUnitLabel(speedUnit)}</span>
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
        <div className="footer-links">
          <a
            href="/gizlilik"
            onClick={(e) => {
              e.preventDefault()
              navigateTo('/gizlilik')
            }}
            className="footer-privacy-link"
          >
            Gizlilik ve KVKK
          </a>
        </div>
      </footer>

      {/* Araç HUD (Head-Up Display) Tam Ekran Katmanı */}
      {isHudOpen && (
        <HudView
          speedKmh={speedKmh}
          speedUnit={speedUnit}
          gpsStatus={gpsStatus}
          isStale={isStale}
          isPaused={isPaused}
          onClose={handleCloseHud}
          onCycleUnit={handleCycleSpeedUnit}
        />
      )}
    </div>
  )
}

export default App
