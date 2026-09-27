const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const store = require('./modmailStore');
const { assertNoConflicts } = require('./dmConflicts');
const { updatePresence } = require('./modmailPresence');
const locks = new Map();

function serialize(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  locks.set(key, next);
  return next.finally(() => { if (locks.get(key) === next) locks.delete(key); });
}
async function validateResources(guild, config) {
  const me = guild.members.me || await guild.members.fetchMe();
  const category = await guild.channels.fetch(config.categoryId).catch(() => null);
  const log = await guild.channels.fetch(config.logChannelId).catch(() => null);
  const role = await guild.roles.fetch(config.staffRoleId).catch(() => null);
  if (!category || category.guild.id !== guild.id || category.type !== ChannelType.GuildCategory) throw new TypeError('Bu sunucudan bir ModMail kategorisi seçin.');
  if (!log || log.guild.id !== guild.id || log.type !== ChannelType.GuildText) throw new TypeError('Bu sunucudan bir metin log kanalı seçin.');
  if (store.getSession(log.id)) throw new TypeError('Bir ModMail talep kanalı log kanalı olarak kullanılamaz.');
  if (!role || role.id === guild.id || role.managed) throw new TypeError('Geçerli bir yetkili rolü seçin; @everyone ve bot rolleri kullanılamaz.');
  if (!category.permissionsFor(me)?.has([P.ViewChannel, P.ManageChannels, P.ManageRoles, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.PinMessages])) {
    throw new TypeError('Botun kategoride Kanalı Görüntüle, Kanalları Yönet, Rolleri Yönet, Mesaj Gönder, Mesaj Geçmişini Oku, Dosya Ekle ve Mesajları Sabitle izinleri olmalı.');
  }
  if (!log.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory])) throw new TypeError('Botun log kanalında Kanalı Görüntüle, Mesaj Gönder, Dosya Ekle ve Mesaj Geçmişini Oku izinleri olmalı.');
  return { category, log, role };
}
function saveConfig(guild, patch) {
  return serialize(`guild:${guild.id}`, async () => {
    const old = store.getConfig(guild.id);
    const next = { ...old };
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(store.DEFAULT_CONFIG, key)) throw new TypeError('Bilinmeyen ModMail ayarı.');
      next[key] = value;
    }
    if (typeof next.enabled !== 'boolean') throw new TypeError('ModMail durumu açık veya kapalı olmalı.');
    for (const key of ['categoryId', 'logChannelId', 'staffRoleId']) {
      if (next[key] !== null && !/^\d{17,20}$/.test(next[key])) throw new TypeError('Geçerli kanal ve rol kimlikleri seçin.');
    }
    for (const key of ['welcomeMessage', 'closeMessage']) {
      if (typeof next[key] !== 'string' || !next[key].trim() || next[key].length > 1000) throw new TypeError('Karşılama ve kapanış mesajları 1–1000 karakter olmalı.');
      next[key] = next[key].trim();
    }
    if (!Number.isInteger(next.maxOpenTickets) || next.maxOpenTickets < 1 || next.maxOpenTickets > 50) throw new TypeError('Açık talep sınırı 1–50 arasında olmalı.');
    if (store.listSessions(guild.id).length && ['categoryId', 'staffRoleId'].some(key => next[key] !== old[key])) {
      throw new TypeError('Kategori veya yetkili rolünü değiştirmeden önce açık ModMail taleplerini kapatın.');
    }
    if (store.listSessions(guild.id).length && !next.logChannelId) throw new TypeError('Açık talepler varken log kanalı kaldırılamaz.');
    if (next.enabled) {
      assertNoConflicts();
      if (!next.categoryId || !next.logChannelId || !next.staffRoleId) throw new TypeError('Önce kategori, log kanalı ve yetkili rolünü seçin.');
      await validateResources(guild, next);
      assertNoConflicts();
    }
    store.saveConfig(guild.id, next);
    updatePresence(guild.client);
    return next;
  });
}
module.exports = { saveConfig, validateResources, serialize };
