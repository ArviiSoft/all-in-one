"use strict";

const path = require("path");
const { createJsonStore } = require("../Core/safeJsonStore.js");

const DB_PATH = path.join(
  __dirname,
  "../../Database/Sunucu Yönetimi/yetkiliBasvuru.json"
);
const store = createJsonStore(DB_PATH);
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

function snowflakeOrNull(value) {
  const normalized = String(value || "");
  return SNOWFLAKE_PATTERN.test(normalized) ? normalized : null;
}

function imageUrlOrNull(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 2048) return null;

  try {
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function snowflakeArray(value, legacyValue = null) {
  const values = Array.isArray(value) ? value : [];
  const normalized = [...new Set(values.map(snowflakeOrNull).filter(Boolean))].slice(0, 10);
  const legacyRole = snowflakeOrNull(legacyValue);

  if (normalized.length === 0 && legacyRole) normalized.push(legacyRole);
  return normalized;
}

function normalizeGuildConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const ornekFormResim = imageUrlOrNull(source.ornekFormResim);

  return {
    basvuruKanal: snowflakeOrNull(source.basvuruKanal),
    logKanal: snowflakeOrNull(source.logKanal),
    yetkiliRoller: snowflakeArray(source.yetkiliRoller, source.yetkiliRol),
    yetkiliKanal: snowflakeOrNull(source.yetkiliKanal),
    ornekFormAktif: Boolean(source.ornekFormAktif && ornekFormResim),
    ornekFormResim,
    basvuruMesaj: snowflakeOrNull(source.basvuruMesaj),
    basvuruMesajKanal: snowflakeOrNull(source.basvuruMesajKanal),
  };
}

function serializeGuildConfig(value) {
  const config = normalizeGuildConfig(value);
  const serialized = {};

  for (const field of [
    "basvuruKanal",
    "logKanal",
    "yetkiliKanal",
    "ornekFormResim",
    "basvuruMesaj",
    "basvuruMesajKanal",
  ]) {
    if (config[field]) serialized[field] = config[field];
  }

  if (config.yetkiliRoller.length > 0) {
    serialized.yetkiliRoller = [...config.yetkiliRoller];
  }

  if (config.ornekFormAktif) serialized.ornekFormAktif = true;
  return serialized;
}

function getGuildConfig(guildId) {
  return normalizeGuildConfig(store.get(String(guildId)));
}

function updateGuildConfig(guildId, updater) {
  if (typeof updater !== "function") {
    throw new TypeError("Yetkili başvuru ayarını güncellemek için bir fonksiyon gerekli.");
  }

  const key = String(guildId);
  return store.update(data => {
    const draft = normalizeGuildConfig(data[key]);
    const result = updater(draft);
    const next = normalizeGuildConfig(result === undefined ? draft : result);
    const serialized = serializeGuildConfig(next);

    const preserved = { ...data[key] };
    for (const field of [...Object.keys(normalizeGuildConfig({})), 'yetkiliRol']) delete preserved[field];
    Object.assign(preserved, serialized);
    if (Object.keys(preserved).length === 0) delete data[key];
    else data[key] = preserved;

    return next;
  });
}

function clearGuildConfig(guildId) {
  const key = String(guildId);
  let existed = false;

  store.update(data => {
    existed = Object.prototype.hasOwnProperty.call(data, key);
    delete data[key];
  });

  return existed;
}

module.exports = {
  DB_PATH,
  clearGuildConfig,
  getGuildConfig,
  imageUrlOrNull,
  normalizeGuildConfig,
  updateGuildConfig,
};