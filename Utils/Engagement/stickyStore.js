const path = require("path");
const { createJsonStore } = require("../Core/safeJsonStore.js");

const stickyFile = path.join(__dirname, "../../Database/Sunucu Yönetimi/sticky.json");
const store = createJsonStore(stickyFile);

function loadStickyData() {
  return store.loadData();
}

function updateStickyData(updater) {
  return store.update(updater);
}

function recordBelongsToGuild(channelId, record, guild) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (record.guildId) return String(record.guildId) === String(guild.id);

  return guild.channels.cache.has(String(channelId));
}

function getGuildStickyEntries(guild) {
  return Object.entries(loadStickyData())
    .filter(([channelId, record]) => recordBelongsToGuild(channelId, record, guild))
    .map(([channelId, record]) => ({ channelId, record }))
    .sort((first, second) => {
      const firstChannel = guild.channels.cache.get(first.channelId);
      const secondChannel = guild.channels.cache.get(second.channelId);

      if (!firstChannel && secondChannel) return 1;
      if (firstChannel && !secondChannel) return -1;

      const positionDifference = (firstChannel?.rawPosition ?? 0) - (secondChannel?.rawPosition ?? 0);
      if (positionDifference !== 0) return positionDifference;

      return (firstChannel?.name || first.channelId).localeCompare(
        secondChannel?.name || second.channelId,
        "tr"
      );
    });
}

module.exports = {
  getGuildStickyEntries,
  loadStickyData,
  recordBelongsToGuild,
  updateStickyData,
};