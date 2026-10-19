import { useState, useEffect } from 'react'
import { gpsDebugLogger, type GpsRawSample } from '../utils/gpsDebugLogger'

/**
 * GpsDebugPanel Component
 * Sprint 6.4 / Adım 1
 *
 * Yalnızca geliştirme ortamında (import.meta.env.DEV) görüntülenir.
 * Canlı bellek içi GPS ham örneklerini, kabul/reddetme nedenlerini gösterir.
 * JSON indirme ve kayıt temizleme işlevleri sunar.
 */
export function GpsDebugPanel() {
  const [sampleCount, setSampleCount] = useState<number>(() => gpsDebugLogger.getSampleCount())
  const [latestSample, setLatestSample] = useState<GpsRawSample | null>(() =>
    gpsDebugLogger.getLatestSample()
  )
  const [isExporting, setIsExporting] = useState<boolean>(false)

  // Örnek sayısını periyodik olarak güncelle (dev panel için hafif yoklama)
  useEffect(() => {
    const interval = setInterval(() => {
      setSampleCount(gpsDebugLogger.getSampleCount())
      setLatestSample(gpsDebugLogger.getLatestSample())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleDownload = () => {
    setIsExporting(true)
    try {
      const filename = `speedgps-raw-data-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      gpsDebugLogger.downloadJson(filename)
    } finally {
      setIsExporting(false)
    }
  }

  const handleClear = () => {
    gpsDebugLogger.clear()
    setSampleCount(0)
    setLatestSample(null)
  }

  return (
    <section className="gps-debug-panel" aria-label="Geliştirici GPS Hata Ayıklama Paneli">
      <details className="debug-details">
        <summary className="debug-summary">
          <span className="debug-title">🛠️ GPS Debug (Dev Modu)</span>
          <span className="debug-badge">{sampleCount} örnek</span>
        </summary>

        <div className="debug-content">
          <div className="debug-actions">
            <button
              type="button"
              className="debug-btn debug-btn-download"
              onClick={handleDownload}
              disabled={sampleCount === 0 || isExporting}
            >
              📥 JSON İndir
            </button>
            <button
              type="button"
              className="debug-btn debug-btn-clear"
              onClick={handleClear}
              disabled={sampleCount === 0}
            >
              🗑️ Temizle
            </button>
          </div>

          {latestSample ? (
            <div className="debug-sample-box">
              <div className="debug-sample-row">
                <span className="debug-key">Son Kayıt #{latestSample.id}:</span>
                <span className={`debug-status status-${latestSample.status}`}>
                  {latestSample.status === 'accepted' ? '✓ Kabul Edildi' : '✕ Reddedildi'}
                </span>
              </div>
              <div className="debug-grid">
                <div>
                  <strong>Zaman:</strong> {latestSample.isoTime.substring(11, 19)}
                </div>
                <div>
                  <strong>Konum:</strong> {latestSample.latitude.toFixed(5)}, {latestSample.longitude.toFixed(5)}
                </div>
                <div>
                  <strong>Doğruluk:</strong> {latestSample.accuracy !== null ? `±${latestSample.accuracy.toFixed(1)}m` : 'null'}
                </div>
                <div>
                  <strong>Hız:</strong> {latestSample.speed !== null ? `${(latestSample.speed * 3.6).toFixed(1)} km/sa (${latestSample.speed.toFixed(2)} m/s)` : 'null'}
                </div>
                <div>
                  <strong>Kaynak:</strong> {latestSample.source}
                </div>
                <div>
                  <strong>Yön / İrtifa:</strong> {latestSample.heading !== null ? `${latestSample.heading}°` : 'null'} / {latestSample.altitude !== null ? `${latestSample.altitude.toFixed(0)}m` : 'null'}
                </div>
              </div>
              {latestSample.reason && (
                <div className="debug-reason">
                  <strong>Neden / Açıklama:</strong> {latestSample.reason}
                </div>
              )}
            </div>
          ) : (
            <div className="debug-empty">Henüz GPS ham verisi kaydedilmedi. GPS başlatıldığında kayıtlar burada listelenir.</div>
          )}

          <div className="debug-notice">
            🔒 Bu kayıtlar yalnızca cihaz belleğinde tutulur; hiçbir sunucuya iletilmez. Üretim (production) sürümünde bu panel ve veri toplama tamamen devre dışıdır.
          </div>
        </div>
      </details>
    </section>
  )
}
export default GpsDebugPanel
