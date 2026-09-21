const fs = require("../Core/databaseFs");
const path = require("path");

const AYAR_DOSYASI = path.join(__dirname, "../../Database/Eğlence ve Etkileşim/burcAyar.json");

const BURCLAR = Object.freeze([
  Object.freeze({
    key: "koc",
    apiSign: "aries",
    name: "Koç",
    symbol: "♈",
    emojiAlias: "koc",
    element: "Ateş",
    planet: "Mars",
    motto: "Ben varım",
    color: 0xf43236,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_vARIES.jpg?w=1280",
  }),
  Object.freeze({
    key: "boga",
    apiSign: "taurus",
    name: "Boğa",
    symbol: "♉",
    emojiAlias: "boga",
    element: "Toprak",
    planet: "Venüs",
    motto: "Sahibim",
    color: 0x3f7d44,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_TAURUS.jpg?w=1280",
  }),
  Object.freeze({
    key: "ikizler",
    apiSign: "gemini",
    name: "İkizler",
    symbol: "♊",
    emojiAlias: "ikizler",
    element: "Hava",
    planet: "Merkür",
    motto: "Düşünüyorum",
    color: 0xfd8618,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_GEMINI.jpg?w=1280",
  }),
  Object.freeze({
    key: "yengec",
    apiSign: "cancer",
    name: "Yengeç",
    symbol: "♋",
    emojiAlias: "yengec",
    element: "Su",
    planet: "Ay",
    motto: "Hissediyorum",
    color: 0x08bbdb,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_CANCER.jpg?w=1280",
  }),
  Object.freeze({
    key: "aslan",
    apiSign: "leo",
    name: "Aslan",
    symbol: "♌",
    emojiAlias: "aslan",
    element: "Ateş",
    planet: "Güneş",
    motto: "Yaratıyorum",
    color: 0xffcf02,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_LEO.jpg?w=1280",
  }),
  Object.freeze({
    key: "basak",
    apiSign: "virgo",
    name: "Başak",
    symbol: "♍",
    emojiAlias: "basak",
    element: "Toprak",
    planet: "Merkür",
    motto: "İnceliyorum",
    color: 0xfeb4a0,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_VIRGO.jpg?w=1280",
  }),
  Object.freeze({
    key: "terazi",
    apiSign: "libra",
    name: "Terazi",
    symbol: "♎",
    emojiAlias: "terazi",
    element: "Hava",
    planet: "Venüs",
    motto: "Dengeliyorum",
    color: 0xfa2e7c,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_LIBRA.jpg?w=1280",
  }),
  Object.freeze({
    key: "akrep",
    apiSign: "scorpio",
    name: "Akrep",
    symbol: "♏",
    emojiAlias: "akrep",
    element: "Su",
    planet: "Plüton",
    motto: "Arzuluyorum",
    color: 0xc2162c,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_SCORPIO.jpg?w=1280",
  }),
  Object.freeze({
    key: "yay",
    apiSign: "sagittarius",
    name: "Yay",
    symbol: "♐",
    emojiAlias: "yay",
    element: "Ateş",
    planet: "Jüpiter",
    motto: "Görüyorum",
    color: 0x6726fd,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_SAGITTARIUS.jpg?w=1280",
  }),
  Object.freeze({
    key: "oglak",
    apiSign: "capricorn",
    name: "Oğlak",
    symbol: "♑",
    emojiAlias: "oglak",
    element: "Toprak",
    planet: "Satürn",
    motto: "Kullanıyorum",
    color: 0xb6aac3,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_CAPRICORN.jpg?w=1280",
  }),
  Object.freeze({
    key: "kova",
    apiSign: "aquarius",
    name: "Kova",
    symbol: "♒",
    emojiAlias: "kova",
    element: "Hava",
    planet: "Uranüs",
    motto: "Biliyorum",
    color: 0x65c7b4,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_AQUARIUS.jpg?w=1280",
  }),
  Object.freeze({
    key: "balik",
    apiSign: "pisces",
    name: "Balık",
    symbol: "♓",
    emojiAlias: "balik",
    element: "Su",
    planet: "Neptün",
    motto: "İnanıyorum",
    color: 0xa757af,
    image: "https://stylecaster.com/wp-content/uploads/2025/01/010825_Zodiac-Banners_3_PISCES.jpg?w=1280",
  }),
]);

const BURC_HARITASI = new Map(BURCLAR.map(burc => [burc.key, burc]));

function normalizeSnowflake(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^\d{16,22}$/.test(id) ? id : null;
}

function normalizeGuildSetting(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const roller = {};
  const allKeys = BURCLAR.map(burc => burc.key);
  const selectedKeys = Array.isArray(raw.gonderilecekBurclar)
    ? raw.gonderilecekBurclar
    : allKeys;
  const gonderilecekBurclar = [...new Set(selectedKeys)]
    .filter(key => BURC_HARITASI.has(key));

  for (const burc of BURCLAR) {
    const roleId = normalizeSnowflake(raw.roller?.[burc.key]);
    if (roleId) roller[burc.key] = roleId;
  }

  return {
    kanal: normalizeSnowflake(raw.kanal),
    gonderilecekBurclar,
    roller,
  };
}

function readBurcSettings() {
  if (!fs.existsSync(AYAR_DOSYASI)) return {};

  try {
    const raw = JSON.parse(fs.readFileSync(AYAR_DOSYASI, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    return Object.fromEntries(
      Object.entries(raw).map(([guildId, setting]) => [guildId, normalizeGuildSetting(setting)])
    );
  } catch (error) {
    console.error("🔴 [BURÇ] burcAyar.json okunamadı:", error);
    return {};
  }
}

function writeBurcSettings(settings) {
  fs.mkdirSync(path.dirname(AYAR_DOSYASI), { recursive: true });
  fs.writeFileSync(AYAR_DOSYASI, JSON.stringify(settings, null, 2), "utf8");
}

function getGuildBurcSetting(guildId) {
  return normalizeGuildSetting(readBurcSettings()[guildId]);
}

function updateGuildBurcSetting(guildId, updater) {
  const allSettings = readBurcSettings();
  const draft = getGuildBurcSettingFrom(allSettings, guildId);
  const updated = updater(draft) || draft;
  const normalized = normalizeGuildSetting(updated);

  allSettings[guildId] = normalized;
  writeBurcSettings(allSettings);
  return normalized;
}

function getGuildBurcSettingFrom(settings, guildId) {
  return normalizeGuildSetting(settings[guildId]);
}

function deleteGuildBurcSetting(guildId) {
  const allSettings = readBurcSettings();
  if (!Object.prototype.hasOwnProperty.call(allSettings, guildId)) return false;

  delete allSettings[guildId];
  writeBurcSettings(allSettings);
  return true;
}

function getBurc(key) {
  return BURC_HARITASI.get(key) || null;
}

module.exports = {
  AYAR_DOSYASI,
  BURCLAR,
  deleteGuildBurcSetting,
  getBurc,
  getGuildBurcSetting,
  getGuildBurcSettingFrom,
  normalizeGuildSetting,
  readBurcSettings,
  updateGuildBurcSetting,
  writeBurcSettings,
};
