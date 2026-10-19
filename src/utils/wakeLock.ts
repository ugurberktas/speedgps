/**
 * SpeedGPS — Screen Wake Lock Yöneticisi
 * Sprint 6 / Adım 1
 *
 * GPS ölçümü sırasında cihaz ekranının kapanmasını/uyku moduna geçmesini önler.
 * Tarayıcı desteğini kontrol eder, sayfa gizlenip geri geldiğinde (visibilitychange)
 * kilidi otomatik yeniler ve asenkron yarış durumlarını (race condition) önler.
 */

export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null
  private shouldBeActive: boolean = false
  private isAcquiring: boolean = false
  private visibilityListener: (() => void) | null = null

  /**
   * Tarayıcının Screen Wake Lock API'sini destekleyip desteklemediğini denetler.
   */
  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      typeof navigator.wakeLock?.request === 'function'
    )
  }

  /**
   * Wake Lock'un şu anda aktif olup olmadığını döner.
   */
  public isActive(): boolean {
    return this.sentinel !== null && !this.sentinel.released
  }

  /**
   * Ekran kilidini talep eder (Başlat butonunda veya sayfa yeniden görünür olduğunda çağrılır).
   */
  public async requestLock(): Promise<boolean> {
    this.shouldBeActive = true

    // Zaten aktif bir kilit varsa veya desteklenmiyorsa tekrar talep etme
    if (this.isActive() || !this.isSupported() || this.isAcquiring) {
      return this.isActive()
    }

    // Sayfa arka plandaysa (hidden), tarayıcı zaten kilidi reddedecektir
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false
    }

    this.isAcquiring = true

    try {
      const sentinel = await navigator.wakeLock.request('screen')

      // Yarış durumu kontrolü: İstek sürerken kullanıcı "Durdur"a basmışsa kilidi derhal serbest bırak
      if (!this.shouldBeActive) {
        await sentinel.release()
        this.sentinel = null
        this.isAcquiring = false
        return false
      }

      this.sentinel = sentinel

      // Sistem veya tarayıcı kilidi bırakırsa (ör. sayfa gizlendiğinde) referansı temizle
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) {
          this.sentinel = null
        }
      })

      this.isAcquiring = false
      return true
    } catch {
      // İzin reddi (NotAllowedError), pil tasarrufu veya tarayıcı hatasında uygulama çökmez
      this.sentinel = null
      this.isAcquiring = false
      return false
    }
  }

  /**
   * Ekran kilidini serbest bırakır (Durdur butonunda veya bileşen kapandığında çağrılır).
   */
  public async releaseLock(): Promise<void> {
    this.shouldBeActive = false

    if (this.sentinel && !this.sentinel.released) {
      try {
        await this.sentinel.release()
      } catch {
        // Serbest bırakma hatası sessizce yutulur
      }
    }
    this.sentinel = null
  }

  /**
   * Sayfa görünürlük değişikliklerini dinlemeye başlar.
   * Sayfa arka plana gidip geri geldiğinde kilit otomatik olarak yeniden talep edilir.
   */
  public initVisibilityListener(isTrackingCheck: () => boolean): void {
    if (typeof document === 'undefined' || this.visibilityListener !== null) {
      return
    }

    this.visibilityListener = async () => {
      if (document.visibilityState === 'visible' && isTrackingCheck()) {
        await this.requestLock()
      }
    }

    document.addEventListener('visibilitychange', this.visibilityListener)
  }

  /**
   * Tüm event listener ve kaynakları temizler.
   */
  public destroy(): void {
    if (typeof document !== 'undefined' && this.visibilityListener !== null) {
      document.removeEventListener('visibilitychange', this.visibilityListener)
      this.visibilityListener = null
    }
    void this.releaseLock()
  }
}
