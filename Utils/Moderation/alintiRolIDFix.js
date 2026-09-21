const fs = require("../Core/databaseFs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../../Database/Sunucu Yönetimi/alintiRol.json");

if (!fs.existsSync(DATA_PATH)) {
  console.error("🔴 [ALINTI ROL ID FIX] Dosya bulunamadı:", DATA_PATH);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
} catch (err) {
  console.error("🔴 [ALINTI ROL ID FIX] JSON okuma hatası:", err);
  process.exit(1);
}

const fixedData = {};

for (const guildId in data) {
  const guildKey = String(guildId);
  fixedData[guildKey] = {};

  for (const channelId in data[guildId]) {
    const channelKey = String(channelId);
    fixedData[guildKey][channelKey] = data[guildId][channelId];
  }
}

fs.writeFileSync(DATA_PATH, JSON.stringify(fixedData, null, 2), "utf8");

console.log(`✅ [AINTI ROL ID FIX] ID düzeltme tamamlandı.`);
