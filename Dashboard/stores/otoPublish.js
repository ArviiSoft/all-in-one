const fs = require("../../Utils/Core/databaseFs");
const path = require("node:path");
const { atomikYaz } = require("./atomik");
const dbPath = path.resolve(__dirname, "../../Database/Sunucu Yönetimi/otoPublish.json");
function loadDB() {
  try {
    if (!fs.existsSync(dbPath)) return {};
    const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [OTO PUBLISH] otoPublish.json okunamadı:", error);
    return {};
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  atomikYaz(dbPath, data);
}

function getGuildChannelIds(data, guildId) {
  if (!Array.isArray(data[guildId])) return [];

  return [...new Set(
    data[guildId]
      .map(String)
      .filter(channelId => /^\d{17,20}$/.test(channelId))
  )];
}

function setGuildChannelIds(data, guildId, channelIds) {
  const uniqueChannelIds = [...new Set(channelIds.map(String))];

  if (uniqueChannelIds.length === 0) {
    delete data[guildId];
  } else {
    data[guildId] = uniqueChannelIds;
  }
}


module.exports = { loadDB, saveDB, getGuildChannelIds, setGuildChannelIds };
