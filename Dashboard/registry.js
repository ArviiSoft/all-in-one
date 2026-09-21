const { AyarHatasi } = require('./validation');
const b = (key, label, value = false) => ({ key, label, type: 'boolean', default: value });
const n = (key, label, min, max, value) => ({ key, label, type: 'number', min, max, default: value });
const t = (key, label, maxLength = 1000, extra = {}) => ({ key, label, type: 'text', maxLength, default: '', ...extra });
const c = (key, label, nullable = true, channelTypes = [0, 5]) => ({ key, label, type: 'channel', nullable, channelTypes });
const r = (key, label, nullable = true) => ({ key, label, type: 'role', nullable, assignable: true });
const e = (key, label) => ({ key, label, type: 'emoji', default: '⭐', maxLength: 100 });
const s = (key, label, options, value) => ({ key, label, type: 'select', options: options.map(([value, label]) => ({ value, label })), default: value || options[0][0] });
const a = (key, label, item, max = 10, min = 0) => ({ key, label, type: 'array', item, max, min, default: [] });
const l = (key, label, fields, max = 100) => ({ key, label, type: 'list', fields, max, default: [] });
const birlestir = (hedef, yama) => {
  for (const [anahtar, deger] of Object.entries(yama)) {
    if (deger && typeof deger === 'object' && !Array.isArray(deger)) birlestir(hedef[anahtar] ||= {}, deger);
    else hedef[anahtar] = deger;
  }
  return hedef;
};
function tekilKanallar(satirlar) {
  const kanallar = satirlar.map(s => s.channelId);
  if (new Set(kanallar).size !== kanallar.length) throw new AyarHatasi('Aynı kanal birden fazla kez eklenemez.');
}
function createRegistry(client) {
  const liste = [];
  function ekle(id, label, category, description, store, fields, read, write, extra = {}) {
    liste.push({ id, label, category, description, store, fields, read, write, status: 'ready', scope: 'guild', ...extra });
  }
  const star = require('../Utils/Engagement/starboardStore');
  ekle('starboard', 'Starboard', 'Sunucu Yönetimi', 'Topluluğun en sevdiği mesajlar tek bir kanalda.', 'Utils/Engagement/starboardStore.js', [b('enabled', 'Starboard etkin'), c('channelId', 'Starboard kanalı'), n('threshold', 'Gerekli tepki sayısı', 1, 9999, 3), { ...e('emoji', 'Tepki emojisi'), unicodeOnly: true }], g => star.getGuildConfig(g.id), (g, p) => {
    if ({ ...star.getGuildConfig(g.id), ...p }.enabled && !({ ...star.getGuildConfig(g.id), ...p }.channelId)) throw new AyarHatasi('Starboard için önce bir kanal seçin.');
    return star.updateGuildConfig(g.id, p);
  }, { command: 'starboard', pattern: 'A' });
  const giris = require('./stores/girisCikis');
  ekle('giris-cikis', 'Karşılama ve uğurlama', 'Sunucu Yönetimi', 'Yeni üyelere sıcak bir karşılama hazırlayın.', 'Dashboard/stores/girisCikis.js', [b('aktif', 'Karşılama sistemi etkin'), c('giris.kanal', 'Hoş geldin kanalı'), c('cikis.kanal', 'Güle güle kanalı'), r('giris.otoRol', 'Yeni üyeye verilecek rol'), s('giris.resimli', 'Görselli karşılama', [['hayir', 'Kapalı'], ['evet', 'Açık']]), t('giris.mesaj', 'Karşılama mesajı', 1000, { multiline: true, tokens: ['user'], hint: '{user} yeni üyeyi etiketler.', default: 'Sunucuya **hoş geldin!**' }), { ...n('giris.hedefUye', 'Hedef üye sayısı', 1, 999999999, null), nullable: true }], g => {
    const veri = giris.readGuildConfig(g.id);
    return { ...veri, aktif: typeof veri.aktif === 'boolean' ? veri.aktif : Boolean(veri.giris?.kanal || veri.cikis?.kanal) };
  }, (g, p) => giris.updateGuildConfig(g.id, veri => {
    birlestir(veri, p);
    if (p.giris && Object.hasOwn(p.giris, 'hedefUye')) {
      if (p.giris.hedefUye === null) { delete veri.giris.hedefUye; delete veri.cikis.hedefUye; }
      else veri.cikis.hedefUye = p.giris.hedefUye;
    }
    if (p.giris?.mesaj !== undefined) veri.giris.mesaj = p.giris.mesaj.trim();
  }), { command: 'giriş-çıkış', pattern: 'C', note: 'Güle güle metni mevcut botta sabittir. Hedef üye sayısı giriş ve çıkış için birlikte uygulanır.' });
  const seviye = require('../Utils/Level/levelStore');
  ekle('seviye', 'Seviye ve XP', 'Seviye', 'Sohbete katılımı ödüllendirin, seviye rollerini yönetin.', 'Utils/Level/levelStore.js', [b('enabled', 'Seviye sistemi etkin'), c('channelId', 'Seviye bildirimi kanalı'), t('message', 'Seviye mesajı', 1500, { multiline: true, minLength: 1, hint: '{kullanici}, {kullanici_adi}, {sunucu}, {seviye}, {eski_seviye}, {xp}, {sira}, {roller}' }), n('xpMin', 'Mesaj başına minimum XP', 1, 1000, 15), n('xpMax', 'Mesaj başına maksimum XP', 1, 1000, 25), n('cooldownSeconds', 'XP bekleme süresi · saniye', 5, 86400, 60), l('rewards', 'Seviye ödülleri', [r('roleId', 'Ödül rolü', false), n('level', 'Gerekli seviye', 1, seviye.MAX_LEVEL, 1), b('removeOnHigher', 'Yeni seviye ödülü rolü alındığında eski ödül rolünü kaldır')])], g => seviye.getConfig(g.id), (g, p) => seviye.updateConfig(g.id, p), { command: 'seviye-sistemi', pattern: 'A' });
  const itiraf = require('../Utils/Engagement/itirafStore');
  ekle('itiraf', 'İtiraf sistemi', 'Eğlence ve Etkileşim', 'Anonim paylaşımlar için alan ve temel kurallar.', 'Utils/Engagement/itirafStore.js', [b('aktif', 'İtiraf sistemi etkin', true), c('itirafKanal', 'İtiraf kanalı'), c('logKanal', 'Log kanalı'), n('minimumKarakter', 'Minimum karakter sayısı', 1, 500, 10), b('tepkiler', 'Otomatik tepkiler etkin', true)], g => itiraf.getGuildItirafSetting(g.id) || {}, (g, p) => itiraf.updateGuildItirafSetting(g.id, v => Object.assign(v, p)), { command: 'itiraf-sistemi', pattern: 'A' });
  const yayin = require('./stores/otoPublish');
  ekle('oto-publish', 'Otomatik yayın', 'Sunucu Yönetimi', 'Duyuru kanallarındaki mesajları otomatik yayımlayın.', 'Dashboard/stores/otoPublish.js', [a('channels', 'Duyuru kanalları', c('channelId', 'Kanal', false, [5]), 500)], g => ({ channels: yayin.getGuildChannelIds(yayin.loadDB(), g.id) }), (g, p) => { const d = yayin.loadDB(); yayin.setGuildChannelIds(d, g.id, p.channels); yayin.saveDB(d); }, { command: 'oto-publish', pattern: 'C' });
  const ghost = require('./stores/ghostPing');
  ekle('ghost-ping', 'Ghost ping', 'Güvenlik ve Moderasyon', 'Yeni üyeleri seçili kanallarda kısa süreli etiketleyin.', 'Dashboard/stores/ghostPing.js', [a('channels', 'Etiket kanalları', c('channelId', 'Kanal', false), 500), n('duration', 'Etiketin görünme süresi · ms', 500, 60000, 1000)], g => { const d = ghost.loadDB(); return { channels: ghost.getGuildChannelIds(d, g.id), duration: ghost.getTagDuration(d, g.id) }; }, (g, p) => { const d = ghost.loadDB(); if (p.channels) d[g.id] = p.channels; if (p.duration !== undefined) ghost.setTagDuration(d, g.id, p.duration); ghost.saveDB(d); }, { command: 'ghost-ping', pattern: 'C' });
  const durum = require('./stores/durumRol');
  ekle('durum-rol', 'Durum metni → rol', 'Sunucu Yönetimi', 'Özel durumunda belirli bir metin olan üyelere rol verin.', 'Dashboard/stores/durumRol.js', [t('tag', 'Aranacak durum metni', 64, { nullable: true, minLength: 1 }), r('rolId', 'Verilecek rol'), c('logId', 'Log kanalı')], g => durum.guildConfig(g.id), (g, p) => durum.updateGuildConfig(g.id, v => Object.assign(v, p)), { command: 'durum-rol', pattern: 'C', note: 'Yeni ayarlar üyelerin sonraki durum değişiminde uygulanır.' });
  const thread = require('./stores/otoThread');
  ekle('oto-thread', 'Otomatik thread', 'Sunucu Yönetimi', 'Yeni mesajlar için otomatik threadler oluşturun.', 'Dashboard/stores/otoThread.js', [l('channels', 'Kanal kuralları', [c('channelId', 'Kanal', false, [0, 5]), t('isim', 'Alt başlık ismi', 100, { default: 'Yeni Thread', minLength: 1 }), s('duration', 'Arşiv süresi', [['60', '1 saat'], ['1440', '1 gün'], ['4320', '3 gün'], ['10080', '1 hafta']], '1440'), t('sebep', 'Sebep', 512, { default: 'Belirtilmedi', minLength: 1 }), b('botlar', 'Bot mesajlarını dahil et')], 500)], g => ({ channels: Object.entries(thread.readData()[g.id] || {}).map(([channelId, v]) => ({ ...thread.normalizeSetting(v), channelId, duration: String(thread.normalizeSetting(v).süre) })) }), (g, p) => {
    tekilKanallar(p.channels); const d = thread.readData(); const eski = d[g.id] || {}; const yeni = {};
    for (const v of p.channels) yeni[v.channelId] = { ...eski[v.channelId], ...thread.normalizeSetting({ ...v, süre: Number(v.duration) }) };
    d[g.id] = yeni; thread.writeData(d);
  }, { command: 'otomatik-thread', pattern: 'C' });
  const sureli = require('../Utils/Scheduling/sureliMesajStore');
  ekle('sureli-mesaj', 'Zamanlanmış mesajlar', 'Sunucu Yönetimi', 'Mesajları belirlediğiniz aralıklarla otomatik gönderin.', 'Utils/Scheduling/sureliMesajStore.js', [l('channels', 'Mesaj planları', [c('channelId', 'Kanal', false), t('mesaj', 'Mesaj', 2000, { multiline: true, minLength: 1 }), n('süre', 'Gönderim aralığı · ms', sureli.MIN_DURATION, sureli.MAX_DURATION, 3600000)], 500)], g => ({ channels: Object.entries(sureli.readData()[g.id] || {}).map(([channelId, v]) => ({ channelId, mesaj: v.mesaj, süre: v.süre })) }), (g, p) => {
    tekilKanallar(p.channels); const d = sureli.readData(); const eski = d[g.id] || {}; const yeni = {};
    for (const v of p.channels) yeni[v.channelId] = { ...eski[v.channelId], mesaj: v.mesaj, süre: v.süre, sonrakiGönderim: eski[v.channelId]?.sonrakiGönderim ?? Date.now() + v.süre };
    d[g.id] = yeni; sureli.writeData(d);
    const zamanlayici = require('../Utils/Scheduling/sureliMesajScheduler');
    for (const id of Object.keys(eski)) if (!yeni[id]) zamanlayici.stopTimedMessage(g.id, id);
    for (const [id, ayar] of Object.entries(yeni)) zamanlayici.scheduleTimedMessage(client, g.id, id, ayar);
  }, { command: 'süreli-mesaj', pattern: 'B', note: 'Mevcut planın sıradaki gönderim zamanı korunur. Yeni aralık sonraki gönderimden itibaren kullanılır.' });
  const mesajEmoji = require('../Utils/Media/messageEmojiStore');
  ekle('mesaja-emoji', 'Mesajlara emoji', 'Sunucu Yönetimi', 'Seçili kanallardaki mesajlara otomatik emoji ekleyin.', 'Utils/Media/messageEmojiStore.js', [l('channels', 'Kanal kuralları', [c('channelId', 'Kanal', false), b('enabled', 'Etkin', true), b('includeBots', 'Bot mesajlarını dahil et'), a('emojis', 'Emojiler', e('emoji', 'Emoji'), 10, 1)], 500)], g => { const d = mesajEmoji.loadData(); return { channels: Object.keys(d).filter(id => g.channels.cache.has(id)).map(channelId => ({ channelId, ...mesajEmoji.getSetting(d, channelId) })) }; }, (g, p) => {
    tekilKanallar(p.channels); const d = mesajEmoji.loadData();
    for (const id of Object.keys(d)) if (g.channels.cache.has(id) && !p.channels.some(v => v.channelId === id)) mesajEmoji.deleteSetting(d, id);
    for (const v of p.channels) mesajEmoji.setSetting(d, v.channelId, v);
    mesajEmoji.saveData(d);
  }, { command: 'mesaja-emoji', pattern: 'B' });
  const medya = require('../Utils/Media/mediaEmojiStore');
  for (const [tur, ad] of [['görsel', 'Görsellere emoji'], ['video', 'Videolara emoji']]) ekle(`medya-${tur}`, ad, 'Sunucu Yönetimi', 'Medya paylaşımlarına otomatik tepkiler ekleyin.', 'Utils/Media/mediaEmojiStore.js', [l('channels', 'Kanal kuralları', [c('channelId', 'Kanal', false), b('enabled', 'Etkin', true), a('emojis', 'Emojiler', e('emoji', 'Emoji'), 10, 1)], 500)], g => { const d = medya.loadData(); return { channels: Object.keys(d).filter(k => k.startsWith(`${tur}_`) && g.channels.cache.has(k.slice(tur.length + 1))).map(k => ({ channelId: k.slice(tur.length + 1), ...medya.getSetting(d, tur, k.slice(tur.length + 1)) })) }; }, (g, p) => {
    tekilKanallar(p.channels); const d = medya.loadData();
    for (const id of g.channels.cache.keys()) if (!p.channels.some(v => v.channelId === id)) medya.deleteSetting(d, tur, id);
    for (const v of p.channels) medya.setSetting(d, tur, v.channelId, v);
    medya.saveData(d);
  }, { command: 'medyalara-emoji', pattern: 'B' });
  const alinti = require('../Utils/Moderation/alintiRolStore');
  ekle('alinti-rol', 'Alıntı ve rol bildirimi', 'Sunucu Yönetimi', 'Mesajlara seçtiğiniz rolleri etiketleyerek yanıt verin.', 'Utils/Moderation/alintiRolStore.js', [l('channels', 'Kanal kuralları', [c('channelId', 'Kanal', false), s('accountType', 'Hesap türü', [['users', 'Kullanıcılar'], ['bots', 'Botlar'], ['both', 'Tümü']]), a('roleIds', 'Etiketlenecek roller', { ...r('roleId', 'Rol', false), assignable: false }, 10, 1)], 500)], g => ({ channels: Object.entries(alinti.getGuildSettings(g.id)).map(([channelId, v]) => ({ ...v, channelId })) }), (g, p) => {
    tekilKanallar(p.channels);
    for (const id of Object.keys(alinti.getGuildSettings(g.id))) if (!p.channels.some(v => v.channelId === id)) alinti.removeChannelSetting(g.id, id);
    for (const v of p.channels) alinti.saveChannelSetting(g.id, v.channelId, v);
  }, { command: 'alıntı-rol', pattern: 'B' });
  ekle('yedek-plani', 'Otomatik yedekleme planı', 'Yedek', 'Bot dosyalarının günlük yedekleme saatini belirleyin.', 'Utils/Backup/autoBackup.js', [b('enabled', 'Günlük yedek etkin', true), n('hour', 'Saat', 0, 23, 0), n('minute', 'Dakika', 0, 59, 0), s('timeZone', 'Saat dilimi', [['Europe/Istanbul', 'İstanbul · UTC+3']]), t('backupRoot', 'Yedeklenecek klasör', 1000, { minLength: 1 })], () => require('../Utils/Backup/autoBackup').getBotBackupConfig(), (g, p) => {
    const yedek = require('../Utils/Backup/autoBackup');
    if (p.backupRoot !== undefined) { const hata = yedek.validateBotBackupRoot(p.backupRoot); if (hata) throw new AyarHatasi(hata); }
    return yedek.saveBotBackupConfig(p);
  }, { command: 'yedek-sistemi', scope: 'global', pattern: 'YAML', note: 'Bu plan bot genelindedir; tüm sunucular için aynı ayardır. Mevcut zamanlayıcı yalnız Europe/Istanbul saat dilimini destekler. Değişiklik bir sonraki dakika kontrolünde okunur.' });

  const context = { client, ekle, b, n, t, c, r, e, s, a, l, birlestir, tekilKanallar };
  for (const module of ['./modules/automod', './modules/moderation', './modules/serverManagement', './modules/community', './modules/engagement', './modules/system', './modules/backupGeneral']) require(module)(context);
  return liste;
}
module.exports = { createRegistry };
