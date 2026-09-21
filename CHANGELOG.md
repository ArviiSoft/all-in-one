# Değişiklik Günlüğü

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenecektir.

Format [Keep a Changelog](https://keepachangelog.com/tr-TR/1.0.0/) standardına dayanır ve proje [Semantic Versioning (SemVer)](https://semver.org/lang/tr/) kurallarını takip eder.

Kullanılan kategori başlıkları:
* **Added (Eklendi):** Yeni eklenen özellikler.
* **Changed (Değiştirildi):** Mevcut işlevsellikte yapılan değişiklikler.
* **Deprecated (Kullanımdan Kaldırılacak):** Yakında kaldırılması planlanan özellikler.
* **Removed (Kaldırıldı):** Artık desteklenmeyen ve projeden çıkarılan özellikler.
* **Fixed (Düzeltildi):** Giderilen hatalar ve bug düzeltmeleri.
* **Security (Güvenlik):** Güvenlik açıklarına yönelik güncellemeler.

---

## [v1.9.4-beta.1] - 20.06.2026

### Added
* MongoDB desteği eklendi.
* Topluluk ve katkı dokümanları eklendi.
* GitHub otomasyonları eklendi

---

## [v1.9.4-beta.3] - 21.06.2026

### Added
* `Settings/ayarlar.json` dosyası ve bu dosyaya bağlı okuma/yazma yolları kaldırıldı. Her şey `Settings/.env` içine taşındı.
* Handlers dosyaları kategorize edildi.

### Changed
* Proje sürümü `1.9.4` olarak güncellendi.
* Genel bot ayarları `Settings/.env` dosyasına taşındı: `BotStatus` -> `BOT_STATUS`, `sahipID` -> `BOT_OWNER_ID`, `BlacklistServers.SunucuIDleri` -> `BLACKLIST_SERVER_IDS`, `BlacklistServers.BotOlaylariniYoksay` -> `IGNORE_BOT_EVENTS`.
* Sunucu ID'leri `.env` içinde virgülle ayrılır, boş liste hiçbir sunucunun engellenmediğini belirtir. Bot olaylarını yok sayma ayarı `true` veya `false` olarak okunur.
* mongo-pending, database-state.json ve database-backups dosyalarının yeni konumları `Database/MongoDB/mongodb-pending/`, `Database/Database State/database-state.json` ve `Database/MongoDB/Database Backups` olarak güncellendi
* `Utils/emojiler.js`, `Utils/Emojis/emojiler.js` konumuna taşındı. Komutlar, olaylar, yardımcı modüller ve tüm bağlantı yolları güncellendi.

---

## [v1.9.4-beta.4] - 21.06.2026

### Changed
* `assets/account` klasörü `assets/Hesap`, içindeki `badges` klasörü `Rozetler` ve `assets/boost` klasörü `assets/Boost` olarak yeniden adlandırıldı. Hesap ve profil kartlarının rozet yolları ile Boost görsellerinin yükleme yolları güncellendi.

---

## [v1.9.4-beta.5] - 21.06.2026

### Added
* `/hesap-bilgi` komutunun Durum Bilgileri bölümüne mevcut veritabanı kayıtlarından okunan Son Görülme Zamanı eklendi.

---

## [v1.9.4-beta.6] - 21.06.2026

### Added

* Local mod, Public mod, Public mod kurulumu ve HTTP ters vekil için açıklamalar ve kurulum örnekleri eklendi.

### Changed

* `ANLATIMLAR` altındaki 12 Markdown dosyası kendi konusuna göre düzenlenip sadeleştirildi.
* Dashboard ve veritabanı kurulum adımları mevcut kodla uyumlu hale getirildi, dosyalar arasındaki bağlantılar düzeltildi.
* JSON ve MongoDB arasındaki aktarımın, kaynak değiştirildiğinde bot açılışında yapıldığı açıklandı.

### Removed

* Veritabanı dokümanlarındaki tekrarlanan ortak içerikler ve Dashboard tanıtımındaki uzun modül listesi kaldırıldı.

---

## [v1.9.4-beta.7] - 21.06.2026

### Changed

*  87 ESLint uyarısı giderildi.
* Dashboard dosyaları arasında kullanılan ortak fonksiyonlar ESLint'e tanıtıldı. Nesnelerden alanları bilerek ayıklayan işlemler için `ignoreRestSiblings` ayarı etkinleştirildi.

### Removed

* Kullanılmayan importlar, değişkenler ve parametreler temizlendi.
* Çağrılmayan eski çekiliş kontrolü ve kullanılmayan yardımcı fonksiyonlar kaldırıldı.

---

## [v1.9.4-beta.8] - 21.06.2026

### Changed

* Clan tag rol ve genel tag loglarında etiket bildirimleri kapatıldı. Rol ve kişi bilgileri mesajlarda görünmeye devam ederken kullanıcılara ve rol üyelerine etiket bildirimi gönderilmesi engellendi.

---

## [v1.9.4-beta.9] - 21.06.2026

### Changed

* Anatımlar ana dizinden kaldırıldı, video boyutları nedeniyle ayrı ZIP dosyası olarak eklenecek

---

## [v1.9.4-beta.10] - 21.06.2026

### Added

* README.md dosyası eklendi.

---

[v1.9.4-beta.1]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V0.0.9_4%2F5
[v1.9.4-beta.3]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.3
[v1.9.4-beta.4]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.4
[v1.9.4-beta.5]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.5
[v1.9.4-beta.6]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.6
[v1.9.4-beta.7]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.7
[v1.9.4-beta.8]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.8
[v1.9.4-beta.9]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.9
[v1.9.4-beta.10]: https://github.com/ArviiSoft/all-in-one_test/releases/tag/V1.9.4-beta.9