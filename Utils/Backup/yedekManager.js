const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const YEDEK_KLASORU = path.join(__dirname, "../../Database/Yedekler/Sunucu Yedekleri");
const ESKI_YEDEK_KLASORU = path.join(__dirname, "../../Commands/Yedek/Sunucu Yedekleri");
const DEFAULT_YEDEK_PLANI = Object.freeze({
  timeZone: "Europe/Istanbul",
  hour: 21,
  minute: 0,
});

function dosyaTasi(sourcePath, destinationPath) {
  try {
    fs.renameSync(sourcePath, destinationPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(sourcePath);
  }
}

function eskiYedekleriTasi() {
  if (!fs.existsSync(ESKI_YEDEK_KLASORU)) return { moved: 0, skipped: 0 };

  let moved = 0;
  let skipped = 0;

  for (const entry of fs.readdirSync(ESKI_YEDEK_KLASORU, { withFileTypes: true })) {
    if (!entry.isFile()) {
      skipped += 1;
      continue;
    }

    const sourcePath = path.join(ESKI_YEDEK_KLASORU, entry.name);
    const destinationPath = path.join(YEDEK_KLASORU, entry.name);

    if (fs.existsSync(destinationPath)) {
      skipped += 1;
      continue;
    }

    try {
      dosyaTasi(sourcePath, destinationPath);
      moved += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`⚠️ [YEDEK SİSTEMİ] ${entry.name} yeni klasöre taşınamadı: ${error.message}`);
    }
  }

  try {
    if (fs.readdirSync(ESKI_YEDEK_KLASORU).length === 0) {
      fs.rmdirSync(ESKI_YEDEK_KLASORU);
    }
  } catch (error) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] Eski boş yedek klasörü kaldırılamadı: ${error.message}`);
  }

  if (moved > 0) {
    console.log(`♻️ [YEDEK SİSTEMİ] ${moved} eski yedek Database/Yedekler/Sunucu Yedekleri klasörüne taşındı.`);
  }

  return { moved, skipped };
}

function yedekKlasorunuHazirla() {
  fs.mkdirSync(YEDEK_KLASORU, { recursive: true });
  return YEDEK_KLASORU;
}

yedekKlasorunuHazirla();
eskiYedekleriTasi();

function yedekDosyaYolu(id) {
  return path.join(YEDEK_KLASORU, `${id}.yaml`);
}

function yedekPlanYolu(guildId) {
  return path.join(YEDEK_KLASORU, `${guildId}_plan.yaml`);
}

function formatYedekSaati(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeYedekPlani(data = {}) {
  const timeMatch = typeof data?.saat === "string"
    ? data.saat.match(/^(\d{2}):(\d{2})$/)
    : null;
  const hour = timeMatch ? Number(timeMatch[1]) : Number(data?.hour);
  const minute = timeMatch ? Number(timeMatch[2]) : Number(data?.minute);
  const validTime = Number.isInteger(hour)
    && hour >= 0
    && hour <= 23
    && Number.isInteger(minute)
    && minute >= 0
    && minute <= 59;

  return {
    timeZone: typeof data?.saatDilimi === "string" && data.saatDilimi
      ? data.saatDilimi
      : DEFAULT_YEDEK_PLANI.timeZone,
    hour: validTime ? hour : DEFAULT_YEDEK_PLANI.hour,
    minute: validTime ? minute : DEFAULT_YEDEK_PLANI.minute,
  };
}

function yedekPlaniniOku(guildId) {
  const filePath = yedekPlanYolu(guildId);
  if (!fs.existsSync(filePath)) return { ...DEFAULT_YEDEK_PLANI };

  try {
    return normalizeYedekPlani(yaml.load(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] ${guildId} çalışma planı okunamadı: ${error.message}`);
    return { ...DEFAULT_YEDEK_PLANI };
  }
}

function yedekPlaniniKaydet(guildId, { hour, minute }) {
  const plan = normalizeYedekPlani({ hour, minute });
  const filePath = yedekPlanYolu(guildId);

  yedekKlasorunuHazirla();
  fs.writeFileSync(filePath, yaml.dump({
    saat: formatYedekSaati(plan.hour, plan.minute),
    saatDilimi: plan.timeZone,
    updatedAt: Date.now(),
  }), "utf8");

  return plan;
}

function yedekKaydet(id, veri) {
  const yamlData = yaml.dump(veri);
  fs.writeFileSync(yedekDosyaYolu(id), yamlData, "utf8");
}

function yedekOku(id) {
  const filePath = yedekDosyaYolu(id);
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath, "utf8");
  return yaml.load(data);
}

function yedekSil(id) {
  const filePath = yedekDosyaYolu(id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function tumYedekleriListele() {
  return fs.readdirSync(YEDEK_KLASORU)
    .filter(file => file.endsWith(".yaml"))
    .map(file => path.parse(file).name);
}

module.exports = {
  DEFAULT_YEDEK_PLANI,
  YEDEK_KLASORU,
  eskiYedekleriTasi,
  formatYedekSaati,
  normalizeYedekPlani,
  tumYedekleriListele,
  yedekKlasorunuHazirla,
  yedekPlaniniKaydet,
  yedekPlaniniOku,
  yedekKaydet,
  yedekOku,
  yedekSil,
};
