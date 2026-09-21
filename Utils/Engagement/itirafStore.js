const path = require("path");
const { createJsonStore } = require("../Core/safeJsonStore");

const DB_PATH = path.join(
  __dirname,
  "../../Database/Eğlence ve Etkileşim/itirafAyar.json"
);
const store = createJsonStore(DB_PATH);

const DEFAULT_MINIMUM_CHARACTERS = 10;
const MINIMUM_CHARACTERS_LIMIT = 500;

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

function normalizeSetting(rawSetting = {}) {
  const raw = rawSetting && typeof rawSetting === "object" && !Array.isArray(rawSetting)
    ? rawSetting
    : {};
  const parsedMinimum = Number(raw.minimumKarakter);

  return {
    aktif: raw.aktif !== false,
    itirafKanal: isSnowflake(raw.itirafKanal) ? raw.itirafKanal : null,
    logKanal: isSnowflake(raw.logKanal) ? raw.logKanal : null,
    minimumKarakter: Number.isInteger(parsedMinimum)
      && parsedMinimum >= 1
      && parsedMinimum <= MINIMUM_CHARACTERS_LIMIT
      ? parsedMinimum
      : DEFAULT_MINIMUM_CHARACTERS,
    tepkiler: raw.tepkiler !== false,
  };
}

function getGuildItirafSetting(guildId) {
  const rawSetting = store.get(guildId);
  return rawSetting ? normalizeSetting(rawSetting) : null;
}

function updateGuildItirafSetting(guildId, updater) {
  let nextSetting;

  store.update(data => {
    const draft = normalizeSetting(data[guildId]);
    updater(draft);
    nextSetting = normalizeSetting(draft);
    data[guildId] = nextSetting;
  });

  return nextSetting;
}

function deleteGuildItirafSetting(guildId) {
  store.delete(guildId);
}

module.exports = {
  DEFAULT_MINIMUM_CHARACTERS,
  MINIMUM_CHARACTERS_LIMIT,
  deleteGuildItirafSetting,
  getGuildItirafSetting,
  updateGuildItirafSetting,
};