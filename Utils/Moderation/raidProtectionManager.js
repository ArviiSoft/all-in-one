const path = require("path");
const { readJson, writeJson } = require("../Core/fileDB");

const DB_PATH = path.join(process.cwd(), "Database", "Güvenlik ve Moderasyon", "raidKoruma.json");

const RAID_ACTIONS = Object.freeze({
  LOG: "log",
  KICK: "kick",
  BAN: "ban",
});

const RAID_ACTION_LABELS = Object.freeze({
  [RAID_ACTIONS.LOG]: "Sadece logla",
  [RAID_ACTIONS.KICK]: "Sunucudan at",
  [RAID_ACTIONS.BAN]: "Banla",
});

const DEFAULT_RAID_CONFIG = Object.freeze({
  enabled: false,
  logChannelId: null,
  threshold: 5,
  windowSeconds: 60,
  action: RAID_ACTIONS.LOG,
  minimumAccountAgeDays: 7,
});

class RaidProtectionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "RaidProtectionConfigError";
  }
}

function parseInteger(value, label, minimum, maximum) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RaidProtectionConfigError(
      `${label} ${minimum} ile ${maximum} arasında bir tam sayı olmalı.`,
    );
  }
  return parsed;
}

function normalizeLogChannelId(value) {
  if (value === null || value === undefined || value === "") return null;
  const channelId = String(value);
  if (!/^\d{16,22}$/.test(channelId)) {
    throw new RaidProtectionConfigError("Geçerli bir raid log kanalı seçmelisin.");
  }
  return channelId;
}

function normalizeRaidConfig(config = {}) {
  const action = config.action ?? DEFAULT_RAID_CONFIG.action;
  if (!Object.values(RAID_ACTIONS).includes(action)) {
    throw new RaidProtectionConfigError("Raid cezası log, kick veya ban olmalı.");
  }

  const normalized = {
    enabled: config.enabled === true,
    logChannelId: normalizeLogChannelId(config.logChannelId),
    threshold: parseInteger(
      config.threshold ?? DEFAULT_RAID_CONFIG.threshold,
      "Raid eşiği",
      3,
      50,
    ),
    windowSeconds: parseInteger(
      config.windowSeconds ?? DEFAULT_RAID_CONFIG.windowSeconds,
      "Kontrol süresi",
      10,
      600,
    ),
    action,
    minimumAccountAgeDays: parseInteger(
      config.minimumAccountAgeDays ?? DEFAULT_RAID_CONFIG.minimumAccountAgeDays,
      "Minimum hesap yaşı",
      0,
      365,
    ),
  };

  if (normalized.enabled && !normalized.logChannelId) {
    throw new RaidProtectionConfigError(
      "Raid korumasını açmadan önce bir log kanalı seçmelisin.",
    );
  }

  return normalized;
}

function getRaidConfig(guildId) {
  const data = readJson(DB_PATH, {});
  const storedConfig = data[String(guildId)];
  if (!storedConfig) return null;

  try {
    return {
      ...normalizeRaidConfig(storedConfig),
      updatedAt: storedConfig.updatedAt,
    };
  } catch (error) {
    console.error(`🔴 [RAID KORUMA AYARI GEÇERSİZ] Sunucu: ${guildId}`, error);
    return null;
  }
}

function updateRaidConfig(guildId, patch = {}) {
  const data = readJson(DB_PATH, {});
  const storedConfig = data[String(guildId)] || {};
  const config = normalizeRaidConfig({
    ...DEFAULT_RAID_CONFIG,
    ...storedConfig,
    ...patch,
  });

  const updatedConfig = {
    ...storedConfig,
    ...config,
    updatedAt: Date.now(),
  };
  data[String(guildId)] = updatedConfig;
  writeJson(DB_PATH, data);
  return updatedConfig;
}

function setRaidEnabled(guildId, enabled) {
  return updateRaidConfig(guildId, { enabled: enabled === true });
}

function formatRaidProtectionError(error) {
  if (error instanceof RaidProtectionConfigError) return error.message;
  return "Raid koruma ayarları kaydedilemedi. Kanal ve bot izinlerini kontrol et.";
}

module.exports = {
  DB_PATH,
  DEFAULT_RAID_CONFIG,
  RAID_ACTIONS,
  RAID_ACTION_LABELS,
  RaidProtectionConfigError,
  formatRaidProtectionError,
  getRaidConfig,
  normalizeRaidConfig,
  setRaidEnabled,
  updateRaidConfig,
};
