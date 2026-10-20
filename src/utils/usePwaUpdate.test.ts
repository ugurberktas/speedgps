/**
 * SpeedGPS — PWA Güncelleme Mantığı Testleri
 * V3 Aşama 2 / Görev 6: Maddeler 21 ve 22
 */

import { describe, it, expect } from 'vitest'
import { shouldShowPwaPrompt } from './usePwaUpdate'

describe('V3 Görev 6: PWA Güncelleme Bildirimi Koşulları (Madde 21)', () => {
  it('1. Yeni sürüm yoksa (needRefresh=false) bildirim gösterilmez', () => {
    const show = shouldShowPwaPrompt({
      needRefresh: false,
      isOnline: true,
      isDismissed: false,
      isTracking: false,
    })
    expect(show).toBe(false)
  })

  it('2. Yeni sürüm hazır olduğunda ve GPS ölçümü aktifken bildirim GİZLENİR (oturum bölünmez/yenilenmez)', () => {
    // needRefresh = true ama isTracking = true (araç hareket halinde veya ölçüm açık)
    const show = shouldShowPwaPrompt({
      needRefresh: true,
      isOnline: true,
      isDismissed: false,
      isTracking: true, // AKTİF ÖLÇÜM
    })
    expect(show).toBe(false)
  })

  it('3. GPS ölçümü durdurulduğunda (isTracking=false) bekleyen güncelleme bildirimi kullanıcıya sunulur', () => {
    const show = shouldShowPwaPrompt({
      needRefresh: true,
      isOnline: true,
      isDismissed: false,
      isTracking: false, // DURDURULDU
    })
    expect(show).toBe(true)
  })

  it('4. Cihaz çevrimdışıysa (isOnline=false) güncelleme bildirimi gösterilmez', () => {
    const show = shouldShowPwaPrompt({
      needRefresh: true,
      isOnline: false, // İNTERNET YOK
      isDismissed: false,
      isTracking: false,
    })
    expect(show).toBe(false)
  })

  it('5. Kullanıcı bildirimi ertelediyse (isDismissed=true) tekrar rahatsız edilmez', () => {
    const show = shouldShowPwaPrompt({
      needRefresh: true,
      isOnline: true,
      isDismissed: true, // ERTELENDİ
      isTracking: false,
    })
    expect(show).toBe(false)
  })
})
