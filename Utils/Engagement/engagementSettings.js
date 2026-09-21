'use strict';
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');
const { createJsonStore } = require('../Core/safeJsonStore');
const store = createJsonStore(path.join(__dirname, '../../Database/Eğlence ve Etkileşim/etkilesimAyarlar.json'));
const DEFAULTS = {
  cekilis: { enabled: true, channelId: null, durationSeconds: 3600, winners: 1, requiredRoles: [], blacklistedRoles: [], bypassRoles: [], bonusRoleId: null, bonusAmount: 1, messageCount: 0, messageChannelId: null, messageWindowSeconds: 600, ping: false, donorNoWin: false, message: '', extra: '' },
  'oy-yarismasi': { enabled: true, channelId: null, durationSeconds: 300, title: 'Oy Yarışması', description: '', theme: 'mor' },
  'oylama-baslat': { enabled: true, channelId: null, durationSeconds: 600 },
  'zaman-kapsulu': { enabled: true, minDurationMinutes: 1, maxDurationDays: 730, maxPendingPerUser: 0 },
};
function getSettings(guildId, id) {
  if (!DEFAULTS[id]) throw new TypeError('Bilinmeyen etkileşim sistemi.');
  return { ...structuredClone(DEFAULTS[id]), ...(guildId ? store.get(guildId)?.[id] : {}) };
}
function updateSettings(guildId, id, patch) {
  store.update(data => { const guild = data[guildId] ||= {}; guild[id] = { ...guild[id], ...patch }; });
  return getSettings(guildId, id);
}
async function targetChannel(guild, id, extra = []) {
  const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (!channel || (channel.guildId || channel.guild?.id) !== guild.id || ![0, 5].includes(channel.type)) throw new RangeError('Bu sunucudan bir metin veya duyuru kanalı seçin.');
  if (!channel.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, ...extra])) throw new RangeError('Botun seçilen kanalda gerekli görüntüleme, gönderme ve işlem izinleri yok.');
  return channel;
}
function requireEnabled(guildId, id) {
  const config = getSettings(guildId, id);
  if (!config.enabled) throw new RangeError('Bu komut bu sunucuda kapalı.');
  return config;
}
module.exports = { getSettings, updateSettings, targetChannel, requireEnabled };
