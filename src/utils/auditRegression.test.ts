import { describe, expect, it } from 'vitest'
import { GpsSpeedTracker } from './speedEngine'

// Known defects found during the independent audit. These assert desired behavior;
// `fails` must be removed when the corresponding algorithm defect is fixed.
const reading = (seconds: number, meters: number, speedKmh: number | null) => ({
  coords: {
    latitude: meters / 111194.92664455874,
    longitude: 0,
    accuracy: 5,
    speed: speedKmh === null ? null : speedKmh / 3.6,
  },
  timestamp: 100000 + seconds * 1000,
})

describe('Independent audit: known measurement defects', () => {
  it.fails('recovers from one wrong initial hardware speed after repeated consistent readings', () => {
    const tracker = new GpsSpeedTracker()
    tracker.processReading(reading(0, 0, 120))
    let result
    for (let t = 1; t <= 20; t++) result = tracker.processReading(reading(t, t * 10, 36))
    expect(result?.speedKmh).toBe(36)
  })

  it.fails('does not divide newly started movement by the preceding stationary minute', () => {
    const tracker = new GpsSpeedTracker()
    for (let t = 0; t <= 60; t++) tracker.processReading(reading(t, 0, null))
    const result = tracker.processReading(reading(61, 5, null))
    expect(result.speedKmh).toBeCloseTo(18, 0)
  })

  it.fails('does not eventually accept a rejected relocation while the new position remains stationary', () => {
    const tracker = new GpsSpeedTracker()
    tracker.processReading(reading(0, 0, null))
    tracker.processReading(reading(1, 0, null))
    let result
    for (let t = 2; t <= 15; t++) result = tracker.processReading(reading(t, 1000, null))
    expect(result?.speedKmh).toBe(0)
  })
})
