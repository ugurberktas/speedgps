/**
 * SpeedGPS — PWA Sekmeler Arası Oturum Koordinasyonu
 * V3 Görev 5 (D3): PWA güncellemesi sırasında aktif GPS ölçümlerinin ve RAM geçmişinin korunması
 */

export interface TabSessionMessage {
  type: 'QUERY_ACTIVE_SESSION' | 'ACTIVE_SESSION_RESPONSE' | 'UPDATE_REQUESTED'
  senderId: string
  isTracking?: boolean
  hasHistory?: boolean
}

export const PWA_COORDINATION_CHANNEL = 'speedgps_pwa_coordination'

export class PwaSessionCoordinator {
  private channel: BroadcastChannel | null = null
  private tabId: string
  private getIsTracking: () => boolean
  private getHasHistory: () => boolean

  constructor(
    tabId: string,
    getIsTracking: () => boolean,
    getHasHistory: () => boolean
  ) {
    this.tabId = tabId
    this.getIsTracking = getIsTracking
    this.getHasHistory = getHasHistory

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(PWA_COORDINATION_CHANNEL)
        this.channel.onmessage = this.handleMessage.bind(this)
      } catch (e) {
        console.warn('[SpeedGPS PWA] BroadcastChannel başlatılamadı:', e)
      }
    }
  }

  private handleMessage(event: MessageEvent<TabSessionMessage>) {
    const data = event.data
    if (!data || data.senderId === this.tabId) return

    if (data.type === 'QUERY_ACTIVE_SESSION') {
      // Başka bir sekme güncelleme öncesi aktif oturum sorguluyor
      const isTracking = this.getIsTracking()
      const hasHistory = this.getHasHistory()

      // Yalnızca aktif ölçüm veya korunacak RAM geçmişi varsa yanıt ver
      if (isTracking || hasHistory) {
        this.channel?.postMessage({
          type: 'ACTIVE_SESSION_RESPONSE',
          senderId: this.tabId,
          isTracking,
          hasHistory,
        })
      }
    }
  }

  /**
   * Diğer sekmelerde aktif GPS ölçümü veya RAM geçmişi olup olmadığını sorgular.
   * Kısa zaman aşımı (120ms) ile yaşayan sekmelerden yanıt toplar.
   * Kapanan veya çöken sekmeler yanıt veremeyeceği için sahte aktif kilit bırakamaz.
   */
  public async queryOtherTabsActive(timeoutMs = 120): Promise<{
    hasOtherActiveTracking: boolean
    hasOtherHistory: boolean
  }> {
    if (!this.channel) {
      return { hasOtherActiveTracking: false, hasOtherHistory: false }
    }

    const ch = this.channel
    return new Promise((resolve) => {
      let hasOtherActiveTracking = false
      let hasOtherHistory = false

      const responseHandler = (event: MessageEvent<TabSessionMessage>) => {
        const data = event.data
        if (!data || data.senderId === this.tabId) return

        if (data.type === 'ACTIVE_SESSION_RESPONSE') {
          if (data.isTracking) {
            hasOtherActiveTracking = true
          }
          if (data.hasHistory) {
            hasOtherHistory = true
          }
        }
      }

      ch.addEventListener('message', responseHandler)

      try {
        ch.postMessage({
          type: 'QUERY_ACTIVE_SESSION',
          senderId: this.tabId,
        })
      } catch (err) {
        console.warn('[SpeedGPS PWA] postMessage başarısız:', err)
      }

      setTimeout(() => {
        ch.removeEventListener('message', responseHandler)
        resolve({ hasOtherActiveTracking, hasOtherHistory })
      }, timeoutMs)
    })
  }

  public destroy() {
    if (this.channel) {
      try {
        this.channel.close()
      } catch {
        // yoksay
      }
      this.channel = null
    }
  }
}
