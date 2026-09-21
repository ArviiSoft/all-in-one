const fs = require("../../Utils/Core/databaseFs");
const path = require("node:path");
const { atomikYaz } = require("./atomik");
const DB_PATH = path.join(__dirname, '../../Database/Sunucu Yönetimi/durumRol.json');
function readDB() {
    if (!fs.existsSync(DB_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (error) {
        console.error('🔴 [DURUM ROL] Veritabanı okunamadı:', error);
        return {};
    }
}

function writeDB(data) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    atomikYaz(DB_PATH, data);
}

function guildConfig(guildId) {
    const config = readDB()[guildId] || {};
    return {
        tag: typeof config.tag === 'string' && config.tag.trim() ? config.tag : null,
        rolId: config.rolId || null,
        logId: config.logId || null,
    };
}

function updateGuildConfig(guildId, updater) {
    const data = readDB();
    if (!data[guildId] || typeof data[guildId] !== 'object') data[guildId] = {};
    updater(data[guildId]);
    writeDB(data);
    return data[guildId];
}


module.exports = { readDB, writeDB, guildConfig, updateGuildConfig };
