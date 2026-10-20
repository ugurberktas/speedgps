import { useEffect, useRef } from 'react'
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
  errorMessage?: string | null
  onClose: () => void
  onCycleUnit?: () => void
}

export function HudView({
  speedKmh,
  speedUnit,
  gpsStatus,
  isStale,
  isPaused,
  errorMessage,
  onClose,
  onCycleUnit,
}: HudViewProps) {
  const exitBtnRef = useRef<HTMLButtonElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // ESC tuşu ile çıkış, odak yönetimi ve focus trap
  useEffect(() => {
    // 1. HUD açılmadan önceki aktif odağı kaydet
    if (document.activeElement instanceof HTMLElement) {
      previousActiveElementRef.current = document.activeElement
    }

    // 2. HUD açılınca odağı Kapat butonuna taşı
    exitBtnRef.current?.focus()

    // 3. Klavye etkileşimleri: Escape ile çıkış ve modal içi Focus Trap
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab') {
        const focusableElements = overlayRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex="0"]:not([disabled])'
        )
        if (!focusableElements || focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // 4. HUD kapandığında odağı önceki kontrole geri taşı
      try {
        previousActiveElementRef.current?.focus()
      } catch {
        // Sessizce devam et
      }
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

  // Durum metni: Bekleme, sinyal kaybı veya izin hatası durumunda kullanıcıya rehberlik eder
  const getHudStatus = (): { text: string; isError: boolean } | null => {
    if (gpsStatus === 'hata') {
      return {
        text: errorMessage || 'Konum izni reddedildi',
        isError: true,
      }
    }
    if (isPaused) {
      return { text: 'Ölçüm duraklatıldı', isError: false }
    }
    if (isStale) {
      return { text: 'GPS sinyali aranıyor...', isError: false }
    }
    if (gpsStatus === 'bekleniyor' || (gpsStatus === 'aktif' && speedKmh === null)) {
      return { text: 'GPS sinyali bekleniyor...', isError: false }
    }
    return null
  }

  const hudStatus = getHudStatus()

  return (
    <div
      ref={overlayRef}
      className="hud-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Araç HUD Modu"
    >
      {/* Çıkış Kontrolü — Asla aynalanmaz, kullanıcı tarafından doğrudan okunabilir */}
      <header className="hud-top-bar">
        {gpsStatus === 'hata' && (
          <div className="hud-top-error-badge" role="alert">
            {errorMessage || 'Konum izni reddedildi'}
          </div>
        )}
        <button
          ref={exitBtnRef}
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
          {hudStatus && (
            <div
              className={`hud-status-text ${hudStatus.isError ? 'hud-status-error' : ''}`}
              data-testid="hud-status"
            >
              {hudStatus.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
