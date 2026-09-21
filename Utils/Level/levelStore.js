const fs = require("../Core/databaseFs");
const path = require("path");
const { createJsonStore } = require("../Core/safeJsonStore");
const { MAX_LEVEL, MAX_XP, progressForXp } = require("./levelMath");

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  channelId: null,
  message: "Tebrikler {kullanici}! **{seviye}. seviyeye** ulaştın! 🎉",
  xpMin: 15,
  xpMax: 25,
  cooldownSeconds: 60,
  rewards: Object.freeze([]),
});
const PLACEHOLDERS = Object.freeze([
  "kullanici", "kullanici_adi", "sunucu", "seviye", "eski_seviye", "xp", "sira", "roller",
]);
const MAX_REWARDS = 100;
const DEFAULT_PATH = path.join(__dirname, "../../Database/Seviye/levels.json");
const clone = (value) => JSON.parse(JSON.stringify(value));

function validId(value, label = "Kimlik") {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) {
    throw new TypeError(`${label} geçerli bir Discord kimliği olmalı.`);
  }
  return value;
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} ${min} ile ${max} arasında bir tam sayı olmalı.`);
  }
}

function validateMessageTemplate(message) {
  if (typeof message !== "string" || !message.trim() || message.length > 1500) {
    throw new RangeError("Seviye mesajı 1–1500 karakter olmalı.");
  }
  for (const match of message.matchAll(/\{([^{}]+)\}/g)) {
    if (!PLACEHOLDERS.includes(match[1])) throw new TypeError(`Bilinmeyen değişken: ${match[0]}`);
  }
  return message;
}

function validateReward(reward) {
  if (!reward || typeof reward !== "object") throw new TypeError("Ödül bilgisi gerekli.");
  validId(reward.roleId, "Rol");
  integer(reward.level, 1, MAX_LEVEL, "Ödül seviyesi");
  if (typeof reward.removeOnHigher !== "boolean") throw new TypeError("Eski rolü kaldırma ayarı doğru/yanlış olmalı.");
  return { roleId: reward.roleId, level: reward.level, removeOnHigher: reward.removeOnHigher };
}

function validateConfig(config) {
  if (typeof config.enabled !== "boolean") throw new TypeError("Sistem durumu doğru/yanlış olmalı.");
  if (config.channelId !== null) validId(config.channelId, "Kanal");
  validateMessageTemplate(config.message);
  integer(config.xpMin, 1, 1000, "Minimum XP");
  integer(config.xpMax, 1, 1000, "Maksimum XP");
  if (config.xpMin > config.xpMax) throw new RangeError("Minimum XP, maksimum XP'den büyük olamaz.");
  integer(config.cooldownSeconds, 5, 86400, "XP bekleme süresi");
  if (!Array.isArray(config.rewards) || config.rewards.length > MAX_REWARDS) {
    throw new RangeError(`En fazla ${MAX_REWARDS} seviye ödülü tanımlanabilir.`);
  }
  const rewards = config.rewards.map(validateReward);
  if (new Set(rewards.map((reward) => reward.roleId)).size !== rewards.length) {
    throw new TypeError("Aynı rol birden fazla ödüle atanamaz.");
  }
  return {
    enabled: config.enabled, channelId: config.channelId, message: config.message,
    xpMin: config.xpMin, xpMax: config.xpMax, cooldownSeconds: config.cooldownSeconds,
    rewards: rewards.sort((a, b) => a.level - b.level || a.roleId.localeCompare(b.roleId)),
  };
}

function normalizedConfig(raw) {
  try { return validateConfig({ ...DEFAULT_CONFIG, ...raw }); }
  catch { return clone(DEFAULT_CONFIG); }
}

function normalizeMember(userId, raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  return {
    userId,
    ...progressForXp(Number.isSafeInteger(raw.totalXp) ? raw.totalXp : 0),
    lastAwardAt: Number.isFinite(raw.lastAwardAt) ? raw.lastAwardAt : null,
    lastMessageId: typeof raw.lastMessageId === "string" && /^\d{17,20}$/.test(raw.lastMessageId) ? raw.lastMessageId : null,
    messageCount: Number.isSafeInteger(raw.messageCount) && raw.messageCount >= 0 ? raw.messageCount : 0,
    active: raw.active !== false,
  };
}

function createLevelStore({ filePath = DEFAULT_PATH, now = Date.now, random = Math.random, logger = console } = {}) {
  const database = createJsonStore(filePath, { logger });
  let cachedData;
  let cachedSignature;

  function signature() {
    try {
      const stats = fs.statSync(filePath, { bigint: true });
      return `${stats.mtimeNs}:${stats.size}:${stats.ino}`;
    } catch (error) {
      if (error.code === "ENOENT") return "missing";
      throw error;
    }
  }

  function read() {
    const currentSignature = signature();
    if (!cachedData || currentSignature !== cachedSignature) {
      cachedData = database.loadData();
      cachedSignature = currentSignature;
    }
    return cachedData;
  }

  function mutate(updater) {
    try { return database.update(updater); }
    finally { cachedData = null; cachedSignature = null; }
  }

  function guildData(data, guildId, create = false) {
    validId(guildId, "Sunucu");
    if (!create) return data.guilds?.[guildId] || {};
    if (!data.guilds || typeof data.guilds !== "object" || Array.isArray(data.guilds)) data.guilds = {};
    if (!data.guilds[guildId] || typeof data.guilds[guildId] !== "object" || Array.isArray(data.guilds[guildId])) data.guilds[guildId] = {};
    const guild = data.guilds[guildId];
    if (!guild.members || typeof guild.members !== "object" || Array.isArray(guild.members)) guild.members = {};
    return guild;
  }

  function getConfig(guildId) { return clone(normalizedConfig(guildData(read(), guildId).config)); }

  function updateConfig(guildId, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Ayar güncellemesi gerekli.");
    for (const key of Object.keys(patch)) {
      if (!Object.hasOwn(DEFAULT_CONFIG, key)) throw new TypeError(`Bilinmeyen seviye ayarı: ${key}`);
    }
    return mutate((data) => {
      const guild = guildData(data, guildId, true);
      guild.config = validateConfig({ ...normalizedConfig(guild.config), ...patch });
      return clone(guild.config);
    });
  }

  function getMember(guildId, userId) {
    validId(userId, "Kullanıcı");
    return normalizeMember(userId, guildData(read(), guildId).members?.[userId]);
  }

  function sortedMembers(guildId) {
    return Object.entries(guildData(read(), guildId).members || {})
      .filter(([userId, value]) => /^\d{17,20}$/.test(userId) && value && typeof value === "object")
      .map(([userId, value]) => normalizeMember(userId, value))
      .filter((member) => member.active && member.totalXp > 0)
      .sort((a, b) => b.totalXp - a.totalXp || a.userId.localeCompare(b.userId))
      .map((member, index) => ({ ...member, rank: index + 1 }));
  }

  function getLeaderboard(guildId, { page = 1, pageSize = 10 } = {}) {
    integer(pageSize, 1, 25, "Sayfa boyutu");
    integer(page, 1, Number.MAX_SAFE_INTEGER, "Sayfa");
    const entries = sortedMembers(guildId);
    const pages = Math.max(1, Math.ceil(entries.length / pageSize));
    const currentPage = Math.min(page, pages);
    return { entries: entries.slice((currentPage - 1) * pageSize, currentPage * pageSize), page: currentPage, pages, total: entries.length };
  }

  function getRank(guildId, userId) {
    validId(userId, "Kullanıcı");
    return sortedMembers(guildId).find((member) => member.userId === userId)?.rank ?? null;
  }

  function upsertReward(guildId, reward) {
    const validated = validateReward(reward);
    return mutate((data) => {
      const guild = guildData(data, guildId, true);
      const config = normalizedConfig(guild.config);
      config.rewards = config.rewards.filter((item) => item.roleId !== validated.roleId);
      config.rewards.push(validated);
      guild.config = validateConfig(config);
      return clone(guild.config);
    });
  }

  function removeReward(guildId, roleId) {
    validId(roleId, "Rol");
    return mutate((data) => {
      const guild = guildData(data, guildId, true);
      const config = normalizedConfig(guild.config);
      config.rewards = config.rewards.filter((reward) => reward.roleId !== roleId);
      guild.config = config;
      return clone(config);
    });
  }

  function eligible(raw, config, timestamp, messageId) {
    if (!config.enabled) return "disabled";
    if (raw.lastMessageId && BigInt(messageId) <= BigInt(raw.lastMessageId)) return "duplicate";
    if (raw.lastAwardAt !== null && timestamp - raw.lastAwardAt < config.cooldownSeconds * 1000) return "cooldown";
    if (raw.totalXp >= MAX_XP) return "max-xp";
    return null;
  }

  function awardMessage(guildId, userId, messageId) {
    validId(userId, "Kullanıcı");
    validId(messageId, "Mesaj");
    const timestamp = now();
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new RangeError("Geçersiz XP zamanı.");
    const existing = getMember(guildId, userId);
    const rejection = eligible(existing, getConfig(guildId), timestamp, messageId);
    if (rejection) return { awarded: false, reason: rejection, member: existing };
    return mutate((data) => {
      const guild = guildData(data, guildId, true);
      const config = normalizedConfig(guild.config);
      const previous = normalizeMember(userId, guild.members[userId]);
      const concurrentRejection = eligible(previous, config, timestamp, messageId);
      if (concurrentRejection) return { awarded: false, reason: concurrentRejection, member: previous };
      const sample = Math.min(0.999999999999, Math.max(0, Number(random()) || 0));
      const gainedXp = Math.min(MAX_XP - previous.totalXp, config.xpMin + Math.floor(sample * (config.xpMax - config.xpMin + 1)));
      guild.members[userId] = {
        totalXp: previous.totalXp + gainedXp, lastAwardAt: timestamp, lastMessageId: messageId,
        messageCount: Math.min(Number.MAX_SAFE_INTEGER, previous.messageCount + 1), active: true,
      };
      const member = normalizeMember(userId, guild.members[userId]);
      return { awarded: true, gainedXp, oldLevel: previous.level, levelChanged: member.level > previous.level, member };
    });
  }

  function setMemberActive(guildId, userId, active) {
    validId(userId, "Kullanıcı");
    if (typeof active !== "boolean") throw new TypeError("Üye durumu doğru/yanlış olmalı.");
    const existing = guildData(read(), guildId).members?.[userId];
    if (!existing || (existing.active !== false) === active) return false;
    return mutate((data) => {
      const member = guildData(data, guildId).members?.[userId];
      if (!member) return false;
      member.active = active;
      return true;
    });
  }

  return { getConfig, updateConfig, getMember, getLeaderboard, getRank, upsertReward, removeReward, awardMessage, setMemberActive };
}

module.exports = {
  ...createLevelStore(), createLevelStore, DEFAULT_CONFIG, DEFAULT_PATH,
  MAX_LEVEL, MAX_REWARDS, PLACEHOLDERS, validateConfig, validateMessageTemplate, validateReward,
};
