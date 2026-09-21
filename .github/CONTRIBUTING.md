# Katkı Sağlama Rehberi

`all-in-one` projesine katkıda bulunmak istediğiniz için teşekkürler! Projeyi geliştirmek adına kod, hata bildirimi, dokümantasyon ve yeni özellik önerilerini memnuniyetle karşılıyoruz.

## Nasıl Katkıda Bulunabilirsiniz?

### 1. Hata Bildirimi (Bug Reports)
Bir hata ile karşılaştıysanız lütfen önce mevcut [Issues](https://github.com/ArviiSoft/all-in-one/issues) sekmesini kontrol edin. Benzer bir kayıt yoksa aşağıdaki detayları içeren yeni bir bildirim oluşturun:
* Hatayı yeniden oluşturma adımları
* Beklenen davranış ve gerçekleşen sonuç
* Çalışma ortamınız (işletim sistemi, tarayıcı veya çalışma zamanı sürümü)

### 2. Yeni Özellik Önerileri (Feature Requests)
Yeni bir araç veya özellik eklenmesini öneriyorsanız, konsepti ve kullanım amacını detaylandıran bir issue açarak tartışma başlatabilirsiniz.

### 3. Kod Katkısı ve Geliştirme Süreci (Pull Requests)
1. Repoyu forklayın (`Fork` butonuna tıklayın).
2. Kendi yerel makinenize klonlayın:
   ```bash
   git clone https://github.com/KULLANICI_ADINIZ/all-in-one.git
   cd all-in-one
   ```
   `KULLANICI_ADINIZ` bölümünü kendi GitHub kullanıcı adınızla değiştirin.
3. Node.js 22.13 veya üzeri bir 22.x sürümüyle bağımlılıkları kurun:
   ```bash
   npm ci
   ```
4. Değişikliğiniz için bir dal açın ve ilgili kontrolleri çalıştırın:
   ```bash
   git switch -c duzeltme/aciklama
   npm run lint
   npm run database:test
   npm run dashboard:test
   ```
   `npm test` botu başlatır; otomatik test komutu değildir. Gerçek MongoDB entegrasyon testleri yalnızca `ARVIS_TEST_MONGODB_URI` tanımlandığında çalışır.
5. Değişikliğin amacını ve yaptığınız kontrolleri açıklayan bir pull request açın. Token, parola ve `Settings/.env` gibi özel ayarları paylaşmayın.

## Otomasyonlar

* **Lint:** `main` ve `master` dallarına push ve bu dallara açılan pull request'lerde çalışır. Actions sekmesinden elle de başlatılabilir. Kullanılmayan değişkenler uyarı olarak raporlanır; hatalar kontrolü başarısız kılar.
* **Dependabot:** npm paketlerini ve GitHub Actions sürümlerini haftalık denetler; her grup için en fazla 5 açık güncelleme PR'ı oluşturur.
* **Hareketsizlik:** Her gün 03:17 UTC'de issue ve PR'ları kontrol eder. 14 gün hareketsizlikten sonra `hareketsiz` etiketi ekler; 7 gün daha etkinlik olmazsa kapatır. Yorum veya güncelleme olduğunda sayaç yenilenir.

Dependabot ve zamanlanmış iş akışları için yapılandırmalar deponun varsayılan dalında bulunmalıdır. GitHub Actions depo ayarlarında açık olmalıdır. Eski `.github/stale.yml` yerine `.github/workflows/stale.yml` kullanılır; ayrı bir Stale GitHub App kurulumu gerekmez.
