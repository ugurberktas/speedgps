import { useEffect } from 'react'
import {
  type SpeedUnit,
  formatSpeedValue,
  getSpeedUnitLabel,
} from '../utils/speedUnits'
import type { GpsStatus } from '../App'
import './HudView.css'

export interface HudViewProps {
  speedKmh: number | null
  speedUnit: SpeedUnit
  gpsStatus: GpsStatus
  isStale: boolean
  isPaused: boolean
  onClose: () => void
  onCycleUnit?: () => void
}

export function HudView({
  speedKmh,
  speedUnit,
  gpsStatus,
  isStale,
  isPaused,
  onClose,
  onCycleUnit,
}: HudViewProps) {
  // ESC tuşu ile HUD'dan güvenli çıkış
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Geçerli hız kontrolü: GPS aktif, bayatlamamış, duraklatılmamış ve hız sayı olmalı
  const isSpeedValid =
    speedKmh !== null &&
    !isStale &&
    !isPaused &&
    gpsStatus === 'aktif'

  const displaySpeed = isSpeedValid ? formatSpeedValue(speedKmh, speedUnit, 0) : '--'
  const unitLabel = getSpeedUnitLabel(speedUnit)

  return (
    <div
      className="hud-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Araç HUD Modu"
    >
      {/* Çıkış Kontrolü — Asla aynalanmaz, kullanıcı tarafından doğrudan okunabilir */}
      <header className="hud-top-bar">
        <button
          type="button"
          className="hud-exit-btn"
          onClick={onClose}
          aria-label="HUD modundan çık"
        >
          <span className="hud-exit-icon" aria-hidden="true">✕</span>
          <span className="hud-exit-text">Kapat</span>
        </button>
      </header>

      {/* HUD İçerik Alanı — Portre ekranlarda 90 derece dönüşü barındırır */}
      <div className="hud-content-wrapper">
        {/* Ön cama yansıtma için yatay aynalanmış hız alanı */}
        <div
          className="hud-mirrored-display"
          onClick={onCycleUnit}
          role={onCycleUnit ? 'button' : undefined}
          tabIndex={onCycleUnit ? 0 : undefined}
          title={onCycleUnit ? 'Birim değiştirmek için dokunun' : undefined}
          onKeyDown={(e) => {
            if (onCycleUnit && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onCycleUnit()
            }
          }}
        >
          <div className="hud-speed-value" data-testid="hud-speed">
            {displaySpeed}
          </div>
          <div className="hud-speed-unit" data-testid="hud-unit">
            {unitLabel}
          </div>
        </div>
      </div>
    </div>
  )
}
