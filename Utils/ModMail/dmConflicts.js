const path = require('node:path');
const { createJsonStore } = require('../Core/safeJsonStore');
const modmail = require('./modmailStore');
const anonymous = createJsonStore(path.join(__dirname, '../../Database/Eğlence ve Etkileşim/anonimSohbet.json'));
const queue = createJsonStore(path.join(__dirname, '../../Database/Eğlence ve Etkileşim/anonimKuyruk.json'));
const sessions = createJsonStore(path.join(__dirname, '../../Database/Eğlence ve Etkileşim/anonimSesyon.json'));

function getConflicts() {
  const conflicts = [];
  for (const { ID, data } of anonymous.all()) {
    if (data.channelId) conflicts.push({ guildId: ID, label: 'Anonim Sohbet paneli' });
  }
  for (const [source, label] of [[queue, 'Anonim Sohbet kuyruğu'], [sessions, 'Açık anonim sohbet']]) {
    for (const { data } of source.all()) {
      if (!conflicts.some(c => c.guildId === data.guildId && c.label === label)) {
        conflicts.push({ guildId: data.guildId || null, label });
      }
    }
  }
  return conflicts;
}
function describeConflicts(client) {
  return getConflicts().map(c => `${c.label} (${client?.guilds.cache.get(c.guildId)?.name || c.guildId || 'eski kayıt'})`);
}
function assertNoConflicts() {
  if (getConflicts().length) throw new TypeError('Önce Anonim Sohbet sistemini, bekleme kuyruğunu ve açık sohbetlerini kapatın. DM çakışma kontrolü botun tüm sunucularında uygulanır.');
}
function assertAnonymousAllowed() {
  if (modmail.ownsDirectMessages()) throw new TypeError('Önce ModMail sistemini kapatın ve açık ModMail taleplerini sonlandırın. Her iki sistem botun DM mesajlarını kullanır.');
}
async function disableAnonymous(guild) {
  const config = anonymous.get(guild.id) || {};
  anonymous.update(data => { if (data[guild.id]) { delete data[guild.id].channelId; delete data[guild.id].messageId; } });
  const ended = new Set();
  sessions.update(data => {
    for (const [userId, session] of Object.entries(data)) {
      if (session.guildId === guild.id) { ended.add(userId); if (session.partnerId) ended.add(session.partnerId); }
    }
    for (const userId of ended) delete data[userId];
  });
  queue.update(data => {
    for (const [userId, entry] of Object.entries(data)) {
      if (entry.guildId === guild.id || ended.has(userId)) { ended.add(userId); delete data[userId]; }
    }
  });
  const channel = config.channelId ? await guild.channels.fetch(config.channelId).catch(() => null) : null;
  const panel = config.messageId && channel?.messages ? await channel.messages.fetch(config.messageId).catch(() => null) : null;
  if (panel?.author.id === guild.client.user.id) await panel.delete().catch(() => null);
  for (const id of ended) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    await user?.send({ content: `${guild.name}: Anonim Sohbet yönetici tarafından kapatıldı. Sohbetin veya bekleme kaydın sonlandırıldı.`, allowedMentions: { parse: [] } }).catch(() => null);
  }
  return ended.size;
}
module.exports = { getConflicts, describeConflicts, assertNoConflicts, assertAnonymousAllowed, disableAnonymous };
