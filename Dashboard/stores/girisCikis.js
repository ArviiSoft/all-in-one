const fs = require('../../Utils/Core/databaseFs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const dbPath = path.join(__dirname, '../../Database/Sunucu Yönetimi/girisCikis.json');

function loadDB() {
  if (!fs.existsSync(dbPath)) return {};
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); }
  catch (err) {
    console.error('🔴 [GİRİŞ-ÇIKIŞ] girisCikis.json okunurken hata:', err);
    return {};
  }
}

function saveDB(data) {
  const gecici = `${dbPath}.tmp-${randomUUID()}`;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(gecici, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(gecici, dbPath);
  } catch (err) {
    console.error('🔴 [GİRİŞ-ÇIKIŞ] girisCikis.json yazılırken hata:', err);
    throw err;
  } finally {
    if (fs.existsSync(gecici)) fs.unlinkSync(gecici);
  }
}

function ensureGuildConfig(data, guildId) {
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId].giris) data[guildId].giris = {};
  if (!data[guildId].cikis) data[guildId].cikis = {};
  return data[guildId];
}

function readGuildConfig(guildId) {
  return loadDB()[guildId] || { giris: {}, cikis: {} };
}

function updateGuildConfig(guildId, updater) {
  const data = loadDB();
  const config = ensureGuildConfig(data, guildId);
  updater(config, data);
  saveDB(data);
  return data[guildId] || { giris: {}, cikis: {} };
}

module.exports = { loadDB, saveDB, ensureGuildConfig, readGuildConfig, updateGuildConfig };
