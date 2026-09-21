const fs = require("../Core/databaseFs");
const path = require("path");
const emojiler = require("../Emojis/emojiler.js");

const DATA_PATH = path.join(__dirname, "../../Database/Sunucu Yönetimi/iceriklereEmoji.json");
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
  if (rawSetting === true) {
    return { enabled: true, emojis: uniqueEmojis(null, fallbackEmojis) };
  }

  if (!rawSetting || typeof rawSetting !== "object" || Array.isArray(rawSetting)) {
    return { enabled: false, emojis: uniqueEmojis(null, fallbackEmojis) };
  }

  let enabled = true;
  if (typeof rawSetting.enabled === "boolean") enabled = rawSetting.enabled;
  else if (typeof rawSetting.aktif === "boolean") enabled = rawSetting.aktif;
  else if (typeof rawSetting.status === "boolean") enabled = rawSetting.status;

  return {
    enabled,
    emojis: uniqueEmojis(rawSetting.emojis, fallbackEmojis),
  };
}

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [MEDYALARA EMOJİ] iceriklereEmoji.json okunamadı:", error);
    return {};
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function settingKey(type, channelId) {
  return `${type}_${channelId}`;
}

function getSetting(data, type, channelId, fallbackEmojis = getDefaultEmojis()) {
  return normalizeSetting(data[settingKey(type, channelId)], fallbackEmojis);
}

function setSetting(data, type, channelId, setting, fallbackEmojis = getDefaultEmojis()) {
  const normalized = normalizeSetting(setting, fallbackEmojis);
  data[settingKey(type, channelId)] = normalized;
  return normalized;
}

function deleteSetting(data, type, channelId) {
  return delete data[settingKey(type, channelId)];
}

module.exports = {
  MAX_EMOJIS,
  deleteSetting,
  getDefaultEmojis,
  getSetting,
  loadData,
  normalizeSetting,
  saveData,
  setSetting,
  uniqueEmojis,
};
