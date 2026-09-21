const fs = require("../Core/databaseFs");
const path = require("path");

const setupPath = path.join(__dirname, "../../Database/Abonelik/aboneSetup.json");
const trackingPath = path.join(__dirname, "../../Database/Abonelik/aboneTakip.json");

const DEFAULT_VIDEO_TEXT = [
  "**`{kanal}`** yeni bir video **paylaştı.**",
  "> {video_link}",
  "",
  "-# {rol}",
].join("\n");

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    console.error(`🔴 [ABONE DB] ${path.basename(filePath)} okunamadı:`, error);
    return {};
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeYoutubeSetting(value = {}) {
  return {
    ...value,
    aktif: Boolean(value.aktif),
    kaynakKanallar: Array.isArray(value.kaynakKanallar)
      ? value.kaynakKanallar.map(String).map(item => item.trim()).filter(Boolean)
      : [],
    bildirimKanal: value.bildirimKanal || null,
    bildirimRol: value.bildirimRol || null,
    webhookUrl: value.webhookUrl || value.webhook || null,
    webhookName: value.webhookName || "YouTube",
    webhookAvatar: value.webhookAvatar || null,
    videoMetni: value.videoMetni || DEFAULT_VIDEO_TEXT,
    sonVideoId: value.sonVideoId || null,
    sonVideoUrl: value.sonVideoUrl || null,
    sonVideoBaslik: value.sonVideoBaslik || null,
    sonVideoKanal: value.sonVideoKanal || null,
    sonVideoPublished: value.sonVideoPublished || null,
  };
}

function normalizeGuildSetting(value = {}) {
  return {
    ...value,
    kanal: value.kanal || null,
    yetkili: value.yetkili || null,
    rol: value.rol || null,
    logKanal: value.logKanal || null,
    kontrolMesaj: value.kontrolMesaj || null,
    youtube: normalizeYoutubeSetting(value.youtube),
  };
}

function readSetup() {
  return readJson(setupPath);
}

function writeSetup(data) {
  writeJson(setupPath, data);
}

function getGuildSetting(guildId) {
  return normalizeGuildSetting(readSetup()[guildId]);
}

function getAllGuildSettings() {
  const data = readSetup();
  return Object.fromEntries(
    Object.entries(data).map(([guildId, setting]) => [guildId, normalizeGuildSetting(setting)])
  );
}

function updateGuildSetting(guildId, updater) {
  const data = readSetup();
  const draft = normalizeGuildSetting(data[guildId]);
  updater(draft);
  data[guildId] = normalizeGuildSetting(draft);
  writeSetup(data);
  return data[guildId];
}

function deleteGuildSetting(guildId) {
  const data = readSetup();
  delete data[guildId];
  writeSetup(data);
}

function readTracking() {
  return readJson(trackingPath);
}

function writeTracking(data) {
  writeJson(trackingPath, data);
}

function getTrackingRecord(guildId, userId) {
  return readTracking()[guildId]?.[userId] || null;
}

function saveTrackingRecord(record) {
  const data = readTracking();
  if (!data[record.guildId]) data[record.guildId] = {};
  data[record.guildId][record.userId] = record;
  writeTracking(data);
  return record;
}

function updateTrackingRecord(guildId, userId, updater) {
  const data = readTracking();
  const record = data[guildId]?.[userId];
  if (!record) return null;
  updater(record);
  writeTracking(data);
  return record;
}

function resetTrackingGuild(guildId) {
  const data = readTracking();
  delete data[guildId];
  writeTracking(data);
}

module.exports = {
  DEFAULT_VIDEO_TEXT,
  deleteGuildSetting,
  getAllGuildSettings,
  getGuildSetting,
  getTrackingRecord,
  normalizeGuildSetting,
  readSetup,
  readTracking,
  resetTrackingGuild,
  saveTrackingRecord,
  updateGuildSetting,
  updateTrackingRecord,
  writeSetup,
  writeTracking,
};
