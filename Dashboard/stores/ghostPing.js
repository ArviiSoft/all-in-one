const fs = require("../../Utils/Core/databaseFs");
const path = require("node:path");
const { atomikYaz } = require("./atomik");
const dbPath = path.resolve(__dirname, "../../Database/Güvenlik ve Moderasyon/girisPing.json");
const SETTINGS_KEY = "_ayarlar";
const DEFAULT_TAG_DURATION = 1000;
const MIN_TAG_DURATION = 500;
const MAX_TAG_DURATION = 60000;
function loadDB() {
  try {
    if (!fs.existsSync(dbPath)) return {};
    const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [GHOST PING] girisPing.json okunamadı:", error);
    return {};
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  atomikYaz(dbPath, data);
}

function getGuildChannelIds(data, guildId) {
  if (!Array.isArray(data[guildId])) return [];
  return [...new Set(data[guildId].filter(id => /^\d{17,20}$/.test(String(id))))];
}

function getTagDuration(data, guildId) {
  const duration = Number(data[SETTINGS_KEY]?.[guildId]?.etiketSuresi);
  if (!Number.isFinite(duration) || duration < MIN_TAG_DURATION || duration > MAX_TAG_DURATION) {
    return DEFAULT_TAG_DURATION;
  }
  return Math.round(duration);
}

function setTagDuration(data, guildId, duration) {
  if (!data[SETTINGS_KEY] || typeof data[SETTINGS_KEY] !== "object" || Array.isArray(data[SETTINGS_KEY])) {
    data[SETTINGS_KEY] = {};
  }

  const currentSettings = data[SETTINGS_KEY][guildId];
  data[SETTINGS_KEY][guildId] = {
    ...(currentSettings && typeof currentSettings === "object" ? currentSettings : {}),
    etiketSuresi: duration,
  };
}


module.exports = { loadDB, saveDB, getGuildChannelIds, getTagDuration, setTagDuration };
