const fs = require("../Core/databaseFs");
const path = require("path");

const filePath = path.join(__dirname, "../../Database/Sunucu Yönetimi/süreliMesaj.json");
const MIN_DURATION = 5_000;
const MONTH_DURATION = 30 * 24 * 60 * 60 * 1_000;
const YEAR_DURATION = 365 * 24 * 60 * 60 * 1_000;
const MAX_DURATION = 10 * YEAR_DURATION;

function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return null;

  const roundedDuration = Math.round(duration);
  if (roundedDuration < MIN_DURATION || roundedDuration > MAX_DURATION) return null;
  return roundedDuration;
}

function normalizeSetting(setting = {}) {
  const rawSetting = setting && typeof setting === "object" && !Array.isArray(setting)
    ? setting
    : {};
  const message = typeof rawSetting.mesaj === "string" && rawSetting.mesaj.trim()
    ? rawSetting.mesaj.trim().slice(0, 2_000)
    : null;
  const nextSendAt = Number(rawSetting.sonrakiGönderim);

  return {
    mesaj: message,
    süre: normalizeDuration(rawSetting.süre),
    sonrakiGönderim: Number.isFinite(nextSendAt) && nextSendAt > 0
      ? Math.round(nextSendAt)
      : null,
  };
}

function normalizeData(rawData) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return {};

  const normalizedData = {};

  for (const [guildId, rawGuildSettings] of Object.entries(rawData)) {
    if (!rawGuildSettings || typeof rawGuildSettings !== "object" || Array.isArray(rawGuildSettings)) {
      continue;
    }

    const guildSettings = {};

    if (typeof rawGuildSettings.kanalID === "string") {
      guildSettings[rawGuildSettings.kanalID] = normalizeSetting(rawGuildSettings);
    } else {
      for (const [channelId, rawSetting] of Object.entries(rawGuildSettings)) {
        if (!/^\d{17,20}$/.test(channelId)) continue;
        guildSettings[channelId] = normalizeSetting(rawSetting);
      }
    }

    if (Object.keys(guildSettings).length > 0) normalizedData[guildId] = guildSettings;
  }

  return normalizedData;
}

function readData() {
  if (!fs.existsSync(filePath)) return {};

  try {
    return normalizeData(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch (error) {
    console.error("🔴 [SÜRELİ MESAJ] süreliMesaj.json okunurken hata:", error);
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeData(data), null, 2), "utf-8");
}

function hasSetting(data, guildId, channelId) {
  return Object.prototype.hasOwnProperty.call(data[guildId] || {}, channelId);
}

function getSetting(data, guildId, channelId) {
  return normalizeSetting(data[guildId]?.[channelId]);
}

function setSetting(data, guildId, channelId, setting) {
  if (!data[guildId] || typeof data[guildId] !== "object" || Array.isArray(data[guildId])) {
    data[guildId] = {};
  }

  data[guildId][channelId] = normalizeSetting(setting);
}

function updateSetting(guildId, channelId, updater) {
  const data = readData();
  const setting = getSetting(data, guildId, channelId);
  updater(setting);
  setSetting(data, guildId, channelId, setting);
  writeData(data);
  return getSetting(data, guildId, channelId);
}

function deleteSetting(data, guildId, channelId) {
  if (!hasSetting(data, guildId, channelId)) return false;

  delete data[guildId][channelId];
  if (Object.keys(data[guildId]).length === 0) delete data[guildId];
  return true;
}

function isCompleteSetting(setting) {
  const normalizedSetting = normalizeSetting(setting);
  return Boolean(normalizedSetting.mesaj && normalizedSetting.süre);
}

function parseDuration(text) {
  const normalizedText = String(text || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(",", ".");
  const match = normalizedText.match(
    /^(\d+(?:\.\d+)?)\s*(milisaniye|ms|saniye|sn|s|dakika|dk|saat|sa|gün|gun|hafta|hf|ay|yıl|yil|sene)?$/i
  );

  if (!match) return NaN;

  const value = Number(match[1]);
  const unit = match[2] || "ms";
  const multipliers = {
    milisaniye: 1,
    ms: 1,
    saniye: 1_000,
    sn: 1_000,
    s: 1_000,
    dakika: 60_000,
    dk: 60_000,
    saat: 3_600_000,
    sa: 3_600_000,
    gün: 86_400_000,
    gun: 86_400_000,
    hafta: 604_800_000,
    hf: 604_800_000,
    ay: MONTH_DURATION,
    yıl: YEAR_DURATION,
    yil: YEAR_DURATION,
    sene: YEAR_DURATION,
  };

  const duration = Math.round(value * multipliers[unit]);
  return normalizeDuration(duration) ?? NaN;
}

function formatDuration(value) {
  let remaining = normalizeDuration(value);
  if (!remaining) return "Ayarlanmadı";

  const units = [
    [YEAR_DURATION, "yıl"],
    [MONTH_DURATION, "ay"],
    [604_800_000, "hafta"],
    [86_400_000, "gün"],
    [3_600_000, "saat"],
    [60_000, "dakika"],
    [1_000, "saniye"],
    [1, "ms"],
  ];
  const parts = [];

  for (const [unitDuration, label] of units) {
    const amount = Math.floor(remaining / unitDuration);
    if (amount === 0) continue;
    parts.push(`${amount} ${label}`);
    remaining -= amount * unitDuration;
  }

  return parts.join(" ");
}

module.exports = {
  MAX_DURATION,
  MIN_DURATION,
  MONTH_DURATION,
  YEAR_DURATION,
  deleteSetting,
  filePath,
  formatDuration,
  getSetting,
  hasSetting,
  isCompleteSetting,
  normalizeSetting,
  parseDuration,
  readData,
  setSetting,
  updateSetting,
  writeData,
};
