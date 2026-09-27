# Değişiklik Günlüğü

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenecektir.

Format [Keep a Changelog](https://keepachangelog.com/tr-TR/1.0.0/) standardına dayanır ve proje [Semantic Versioning (SemVer)](https://semver.org/lang/tr/) kurallarını takip eder.

Kullanılan kategori başlıkları:
* **Eklendi:** Yeni eklenen özellikler.
* **Değiştirildi:** Mevcut işlevsellikte yapılan değişiklikler.
* **Kullanımdan Kaldırılacak:** Yakında kaldırılması planlanan özellikler.
* **Kaldırıldı:** Artık desteklenmeyen ve projeden çıkarılan özellikler.
* **Düzeltildi:** Giderilen hatalar ve bug düzeltmeleri.
* **Güvenlik:** Güvenlik açıklarına yönelik güncellemeler.

---

## [v1.9.4-beta.1] - 20.09.2026

### Eklendi
* MongoDB desteği eklendi.
* Topluluk ve katkı dokümanları eklendi.
* GitHub otomasyonları eklendi

---

## [v1.9.4-beta.3] - 21.09.2026

### Eklendi
* `Settings/ayarlar.json` dosyası ve bu dosyaya bağlı okuma/yazma yolları kaldırıldı. Her şey `Settings/.env` içine taşındı.
* Handlers dosyaları kategorize edildi.

### Değiştirildi
* Proje sürümü `1.9.4` olarak güncellendi.
* Genel bot ayarları `Settings/.env` dosyasına taşındı: `BotStatus` -> `BOT_STATUS`, `sahipID` -> `BOT_OWNER_ID`, `BlacklistServers.SunucuIDleri` -> `BLACKLIST_SERVER_IDS`, `BlacklistServers.BotOlaylariniYoksay` -> `IGNORE_BOT_EVENTS`.
* Sunucu ID'leri `.env` içinde virgülle ayrılır, boş liste hiçbir sunucunun engellenmediğini belirtir. Bot olaylarını yok sayma ayarı `true` veya `false` olarak okunur.
* mongo-pending, database-state.json ve database-backups dosyalarının yeni konumları `Database/MongoDB/mongodb-pending/`, `Database/Database State/database-state.json` ve `Database/MongoDB/Database Backups` olarak güncellendi
* `Utils/emojiler.js`, `Utils/Emojis/emojiler.js` konumuna taşındı. Komutlar, olaylar, yardımcı modüller ve tüm bağlantı yolları güncellendi.

---

## [v1.9.4-beta.4] - 21.09.2026

### Değiştirildi
* `assets/account` klasörü `assets/Hesap`, içindeki `badges` klasörü `Rozetler` ve `assets/boost` klasörü `assets/Boost` olarak yeniden adlandırıldı. Hesap ve profil kartlarının rozet yolları ile Boost görsellerinin yükleme yolları güncellendi.

---

## [v1.9.4-beta.5] - 21.09.2026

### Eklendi
* `/hesap-bilgi` komutunun Durum Bilgileri bölümüne mevcut veritabanı kayıtlarından okunan Son Görülme Zamanı eklendi.

---

## [v1.9.4-beta.6] - 21.09.2026

### Eklendi

* Local mod, Public mod, Public mod kurulumu ve HTTP ters vekil için açıklamalar ve kurulum örnekleri eklendi.

### Değiştirildi

* `ANLATIMLAR` altındaki 12 Markdown dosyası kendi konusuna göre düzenlenip sadeleştirildi.
* Dashboard ve veritabanı kurulum adımları mevcut kodla uyumlu hale getirildi, dosyalar arasındaki bağlantılar düzeltildi.
* JSON ve MongoDB arasındaki aktarımın, kaynak değiştirildiğinde bot açılışında yapıldığı açıklandı.

### Kaldırıldı

* Veritabanı dokümanlarındaki tekrarlanan ortak içerikler ve Dashboard tanıtımındaki uzun modül listesi kaldırıldı.

---

## [v1.9.4-beta.7] - 21.09.2026

### Değiştirildi

*  87 ESLint uyarısı giderildi.
* Dashboard dosyaları arasında kullanılan ortak fonksiyonlar ESLint'e tanıtıldı. Nesnelerden alanları bilerek ayıklayan işlemler için `ignoreRestSiblings` ayarı etkinleştirildi.

### Kaldırıldı

* Kullanılmayan importlar, değişkenler ve parametreler temizlendi.
* Çağrılmayan eski çekiliş kontrolü ve kullanılmayan yardımcı fonksiyonlar kaldırıldı.

---

## [v1.9.4-beta.8] - 21.09.2026

### Değiştirildi

* Clan tag rol ve genel tag loglarında etiket bildirimleri kapatıldı. Rol ve kişi bilgileri mesajlarda görünmeye devam ederken kullanıcılara ve rol üyelerine etiket bildirimi gönderilmesi engellendi.

---

## [v1.9.4-beta.9] - 21.09.2026

### Değiştirildi

* Anatımlar ana dizinden kaldırıldı, video boyutları nedeniyle ayrı ZIP dosyası olarak eklenecek

---

## [v1.9.10] - 21.09.2026

### Eklendi

* README.md dosyası eklendi.

---

## [v1.9.11] - 27.09.2026

### Eklendi

- ModMail sistemi eklendi:
  - /modmail komutu üzerinden tek yönetim paneli.
  - Tam Web Dashboard entegrasyonu.
  - ModMail kurulum öncesi diğer sistemlerle çakışma kontrolü.
  - ModMail sistemi açıksa botun oynuyor kısmı Üye sayaçları ve "Destek İçin DM At!" arasında sırayla dönüyor.
  - Components V2 embed yapılı log embedlarının içinde transcript dosyaları.
  - Log gönderilemezse talep ve kayıtların korunması.
  - Yanlışlıkla ModMail açılmasını önlemek için onay sistemi.

### Değiştirildi

- Clan tag rol kontrolüne kaynak sunucu kimliği (`primaryGuild.identityGuildId`) ve açık tag görünürlüğü (`identityEnabled === true`) doğrulaması eklendi. Mevcut tag-rol ayarları korunuyor, kaynak sunucu ID'si ayarın yapıldığı sunucudan otomatik alınır.
- Anlık tag takibi, bot açılışındaki eşitleme ve Dashboard'daki üye rol eşitlemesi aynı doğrulamayı kullanır. Eşitleme, önceden hatalı verilmiş kayıtlı clan rollerini de kaldırır.
- Clan tag loglarına kaynak sunucu ID'leri eklendi.

### Düzeltildi

- Başka bir sunucuya ait aynı yazılı tagın, sunucunun tagı sayılarak rol kazandırması düzeltildi.
- Tag yazısı aynı kalırken kaynak sunucu değiştiğinde rolün verilmemesi veya geri alınmaması düzeltildi.
- Gizlenmiş, Discord tarafından temizlenmiş veya kaynak kimliği eksik tagların rol kazandırması engellendi. Dashboard hiyerarşi kontrolü de aynı kurala uyarlandı.
- Tag geçişlerinde eski rozet eksikse farklı sunucunun rozetinin rol kaldırma logunda gösterilmesi düzeltildi.

---

[v1.9.10]: https://github.com/ArviiSoft/all-in-one/releases/tag/v1.9.10
[v1.9.11]: https://github.com/ArviiSoft/all-in-one/releases/tag/v1.9.11
