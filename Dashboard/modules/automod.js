const { AyarHatasi } = require('../validation');
const automod = require('../../Utils/Moderation/autoModManager');
const raid = require('../../Utils/Moderation/raidProtectionManager');

module.exports = ({ ekle, b, n, t, c, r, s, a }) => {
  const descriptions = {
    advertising: 'Discord davetlerini, Telegram bağlantılarını, yaygın alan adı uzantılarına sahip web adreslerini ve IP adreslerini içeren mesajları engeller. Hazır bağlantı kalıplarını kullanır, her bağlantının reklam olup olmadığını ayrıca değerlendirmez.',
    profanity: 'Hazır Türkçe küfür ve uygunsuz ifade listesiyle eşleşen mesajları engeller. Kendi topluluğunuza özel ifadeleri ayrıca Yasaklı Kelimeler bölümüne ekleyebilirsiniz.',
    customWords: 'Belirlediğiniz kelime veya ifadeleri içeren mesajları engeller. Her satıra bir ifade yazarak sunucunuza özel bir filtre oluşturun; kuralı ilk kez açmadan önce en az bir ifade ekleyin.',
    protectedRoles: 'Seçtiğiniz rolleri etiketleyen mesajları engeller. Özellikle yönetici, moderatör ve duyuru rollerinin izinsiz etiketlenmesini sınırlamak için kullanın; kuralı ilk kez açmadan önce en az bir rol seçin.',
    unsafeContent: 'Discord’un hazır küfür, cinsel içerik ve hakaret filtreleriyle eşleşen mesajları engeller. Hazır kelime listelerini Discord belirler; bu bölüm görsel veya video içeriğini taramaz. Türkçe ifadeler için Türkçe Küfür Engeli de kullanılabilir.',
    spam: 'Discord’un otomatik spam algılayıcısının istenmeyen içerik olarak değerlendirdiği mesajları engeller. Algılama ölçütlerini Discord belirler; bu kuralda mesaj sayısı veya süre eşiği ayarlanmaz.',
    mentionSpam: 'Tek bir mesajdaki kullanıcı ve rol etiketleri belirlediğiniz sınırı aştığında mesajı engeller. Örneğin sınır 5 ise 5’ten fazla etiket içeren mesajlar engellenir. Discord’un etiket baskını korumasını da açar.',
  };
  const sections = Object.entries(automod.RULE_DEFINITIONS).map(([id, rule]) => ({ id, label: rule.name, description: descriptions[id] }));
  sections.push({ id: 'raid', label: 'Raid koruması', description: 'Belirlediğiniz zaman aralığında sunucuya katılan üyeleri sayar. Katılım eşiğine ulaşıldığında gelen üyeler için kayıt, sunucudan çıkarma ya da yasaklama işlemini uygular. Ayrıca raid eşiğine ulaşılmasa bile belirlediğiniz yaş sınırındaki ve daha yeni hesapları kayıt kanalında bildirir. Üye girişlerini izleyen bu korumayı bot yürütür.' });
  const fields = [];
  const add = (section, ...items) => fields.push(...items.map(field => ({ ...field, key: `${section}.${field.key}`, section })));
  for (const section of sections.filter(section => section.id !== 'raid')) add(section.id, b('enabled', `${section.label} etkin`));
  add('customWords', t('keywords', 'Yasaklı kelimeler ve ifadeler', 61000, { multiline: true, hint: 'Her satıra bir ifade yazın veya virgülle ayırın. En fazla 1.000 ifade, ifade başına 60 karakter. Tekrarlanan ifadeler bir kez kaydedilir.' }));
  add('protectedRoles', { ...a('roleIds', 'Korunan roller', { ...r('roleId', 'Rol', false), assignable: false }, 20), hint: 'En fazla 20 rol seçebilirsiniz. Seçilen rolün kendisi değiştirilmez; bu rolü etiketleyen mesajlar engellenir.' });
  add('mentionSpam', { ...n('mentionLimit', 'Mesaj başına etiket sınırı', 1, 50, 5), hint: '1–50 arasında bir sınır belirleyin. Kullanıcı ve rol etiketleri birlikte değerlendirilir.' });
  add('raid', b('enabled', 'Raid koruması etkin'), { ...c('logChannelId', 'Raid kayıt kanalı'), hint: 'Koruma etkinleştirilmeden önce bir kanal seçin. Tespit edilen girişler ve uygulanan işlem burada bildirilir.' },
    { ...n('threshold', 'Katılım eşiği', 3, 50, 5), hint: 'Kontrol aralığında bu sayıda üye girişi olduğunda raid kontrolü devreye girer. 3–50 üye.' },
    { ...n('windowSeconds', 'Kontrol aralığı · saniye', 10, 600, 60), hint: 'Üye girişlerinin birlikte sayıldığı zaman aralığı. 10–600 saniye.' },
    { ...s('action', 'Eşiğe ulaşıldığında uygulanacak işlem', [['log', 'Yalnızca kaydet'], ['kick', 'Sunucudan çıkar'], ['ban', 'Yasakla']]), hint: 'Raid eşiğine ulaşıldığında hesap yaşı fark etmeksizin gelen üyelere uygulanır. Çıkarma ve yasaklama için botun ilgili izni gerekir; izin yoksa yalnızca kayıt tutulur.' },
    { ...n('minimumAccountAgeDays', 'Yeni hesap uyarısı · gün', 0, 365, 7), hint: 'Hesabı bu yaşta veya daha yeni olan üyeler raid olmasa da bildirilir. Bu sınır raid sırasında uygulanacak işlemden muafiyet sağlamaz. 0–365 gün.' });

  ekle('automod', 'AutoMod', 'Güvenlik ve Moderasyon', 'Reklam, Türkçe küfür, yasaklı kelime, rol etiketi, sakıncalı içerik, spam ve raid korumalarını tek yerden yapılandırın.', 'Utils/Moderation/autoModManager.js', fields, async guild => {
    const rules = await automod.fetchRules(guild);
    const values = { raid: raid.getRaidConfig(guild.id) || raid.DEFAULT_RAID_CONFIG };
    for (const key of Object.keys(automod.RULE_DEFINITIONS)) {
      const rule = automod.getRule(rules, key);
      values[key] = { enabled: rule?.enabled || false };
      if (key === 'customWords') values[key].keywords = rule?.triggerMetadata?.keywordFilter?.join('\n') || '';
      if (key === 'protectedRoles') values[key].roleIds = automod.extractProtectedRoleIds(rule);
      if (key === 'mentionSpam') values[key].mentionLimit = rule?.triggerMetadata?.mentionTotalLimit || 5;
    }
    return values;
  }, async (guild, patch) => {
    const rules = await automod.fetchRules(guild);
    const updates = [];

    for (const key of Object.keys(automod.RULE_DEFINITIONS)) {
      if (!patch[key]) continue;
      const current = automod.getRule(rules, key);
      const options = { ...patch[key], enabled: patch[key].enabled ?? current?.enabled ?? false, reason: 'ArviS dashboard üzerinden güncellendi.' };
      try {
        if (options.keywords !== undefined) options.keywords = automod.parseKeywordInput(options.keywords);
        if (!current && !options.enabled) {
          if (options.keywords?.length || options.roleIds?.length || options.mentionLimit !== undefined) throw new automod.AutoModConfigError('Yeni kuralı kaydetmek için etkinleştirin.');
          continue;
        }
        automod.resolveTriggerMetadata(key, current, options);
      } catch (error) { throw new AyarHatasi(`${automod.RULE_DEFINITIONS[key].name}: ${automod.formatAutoModError(error)}`); }
      updates.push({ key, options });
    }
    if (patch.raid) {
      try { raid.normalizeRaidConfig({ ...(raid.getRaidConfig(guild.id) || raid.DEFAULT_RAID_CONFIG), ...patch.raid }); }
      catch (error) { throw new AyarHatasi(`Raid koruması: ${raid.formatRaidProtectionError(error)}`); }
    }
    const saved = [];
    const partial = () => saved.length ? ` Kaydedilen bölümler: ${saved.join(', ')}. Güncel değerleri yükleyip kalan değişiklikleri yeniden uygulayın.` : '';
    for (const { key, options } of updates) {
      try { await automod.upsertRule(guild, rules, key, options); saved.push(automod.RULE_DEFINITIONS[key].name); }
      catch (error) { throw new AyarHatasi(`${automod.RULE_DEFINITIONS[key].name}: ${automod.formatAutoModError(error)}${partial()}`); }
    }
    if (patch.raid) {
      try { raid.updateRaidConfig(guild.id, patch.raid); }
      catch (error) { throw new AyarHatasi(`Raid koruması: ${raid.formatRaidProtectionError(error)}${partial()}`); }
    }
  }, { command: 'automod', pattern: 'Discord API', sections, note: 'Her korumayı ayrı ayrı açıp kapatabilir, değişikliklerinizi tek Kaydet düğmesiyle uygulayabilirsiniz. En az bir koruma açıksa AutoMod kartı aktif görünür. Mesaj filtreleri Discord Sunucu Ayarları → AutoMod bölümüne yansır; botun Sunucuyu Yönet izni gerekir. Raid koruması bot tarafından uygulanır ve botun çevrimiçi olmasını gerektirir.' });
};
