/**
 * SpeedGPS — PWA Güncelleme Yönetimi Hook'u
 * V3 Aşama 2 / Görev 6: Madde 21
 */

import { useState, useCallback, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export interface PwaUpdateState {
  needRefresh: boolean
  isOnline: boolean
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  dismissUpdate: () => void
  isDismissed: boolean
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

export function usePwaUpdate(isTracking: boolean): PwaUpdateState {
  const [isDismissed, setIsDismissed] = useState(false)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

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
    updateServiceWorker,
  } = useRegisterSW({
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

  // Kullanıcı daha sonra hatırlat derse veya güncelleme onaylanırsa
  const dismissUpdate = useCallback(() => {
    setIsDismissed(true)
  }, [])

  // Aktif GPS ölçümü sırasında güncelleme bildirimi gizlenir/ertelenir;
  // Ölçüm bittiğinde kullanıcıya gösterilebilir.
  const shouldShowPrompt = shouldShowPwaPrompt({
    needRefresh,
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
  }
}
