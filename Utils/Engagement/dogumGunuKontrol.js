const fs = require("../Core/databaseFs");
const path = require("path");
const cron = require("node-cron");
const {
  ISTANBUL_SAAT_DILIMI,
  dogumGunuCoz,
  istanbulBugunu,
} = require("./dogumGunuTarih.js");

const databaseDir = path.join(__dirname, "../../Database/Üye Verileri");
const ayarlarPath = path.join(databaseDir, "dogumGunleri_ayarlar.json");
const dogumgunleriPath = path.join(databaseDir, "dogumGunleri.json");
const aktifRollerPath = path.join(databaseDir, "dogumGunleri_aktifRoller.json");
const ROL_SURESI = 24 * 60 * 60 * 1000;

let zamanlayici = null;

if (!fs.existsSync(databaseDir)) fs.mkdirSync(databaseDir, { recursive: true });
if (!fs.existsSync(ayarlarPath)) fs.writeFileSync(ayarlarPath, JSON.stringify({}, null, 4));
if (!fs.existsSync(dogumgunleriPath)) fs.writeFileSync(dogumgunleriPath, JSON.stringify({}, null, 4));
if (!fs.existsSync(aktifRollerPath)) fs.writeFileSync(aktifRollerPath, JSON.stringify({}, null, 4));

function jsonOku(dosyaYolu) {
  try {
    return JSON.parse(fs.readFileSync(dosyaYolu, "utf8"));
  } catch (error) {
    console.warn(`⚠️ [DOĞUM GÜNÜ] ${path.basename(dosyaYolu)} okunamadı: ${error.message}`);
    return {};
  }
}

function jsonYaz(dosyaYolu, veri) {
  fs.writeFileSync(dosyaYolu, JSON.stringify(veri, null, 4));
}

function istanbulSaati(tarih = new Date()) {
  const saatParcasi = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISTANBUL_SAAT_DILIMI,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(tarih).find(parca => parca.type === "hour");

  return Number(saatParcasi?.value ?? 0);
}

async function dogumGunuKontrol(client) {
  console.log("🎂 [DOĞUM GÜNÜ] Günlük kontrol başlatıldı.");

  const ayarlar = jsonOku(ayarlarPath);
  const dogumgunleri = jsonOku(dogumgunleriPath);
  const aktifRoller = jsonOku(aktifRollerPath);
  const bugun = istanbulBugunu();
  let toplamKutlama = 0;

  for (const [guildId, sunucuKayitlari] of Object.entries(dogumgunleri)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const ayar = ayarlar[guildId];
    if (!ayar?.kanalId || !ayar?.rolId) {
      console.warn(`⚠️ [DOĞUM GÜNÜ] ${guild.name} sunucusunda sistem ayarlanmamış.`);
      continue;
    }
    if (ayar.enabled === false) continue;

    const kanal = guild.channels.cache.get(ayar.kanalId);
    const rol = guild.roles.cache.get(ayar.rolId);
    if (!kanal?.isTextBased() || !rol) {
      console.warn(`⚠️ [DOĞUM GÜNÜ] ${guild.name} sunucusunda kanal veya rol bulunamadı.`);
      continue;
    }

    if (!aktifRoller[guildId]) aktifRoller[guildId] = {};

    for (const [userId, kayit] of Object.entries(sunucuKayitlari)) {
      const dogumGunu = dogumGunuCoz(kayit);
      if (!dogumGunu || dogumGunu.gun !== bugun.gun || dogumGunu.ay !== bugun.ay) continue;

      if ((aktifRoller[guildId][userId] ?? 0) > Date.now()) {
        console.log(`ℹ️ [DOĞUM GÜNÜ] ${userId} bugün daha önce kutlanmış.`);
        continue;
      }

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        console.warn(`⚠️ [DOĞUM GÜNÜ] ${guild.name} içinde ${userId} kullanıcısı bulunamadı.`);
        continue;
      }

      if (member.roles.cache.has(rol.id)) {
        console.log(`ℹ️ [DOĞUM GÜNÜ] ${member.user.tag} bugün daha önce kutlanmış.`);
        continue;
      }

      try {
        await member.roles.add(rol);
      } catch (error) {
        console.warn(`⚠️ [DOĞUM GÜNÜ] ${member.user.tag} için rol eklenemedi: ${error.message}`);
      }

      await kanal.send({
        content: `🎂 Bugün <@${userId}> adlı üyemizin doğum günü. İyi ki doğdun!`,
        allowedMentions: { users: [userId] },
      }).catch(error => {
        console.warn(`⚠️ [DOĞUM GÜNÜ] Mesaj gönderilemedi (${guild.name}): ${error.message}`);
      });

      toplamKutlama++;
      aktifRoller[guildId][userId] = Date.now() + ROL_SURESI;
      jsonYaz(aktifRollerPath, aktifRoller);
      console.log(`🎉 [DOĞUM GÜNÜ] ${guild.name} | ${member.user.tag} kutlandı.`);

      setTimeout(() => {
        dogumGunuRolunuKaldir(guild, rol.id, guildId, userId, aktifRoller).catch(error => {
          console.warn(`⚠️ [DOĞUM GÜNÜ] Rol süresi temizlenemedi: ${error.message}`);
        });
      }, ROL_SURESI);
    }
  }

  await rolTemizlemeKontrol(client, aktifRoller, ayarlar);

  console.log(
    toplamKutlama > 0
      ? `🎉 [DOĞUM GÜNÜ] Bugün ${toplamKutlama} kişi kutlandı.`
      : "ℹ️ [DOĞUM GÜNÜ] Bugün doğum günü olan kimse yok."
  );
  console.log("🔚 [DOĞUM GÜNÜ] Günlük kontrol tamamlandı.\n");
}

async function dogumGunuRolunuKaldir(guild, rolId, guildId, userId, aktifRoller) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member?.roles.cache.has(rolId)) {
    await member.roles.remove(rolId).catch(error => {
      console.warn(`⚠️ [DOĞUM GÜNÜ] ${member.user.tag} rolü geri alınamadı: ${error.message}`);
    });
  }

  if (aktifRoller[guildId]) {
    delete aktifRoller[guildId][userId];
    if (Object.keys(aktifRoller[guildId]).length === 0) delete aktifRoller[guildId];
  }
  jsonYaz(aktifRollerPath, aktifRoller);
}

async function rolTemizlemeKontrol(client, aktifRoller, ayarlar = jsonOku(ayarlarPath)) {
  const suan = Date.now();

  for (const [guildId, roller] of Object.entries(aktifRoller)) {
    const guild = client.guilds.cache.get(guildId);
    const rolId = ayarlar[guildId]?.rolId;
    if (!guild || !rolId) continue;

    for (const [userId, bitisZamani] of Object.entries(roller)) {
      if (suan < bitisZamani) continue;
      await dogumGunuRolunuKaldir(guild, rolId, guildId, userId, aktifRoller);
    }
  }
}

async function dogumGunuZamanlayiciKur(client) {
  if (zamanlayici) return zamanlayici;

  zamanlayici = cron.schedule(
    "0 10 * * *",
    () => {
      dogumGunuKontrol(client).catch(error => {
        console.error("🔴 [DOĞUM GÜNÜ] Günlük kontrol hatası:", error);
      });
    },
    { timezone: ISTANBUL_SAAT_DILIMI }
  );

  console.log("⏰ [DOĞUM GÜNÜ] Kutlamalar her gün 10:00 (Europe/Istanbul) için planlandı.");

  if (istanbulSaati() >= 10) {
    await dogumGunuKontrol(client);
  } else {
    await rolTemizlemeKontrol(client, jsonOku(aktifRollerPath));
  }

  return zamanlayici;
}

module.exports = {
  dogumGunuKontrol,
  dogumGunuZamanlayiciKur,
};
