const fs = require("../../Utils/Core/databaseFs");
const path = require("node:path");
const { atomikYaz } = require("./atomik");
const filePath = path.join(__dirname, "../../Database/Sunucu Yönetimi/otoThread.json");
const ARCHIVE_DURATIONS = [60,1440,4320,10080].map(value=>({value}));
const DEFAULT_SETTING = {isim:"Yeni Thread",süre:1440,sebep:"Belirtilmedi",botlar:false};
function readData() {
  if (!fs.existsSync(filePath)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [OTOMATİK THREAD] otoThread.json okunurken hata:", error);
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomikYaz(filePath, data);
}

function hasSetting(data, guildId, channelId) {
  return Object.prototype.hasOwnProperty.call(data[guildId] || {}, channelId);
}

function normalizeSetting(setting = {}) {
  const rawSetting = setting && typeof setting === "object" && !Array.isArray(setting)
    ? setting
    : {};
  const isim = typeof rawSetting.isim === "string" && rawSetting.isim.trim()
    ? rawSetting.isim.trim().slice(0, 100)
    : DEFAULT_SETTING.isim;
  const süre = ARCHIVE_DURATIONS.some(duration => duration.value === rawSetting.süre)
    ? rawSetting.süre
    : DEFAULT_SETTING.süre;
  const sebep = typeof rawSetting.sebep === "string" && rawSetting.sebep.trim()
    ? rawSetting.sebep.trim().slice(0, 512)
    : DEFAULT_SETTING.sebep;

  return {
    isim,
    süre,
    sebep,
    botlar: rawSetting.botlar === true,
  };
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


module.exports = { readData, writeData, hasSetting, normalizeSetting, getSetting, setSetting, updateSetting, deleteSetting };
