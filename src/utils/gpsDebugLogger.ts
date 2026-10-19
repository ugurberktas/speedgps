/**
 * SpeedGPS — GPS Ham Veri Kayıt ve Hata Ayıklama Modülü (Debug Logger)
 * Sprint 6.4 / Adım 1
 *
 * Yalnızca geliştirme ortamında (import.meta.env.DEV) çalışır.
 * GPS okumalarını ve kabul/ret durumlarını yalnızca tarayıcı belleğinde sınırlar içinde tutar.
 * Sunucuya kesinlikle veri göndermez.
 * JSON formatında dışa aktarma (export/download) ve temizleme desteği sunar.
 */

import { type SpeedSource } from './speedEngine'

export interface GpsRawSample {
  id: number
  timestamp: number
  isoTime: string
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  speedKmh: number | null
  heading: number | null
  altitude: number | null
  source: SpeedSource
  status: 'accepted' | 'rejected'
  reason?: string
}

export const GPS_DEBUG_CONFIG = {
  MAX_SAMPLES: 300,
} as const

export class GpsDebugLogger {
  private samples: GpsRawSample[] = []
  private nextId: number = 1
  private enabled: boolean = false

  constructor(enabled: boolean = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)) {
    this.enabled = enabled
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.clear()
    }
  }

  /**
   * Yeni bir GPS örneğini belleğe kaydeder.
   */
  public logSample(sample: Omit<GpsRawSample, 'id' | 'isoTime'>): void {
    if (!this.enabled) {
      return
    }

    const isoTime =
      typeof sample.timestamp === 'number' && Number.isFinite(sample.timestamp)
        ? new Date(sample.timestamp).toISOString()
        : new Date().toISOString()

    const entry: GpsRawSample = {
      ...sample,
      id: this.nextId++,
      isoTime,
    }

    this.samples.push(entry)
    if (this.samples.length > GPS_DEBUG_CONFIG.MAX_SAMPLES) {
      this.samples.shift()
    }
  }

  /**
   * Bellekteki tüm kayıtlı örnekleri döner.
   */
  public getSamples(): GpsRawSample[] {
    return [...this.samples]
  }

  /**
   * Son kaydedilen örneği döner (varsa).
   */
  public getLatestSample(): GpsRawSample | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null
  }

  /**
   * Toplam kayıtlı örnek sayısını döner.
   */
  public getSampleCount(): number {
    return this.samples.length
  }

  /**
   * Bellekteki tüm kayıtları temizler.
   */
  public clear(): void {
    this.samples = []
    this.nextId = 1
  }

  /**
   * Kayıtları JSON metni olarak döner.
   */
  public exportJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalSamples: this.samples.length,
        samples: this.samples,
      },
      null,
      2
    )
  }

  /**
   * Tarayıcıda JSON dosyası olarak indirilmesini tetikler.
   */
  public downloadJson(filename: string = `speedgps-debug-${Date.now()}.json`): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false
    }

    const json = this.exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  }
}

// Uygulama geneli tekil logger nesnesi (Singleton)
export const gpsDebugLogger = new GpsDebugLogger()
