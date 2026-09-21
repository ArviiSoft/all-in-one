const fs = require("../Core/databaseFs");
const path = require("path");
const emojiler = require("../Emojis/emojiler.js");

const DATA_PATH = path.join(__dirname, "../../Database/Sunucu Yönetimi/mesajaEmoji.json");
const MAX_EMOJIS = 10;

function uniqueEmojis(values, fallback = []) {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;
  const unique = [];

  for (const value of source) {
    const emoji = String(value || "").trim();
    if (!emoji || unique.includes(emoji)) continue;
    unique.push(emoji);
    if (unique.length === MAX_EMOJIS) break;
  }

  return unique;
}

function getDefaultEmojis() {
  return uniqueEmojis([
    String(emojiler.getReactionEmoji("UpVote", "👍")),
    String(emojiler.getReactionEmoji("DisVote", "👎")),
  ], ["👍", "👎"]);
}

function normalizeSetting(rawSetting, fallbackEmojis = getDefaultEmojis()) {
  if (!rawSetting || typeof rawSetting !== "object" || Array.isArray(rawSetting)) {
    return {
      enabled: false,
      emojis: uniqueEmojis(null, fallbackEmojis),
      includeBots: false,
    };
  }

  return {
    enabled: typeof rawSetting.enabled === "boolean" ? rawSetting.enabled : true,
    emojis: uniqueEmojis(rawSetting.emojis, fallbackEmojis),
    includeBots: rawSetting.includeBots === true,
  };
}

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [MESAJA EMOJİ] mesajaEmoji.json okunamadı:", error);
    return {};
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function hasSetting(data, channelId) {
  return Object.prototype.hasOwnProperty.call(data, channelId);
}

function getSetting(data, channelId, fallbackEmojis = getDefaultEmojis()) {
  return normalizeSetting(data[channelId], fallbackEmojis);
}

function setSetting(data, channelId, setting, fallbackEmojis = getDefaultEmojis()) {
  const normalized = normalizeSetting(setting, fallbackEmojis);
  data[channelId] = normalized;
  return normalized;
}

function deleteSetting(data, channelId) {
  return delete data[channelId];
}

module.exports = {
  MAX_EMOJIS,
  deleteSetting,
  getDefaultEmojis,
  getSetting,
  hasSetting,
  loadData,
  normalizeSetting,
  saveData,
  setSetting,
  uniqueEmojis,
};
