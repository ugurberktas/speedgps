import { useState, useEffect, useRef } from 'react'
import { GpsSpeedTracker, type SpeedSource } from './utils/speedEngine'
import { calculateHaversineDistance, type Coordinates } from './utils/gpsMath'
import {
  GPS_RELIABILITY_CONFIG,
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
} from './utils/measurementSession'
import { WakeLockManager } from './utils/wakeLock'
import { getActiveLocationQuality } from './utils/locationQuality'
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
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null)

  // Oturum istatistikleri ve süre
  const [sessionStats, setSessionStats] = useState<SessionStats>(INITIAL_SESSION_STATS)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  // Ölçüm Geçmişi
  const [history, setHistory] = useState<SavedMeasurement[]>([])
  const nextIdRef = useRef<number>(1)

  // GPS Refs
  const watchIdRef = useRef<number | null>(null)
  const trackerRef = useRef<GpsSpeedTracker>(new GpsSpeedTracker())
  const lastCoordsRef = useRef<Coordinates | null>(null)
  const lastFixTimestampRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockManager>(new WakeLockManager())
  const gpsStatusRef = useRef<GpsStatus>(gpsStatus)

  useEffect(() => {
    gpsStatusRef.current = gpsStatus
  }, [gpsStatus])

  // Süre Sayacı ve GPS Bayatlık (Staleness) Denetleyicisi
  useEffect(() => {
    if (gpsStatus !== 'aktif') {
      return
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)

      // GPS güncellemeleri kesildiğinde (STALE_DATA_TIMEOUT_MS) son hızı ekranda tutma, '--' yap
      if (
        lastFixTimestampRef.current !== null &&
        Date.now() - lastFixTimestampRef.current > GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS
      ) {
        setIsStale(true)
        setSpeedKmh(null)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [gpsStatus])

  // Bileşen kapandığında GPS takibini, Wake Lock'u ve oturumu temizle
  useEffect(() => {
    const tracker = trackerRef.current
    const wakeLock = wakeLockRef.current

    wakeLock.initVisibilityListener(() => {
      const status = gpsStatusRef.current
      return status === 'aktif' || status === 'bekleniyor'
    })

    return () => {
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
          const timestamp =
            typeof position.timestamp === 'number' &&
            Number.isFinite(position.timestamp) &&
            position.timestamp > 0
              ? position.timestamp
              : Date.now()

          const currentCoords: Coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }

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
            return
          }

          // Kabul edilen okuma: güncellik zaman damgasını yenile ve bayatlığı kaldır
          setGpsStatus('aktif')
          setErrorMessage(null)
          lastFixTimestampRef.current = Date.now()
          setIsStale(false)
          setCurrentAccuracy(
            typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null
          )

          // Hız motoru ile hızı hesapla (doğruluk, koordinat ve zaman kontrolleri dahil)
          const result = trackerRef.current.processReading(readingInput)

          // Yalnızca geçerli bir hız üretilmişse istatistikleri ve mesafeyi güncelle
          if (result.speedKmh !== null) {
            setSpeedSource(result.source)
            setSpeedKmh(result.speedKmh)

            let deltaMeters = 0
            if (lastCoordsRef.current) {
              const dist = calculateHaversineDistance(lastCoordsRef.current, currentCoords)
              // Sabit konum titremesi: mesafe eşiği altındaysa veya hız 0 ise yapay mesafe ekleme
              if (
                dist !== null &&
                dist >= GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS &&
                result.speedKmh > 0
              ) {
                deltaMeters = dist
                lastCoordsRef.current = currentCoords
              }
            } else {
              lastCoordsRef.current = currentCoords
            }

            setSessionStats((prev) =>
              updateSessionStats(prev, result.speedKmh, deltaMeters)
            )
          } else {
            // Henüz ilk okuma veya hesaplanma aşamasında sahte 0 gösterme, null tut
            setSpeedKmh(null)
            setSpeedSource('none')
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
    setCurrentAccuracy(null)
    setGpsStatus('durduruldu')
    setSpeedKmh(null)
    setSpeedSource('none')
  }

  // Yeni Ölçüm Butonu Mantığı
  const handleNewMeasurement = () => {
    // 1. GPS ölçümü yoksa, geçersizse veya bayatlamışsa (stale) kayıt oluşturma
    if (!canSaveMeasurement(speedKmh, gpsStatus, isStale)) {
      if (isStale) {
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

  const isTracking = gpsStatus === 'aktif' || gpsStatus === 'bekleniyor'
  const locationQuality = getActiveLocationQuality(currentAccuracy, gpsStatus, isStale)

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
          <div className={`status-pill status-${gpsStatus}`}>
            <span className="status-dot" aria-hidden="true" />
            <span>{STATUS_LABELS[gpsStatus]}</span>
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
            {speedKmh !== null ? speedKmh.toFixed(0) : '--'}
          </span>
          <span className="speed-unit">km/sa</span>
        </div>

        <div className="speed-subtext">
          {gpsStatus === 'durduruldu' && 'Ölçümü başlatmak için Başlat butonuna basın.'}
          {gpsStatus === 'bekleniyor' && 'GPS sinyali aranıyor...'}
          {gpsStatus === 'aktif' && isStale && 'GPS sinyali bekleniyor (güncelleme kesildi)...'}
          {gpsStatus === 'aktif' && !isStale && speedKmh === null && 'GPS sinyali bekleniyor (hız hesaplanıyor)...'}
          {gpsStatus === 'aktif' && !isStale && speedKmh !== null && (
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

      {/* Alt Bilgi */}
      <footer className="speedgps-footer">
        <p>Konum verileri yalnızca cihazınızda işlenir; sunucuya aktarılmaz.</p>
      </footer>
    </div>
  )
}

export default App
