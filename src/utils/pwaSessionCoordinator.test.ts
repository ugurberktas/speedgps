import { describe, it, expect, afterEach } from 'vitest'
import { PwaSessionCoordinator } from './pwaSessionCoordinator'

describe('PwaSessionCoordinator — Sekmeler Arası Oturum Koordinasyonu', () => {
  let coordinatorA: PwaSessionCoordinator | null = null
  let coordinatorB: PwaSessionCoordinator | null = null

  afterEach(() => {
    coordinatorA?.destroy()
    coordinatorB?.destroy()
    coordinatorA = null
    coordinatorB = null
  })

  it('1. A sekmesinde GPS ölçümü aktifken, B sekmesi sorguladığında aktif ölçümü tespit eder', async () => {
    coordinatorA = new PwaSessionCoordinator(
      'tab-A',
      () => true, // isTracking = true
      () => false // hasHistory = false
    )

    coordinatorB = new PwaSessionCoordinator(
      'tab-B',
      () => false,
      () => false
    )

    const result = await coordinatorB.queryOtherTabsActive(50)
    expect(result.hasOtherActiveTracking).toBe(true)
  })

  it('2. A sekmesinde RAM geçmişi varken, B sekmesi sorguladığında geçmişi tespit eder', async () => {
    coordinatorA = new PwaSessionCoordinator(
      'tab-A',
      () => false, // isTracking = false
      () => true // hasHistory = true
    )

    coordinatorB = new PwaSessionCoordinator(
      'tab-B',
      () => false,
      () => false
    )

    const result = await coordinatorB.queryOtherTabsActive(50)
    expect(result.hasOtherActiveTracking).toBe(false)
    expect(result.hasOtherHistory).toBe(true)
  })

  it('3. Diğer sekmelerde aktif ölçüm veya geçmiş yoksa serbest kabul edilir', async () => {
    coordinatorA = new PwaSessionCoordinator(
      'tab-A',
      () => false,
      () => false
    )

    coordinatorB = new PwaSessionCoordinator(
      'tab-B',
      () => false,
      () => false
    )

    const result = await coordinatorB.queryOtherTabsActive(50)
    expect(result.hasOtherActiveTracking).toBe(false)
    expect(result.hasOtherHistory).toBe(false)
  })

  it('4. Sekme kapandığında (destroy) sistemde sahte aktif kilit bırakmaz', async () => {
    coordinatorA = new PwaSessionCoordinator(
      'tab-A',
      () => true,
      () => true
    )

    // A sekmesi kapatıldı
    coordinatorA.destroy()

    coordinatorB = new PwaSessionCoordinator(
      'tab-B',
      () => false,
      () => false
    )

    const result = await coordinatorB.queryOtherTabsActive(50)
    expect(result.hasOtherActiveTracking).toBe(false)
    expect(result.hasOtherHistory).toBe(false)
  })

  it('5. Tek sekme varken kendi sorgusunu kendisi yanıtlayıp sahte kilit üretmez', async () => {
    coordinatorA = new PwaSessionCoordinator(
      'tab-A',
      () => true,
      () => true
    )

    const result = await coordinatorA.queryOtherTabsActive(50)
    expect(result.hasOtherActiveTracking).toBe(false)
    expect(result.hasOtherHistory).toBe(false)
  })
})
