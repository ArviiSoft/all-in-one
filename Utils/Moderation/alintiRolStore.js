const fs = require("../Core/databaseFs");
const path = require("path");

const dataPath = path.join(__dirname, "../../Database/Sunucu Yönetimi/alintiRol.json");
const accountTypes = new Set(["users", "bots", "both"]);

function readData() {
  if (!fs.existsSync(dataPath)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [ALINTI ROL] Veritabanı okunamadı:", error);
    return {};
  }
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeSetting(setting, channelId) {
  if (!setting || typeof setting !== "object" || Array.isArray(setting)) return null;

  const rawRoleIds = setting.roleIds
    || setting.roles
    || setting.roller
    || (setting.rol ? [setting.rol] : []);
  const roleIds = [...new Set(
    (Array.isArray(rawRoleIds) ? rawRoleIds : [rawRoleIds])
      .filter(Boolean)
      .map(String)
  )].slice(0, 10);

  if (roleIds.length === 0) return null;

  let accountType = setting.accountType || setting.hesapTuru;
  if (!accountTypes.has(accountType)) {
    accountType = setting.includeBots === true ? "both" : "users";
  }

  return {
    channelId: String(setting.channelId || setting.kanal || channelId),
    accountType,
    roleIds
  };
}

function getGuildSettings(guildId) {
  const guildData = readData()[String(guildId)];
  if (!guildData || typeof guildData !== "object" || Array.isArray(guildData)) return {};

  return Object.fromEntries(
    Object.entries(guildData)
      .map(([channelId, setting]) => [String(channelId), normalizeSetting(setting, channelId)])
      .filter(([, setting]) => Boolean(setting))
  );
}

function getChannelSetting(guildId, channelId) {
  return getGuildSettings(guildId)[String(channelId)] || null;
}

function saveChannelSetting(guildId, channelId, setting) {
  const normalized = normalizeSetting(setting, channelId);
  if (!normalized) throw new Error("Alıntı rol ayarı en az bir rol içermelidir.");

  const data = readData();
  const guildKey = String(guildId);
  const channelKey = String(channelId);
  if (!data[guildKey] || typeof data[guildKey] !== "object" || Array.isArray(data[guildKey])) {
    data[guildKey] = {};
  }

  data[guildKey][channelKey] = normalized;
  writeData(data);
  return normalized;
}

function removeChannelSetting(guildId, channelId) {
  const data = readData();
  const guildKey = String(guildId);
  const channelKey = String(channelId);
  if (!data[guildKey]?.[channelKey]) return false;

  delete data[guildKey][channelKey];
  if (Object.keys(data[guildKey]).length === 0) delete data[guildKey];
  writeData(data);
  return true;
}

function acceptsAuthor(accountType, isBotOrWebhook) {
  if (accountType === "both") return true;
  if (accountType === "bots") return isBotOrWebhook;
  return !isBotOrWebhook;
}

module.exports = {
  acceptsAuthor,
  getChannelSetting,
  getGuildSettings,
  normalizeSetting,
  removeChannelSetting,
  saveChannelSetting
};
