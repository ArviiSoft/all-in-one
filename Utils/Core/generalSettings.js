const { getEnv, updateEnv } = require('./env');
const statuses = new Set(['online', 'idle', 'dnd', 'invisible']);
const discordId = /^\d{17,20}$/;

const settings = {
  get BotStatus() {
    const status = getEnv('BOT_STATUS', 'online').trim().toLowerCase();
    return statuses.has(status) ? status : 'online';
  },
  get sahipID() { return getEnv('BOT_OWNER_ID', '').trim(); },
  get BlacklistServers() {
    return {
      SunucuIDleri: [...new Set(getEnv('BLACKLIST_SERVER_IDS', '').split(/[\s,]+/).filter(id => discordId.test(id)))],
      BotOlaylariniYoksay: getEnv('IGNORE_BOT_EVENTS', 'false').trim().toLowerCase() === 'true',
    };
  },
};

function read() { return { ...settings }; }

function update(patch, client) {
  const values = {};
  if (patch.BotStatus !== undefined) {
    if (!statuses.has(patch.BotStatus)) throw new TypeError('Geçerli bir bot durumu girin.');
    values.BOT_STATUS = patch.BotStatus;
  }
  if (patch.sahipID !== undefined) {
    if (typeof patch.sahipID !== 'string' || !discordId.test(patch.sahipID)) throw new TypeError('Geçerli bir sahip kullanıcı kimliği girin.');
    values.BOT_OWNER_ID = patch.sahipID;
  }
  const blacklist = patch.BlacklistServers;
  if (blacklist?.SunucuIDleri !== undefined) {
    if (!Array.isArray(blacklist.SunucuIDleri) || blacklist.SunucuIDleri.some(id => typeof id !== 'string' || !discordId.test(id))) {
      throw new TypeError('Geçerli sunucu kimlikleri girin.');
    }
    values.BLACKLIST_SERVER_IDS = [...new Set(blacklist.SunucuIDleri)].join(',');
  }
  if (blacklist?.BotOlaylariniYoksay !== undefined) {
    if (typeof blacklist.BotOlaylariniYoksay !== 'boolean') throw new TypeError('Bot olayları ayarı true veya false olmalıdır.');
    values.IGNORE_BOT_EVENTS = String(blacklist.BotOlaylariniYoksay);
  }
  updateEnv(values);
  const next = read();
  require('../Moderation/blacklistservers').updateBlacklistServers(client, next);
  if (patch.BotStatus !== undefined) client?.user?.setStatus(next.BotStatus);
  return next;
}
module.exports = { settings, read, update };
