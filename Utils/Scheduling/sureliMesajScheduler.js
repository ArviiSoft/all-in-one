const { getSetting, hasSetting, isCompleteSetting, readData, setSetting, writeData } = require("./sureliMesajStore");

const MAX_TIMEOUT_DELAY = 2_147_000_000;
const timers = new Map();

function timerKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function stopTimedMessage(guildId, channelId) {
  const key = timerKey(guildId, channelId);
  const timerEntry = timers.get(key);
  if (timerEntry?.handle) clearTimeout(timerEntry.handle);
  timers.delete(key);
}

function saveNextSendAt(guildId, channelId, nextSendAt) {
  const data = readData();
  if (!hasSetting(data, guildId, channelId)) return null;

  const setting = getSetting(data, guildId, channelId);
  setting.sonrakiGönderim = nextSendAt;
  setSetting(data, guildId, channelId, setting);
  writeData(data);
  return getSetting(data, guildId, channelId);
}

function scheduleTimedMessage(client, guildId, channelId, setting) {
  stopTimedMessage(guildId, channelId);
  if (!isCompleteSetting(setting)) return false;

  const key = timerKey(guildId, channelId);
  const token = Symbol(key);
  const targetTime = Number.isFinite(Number(setting.sonrakiGönderim))
    ? Number(setting.sonrakiGönderim)
    : Date.now() + setting.süre;

  const isCurrentTimer = () => timers.get(key)?.token === token;

  const armTimer = sendAt => {
    if (!isCurrentTimer()) return;

    const remaining = Math.max(0, sendAt - Date.now());
    const delay = Math.min(remaining, MAX_TIMEOUT_DELAY);
    const handle = setTimeout(async () => {
      if (!isCurrentTimer()) return;

      if (sendAt > Date.now()) {
        armTimer(sendAt);
        return;
      }

      const currentSetting = getSetting(readData(), guildId, channelId);
      if (!isCompleteSetting(currentSetting)) {
        stopTimedMessage(guildId, channelId);
        return;
      }

      try {
        const channel = client.channels.cache.get(channelId)
          || await client.channels.fetch(channelId).catch(() => null);

        if (!isCurrentTimer()) return;
        if (!channel?.isTextBased() || typeof channel.send !== "function") {
          stopTimedMessage(guildId, channelId);
          return;
        }

        await channel.send({ content: currentSetting.mesaj });
      } catch (error) {
        console.error(`🔴 [SÜRELİ MESAJ] ${guildId}/${channelId} gönderilemedi:`, error);
      }

      if (!isCurrentTimer()) return;

      const nextSendAt = Date.now() + currentSetting.süre;
      const savedSetting = saveNextSendAt(guildId, channelId, nextSendAt);
      if (!savedSetting || !isCurrentTimer()) {
        stopTimedMessage(guildId, channelId);
        return;
      }

      armTimer(nextSendAt);
    }, delay);

    handle.unref?.();
    timers.set(key, { handle, token });
  };

  timers.set(key, { handle: null, token });
  armTimer(targetTime);
  return true;
}

function syncTimedMessage(client, guildId, channelId) {
  const data = readData();
  const setting = getSetting(data, guildId, channelId);

  if (!isCompleteSetting(setting)) {
    stopTimedMessage(guildId, channelId);
    return false;
  }

  setting.sonrakiGönderim = Date.now() + setting.süre;
  setSetting(data, guildId, channelId, setting);
  writeData(data);
  return scheduleTimedMessage(client, guildId, channelId, setting);
}

function initializeTimedMessages(client) {
  for (const timerEntry of timers.values()) {
    if (timerEntry.handle) clearTimeout(timerEntry.handle);
  }
  timers.clear();

  const data = readData();
  const now = Date.now();
  let activeCount = 0;
  let dataChanged = false;

  for (const [guildId, guildSettings] of Object.entries(data)) {
    for (const [channelId] of Object.entries(guildSettings)) {
      const setting = getSetting(data, guildId, channelId);
      if (!isCompleteSetting(setting)) continue;

      if (!setting.sonrakiGönderim) {
        setting.sonrakiGönderim = now + setting.süre;
        setSetting(data, guildId, channelId, setting);
        dataChanged = true;
      }

      if (scheduleTimedMessage(client, guildId, channelId, setting)) activeCount++;
    }
  }

  if (dataChanged) writeData(data);
  console.log(`✅ [SÜRELİ MESAJ] ${activeCount} zamanlayıcı etkinleştirildi.`);
  return activeCount;
}

module.exports = {
  MAX_TIMEOUT_DELAY,
  initializeTimedMessages,
  scheduleTimedMessage,
  stopTimedMessage,
  syncTimedMessage,
};