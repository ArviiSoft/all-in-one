'use strict';
const { PermissionFlagsBits: P } = require('discord.js');
const { AyarHatasi } = require('../validation');
const { canViewChannel } = require('../guildAccess');
const { createCommunityStore } = require('../stores/community');
const { getSettings, updateSettings, targetChannel } = require('../../Utils/Engagement/engagementSettings');
const { publicUrl } = require('../../Utils/Scheduling/publicRss');
const db = createCommunityStore();
const FILES = { cekilis: 'Eğlence ve Etkileşim/cekilis.json', 'oy-yarismasi': 'Eğlence ve Etkileşim/oyYarismasi.json', 'oylama-baslat': 'Eğlence ve Etkileşim/oylama.json' };
const PERMISSIONS = { cekilis: [P.EmbedLinks, P.ReadMessageHistory], 'oy-yarismasi': [P.AttachFiles, P.ReadMessageHistory], 'oylama-baslat': [P.AddReactions, P.ReadMessageHistory, P.ManageMessages] };
function records(guild, id) { return Object.entries(db.read(FILES[id])).filter(([, record]) => record.guildId === guild.id); }
function visibleRecord(guild, record, member) {
  return !member || canViewChannel(guild, member, guild.channels.cache.get(record.channelId || record.kanalId));
}
function recordFor(guild, id, recordId, member) {
  const record = records(guild, id).find(([key]) => key === recordId)?.[1];
  if (!record) throw new AyarHatasi('Kayıt bu sunucuda bulunamadı.', 404);
  if (!visibleRecord(guild, record, member)) throw new AyarHatasi('Bu kaydın kanalına erişim yetkiniz yok.', 403);
  return record;
}
async function validateAndSave(guild, id, patch) {
  const next = { ...getSettings(guild.id, id), ...patch };
  if (next.channelId && (next.enabled || patch.channelId)) await targetChannel(guild, next.channelId, PERMISSIONS[id]);
  if (id === 'cekilis') {
    if (next.requiredRoles.some(role => next.blacklistedRoles.includes(role))) throw new AyarHatasi('Aynı rol hem gerekli hem yasaklı olamaz.');
    if (next.messageCount && !next.messageChannelId) throw new AyarHatasi('Mesaj şartı için bir kanal seçin.');
    if (next.messageCount && (next.enabled || patch.messageChannelId)) await targetChannel(guild, next.messageChannelId, [P.ReadMessageHistory]);
  }
  if (id === 'oy-yarismasi' && !next.title.trim()) throw new AyarHatasi('Yarışma başlığı boş olamaz.');
  if (id === 'zaman-kapsulu' && next.minDurationMinutes > next.maxDurationDays * 1440) throw new AyarHatasi('Minimum süre maksimum süreden büyük olamaz.');
  updateSettings(guild.id, id, patch);
}
function details(guild, id, member) {
  const items = records(guild, id).filter(([, record]) => visibleRecord(guild, record, member)).sort((a, b) => Number(Boolean(a[1].ended)) - Number(Boolean(b[1].ended)) || (b[1].endTime || b[1].bitis) - (a[1].endTime || a[1].bitis));
  if (!items.length) return ['Bu sunucuda henüz kayıt yok.'];
  return items.slice(0, 30).map(([key, record]) => {
    const name = record.prize || record.question || record.baslik || 'Oy yarışması';
    const count = id === 'cekilis' ? (record.participants?.length || 0) : id === 'oy-yarismasi' ? Object.values(record.oylar || {}).reduce((total, votes) => total + votes.length, 0) : null;
    return `${key} · ${name} · ${record.ended ? 'Bitti' : 'Aktif'}${count === null ? '' : ` · ${count} ${id === 'cekilis' ? 'katılımcı' : 'oy'}`} · #${guild.channels.cache.get(record.channelId || record.kanalId)?.name || 'silinmiş kanal'}`;
  });
}
module.exports = function register({ client, ekle, b, n, t, c, r, s, a }) {
  const category = 'Eğlence ve Etkileşim';
  const store = 'Utils/Engagement/engagementSettings.js';
  const base = label => [b('enabled', `${label} komutu etkin`, true), { ...c('channelId', 'Yayın kanalı'), hint: 'Panelden başlatmak için seçin. Boşsa Discord komutu kullanıldığı kanala gönderir.' }];
  const role = (key, label) => ({ ...r(key, label), assignable: false });
  const roles = (key, label) => a(key, label, { ...role('roleId', 'Rol'), nullable: false }, 20);
  const recordId = () => t('id', 'Kayıt ID', 30, { minLength: 1, hint: 'Yukarıdaki mevcut kayıtlardan ID değerini kopyalayın.' });
  const optionList = (max, length) => a('options', 'Seçenekler', t('option', 'Seçenek', length, { minLength: 1 }), max, 2);
  const extras = (id, command, actions, note) => ({ command, note, details: (g, member) => details(g, id, member), actions });
  const registerSettings = (id, label, description, fields, extra) => ekle(id, label, category, description, store, fields, g => getSettings(g.id, id), (g, patch) => validateAndSave(g, id, patch), extra);

  registerSettings('cekilis', 'Çekiliş', 'Ödüllü çekilişleri başlatın, katılım şartlarını ve kazananları yönetin.', [
    ...base('Çekiliş'), n('durationSeconds', 'Çekiliş süresi · saniye', 5, 2592000, 3600), n('winners', 'Kazanan sayısı', 1, 50, 1),
    roles('requiredRoles', 'Gerekli roller'), roles('blacklistedRoles', 'Yasaklı roller'), roles('bypassRoles', 'Şartları atlayabilen roller'),
    role('bonusRoleId', 'Bonus rolü'), n('bonusAmount', 'Bonus rolünün ek katılım hakkı', 1, 100, 1),
    n('messageCount', 'Gerekli mesaj sayısı · 0 kapatır', 0, 10000, 0), c('messageChannelId', 'Mesaj şartı kanalı'), n('messageWindowSeconds', 'Mesaj şartı zaman aralığı · saniye', 1, 2592000, 600),
    b('ping', 'Mesajdaki etiketlerin bildirim göndermesine izin ver'), b('donorNoWin', 'Bağışçı kazanamasın'),
    t('message', 'Çekiliş üst mesajı', 2000, { multiline: true }), t('extra', 'Ek açıklama', 1500, { multiline: true }),
  ], extras('cekilis', 'çekiliş', [
    { id: 'start', label: 'Çekiliş başlat', description: 'Kaydedilmiş kanal, süre, kazanan sayısı ve katılım şartlarıyla yeni çekiliş yayımlar.', fields: [t('prize', 'Ödül', 256, { minLength: 1 }), t('donorId', 'Bağışçı üye ID · isteğe bağlı', 20, { nullable: true }), t('imageUrl', 'Görsel bağlantısı · HTTPS, isteğe bağlı', 2000, { nullable: true })], run: async (g, input) => {
      if (input.donorId && (!/^\d{17,20}$/.test(input.donorId) || (await g.members.fetch(input.donorId).catch(() => null))?.id !== input.donorId)) throw new AyarHatasi('Bağışçı bu sunucuda bulunamadı.');
      let imageUrl = null;
      if (input.imageUrl) { try { imageUrl = publicUrl(input.imageUrl).href; } catch { throw new AyarHatasi('Genel internette erişilebilir bir HTTPS görsel bağlantısı girin.'); } }
      const result = await require('../../Utils/Engagement/çekilişKontrol').startGiveaway(client, g, null, client.user.id, { ...input, imageUrl });
      return { message: `Çekiliş başlatıldı. ID: ${result.id}` };
    } },
    ...[['end', 'Çekilişi bitir', 'endGiveawayById'], ['reroll', 'Kazananları yeniden seç', 'rerollGiveawayById'], ['reset', 'Katılımcıları sıfırla', 'resetGiveawayParticipants']].map(([id, label, method]) => ({ id, label, fields: [recordId()], ...(id === 'reset' ? { danger: true, confirm: 'Bu çekilişin tüm katılımcıları ve kazananları sıfırlansın mı?' } : {}), run: async (g, input, _actor, member) => {
      const record = recordFor(g, 'cekilis', input.id, member);
      await targetChannel(g, record.channelId, PERMISSIONS.cekilis);
      const result = await require('../../Utils/Engagement/çekilişKontrol')[method](client, input.id);
      if (!result.ok) throw new AyarHatasi(result.reason === 'already_ended' ? 'Bu çekiliş zaten bitmiş.' : result.reason === 'not_ended' ? 'Önce çekilişi bitirin.' : 'Çekiliş bulunamadı.');
      return { message: `${label}: işlem tamamlandı.` };
    } })),
  ], 'Ayarlar yeni çekilişlerde uygulanır. Discord komutunda açıkça verilen seçenekler varsayılanları geçersiz kılar. Komutu kapatmak mevcut çekilişleri durdurmaz. Panelden başlatılan çekilişin sahibi bottur.'));

  registerSettings('oy-yarismasi', 'Oy yarışması', 'Butonlu ve görselli yarışmaların süresini, başlığını ve temasını ayarlayın.', [
    ...base('Oy yarışması'), n('durationSeconds', 'Yarışma süresi · saniye', 10, 2592000, 300),
    t('title', 'Yarışma başlığı', 60, { minLength: 1, default: 'Oy Yarışması' }), t('description', 'Kısa açıklama', 140),
    s('theme', 'Görsel teması', [['mor', 'Mor'], ['mavi', 'Mavi'], ['yesil', 'Yeşil'], ['turuncu', 'Turuncu'], ['pembe', 'Pembe']], 'mor'),
  ], extras('oy-yarismasi', 'oy-yarışması', [
    { id: 'start', label: 'Oy yarışması başlat', description: 'Kaydedilmiş kanal, süre, başlık ve temayla 2–5 seçenekli yarışma yayımlar. Seçeneklerde kişi ve rol etiketi kullanılamaz.', fields: [optionList(5, 70)], run: async (g, input) => {
      const message = await require('../../Commands/Eğlence/oy-yarışması').startPoll(g, null, client.user.id, input);
      return { message: `Oy yarışması başlatıldı. ID: ${message.id}` };
    } },
    { id: 'end', label: 'Oy yarışmasını bitir', fields: [recordId()], run: async (g, input, _actor, member) => {
      const record = recordFor(g, 'oy-yarismasi', input.id, member); await targetChannel(g, record.kanalId, PERMISSIONS['oy-yarismasi']);
      await require('../../Commands/Eğlence/oy-yarışması').finishPoll(client, input.id, true);
      return { message: 'Yarışma bitirildi ve sonuç görseli yayımlandı.' };
    } },
  ], 'Ayarlar yeni yarışmalarda uygulanır. Mevcut oylar korunur. Bitirilen yarışmaların sonucu Discord mesajında kalır; aktif kayıt listesinden kaldırılır.'));

  registerSettings('oylama-baslat', 'Oylama başlat', 'Tepkilerle oy verilen anketler oluşturun ve sonuçlarını yayımlayın.', [
    ...base('Oylama'), n('durationSeconds', 'Oylama süresi · saniye', 1, 2592000, 600),
  ], extras('oylama-baslat', 'oylama-başlat', [
    { id: 'start', label: 'Oylama başlat', description: 'Kaydedilmiş kanal ve süreyle 2–10 seçenekli oylama yayımlar.', fields: [t('question', 'Oylama sorusu', 300, { minLength: 1 }), optionList(10, 150)], run: async (g, input) => {
      const message = await require('../../Utils/Engagement/oylamaKontrol').startPoll(g, null, client.user.id, input);
      return { message: `Oylama başlatıldı. ID: ${message.id}` };
    } },
    { id: 'end', label: 'Oylamayı bitir', fields: [recordId()], run: async (g, input, _actor, member) => {
      const record = recordFor(g, 'oylama-baslat', input.id, member); await targetChannel(g, record.channelId, PERMISSIONS['oylama-baslat']);
      await require('../../Utils/Engagement/oylamaKontrol').endPoll(client, input.id, g.id);
      return { message: 'Oylama bitirildi ve sonuçlar yayımlandı.' };
    } },
  ], 'Üyeler seçeneklerin emoji tepkilerine basarak oy verir; birden fazla seçeneğe oy verilebilir. Ayarlar yeni oylamalarda uygulanır.'));

  registerSettings('zaman-kapsulu', 'Zaman kapsülü', 'Kişisel zaman kapsüllerinin kullanımını ve teslim süresi sınırlarını yönetin.', [
    b('enabled', 'Zaman kapsülü komutu etkin', true), n('minDurationMinutes', 'Minimum teslim süresi · dakika', 1, 1051200, 1), n('maxDurationDays', 'Maksimum teslim süresi · gün', 1, 730, 730), n('maxPendingPerUser', 'Üye başına bekleyen kapsül sınırı · 0 sınırsız', 0, 100, 0),
  ], { command: 'zaman-kapsülü', note: 'Bu ayarlar bu sunucuda oluşturulacak yeni kapsüllere uygulanır. Kapsül içerikleri kişiseldir ve panelde gösterilmez. Sistemi kapatmak önceden oluşturulan kapsüllerin DM teslimini durdurmaz.' });
};
