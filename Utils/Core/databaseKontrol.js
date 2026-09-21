const fs = require("fs");
const path = require("path");
const { quarantineFile, readJsonFile, writeJsonAtomically } = require("./safeJsonStore");
const { getRuntime } = require("../Database/runtime");
const { isInternalDatabasePath } = require("../Database/storagePaths");

const databaseDir = path.join(__dirname, "../../Database");
const dataDirectories = [
  "Abonelik",
  "Boost",
  "Bildirimler ve Sosyal Medya",
  "Eğlence ve Etkileşim",
  "Güvenlik ve Moderasyon",
  "Ses Sistemleri",
  "Seviye",
  "Sistem",
  "Sunucu Yönetimi",
  "Üye Verileri",
];

function jsonDosyalariniBul(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (isInternalDatabasePath(path.relative(databaseDir, entryPath).split(path.sep).join("/"))) continue;

    if (entry.isDirectory()) {
      files.push(...jsonDosyalariniBul(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

function databaseKontrolEt() {
  const runtime = getRuntime();
  if (runtime?.mode === "mongo") {
    console.log(`✅ [DATABASE] MongoDB etkin; ${runtime.backend.list().length} veri dosyası hazır.`);
    return;
  }
  console.log("🔎 [DATABASE] Kontrol sistemi başlatıldı.");

  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true });
    console.log("📁 [DATABASE] Klasör bulunamadığı için oluşturuldu.");
  }

  for (const directory of dataDirectories) {
    fs.mkdirSync(path.join(databaseDir, directory), { recursive: true });
  }

  const files = jsonDosyalariniBul(databaseDir);

  let verifiedCount = 0;
  let recoveredCount = 0;
  let resetCount = 0;

  for (const filePath of files) {
    const current = readJsonFile(filePath);
    if (current.status === "valid") {
      verifiedCount++;
      continue;
    }

    const quarantinedPath = quarantineFile(filePath);
    const backupPath = `${filePath}.bak`;
    const backup = readJsonFile(backupPath);

    if (backup.status === "valid") {
      writeJsonAtomically(filePath, backup.data);
      recoveredCount++;
      console.warn(`⚠️ [DATABASE] Bozuk dosya yedekten kurtarıldı: ${filePath} (karantina: ${quarantinedPath})`);
      continue;
    }

    if (backup.status === "invalid") quarantineFile(backupPath);
    writeJsonAtomically(filePath, {});
    writeJsonAtomically(backupPath, {});
    resetCount++;
    console.error(`🔴 [DATABASE] Geçerli yedek bulunamadı; boş veri oluşturuldu: ${filePath} (karantina: ${quarantinedPath})`);
  }

  console.log(
    `✅ [DATABASE] ( ${verifiedCount} ) dosya doğrulandı.\n`
    + `♻️ [DATABASE] ( ${recoveredCount} ) dosya yedekten kurtarıldı.\n`
    + (resetCount > 0
      ? `❌ [DATABASE] ( ${resetCount} ) dosya yedeksiz olduğu için sıfırlandı.`
      : "✅ [DATABASE] Yedeksiz sıfırlanan dosya bulunmuyor.")
  );
  console.log("🔚 [DATABASE] Kontroller bitti. \n");
}

module.exports = { databaseKontrolEt };
