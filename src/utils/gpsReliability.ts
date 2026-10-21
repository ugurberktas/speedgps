/**
 * SpeedGPS — GPS Veri Güvenilirliği ve Doğrulama Modülü
 * Sprint 4 / Adım 1
 */

import { isValidCoordinate, type Coordinates } from './gpsMath'

/**
 * GPS Güvenilirlik Eşikleri ve Açıklamaları
 */
export const GPS_RELIABILITY_CONFIG = {
  /**
   * Maksimum Kabul Edilebilir Konum Doğruluğu (Metre):
   * coords.accuracy değeri, cihazın hesapladığı konumun %95 güven düzeyiyle bu yarıçap içinde
   * olduğunu belirtir. Bu değer doğrudan hız doğruluğu değildir (hız değeri platform/cihaz
   * tarafından GNSS alıcı donanımı, Doppler kayması veya sensör füzyonu ile sağlanabilir);
   * ancak konum doğruluğu 100 metrenin üzerine çıktığında (zayıf uydu geometrisi, baz istasyonu veya IP tahmini),
   * iki nokta arasındaki Haversine mesafesi ve hız hesabı güvenilemeyecek kadar büyük sıçramalara
   * maruz kalır. Bu nedenle 100 metreden kötü konum doğruluğuna sahip veriler reddedilir.
   */
  MAX_ACCEPTABLE_ACCURACY_METERS: 100,

  /**
   * GPS Verisi Bayatlık / Zaman Aşımı Süresi (Milisaniye):
   * GPS alıcıları standart olarak saniyede yaklaşık 1 güncelleme (1 Hz) üretir.
   * Cihaz tünele, otoparka girdiğinde veya sinyal kesildiğinde ekranda son hız donup kalmamalıdır.
   * 5000 ms (5 saniye) boyunca yeni geçerli bir GPS güncellemesi alınamazsa veriler bayat (stale)
   * kabul edilir, hız göstergesi '--' durumuna geçer ve kullanıcıya sinyal bekleniyor bilgisi verilir.
   */
  STALE_DATA_TIMEOUT_MS: 5000,

  /**
   * Durağan (Hareketsiz / 0 km/sa) Durumda GPS Bayatlık Eşiği (Milisaniye):
   * Cihaz hareketsizken veya kırmızı ışıkta beklerken mobil tarayıcılar (iOS/Android)
   * pil tasarrufu için konum güncellemelerini seyreltebilir. Bu bir GPS arızası değildir.
   * Bu nedenle durağanken bayatlık eşiği daha esnek tutulur (30000 ms = 30 saniye).
   */
  STATIONARY_STALE_TIMEOUT_MS: 30000,

  /**
   * Sprint 4 / Adım 2 & V3 Aşama 2: Hız ve İvme Filtreleme Eşikleri
   * NOT: Bu eşikler evrensel fiziksel imkânsızlık kanıtı değildir. SpeedGPS kara araçlarının yanı sıra
   * yaya, bisiklet, yüksek hızlı tren (YHT/TGV) veya havacılık gibi farklı senaryolarda da çalışabilir.
   * Buradaki eşikler, tüketici akıllı telefonlarındaki GNSS alıcılarının tekil uydu yansıması (multipath)
   * ve koordinat sıçraması kaynaklı gürültülerini filtrelemek amacıyla belirlenmiş mühendislik eşikleridir.
   */

  /**
   * Maksimum Gerçekçi Kara / Şehir Hızı Filtre Eşiği (km/sa):
   * Tüketici GPS alıcılarında baz istasyonu atlaması veya uydu yansıması sonucu oluşan
   * yüzlerce km/sa'lik sahte sıçramaları filtrelemek için kullanılan varsayılan üst sınır.
   * Yüksek hızlı tren veya havacılık gibi özel yüksek hızlı modlar için ileride profil bazlı
   * konfigürasyon planlanmıştır.
   * Mevcut varsayım: 250 km/sa.
   */
  MAX_REALISTIC_SPEED_KMH: 250,

  /**
   * Doğrudan GPS (coords.speed) İçin İvmelenme Filtre Eşiği (m/s²):
   * Tüketici akıllı telefonlarında donanım hızında tek bir saniyede ~54 km/sa (15 m/s) üzerindeki
   * ani sıçramalar çok büyük olasılıkla Doppler gürültüsü veya uydu kilidi kaybı kaynaklıdır.
   * Bu eşik ani sensör gürültüsünü filtrelemek için bir filtreleme filtresidir; mutlak fizik kanunu değildir.
   * Mevcut varsayım: 15 m/s² (~54 km/sa/sn).
   */
  MAX_ACCELERATION_MS2: 15,

  /**
   * Haversine (Koordinat Türevi) İçin İvmelenme Filtre Eşiği (m/s²):
   * Koordinat farkından türetilen hız, konum dalgalanmalarına donanım hızından daha duyarlı
   * olduğundan koordinat sıçramalarına karşı daha sıkı bir sınır uygulanır.
   * Mevcut varsayım: 12 m/s² (~43 km/sa/sn).
   */
  MAX_HAVERSINE_ACCELERATION_MS2: 12,

  /**
   * Doğrudan GPS (coords.speed) Durgunluk Titreme Eşiği (km/sa):
   * Platform GNSS yonga setinin Doppler hızında 1.0 km/sa altındaki değerler durağan durumdaki
   * sensör ölü bölgesi (deadband) gürültüsü kabul edilerek 0 km/sa'e çekilir.
   * 1.0 - 2.5 km/sa arasındaki yavaş yürüyüş hızları gerçek hareket olarak korunur.
   * Mevcut varsayım: 1.0 km/sa.
   */
  STATIONARY_GPS_SPEED_THRESHOLD_KMH: 1.0,

  /**
   * Koordinat Kayması (Haversine) Durgunluk Titreme Hız Eşiği (km/sa):
   * Cihaz masa üstünde veya ışıkta dururken GPS koordinatlarının 1-3 metre dalgalanması yapay
   * 1-4 km/sa koordinat hızları oluşturabilir. Doğrulanmış yer değiştirme (>= 2m) bulunmadığında
   * bu eşiğin altındaki koordinat hızları 0 km/sa kabul edilir.
   * Mevcut varsayım: 2.5 km/sa.
   */
  STATIONARY_DRIFT_SPEED_THRESHOLD_KMH: 2.5,

  /**
   * Sabit Konum Mesafe Titreme Eşiği (Metre):
   * İki konum arasındaki Haversine mesafesi bu değerin altındaysa hareket yok sayılır (0 m).
   * Başlangıç varsayımı: 2.0 metre.
   */
  STATIONARY_DISTANCE_THRESHOLD_METERS: 2.0,

  /**
   * Haversine (Koordinat Farkı) Hız Hesabı İçin Maksimum Kabul Edilebilir Konum Doğruluğu (Metre):
   * coords.speed mevcut olduğunda donanım/sensör hızına güvenilebilir; ancak coords.speed null
   * olduğunda hız iki koordinat arasındaki mesafeden türetilir. Konum doğruluğu 25 metreden
   * daha kötüyse (Zayıf kalite), koordinat dalgalanmaları sahte yüksek hızlar (ör. 86 km/sa)
   * üreteceğinden Haversine ile hız ve mesafe türetilmez.
   * Başlangıç varsayımı: 25.0 metre.
   */
  MAX_HAVERSINE_ACCURACY_METERS: 25.0,

  /**
   * Haversine Hız Hesabı İçin Minimum Zaman Farkı (Milisaniye):
   * İki GPS noktası arasındaki süre 500 ms'den (0.5 saniye) kısa olduğunda,
   * koordinat kuantizasyonu/yuvarlama hataları yapay hız sıçramalarına yol açar.
   * Bu sürenin altındaki noktalarda Haversine hız hesabı yapılmaz (null döner).
   */
  MIN_HAVERSINE_TIME_DELTA_MS: 500,

  /**
   * Haversine Yavaş Yürüyüş Çapa/Biriktirme Zaman Aşımı (Saniye):
   * Çapa noktasından itibaren bu süre boyunca doğrulanmış bir yer değiştirme
   * gerçekleşmezse kullanıcı durmuş kabul edilir ve hız 0 km/sa'e çekilir.
   */
  HAVERSINE_STATIONARY_TIMEOUT_SECONDS: 3.0,

  /**
   * EMA (Üstel Hareketli Ortalama) Yumuşatma Katsayısı (Alfa):
   * [0, 1] aralığında; 1'e yakın değerler anlık tepkiyi korur ve gecikmeyi önler.
   * 0.75 değeri doğal bir yumuşatma sunarken hız değişimlerini geciktirmez.
   * Başlangıç varsayımı: 0.75.
   */
  EMA_SMOOTHING_ALPHA: 0.75,

  /**
   * Medyan Filtresi Pencere Boyutu:
   * Tekil anormal sıçramaları (spike) elemek için son N örneğin medyanı değerlendirilir.
   * Başlangıç varsayımı: 3 örnek (minimum gecikme ile tekil sıçramaları anında süzer).
   */
  MEDIAN_FILTER_WINDOW_SIZE: 3,
  /**
   * Gelecek Zamanlı GPS Örnekleri İçin Maksimum Makul Tolerans (Milisaniye):
   * GPS donanımı veya cihaz saati arasındaki küçük kaymalar (clock drift) için tolerans.
   * Cihazın geçerli saatinden 15 saniyeden daha ilerideki zaman damgaları
   * fiziksel olarak imkansız/hatalı kabul edilerek reddedilir.
   */
  MAX_FUTURE_TIMESTAMP_DRIFT_MS: 15000,

  /**
   * Ölçüm anı ile geolocation callback'inin uygulamaya ulaşması arasındaki üst sınır.
   * 10 saniye, olağan birkaç saniyelik işletim sistemi gecikmesine izin verir;
   * tünel/arka plan sonrasında gelen eski konumu canlı hız gibi sunmaz.
   * Bu yalnız callback varış saati bilindiğinde uygulanır. Hız motorunun kendi
   * zaman farkı ve sıralama hesapları ölçüm timestamp'ini kullanmaya devam eder.
   */
  MAX_GPS_FIX_AGE_MS: 10000,
} as const

/**
 * coords.accuracy değerinin geçerli ve kabul edilebilir olup olmadığını denetler.
 * Geolocation API standardına göre accuracy negatif olmayan bir sayıdır (>= 0).
 * Değer sağlanmamışsa (null veya undefined) geriye dönük uyumluluk gereği geçerli kabul edilir.
 * Sağlanmışsa negatif olmayan (>= 0), sonlu bir sayı olmalı ve 100 metre eşiğini aşmamalıdır.
 */
export function isValidAccuracy(accuracy: number | null | undefined): boolean {
  if (accuracy === undefined || accuracy === null) {
    return true
  }

  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) {
    return false
  }

  if (accuracy < 0) {
    return false
  }

  if (accuracy > GPS_RELIABILITY_CONFIG.MAX_ACCEPTABLE_ACCURACY_METERS) {
    return false
  }

  return true
}

/**
 * İki GPS noktasının konum doğruluklarını birleştirerek efektif doğruluk değerini hesaplar.
 * İki değer de mevcutsa ortalaması alınır; yalnızca biri varsa o kullanılır.
 */
export function calculateCombinedAccuracy(
  acc1?: number | null,
  acc2?: number | null
): number | null {
  const isProvided1 = acc1 !== null && acc1 !== undefined
  const isProvided2 = acc2 !== null && acc2 !== undefined

  const valid1 = isProvided1 && typeof acc1 === 'number' && Number.isFinite(acc1) && acc1 >= 0
  const valid2 = isProvided2 && typeof acc2 === 'number' && Number.isFinite(acc2) && acc2 >= 0

  // Sağlanan değerlerden herhangi biri geçersizse (örn. negatif veya NaN) null dön
  if ((isProvided1 && !valid1) || (isProvided2 && !valid2)) {
    return null
  }

  if (valid1 && valid2) {
    return ((acc1 as number) + (acc2 as number)) / 2
  }
  if (valid1) {
    return acc1 as number
  }
  if (valid2) {
    return acc2 as number
  }
  return null
}

/**
 * Konum doğruluğuna (accuracy) duyarlı dinamik mesafe titreme eşiğini hesaplar.
 * Tek veya iki nokta doğruluğu verildiğinde hata payı altında kalan hareketleri filtreler.
 * Taban eşik: STATIONARY_DISTANCE_THRESHOLD_METERS (2.0 metre).
 * NOT: Doğruluk 0 olsa dahi fiziksel sensör gürültüsüne karşı taban eşik (2.0m) korunur.
 */
export function getEffectiveDistanceThreshold(
  accuracy?: number | null,
  secondAccuracy?: number | null
): number {
  const combined = calculateCombinedAccuracy(accuracy, secondAccuracy)
  if (combined !== null && combined > 0) {
    return Math.max(GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS, combined)
  }
  return GPS_RELIABILITY_CONFIG.STATIONARY_DISTANCE_THRESHOLD_METERS
}

export interface GpsReliabilityCheckInput {
  coords: {
    latitude: number
    longitude: number
    accuracy?: number | null
    speed?: number | null
  }
  timestamp: number
}

/**
 * GPS zaman damgasının geçerli, pozitif ve makul zaman aralığında olup olmadığını denetler.
 * - Eksik, sayısal olmayan, NaN ve sonsuz değerleri reddeder.
 * - 0 ve negatif değerleri reddeder.
 * - Makul olmayan gelecek zamanlı değerleri reddeder (maxWallTime + tolerans).
 */
export function isValidGpsTimestamp(
  timestamp: unknown,
  maxWallTime: number = Date.now()
): timestamp is number {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return false
  }

  if (timestamp <= 0) {
    return false
  }

  // Makul olmayan gelecek zaman kontrolü
  if (timestamp > maxWallTime + GPS_RELIABILITY_CONFIG.MAX_FUTURE_TIMESTAMP_DRIFT_MS) {
    return false
  }

  return true
}

/**
 * GPS okumasının temel sayısal ve mantıksal geçerliliğini denetler:
 * 1. coords ve timestamp alanlarının varlığı
 * 2. Enlem (-90..90) ve boylam (-180..180) sınırları
 * 3. Zaman damgasının pozitif, sonlu ve makul bir sayı olması
 * 4. Konum doğruluğunun (accuracy >= 0) sınırları aşmaması
 * 5. Callback varış saati verildiyse ölçümün 10 saniyeden eski olmaması
 */
export function isReliableGpsReading(
  reading: GpsReliabilityCheckInput | null | undefined,
  maxWallTime?: number
): boolean {
  if (!reading || !reading.coords) {
    return false
  }

  const { latitude, longitude, accuracy } = reading.coords
  const timestamp = reading.timestamp

  if (!isValidGpsTimestamp(timestamp, maxWallTime)) {
    return false
  }

  if (
    maxWallTime !== undefined &&
    timestamp < maxWallTime - GPS_RELIABILITY_CONFIG.MAX_GPS_FIX_AGE_MS
  ) {
    return false
  }

  const coord: Coordinates = { latitude, longitude }
  if (!isValidCoordinate(coord)) {
    return false
  }

  if (!isValidAccuracy(accuracy)) {
    return false
  }

  return true
}

/**
 * İki zaman damgasının sırasını denetler.
 * Aynı veya geriye giden (current <= previous) zaman damgalarını reddeder.
 */
export function isValidTimestampSequence(
  previousTimestamp: number | null | undefined,
  currentTimestamp: number
): boolean {
  if (previousTimestamp === null || previousTimestamp === undefined) {
    return true
  }

  return currentTimestamp > previousTimestamp
}

/**
 * Son GPS güncellemesinin bayat (stale) olup olmadığını kontrol eder.
 */
export function isGpsDataStale(
  lastUpdateTimestamp: number | null | undefined,
  currentNow: number = Date.now(),
  timeoutMs: number = GPS_RELIABILITY_CONFIG.STALE_DATA_TIMEOUT_MS
): boolean {
  if (lastUpdateTimestamp === null || lastUpdateTimestamp === undefined) {
    return true
  }

  return currentNow - lastUpdateTimestamp > timeoutMs
}
