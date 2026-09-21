'use strict';
const { PermissionFlagsBits } = require('discord.js');
const { AyarHatasi } = require('../validation');
const { createCommunityStore } = require('../stores/community');
const { publicUrl, resolvePublic, fetchPublicFeed } = require('../../Utils/Scheduling/publicRss');
const db = createCommunityStore();
const FILES = {
  youtube: 'Abonelik/aboneSetup.json', haber: 'Bildirimler ve Sosyal Medya/haberSistemi.json',
  birthday: 'Üye Verileri/dogumGunleri_ayarlar.json', dates: 'Üye Verileri/dogumGunleri.json',
  rankings: 'Üye Verileri/eskiYeniUye.json', anon: 'Eğlence ve Etkileşim/anonimSohbet.json',
  memories: 'Eğlence ve Etkileşim/aniDefteriAyar.json', compliments: 'Eğlence ve Etkileşim/iltifatVeri.json',
  games: 'Eğlence ve Etkileşim/oyunKanallari.json',
  legacyYoutube: 'Bildirimler ve Sosyal Medya/youtubeAlert.json', watchedYoutube: 'Bildirimler ve Sosyal Medya/izlenenVideolar.json',
};
const GAME_NAMES = [['sayi', 'Sayı saymaca'], ['kelime', 'Kelime zinciri'], ['bom', 'BOM'], ['tuttu', 'Tuttu / Tutmadı'], ['sayiTahmini', 'Sayı tahmini'], ['hizliYaz', 'Hızlı yaz'], ['adamAsmaca', 'Adam asmaca']];
const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key] ?? null]));
async function channel(guild, id, extra = []) {
  const selected = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (!selected || (selected.guildId || selected.guild?.id) !== guild.id || ![0, 5].includes(selected.type)) throw new AyarHatasi('Bu sunucudan bir metin veya duyuru kanalı seçin.');
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, ...extra];
  if (!selected.permissionsFor(guild.members.me)?.has(required)) throw new AyarHatasi('Botun seçilen kanalda gerekli görüntüleme, gönderme ve işlem izinleri yok.');
  return selected;
}
function sourceId(raw) {
  const value = String(raw || '').trim();
  if (/^UC[\w-]{22}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['youtube.com', 'www.youtube.com'].includes(url.hostname) && /^\/channel\/UC[\w-]{22}\/?$/.test(url.pathname)) return url.pathname.split('/')[2];
  } catch {}
  throw new AyarHatasi('YouTube kaynağı UC ile başlayan 24 karakterli kanal kimliği veya youtube.com/channel/ bağlantısı olmalı.');
}
function readYoutube(guild) {
  const value = require('../../Utils/Membership/aboneStore').getGuildSetting(guild.id).youtube;
  return pick(value, ['aktif', 'kaynakKanallar', 'bildirimKanal', 'bildirimRol', 'webhookName', 'webhookAvatar', 'videoMetni']);
}
async function writeYoutube(guild, patch, { repairWebhook = false } = {}) {
  const store = require('../../Utils/Membership/aboneStore');
  const current = store.getGuildSetting(guild.id).youtube;
  const next = { ...current, ...patch };
  next.kaynakKanallar = [...new Set((next.kaynakKanallar || []).map(sourceId))];
  if (next.webhookAvatar) {
    try { next.webhookAvatar = publicUrl(next.webhookAvatar).href; }
    catch { throw new AyarHatasi('Webhook görseli genel internette erişilebilir bir HTTPS resim bağlantısı olmalı.'); }
  }
  if (next.aktif && (!next.kaynakKanallar.length || !next.bildirimKanal)) throw new AyarHatasi('YouTube bildirimini açmak için kaynak ve bildirim kanalı seçin.');
  let created = null;
  if (next.bildirimKanal && (next.aktif || patch.bildirimKanal || repairWebhook)) await channel(guild, next.bildirimKanal);
  if (next.bildirimKanal && (repairWebhook || next.bildirimKanal !== current.bildirimKanal || (next.aktif && !current.webhookUrl))) {
    const target = await channel(guild, next.bildirimKanal, [PermissionFlagsBits.ManageWebhooks]);
    const hooks = await target.fetchWebhooks();
    const owned = hooks.find(hook => hook.owner?.id === guild.client.user.id && hook.name === 'ArviS YouTube');
    const webhook = owned || await target.createWebhook({ name: 'ArviS YouTube', reason: 'Panelden YouTube bildirim kurulumu' });
    if (!owned) created = webhook;
    next.webhookUrl = webhook.url;
  }
  if (!next.bildirimKanal) { next.webhookUrl = null; next.aktif = false; }
  try {
    db.update(FILES.youtube, guild.id, draft => {
      draft.youtube = { ...draft.youtube, ...pick(next, ['aktif', 'kaynakKanallar', 'bildirimKanal', 'bildirimRol', 'webhookName', 'webhookAvatar', 'videoMetni', 'webhookUrl']) };
    });
  } catch (error) { await created?.delete().catch(() => {}); throw error; }
}
async function legacyYoutubeForGuild(guild, required = false) {
  const legacy = db.read(FILES.legacyYoutube);
  if (!legacy.webhook || !Array.isArray(legacy.kanallar) || !legacy.kanallar.length || legacy.migratedGuildId) {
    if (required) throw new AyarHatasi('Aktarılacak eski YouTube kurulumu bulunamadı.');
    return null;
  }
  if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ManageWebhooks)) {
    if (required) throw new AyarHatasi('Eski kurulumun sunucusunu doğrulamak için botun Webhookları Yönet izni gerekli.');
    return null;
  }
  const hooks = await guild.fetchWebhooks();
  const webhook = hooks.find(hook => hook.url === legacy.webhook && guild.channels.cache.has(hook.channelId));
  if (!webhook) {
    if (required) throw new AyarHatasi('Eski YouTube webhooku bu sunucuya ait değil veya artık bulunamıyor.');
    return null;
  }
  return { legacy, webhook };
}
function youtubeFields({ b, t, c, r, a }) {
  return [b('aktif', 'YouTube bildirimleri etkin'), a('kaynakKanallar', 'YouTube kanal kaynakları (Kanal ID)', t('source', 'Kanal kimliği veya bağlantısı', 200, { minLength: 1 }), 30), c('bildirimKanal', 'Bildirim kanalı'), { ...r('bildirimRol', 'Bildirim rolü'), assignable: false }, t('webhookName', 'Webhook adı', 80, { default: 'YouTube', minLength: 1 }), t('webhookAvatar', 'Webhook görseli · (Resim Linki)', 2000, { nullable: true }), t('videoMetni', 'Video mesajı', 1800, { multiline: true, minLength: 1, hint: '{kanal}, {video_baslik}, {video_link}, {rol}' })].map(field => ({ ...field, section: ['webhookName', 'webhookAvatar', 'videoMetni'].includes(field.key) ? 'appearance' : 'delivery' }));
}

function register(ctx) {
  const { client, ekle, b, n, t, c, r, a } = ctx;
  const tracker = () => require('../../Utils/Boost/boostTracker').getTracker(client);
  ekle('boost', 'Boost bildirimleri', 'Boost', 'Boost teşekkürlerini, rozetleri ve Discord sistem mesajı kaynağını yönetin.', 'Utils/Boost/boostTracker.js', [b('enabled', 'Rozet bildirimleri etkin'), c('channelId', 'Rozet bildirimi kanalı'), b('thanks.enabled', 'Teşekkür mesajı etkin'), c('thanks.channelId', 'Teşekkür kanalı'), t('thanks.title', 'Teşekkür başlığı', 80, { minLength: 1 }), t('thanks.message', 'Teşekkür mesajı', 1000, { multiline: true, minLength: 1, hint: '{user}, {username}, {server}, {boosts}' })], g => {
    const settings = tracker().getSettings(g.id); return { ...settings.level, thanks: settings.thanks };
  }, async (g, patch) => {
    const old = tracker().getSettings(g.id);
    const level = { ...old.level, ...patch }; const thanks = { ...old.thanks, ...patch.thanks };
    if (level.enabled && !level.channelId) throw new AyarHatasi('Rozet bildirim kanalı seçin.');
    if (thanks.enabled && !thanks.channelId) throw new AyarHatasi('Teşekkür kanalı seçin.');
    const levelChannel = level.channelId && (level.enabled || patch.channelId) ? await channel(g, level.channelId, [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]) : null;
    const thanksChannel = thanks.channelId && (thanks.enabled || patch.thanks?.channelId) ? await channel(g, thanks.channelId) : null;
    if (level.enabled && (!old.level.enabled || old.level.channelId !== level.channelId)) await tracker().configure(g, levelChannel);
    else if (!level.enabled) await tracker().disable(g.id);
    if (patch.thanks) {
      if (thanksChannel && old.thanks.channelId !== thanks.channelId) await tracker().setThanksChannel(g, thanksChannel);
      await tracker().setThanksMessage(g.id, thanks);
    }
    if (!level.enabled && patch.channelId !== undefined) await tracker().setLevelChannel(g.id, level.channelId);
  }, { command: 'boost-bildirim', actions: [{ id: 'system-source', label: 'Boost sistem kanalını ayarla', description: 'Discord boost sistem mesajlarını seçilen kanalda açar; teşekkürler bu olaylardan tetiklenir.', fields: [c('channelId', 'Discord sistem mesajı kanalı', false)], run: async (g, input) => {
    await channel(g, input.channelId);
    if (!g.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) throw new AyarHatasi('Botun Sunucuyu Yönet izni gerekli.');
    await g.edit({ systemChannel: input.channelId, systemChannelFlags: Number(g.systemChannelFlags.bitfield) & ~2, reason: 'Panelden boost sistem mesajı kurulumu' });
    return { message: 'Boost sistem mesajları seçilen kanalda açıldı.' };
  } }] });

  ekle('youtube', 'YouTube bildirimleri', 'Bildirimler', 'Kanal kaynakları, bildirim kanalı ve gönderi görünümü.', 'Utils/Membership/aboneStore.js', youtubeFields(ctx), readYoutube, writeYoutube, {
    sections: [
      { id: 'delivery', label: 'Bildirim ayarları', description: 'Takip edilecek YouTube kanallarını ve bildirimlerin gönderileceği yeri seçin.' },
      { id: 'appearance', label: 'Gönderi görünümü', description: 'Bildirimlerin gönderen adını, görselini ve mesajını düzenleyin.' },
    ],
    command: 'youtube-alert', note: 'Webhook seçtiğiniz kanalda otomatik hazırlanır. Video geçmişi korunur. Kaynak için YouTube kanalının UC ile başlayan kimliğini kullanın.',
    details: async g => {
      const legacy = await legacyYoutubeForGuild(g).catch(() => null);
      return legacy ? [`Bu sunucunun eski YouTube kurulumu ${legacy.legacy.aktif ? 'etkin' : 'kapalı'}. Eski kurulumu aktar işlemi mevcut kaynakları ve bildirim geçmişini panele taşır.`] : [];
    },
    actions: [
      { id: 'repair-webhook', label: 'Bildirim bağlantısını yenile', description: 'Silinen webhooku seçili kanalda yeniden hazırlar.', fields: [], run: async g => {
        if (!readYoutube(g).bildirimKanal) throw new AyarHatasi('Önce bildirim kanalını kaydedin.');
        await writeYoutube(g, {}, { repairWebhook: true }); return { message: 'YouTube bildirim bağlantısı hazır.' };
      } },
      { id: 'migrate-legacy', label: 'Eski YouTube kurulumunu aktar', description: 'Bu sunucuya ait eski kurulumu mevcut YouTube ayarlarına aktarır ve eski göndericiyi kapatır.', fields: [], run: async g => {
        const { legacy, webhook } = await legacyYoutubeForGuild(g, true);
        const sources = [...new Set(legacy.kanallar.map(sourceId))];
        db.updateRoot(FILES.watchedYoutube, watched => {
          for (const [id, value] of Object.entries(watched)) if (id.startsWith('legacy:')) watched[`${g.id}:${id.slice(7)}`] ??= value;
        });
        await writeYoutube(g, { aktif: Boolean(legacy.aktif), kaynakKanallar: sources, bildirimKanal: webhook.channelId, bildirimRol: g.roles.cache.has(legacy.rol) ? legacy.rol : null, webhookName: legacy.webhookName || 'YouTube', webhookAvatar: legacy.webhookAvatar || null, videoMetni: legacy.videoMetni || require('../../Utils/Membership/aboneStore').DEFAULT_VIDEO_TEXT });
        db.updateRoot(FILES.legacyYoutube, current => {
          if (current.webhook !== legacy.webhook) throw new AyarHatasi('Eski kurulum aktarım sırasında değişti; yeniden kontrol edin.');
          current.aktif = false; current.migratedGuildId = g.id;
        });
        return { message: 'Eski YouTube kurulumu ve bildirim geçmişi aktarıldı. Artık bu panelden yönetebilirsiniz.' };
      } },
      { id: 'disable-legacy', label: 'Eski YouTube bildirimlerini kapat', description: 'Bu sunucuya ait eski göndericiyi kapatır; mevcut panel ayarları korunur.', fields: [], run: async g => {
        const { legacy } = await legacyYoutubeForGuild(g, true);
        db.updateRoot(FILES.legacyYoutube, current => { if (current.webhook !== legacy.webhook) throw new AyarHatasi('Eski kurulum değişti; yeniden deneyin.'); current.aktif = false; });
        return { message: 'Eski YouTube bildirimleri kapatıldı.' };
      } },
    ],
  });

  ekle('haber', 'Haber ve RSS', 'Bildirimler', 'RSS kaynaklarını, haber kanalını ve otomatik threadleri yönetin.', 'Utils/Scheduling/haberKontrol.js', [b('enabled', 'Haber sistemi etkin'), c('kanal', 'Haber kanalı'), { ...r('rol', 'Bildirim rolü'), assignable: false }, t('url', 'RSS adresi · HTTPS', 2000, { nullable: true }), b('threads', 'Her habere alt başlık aç', true)], g => {
    const v = db.get(FILES.haber, g.id); return { ...pick(v, ['kanal', 'rol', 'url']), enabled: v.enabled ?? Boolean(v.url && v.kanal), threads: v.threads !== false };
  }, async (g, patch) => {
    const value = { ...db.get(FILES.haber, g.id), ...patch };
    if (value.enabled && (!value.kanal || !value.url)) throw new AyarHatasi('Haber sistemini açmak için kanal ve RSS kaynağı seçin.');
    if (value.url && (patch.url || value.enabled)) { try { await resolvePublic(value.url); } catch (error) { throw new AyarHatasi(error.message); } }
    if (value.kanal && (value.enabled || patch.kanal)) await channel(g, value.kanal, [PermissionFlagsBits.EmbedLinks, ...(value.threads !== false ? [PermissionFlagsBits.CreatePublicThreads] : [])]);
    db.update(FILES.haber, g.id, draft => Object.assign(draft, patch));
  }, { command: 'haber-sistemi', actions: [{ id: 'validate-feed', label: 'RSS kaynağını doğrula', description: 'Kayıtlı kaynağı okuyarak başlığını ve haber sayısını kontrol eder.', fields: [], run: async g => {
    const value = db.get(FILES.haber, g.id); if (!value.url) throw new AyarHatasi('Önce RSS kaynağını kaydedin.');
    const feed = await fetchPublicFeed(value.url); return { message: `${String(feed.title || 'RSS').slice(0, 200)} · ${feed.items.length} haber bulundu.` };
  } }] });

  const userField = () => t('userId', 'Üye kimliği', 20, { minLength: 17 });
  ekle('dogum-gunu', 'Doğum günleri', 'Üye Verileri', 'Kutlama ayarlarını ve üyelerin doğum tarihi kayıtlarını yönetin.', 'Commands/Kullanıcı/doğum-günü.js', [b('enabled', 'Doğum günü sistemi etkin'), c('kanalId', 'Kutlama kanalı'), r('rolId', 'Doğum günü rolü')], g => {
    const value = db.get(FILES.birthday, g.id); return { ...pick(value, ['kanalId', 'rolId']), enabled: value.enabled ?? Boolean(value.kanalId && value.rolId) };
  }, (g, patch) => {
    const value = { ...db.get(FILES.birthday, g.id), ...patch };
    if (value.enabled && (!value.kanalId || !value.rolId)) throw new AyarHatasi('Doğum günü için kutlama kanalı ve rolü seçin.');
    db.update(FILES.birthday, g.id, draft => Object.assign(draft, patch));
  }, { command: 'doğum-günü', actions: [
    { id: 'save-date', label: 'Üyenin doğum tarihini kaydet', description: 'Seçilen üyenin doğum tarihini ekler veya değiştirir.', fields: [userField(), n('day', 'Gün', 1, 31, 1), n('month', 'Ay', 1, 12, 1), { ...n('year', 'Yıl · isteğe bağlı', 1900, 2200, null), nullable: true }], run: async (g, input) => {
      if (!/^\d{17,20}$/.test(input.userId) || !await g.members.fetch(input.userId).catch(() => null)) throw new AyarHatasi('Üye bu sunucuda bulunamadı.');
      const dates = require('../../Utils/Engagement/dogumGunuTarih'); const result = dates.dogumGunuOlustur(input.day, input.month, input.year);
      if (result.hata) throw new AyarHatasi(result.hata);
      db.update(FILES.dates, g.id, draft => { draft[input.userId] = dates.dogumGunuKayitMetni(result.deger); });
      return { message: 'Üyenin doğum tarihi kaydedildi.' };
    } },
    { id: 'remove-date', label: 'Üyenin doğum tarihini sil', description: 'Girilen üyenin bu sunucudaki doğum tarihi kaydını kaldırır.', fields: [userField()], run: async (g, input) => {
      if (!/^\d{17,20}$/.test(input.userId)) throw new AyarHatasi('Geçerli bir üye kimliği girin.');
      db.update(FILES.dates, g.id, draft => { delete draft[input.userId]; }); return { message: 'Doğum tarihi kaydı kaldırıldı.' };
    } },
  ] });

  ekle('eski-yeni', 'Eski-Yeni üye', 'Üye Verileri', 'Eski ve yeni üye listelerini yayımlayın, kanallarını ve rol filtresini yönetin.', 'Commands/Sunucu/eski-yeni-üye.js', [c('eskiUyeKanal', 'En eski üyeler'), c('yeniUyeKanal', 'En yeni üyeler'), { ...r('rol', 'Sıralama filtresi rolü'), assignable: false }], g => pick(db.get(FILES.rankings, g.id), ['eskiUyeKanal', 'yeniUyeKanal', 'rol']), async (g, patch) => {
    const value = { ...db.get(FILES.rankings, g.id), ...patch };
    if (!value.eskiUyeKanal || !value.yeniUyeKanal || !value.rol) {
      db.update(FILES.rankings, g.id, draft => Object.assign(draft, patch)); return;
    }
    await require('../../Commands/Sunucu/eski-yeni-üye').installSystem(g, { oldChannelId: value.eskiUyeKanal, newChannelId: value.yeniUyeKanal, roleId: value.rol });
    await require('../../Events/Timers/eskiYeniUyeKontrol').refreshGuild(client, g.id);
  }, { command: 'eski-yeni-üye', note: 'İki kanal ve rol seçildiğinde kayıt işlemi vitrin mesajlarını oluşturur ve günceller.' });

  ekle('anonim', 'Anonim sohbet', 'Eğlence ve Etkileşim', 'Sohbet başlatma panelini ve kayıt kanalını yönetin.', 'Commands/Eğlence/anonim-sohbet.js', [c('channelId', 'Sohbet paneli kanalı'), c('logKanalId', 'Log kanalı')], g => pick(db.get(FILES.anon, g.id), ['channelId', 'logKanalId']), async (g, patch) => {
    const old = db.get(FILES.anon, g.id); const value = { ...old, ...patch };
    let message = null;
    if (value.channelId) {
      const target = await channel(g, value.channelId, [PermissionFlagsBits.ReadMessageHistory]);
      message = await require('../../Utils/Engagement/anonimPanel').publishAnonymousPanel(g, target, old);
    }
    db.update(FILES.anon, g.id, draft => { Object.assign(draft, patch); if (message) draft.messageId = message.id; });
  }, { command: 'anonim-sohbet', note: 'Kaydettiğinizde sohbet başlatma paneli seçilen kanalda yayımlanır veya güncellenir.' });

  ekle('ani', 'Anı defteri', 'Eğlence ve Etkileşim', 'Anıların paylaşılacağı kanalı ve kayıt kanalını ayarlayın.', 'Commands/Eğlence/anı-defteri.js', [c('kanalId', 'Anı kanalı', true, [0]), c('logKanalId', 'Log kanalı', true, [0])], g => pick(db.get(FILES.memories, g.id), ['kanalId', 'logKanalId']), (g, patch) => db.update(FILES.memories, g.id, draft => Object.assign(draft, patch)), { command: 'anı-defteri' });

  ekle('iltifat', 'Rastgele iltifat', 'Eğlence ve Etkileşim', 'İltifat kanalını, gönderim ihtimalini ve sunucuya özel metinleri ayarlayın.', 'Commands/Eğlence/rastgele-iltifat.js', [b('status', 'Rastgele iltifat etkin'), c('channelId', 'İltifat kanalı', true, [0]), n('probabilityPercent', 'Mesaj başına iltifat ihtimali · %', 1, 100, 3), a('messages', 'Sunucuya özel iltifatlar', t('message', 'İltifat', 1900, { minLength: 1 }), 100)], g => {
    const value = db.get(FILES.compliments, g.id); return { status: !!value.status, channelId: value.channelId || null, probabilityPercent: value.probabilityPercent ?? 3, messages: value.messages || [] };
  }, (g, patch) => {
    const value = { ...db.get(FILES.compliments, g.id), ...patch };
    if (value.status && !value.channelId) throw new AyarHatasi('İltifat sistemini açmak için bir kanal seçin.');
    db.update(FILES.compliments, g.id, draft => Object.assign(draft, patch));
  }, { command: 'rastgele-iltifat', note: 'Özel liste boşsa botun varsayılan iltifatları kullanılır.' });

  ekle('oyunlar', 'Oyun kanalları', 'Eğlence ve Etkileşim', 'Yedi oyunun kanallarını seçin ve ilk turlarını başlatın.', 'Commands/Sunucu/oyunları-kur.js', GAME_NAMES.map(([key, label]) => c(key, label)), g => pick(db.get(FILES.games, g.id), GAME_NAMES.map(([key]) => key)), async (g, patch) => {
    const previous = db.get(FILES.games, g.id); const next = { ...previous, ...patch };
    const ids = GAME_NAMES.map(([key]) => next[key]).filter(Boolean);
    if (ids.length !== new Set(ids).size) throw new AyarHatasi('Her oyun için farklı bir kanal seçin.');
    const changed = GAME_NAMES.filter(([key]) => next[key] && next[key] !== previous[key]);
    const command = changed.length ? require('../../Commands/Sunucu/oyunları-kur') : null;
    for (const [key] of changed) {
      const target = await channel(g, next[key]); const missing = command.missingPermissions(target, key);
      if (missing.length) throw new AyarHatasi(`${target.name || key}: ${missing.map(item => item.label).join(', ')} izinleri gerekli.`);
    }
    for (const [key] of GAME_NAMES.filter(([key]) => patch[key] === null)) db.update(FILES.games, g.id, draft => { delete draft[key]; });
    for (const [key] of changed) {
      const target = await channel(g, next[key]);
      if (['sayiTahmini', 'hizliYaz', 'adamAsmaca'].includes(key)) {
        db.update(FILES.games, g.id, draft => { draft[key] = next[key]; });
        try { await require('../../Utils/Engagement/yeniOyunlar').setupNewGame(key, g.id, target); }
        catch (error) { db.update(FILES.games, g.id, draft => { if (previous[key]) draft[key] = previous[key]; else delete draft[key]; }); throw error; }
      } else {
        const existingWord = key === 'kelime' ? db.get('Eğlence ve Etkileşim/kelime.json', g.id).sonKelime : null;
        const word = key === 'kelime' ? existingWord || await command.initializeKelimeGame(g.id) : null;
        await target.send(require('../../Utils/Engagement/oyunKurulumPaneli').buildGameSetupPayload(key, command.gameSetupOptions(key, g.id, word)));
        db.update(FILES.games, g.id, draft => { draft[key] = next[key]; });
      }
    }
  }, { command: 'oyunları-kur', note: 'Yeni kanal seçimi oyunu başlatır. Kanal seçimini temizlemek oyunu durdurur, mevcut skorlar korunur.' });
}
module.exports = register;
module.exports.sourceId = sourceId;
module.exports.youtubeFields = youtubeFields;
module.exports.readYoutube = readYoutube;
module.exports.writeYoutube = writeYoutube;
