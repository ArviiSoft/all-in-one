const path = require('node:path');
const { createJsonStore } = require('../Core/safeJsonStore');

const store = createJsonStore(path.join(__dirname, '../../Database/Sunucu Yönetimi/modmail.json'));
const DEFAULT_CONFIG = Object.freeze({
  enabled: false, categoryId: null, logChannelId: null, staffRoleId: null,
  welcomeMessage: 'Talebin yetkililere ulaştı. Bu DM üzerinden mesaj ve dosya gönderebilirsin.',
  closeMessage: 'Destek talebin kapatıldı. Yeni bir talep için tekrar mesaj gönderebilirsin.',
  maxOpenTickets: 30,
});

function getConfig(guildId) { return { ...DEFAULT_CONFIG, ...store.get(guildId)?.config }; }
function allGuilds() { return store.all(); }
function listSessions(guildId) { return Object.values(store.get(guildId)?.sessions || {}); }
function getSession(channelId) {
  for (const { data } of allGuilds()) if (data.sessions?.[channelId]) return data.sessions[channelId];
  return null;
}
function sessionForUser(userId) {
  for (const { data } of allGuilds()) {
    const found = Object.values(data.sessions || {}).find(session => session.userId === userId);
    if (found) return found;
  }
  return null;
}
function hasEnabled() { return allGuilds().some(({ data }) => data.config?.enabled); }
function ownsDirectMessages() { return hasEnabled() || allGuilds().some(({ data }) => Object.keys(data.sessions || {}).length); }
function saveConfig(guildId, config) {
  store.update(data => { (data[guildId] ||= {}).config = config; });
  return getConfig(guildId);
}
function saveSession(session) {
  store.update(data => { ((data[session.guildId] ||= {}).sessions ||= {})[session.channelId] = session; });
}
function updateSession(guildId, channelId, update) {
  return store.update(data => {
    const session = data[guildId]?.sessions?.[channelId];
    if (!session) throw new TypeError('ModMail talebi bulunamadı.');
    update(session);
    return session;
  });
}
function removeSession(session) {
  store.update(data => { delete data[session.guildId]?.sessions?.[session.channelId]; });
}

module.exports = { DEFAULT_CONFIG, getConfig, allGuilds, listSessions, getSession, sessionForUser,
  hasEnabled, ownsDirectMessages, saveConfig, saveSession, updateSession, removeSession };
