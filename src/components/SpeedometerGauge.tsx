import React from 'react'
import { type SpeedUnit } from '../utils/speedUnits'
import {
  GAUGE_SCALES,
  calculateGaugeProgress,
  calculateArcLength,
  calculateDashOffset,
  getArcPoint,
} from '../utils/speedGaugeMath'
import './SpeedometerGauge.css'

export interface SpeedometerGaugeProps {
  speedKmh: number | null
  speedUnit: SpeedUnit
  isSpeedValid: boolean
  formattedSpeed: string
  unitLabel: string
}

export const SpeedometerGauge: React.FC<SpeedometerGaugeProps> = ({
  speedKmh,
  speedUnit,
  isSpeedValid,
  formattedSpeed,
  unitLabel,
}) => {
  // Geometrik parametreler
  const cx = 140
  const cy = 136
  const radius = 104
  const arcLength = calculateArcLength(radius)

  // Aktif birimin ölçeği ve doluluk oranı
  const scale = GAUGE_SCALES[speedUnit] ?? GAUGE_SCALES.kmh
  const progress = calculateGaugeProgress(speedKmh, speedUnit, isSpeedValid)
  const dashOffset = calculateDashOffset(progress, arcLength)

  // Yarım daire yolu (soldan sağa saat yönünde)
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`

  return (
    <div className="speedometer-container" aria-hidden="false">
      <svg
        className="speedometer-svg"
        viewBox="0 0 280 152"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Hız göstergesi kadranı: ${formattedSpeed} ${unitLabel}`}
      >
        <defs>
          <linearGradient id="speedGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
          <filter id="gaugeGlow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#ea580c" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Pasif Arka Plan Yayı (Açık İnce Gri) */}
        <path
          d={arcPath}
          className="gauge-track-arc"
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* Ölçek Çizgileri ve Sayısal Etiketler */}
        {scale.ticks.map((tickValue) => {
          const fraction = tickValue / scale.max
          // Çizgi noktaları
          const innerTick = getArcPoint(cx, cy, radius - 7, fraction)
          const outerTick = getArcPoint(cx, cy, radius - 1, fraction)
          // Etiket noktası (yayın dış kısmında)
          const labelPoint = getArcPoint(cx, cy, radius + 15, fraction)

          return (
            <g key={tickValue} className="gauge-tick-group">
              <line
                x1={innerTick.x}
                y1={innerTick.y}
                x2={outerTick.x}
                y2={outerTick.y}
                className="gauge-tick-line"
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y + 3}
                className="gauge-tick-label"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {tickValue}
              </text>
            </g>
          )
        })}

        {/* Aktif Hız Yayı (Turuncu Doluluk) */}
        <path
          d={arcPath}
          className="gauge-active-arc"
          fill="none"
          stroke="url(#speedGaugeGradient)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          filter={progress > 0.02 ? 'url(#gaugeGlow)' : undefined}
        />
      </svg>

      {/* Kadranın Merkezindeki Ana Dijital Hız Göstergesi */}
      <div className="speedometer-readout">
        <span className="speed-number" data-testid="speed-number">
          {formattedSpeed}
        </span>
        <span className="speed-unit" data-testid="speed-unit">
          {unitLabel}
        </span>
      </div>
    </div>
  )
}
