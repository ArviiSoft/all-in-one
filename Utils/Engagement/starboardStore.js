const path = require("path");
const { createJsonStore } = require("../Core/safeJsonStore");

const dbPath = path.join(__dirname, "../../Database/Sunucu Yönetimi/starboard.json");
const store = createJsonStore(dbPath);

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  channelId: null,
  threshold: 3,
  emoji: "⭐",
});

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function normalizeEntry(entry, sourceMessageId) {
  if (!entry || typeof entry !== "object") return null;

  const normalized = {
    sourceMessageId: String(entry.sourceMessageId || sourceMessageId || ""),
    sourceChannelId: String(entry.sourceChannelId || ""),
    starboardMessageId: String(entry.starboardMessageId || ""),
    starboardChannelId: String(entry.starboardChannelId || ""),
    lastCount: Math.max(0, Number.parseInt(entry.lastCount, 10) || 0),
    copiedFiles: entry.copiedFiles === true,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
  };

  if (
    !isSnowflake(normalized.sourceMessageId)
    || !isSnowflake(normalized.sourceChannelId)
    || !isSnowflake(normalized.starboardMessageId)
    || !isSnowflake(normalized.starboardChannelId)
  ) {
    return null;
  }

  return normalized;
}

function normalizeRecord(record) {
  const input = record && typeof record === "object" ? record : {};
  const parsedThreshold = Number.parseInt(input.threshold, 10);
  const entries = {};

  if (input.entries && typeof input.entries === "object" && !Array.isArray(input.entries)) {
    for (const [sourceMessageId, entry] of Object.entries(input.entries)) {
      const normalized = normalizeEntry(entry, sourceMessageId);
      if (normalized) entries[normalized.sourceMessageId] = normalized;
    }
  }

  return {
    enabled: input.enabled === true,
    channelId: isSnowflake(input.channelId) ? String(input.channelId) : null,
    threshold: Number.isInteger(parsedThreshold) && parsedThreshold >= 1 && parsedThreshold <= 9999
      ? parsedThreshold
      : DEFAULT_CONFIG.threshold,
    emoji: typeof input.emoji === "string" && input.emoji.trim()
      ? input.emoji.trim().slice(0, 32)
      : DEFAULT_CONFIG.emoji,
    entries,
  };
}

function configFromRecord(record) {
  const normalized = normalizeRecord(record);
  return {
    enabled: normalized.enabled,
    channelId: normalized.channelId,
    threshold: normalized.threshold,
    emoji: normalized.emoji,
  };
}

function getGuildConfig(guildId) {
  return configFromRecord(store.get(String(guildId)));
}

function updateGuildConfig(guildId, patch) {
  const id = String(guildId);
  let updatedConfig;

  store.update(data => {
    const current = normalizeRecord(data[id]);
    const next = normalizeRecord({ ...current, ...patch, entries: current.entries });
    data[id] = { ...data[id], ...next };
    updatedConfig = configFromRecord(next);
  });

  return updatedConfig;
}

function getEntry(guildId, sourceMessageId) {
  const record = normalizeRecord(store.get(String(guildId)));
  return record.entries[String(sourceMessageId)] || null;
}

function getEntryByStarboardMessage(guildId, starboardMessageId) {
  const record = normalizeRecord(store.get(String(guildId)));
  const targetId = String(starboardMessageId);
  return Object.values(record.entries).find(entry => entry.starboardMessageId === targetId) || null;
}

function listEntries(guildId) {
  const record = normalizeRecord(store.get(String(guildId)));
  return Object.values(record.entries);
}

function setEntry(guildId, sourceMessageId, entry) {
  const id = String(guildId);
  const sourceId = String(sourceMessageId);
  const normalizedEntry = normalizeEntry(entry, sourceId);
  if (!normalizedEntry) throw new TypeError("Geçersiz starboard mesaj kaydı.");

  store.update(data => {
    const current = normalizeRecord(data[id]);
    current.entries[sourceId] = normalizedEntry;
    data[id] = current;
  });

  return normalizedEntry;
}

function deleteEntry(guildId, sourceMessageId) {
  const id = String(guildId);
  const sourceId = String(sourceMessageId);
  const existing = getEntry(id, sourceId);
  if (!existing) return null;
  let deleted = null;

  store.update(data => {
    const current = normalizeRecord(data[id]);
    deleted = current.entries[sourceId] || null;
    delete current.entries[sourceId];

    if (
      !current.channelId
      && !current.enabled
      && Object.keys(current.entries).length === 0
      && current.threshold === DEFAULT_CONFIG.threshold
      && current.emoji === DEFAULT_CONFIG.emoji
    ) {
      delete data[id];
    } else {
      data[id] = current;
    }
  });

  return deleted;
}

function removeGuild(guildId) {
  const id = String(guildId);
  let entries = [];

  store.update(data => {
    entries = Object.values(normalizeRecord(data[id]).entries);
    delete data[id];
  });

  return entries;
}

module.exports = {
  DEFAULT_CONFIG,
  deleteEntry,
  getEntry,
  getEntryByStarboardMessage,
  getGuildConfig,
  listEntries,
  removeGuild,
  setEntry,
  updateGuildConfig,
};
