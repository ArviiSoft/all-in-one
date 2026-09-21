const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { createJsonStore } = require('../../Utils/Core/safeJsonStore');
const { AyarHatasi } = require('../validation');

const localStore = relative => createJsonStore(path.join(__dirname, '../../Database', relative));
function imageUrl(value, label) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new AyarHatasi(`${label}: geçerli bir HTTPS görsel bağlantısı girin.`); }
}
async function channelWithPermissions(guild, id, types, permissions, label) {
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || !types.includes(channel.type) || (channel.guildId || channel.guild?.id) !== guild.id) throw new AyarHatasi(`${label}: bu sunucudan uygun bir kanal seçin.`);
  if (!channel.permissionsFor(guild.members.me)?.has(permissions)) throw new AyarHatasi(`${label}: botun gerekli kanal izinleri eksik.`);
  return channel;
}

module.exports = function registerSystem({ client, ekle, b, n, t, c, r, a, birlestir }) {
  const random = require('../../Utils/Media/randomMediaScheduler');
  const { MIN_INTERVAL_MS, MAX_TIMESTAMP_MS } = require('../../Utils/Media/randomMediaDuration');
  ekle('random-medya', 'Random avatar ve banner', 'Eğlence ve Etkileşim', 'Avatar ve banner paylaşım kanallarını ve gönderim aralıklarını belirleyin.', 'Utils/Media/randomMediaScheduler.js', [
    c('icon.channelId', 'Avatar kanalı'), n('icon.intervalMs', 'Avatar gönderim aralığı · ms', MIN_INTERVAL_MS, MAX_TIMESTAMP_MS, MIN_INTERVAL_MS),
    c('banner.channelId', 'Banner kanalı'), n('banner.intervalMs', 'Banner gönderim aralığı · ms', MIN_INTERVAL_MS, MAX_TIMESTAMP_MS, MIN_INTERVAL_MS),
  ], g => random.getGuildConfig(g.id), async (g, p) => {
    for (const type of ['icon', 'banner']) if (p[type]?.channelId) await channelWithPermissions(g, p[type].channelId, [0, 5], [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles], 'Medya kanalı');
    for (const type of ['icon', 'banner']) if (p[type] && !random.getGuildConfig(g.id)[type]?.intervalMs && p[type].intervalMs === undefined) p[type].intervalMs = MIN_INTERVAL_MS;
    try { random.updateGuildConfig(g.id, p); }
    catch (error) { if (error instanceof RangeError) throw new AyarHatasi('Medya gönderim aralığı desteklenen tarih sınırını aşıyor. Daha kısa bir süre girin.'); throw error; }
  }, { command: 'random', note: 'Kanalı temizlemek paylaşımı durdurur. Kanal veya süre değiştiğinde yeni plan kaydetme anından başlar; değişmeyen planların sıradaki gönderimi korunur.' });

  const temp = require('../../Utils/Voice/tempVoiceStore');
  ekle('temp-voice', 'Geçici ses kanalları', 'Ses Sistemleri', 'Oda oluşturma kanalını seçin; üyeler katıldığında özel odaları otomatik açılsın.', 'Utils/Voice/tempVoiceStore.js', [b('enabled', 'Geçici ses kanalları etkin'), c('voiceChannelId', 'Oda oluşturma kanalı', true, [2])], g => { const data = temp.getConfig(); const local = !data.voiceChannelId || g.channels.cache.has(data.voiceChannelId); return { enabled: local && (data.enabled ?? Boolean(data.voiceChannelId)), voiceChannelId: local ? data.voiceChannelId : null }; }, async (g, p) => {
    const previous = temp.getConfig();
    if (previous.voiceChannelId && !g.channels.cache.has(previous.voiceChannelId) && !p.voiceChannelId) {
      if (p.enabled) throw new AyarHatasi('Sistemi açmak için bu sunucudan oda oluşturma kanalını seçin.');
      return;
    }
    const next = { ...temp.getConfig(), ...p };
    if (next.enabled && !next.voiceChannelId) throw new AyarHatasi('Sistemi açmak için oda oluşturma kanalını seçin.');
    if (next.voiceChannelId && (p.voiceChannelId || p.enabled)) await channelWithPermissions(g, next.voiceChannelId, [2], [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers], 'Oda oluşturma kanalı');
    temp.updateConfig({ ...p, ...(p.voiceChannelId ? { guildId: g.id } : {}) });
  }, { command: 'temp-voice', scope: 'global', note: 'Bot genelinde tek oda oluşturma kanalı kullanılır. Ayarlar anında uygulanır. Kapatıldığında mevcut odalar boşalana kadar korunur.' });

  const voiceStore = localStore('Ses Sistemleri/sesKanali.json');
  ekle('ses-kanali', 'Botun ses kanalı', 'Ses Sistemleri', 'Kayıtlı ses kanallarını ve botun bağlı kalacağı aktif kanalı yönetin.', 'Utils/Voice/persistentVoiceConnection.js', [a('sesKanallari', 'Kayıtlı ses kanalları', c('channelId', 'Ses kanalı', false, [2]), 500), c('aktifSesKanali', 'Aktif ses kanalı', true, [2])], g => { const data = voiceStore.loadData(); return { sesKanallari: (data.sesKanallari || []).filter(id => g.channels.cache.has(id)), aktifSesKanali: g.channels.cache.has(data.aktifSesKanali) ? data.aktifSesKanali : null }; }, async (g, p) => {
    const old = voiceStore.loadData();
    if (p.aktifSesKanali === null && old.aktifSesKanali && !g.channels.cache.has(old.aktifSesKanali)) delete p.aktifSesKanali;
    const channels = p.sesKanallari === undefined ? old.sesKanallari || [] : [...(old.sesKanallari || []).filter(id => !g.channels.cache.has(id)), ...p.sesKanallari];
    const next = { ...old, ...p, sesKanallari: [...new Set(channels)] };
    if (next.aktifSesKanali && !next.sesKanallari.includes(next.aktifSesKanali)) throw new AyarHatasi('Aktif ses kanalını önce kayıtlı kanallar listesine ekleyin.');
    let channel;
    if (p.aktifSesKanali) channel = await channelWithPermissions(g, p.aktifSesKanali, [2], [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], 'Aktif ses kanalı');
    voiceStore.update(data => Object.assign(data, next));
    if (Object.hasOwn(p, 'aktifSesKanali')) {
      const voice = require('../../Utils/Voice/persistentVoiceConnection');
      if (channel) await voice.setPersistentVoiceChannel(client, channel);
      else voice.clearPersistentVoiceChannel();
    }
  }, { command: 'ses-kanalı', scope: 'global', note: 'Bot genelinde tek aktif ses bağlantısı vardır. Aktif kanalı değiştirdiğinizde bağlantı hemen taşınır; temizlediğinizde bot ayrılır. Diğer sunuculardaki kayıtlı kanallar korunur.' });

  const botLog = localStore('Sistem/botLog.json');
  const resetLog = require('../../Utils/Core/jsonDB');
  ekle('bot-log', 'Bot işlem kayıtları', 'Sistem', 'Konsol ve veri sıfırlama kayıtlarını yönetin; webhook otomatik kurulur.', 'Utils/Core/logger.js', [
    b('enabled', 'Konsol kayıtlarını gönder'), c('kanalId', 'Bot log kanalı'), c('resetLogChannel', 'Veri sıfırlama log kanalı'),
    t('username', 'Webhook adı', 80, { default: 'Bot Log', minLength: 1 }), t('avatarURL', 'Webhook görseli · (Resim Linki)', 2048, { nullable: true }),
  ], g => { const value = botLog.get(g.id) || {}; const resetChannel = resetLog.get('reset_log_channel'); return { enabled: value.enabled ?? Boolean(value.webhookURL), kanalId: value.kanalId || null, username: value.username || 'Bot Log', avatarURL: value.avatarURL || null, resetLogChannel: g.channels.cache.has(resetChannel) ? resetChannel : null }; }, async (g, p) => {
    const old = botLog.get(g.id) || {};
    const next = { enabled: Boolean(old.webhookURL), username: 'Bot Log', ...old, ...p };
    if (Object.hasOwn(p, 'avatarURL')) next.avatarURL = imageUrl(p.avatarURL, 'Gönderen görseli');
    if (next.enabled && !next.kanalId) throw new AyarHatasi('Konsol kayıtları için bir kanal seçin.');
    if (p.resetLogChannel) await channelWithPermissions(g, p.resetLogChannel, [0, 5], [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], 'Veri sıfırlama log kanalı');
    if (next.enabled && (!old.webhookURL || old.kanalId !== next.kanalId || old.enabled === false)) {
      const channel = await channelWithPermissions(g, next.kanalId, [0, 5], [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageWebhooks], 'Bot log kanalı');
      try {
        const webhooks = await channel.fetchWebhooks();
        const knownId = String(old.webhookURL || '').match(/\/webhooks\/(\d+)\//)?.[1];
        let hook = webhooks.find(value => value.owner?.id === client.user.id && (value.id === knownId || value.name === 'ArviS Bot Log'));
        if (!hook) hook = await channel.createWebhook({ name: 'ArviS Bot Log', reason: 'Dashboard bot log kurulumu' });
        if (!hook.url) throw new Error();
        next.webhookURL = hook.url;
      } catch { throw new AyarHatasi('Bot log webhook kurulumu tamamlanamadı. Kanalın Webhookları Yönet iznini kontrol edin.'); }
    }
    const { resetLogChannel, ...config } = next;
    botLog.update(data => { data[g.id] = { ...data[g.id], ...config }; });
    if (Object.hasOwn(p, 'resetLogChannel')) {
      if (p.resetLogChannel) resetLog.set('reset_log_channel', p.resetLogChannel);
      else if (g.channels.cache.has(resetLog.get('reset_log_channel'))) resetLog.delete('reset_log_channel');
    }
  }, { command: 'bot-log', scope: 'global', note: 'Konsol kayıtları seçili sunucuya gönderilir. Veri sıfırlama log kanalı bot genelinde geçerlidir. Webhook anahtarı panelde gösterilmez.' });

  const help = localStore('Sistem/yardımEmbed.json');
  ekle('yardim', 'Yardım görünümü', 'Sistem', 'Yardım ekranının ve komut listesinin renklerini ve görsellerini özelleştirin.', 'Commands/Bilgi/yardım.js', [
    t('renk', 'Yardım rengi · HEX', 7, { default: '#5865F2', minLength: 7 }), t('resim', 'Yardım görseli · HTTPS', 2048, { nullable: true }),
    t('komutrenk', 'Komut listesi rengi · HEX', 7, { default: '#2B2D31', minLength: 7 }), t('komutresim', 'Komut listesi görseli · HTTPS', 2048, { nullable: true }),
  ], () => help.get('yardım') || {}, (g, p) => {
    for (const key of ['renk', 'komutrenk']) if (p[key] !== undefined && !/^#[\da-f]{6}$/i.test(p[key])) throw new AyarHatasi('Renk #5865F2 biçiminde olmalı.');
    for (const key of ['resim', 'komutresim']) if (p[key] !== undefined) p[key] = imageUrl(p[key], 'Görsel');
    help.update(data => { Object.assign(data.yardım ||= {}, p); });
  }, { command: 'yardım-embed-düzenle', scope: 'global', note: 'Görünüm tüm sunucularda geçerlidir. Değişiklikler yardım ekranının sonraki açılışında veya gezinme işleminde görünür.' });

  const abone = require('../../Utils/Membership/aboneStore');
  ekle('abonelik', 'Abonelik sistemi', 'Abonelik', 'Abone başvurusu, onay rolleri ve kontrol mesajını ayarlayın.', 'Utils/Membership/aboneStore.js', [
    c('kanal', 'Kontrol kanalı'), { ...r('yetkili', 'Onaylayacak rol'), assignable: false }, r('rol', 'Abone rolü'), c('logKanal', 'Log kanalı'), t('kontrolMesaj', 'Kontrol mesajı', 1500, { multiline: true, nullable: true }),
  ], g => { const value = abone.getGuildSetting(g.id); return Object.fromEntries(['kanal', 'yetkili', 'rol', 'logKanal', 'kontrolMesaj'].map(key => [key, value[key]])); }, (g, p) => abone.updateGuildSetting(g.id, value => birlestir(value, p)), {
    command: 'abone-sistemi-ayarla', note: 'Video kaynaklarını, gönderen kimliğini, bildirim metnini ve otomatik webhook kurulumunu paneldeki YouTube bildirimleri modülünden yönetin. Abone ve yorum takip kayıtları korunur.',
  });

  const applications = require('../../Utils/Moderation/yetkiliBasvuruStore');
  ekle('yetkili-basvuru', 'Yetkili başvuruları', 'Sunucu Yönetimi', 'Başvuru kanallarını, onaylanan üyeye verilecek rolleri ve örnek formu düzenleyip başvuru mesajını yayımlayın.', 'Utils/Moderation/yetkiliBasvuruStore.js', [
    c('basvuruKanal', 'Başvuru kanalı', true, [0]), c('logKanal', 'Log kanalı', true, [0]), c('yetkiliKanal', 'Yetkili kanalı', true, [0]), a('yetkiliRoller', 'Başvuru onaylandığında verilecek roller', r('roleId', 'Rol', false), 10), b('ornekFormAktif', 'Örnek form görseli etkin'), t('ornekFormResim', 'Örnek form görseli · HTTPS', 2048, { nullable: true }),
  ], g => applications.getGuildConfig(g.id), async (g, p) => {
    if (Object.hasOwn(p, 'ornekFormResim')) p.ornekFormResim = imageUrl(p.ornekFormResim, 'Örnek form');
    const next = { ...applications.getGuildConfig(g.id), ...p };
    if (next.ornekFormAktif && !next.ornekFormResim) throw new AyarHatasi('Örnek formu etkinleştirmek için görsel bağlantısını girin.');
    for (const key of ['basvuruKanal', 'logKanal', 'yetkiliKanal']) if (p[key]) await channelWithPermissions(g, p[key], [0], [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, ...(key !== 'yetkiliKanal' ? [PermissionFlagsBits.EmbedLinks] : []), ...(key === 'basvuruKanal' ? [PermissionFlagsBits.ManageMessages] : [])], 'Başvuru sistemi kanalı');
    applications.updateGuildConfig(g.id, value => birlestir(value, p));
  }, { command: 'yetkili-başvuru', note: 'Ayarları kaydettikten sonra başvuru mesajını yayımlayın. Aynı kanalda mevcut mesaj güncellenir; kanal değiştiyse yeni mesaj gönderilir.', actions: [
    { id: 'publish', label: 'Başvuru mesajını yayımla / güncelle', description: 'Kaydedilmiş başvuru kanalına form açıklamasını ve örnek görseli gönderir.', fields: [], run: async g => {
      try {
        const result = await require('../../Commands/Sunucu/yetkili-başvuru').publishApplicationMessage(g, applications.getGuildConfig(g.id));
        return { message: result.created ? 'Başvuru mesajı yayımlandı.' : 'Başvuru mesajı güncellendi.' };
      } catch { throw new AyarHatasi('Başvuru mesajı yayımlanamadı. Kanal seçimini ve botun Mesaj Gönder, Bağlantıları Göm ve Mesajları Yönet izinlerini kontrol edin.'); }
    } },
  ] });
};