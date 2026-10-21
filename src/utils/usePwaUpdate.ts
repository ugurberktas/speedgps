/**
 * SpeedGPS — PWA Güncelleme Yönetimi Hook'u
 * V3 Aşama 2 / Görev 6: Madde 21 & V3 Son Düzeltmeler / Görev 5 (D3)
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PwaSessionCoordinator } from './pwaSessionCoordinator'

export interface PwaUpdateState {
  needRefresh: boolean
  isOnline: boolean
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  dismissUpdate: () => void
  isDismissed: boolean
  otherTabNotice: string | null
  pendingReload: boolean
}

/**
 * PWA güncelleme bildiriminin gösterilme koşullarını belirler:
 * 1. Yeni sürüm hazır olmalıdır (needRefresh === true).
 * 2. Cihaz çevrimiçi olmalıdır (isOnline === true).
 * 3. Kullanıcı bildirimi ertelememiş olmalıdır (!isDismissed).
 * 4. EN ÖNEMLİSİ: Aktif GPS ölçümü sırasında bildirim gösterilmez / reload yapılmaz (!isTracking).
 */
export function shouldShowPwaPrompt(params: {
  needRefresh: boolean
  isOnline: boolean
  isDismissed: boolean
  isTracking: boolean
}): boolean {
  return params.needRefresh && params.isOnline && !params.isDismissed && !params.isTracking
}

function generateTabId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export function usePwaUpdate(isTracking: boolean, hasHistory: boolean = false): PwaUpdateState {
  const [isDismissed, setIsDismissed] = useState(false)
  const [pendingReload, setPendingReload] = useState(false)
  const [otherTabNotice, setOtherTabNotice] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  const [tabId] = useState(generateTabId)
  const isTrackingRef = useRef(isTracking)
  const hasHistoryRef = useRef(hasHistory)

  useEffect(() => {
    isTrackingRef.current = isTracking
    hasHistoryRef.current = hasHistory
  }, [isTracking, hasHistory])

  const userInitiatedReloadRef = useRef(false)
  const coordinatorRef = useRef<PwaSessionCoordinator | null>(null)

  useEffect(() => {
    const coordinator = new PwaSessionCoordinator(
      tabId,
      () => isTrackingRef.current,
      () => hasHistoryRef.current
    )
    coordinatorRef.current = coordinator

    return () => {
      coordinator.destroy()
      coordinatorRef.current = null
    }
  }, [tabId])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const {
    needRefresh: [needRefresh],
    updateServiceWorker: rawUpdateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      // 1. D3 / P1 Koruması: Bu sekmede aktif GPS ölçümü devam ediyorsa ASLA reload yapma
      if (isTrackingRef.current) {
        if (import.meta.env.DEV) {
          console.info('[SpeedGPS PWA] Aktif GPS ölçümü devam ettiği için sayfa yenilenmedi.')
        }
        setPendingReload(true)
        return
      }

      // 2. Bu sekmede RAM geçmişi varsa ve kullanıcı bu sekmeden Güncelle'ye basmadıysa
      // sessizce yenileme yapma, kullanıcının Durdur sonrası bilinçli onayını bekle
      if (hasHistoryRef.current && !userInitiatedReloadRef.current) {
        if (import.meta.env.DEV) {
          console.info('[SpeedGPS PWA] RAM geçmişi bulunduğu için otomatik yenileme ertelendi.')
        }
        setPendingReload(true)
        return
      }

      // 3. Yenileme koşulları güvenli (kullanıcı bu sekmeden onayladı veya oturum temiz)
      window.location.reload()
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Düzenli aralıklarla gereksiz polling yapılmaz;
        // Tarayıcı sayfa ziyaretlerinde ve gezinmede sw.js'i doğal olarak kontrol eder.
      }
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) {
        console.warn('[SpeedGPS PWA] Service Worker kaydı başarısız:', error)
      }
    },
  })

  // Kullanıcı daha sonra hatırlat derse veya güncelleme ertelenirse
  const dismissUpdate = useCallback(() => {
    setIsDismissed(true)
    setOtherTabNotice(null)
  }, [])

  // Güvenli ve koordineli güncelleme tetikleyicisi
  const updateServiceWorker = useCallback(
    async (reloadPage = true) => {
      // 1. Diğer sekmelerde aktif ölçüm var mı sorgula
      if (coordinatorRef.current) {
        const { hasOtherActiveTracking } = await coordinatorRef.current.queryOtherTabsActive(120)
        if (hasOtherActiveTracking) {
          setOtherTabNotice(
            'Başka bir sekmede aktif GPS ölçümü devam ediyor. Oturumun bölünmemesi için güncelleme ertelendi.'
          )
          return
        }
      }

      setOtherTabNotice(null)

      // 2. Bu sekmede RAM geçmişi varsa kullanıcıyı bilgilendir
      if (hasHistoryRef.current && reloadPage) {
        const confirmUpdate = window.confirm(
          'Uygulama güncellendiğinde geçici hafızadaki (RAM) kayıtlı ölçümler temizlenecektir. Devam etmek istiyor musunuz?'
        )
        if (!confirmUpdate) {
          return
        }
      }

      userInitiatedReloadRef.current = true

      // 3. Eğer Service Worker zaten kontrolü almış ve sadece reload bekleniyorsa
      if (pendingReload) {
        window.location.reload()
        return
      }

      // 4. Yeni Service Worker'ı aktifleştir (skipWaiting)
      await rawUpdateServiceWorker(reloadPage)
    },
    [pendingReload, rawUpdateServiceWorker]
  )

  // Aktif GPS ölçümü sırasında güncelleme bildirimi gizlenir/ertelenir;
  // Ölçüm bittiğinde kullanıcıya gösterilebilir.
  const isUpdateAvailable = needRefresh || pendingReload
  const shouldShowPrompt = shouldShowPwaPrompt({
    needRefresh: isUpdateAvailable,
    isOnline,
    isDismissed,
    isTracking,
  })

  return {
    needRefresh: shouldShowPrompt,
    isOnline,
    updateServiceWorker,
    dismissUpdate,
    isDismissed,
    otherTabNotice,
    pendingReload,
  }
}
