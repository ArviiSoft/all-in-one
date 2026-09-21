const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const { Events } = require('discord.js');
const emojiler = require("../../Utils/Emojis/emojiler.js");

const dataPath = path.join(__dirname, '../../Database/Üye Verileri/eskiYeniUye.json');
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const MEMBER_FETCH_TIMEOUT_MS = 45 * 1000;
const WARN_COOLDOWN_MS = 30 * 60 * 1000;
const MIN_CACHE_COVERAGE = 0.8;
const lastWarnings = new Map();

function shouldWarn(key) {
  const now = Date.now();
  const last = lastWarnings.get(key) || 0;
  if (now - last < WARN_COOLDOWN_MS) return false;
  lastWarnings.set(key, now);
  return true;
}

async function fetchMembersSafely(guild) {
  try {
    return await guild.members.fetch({
      withPresences: false,
      time: MEMBER_FETCH_TIMEOUT_MS,
    });
  } catch (err) {
    const cachedMembers = guild.members.cache;
    const expectedMembers = guild.memberCount || cachedMembers.size;
    const hasUsableCache = expectedMembers === 0 || cachedMembers.size >= Math.floor(expectedMembers * MIN_CACHE_COVERAGE);

    if (!hasUsableCache) {
      if (shouldWarn(`skip:${guild.id}`)) {
        console.warn(
          `⚠️ [ESKİ YENİ ÜYE KONTROL] ${guild.name}: Üye listesi alınamadı ve cache eksik (${cachedMembers.size}/${expectedMembers}), panel bu tur güncellenmedi. (${err.message})`
        );
      }
      return null;
    }

    return cachedMembers;
  }
}

async function runKontrol(client, selectedGuildId = null) {
  if (!fs.existsSync(dataPath)) return;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ [ESKİ YENİ ÜYE KONTROL] Veri okunamadı: ${err.message}`);
    return;
  }

  for (const [guildID, ayar] of Object.entries(data)) {
    if (selectedGuildId && selectedGuildId !== guildID) continue;
    const guild = client.guilds.cache.get(guildID);
    if (!guild) continue;

    const members = await fetchMembersSafely(guild);
    if (!members) continue;

    const allMembers = [...members.values()]
      .filter(m => !m.user.bot && m.joinedTimestamp)
      .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

    if (!allMembers.length) {
      if (shouldWarn(`empty:${guild.id}`)) {
        console.warn(`⚠️ [ESKİ YENİ ÜYE KONTROL] ${guild.name}: Kullanılabilir üye cache'i boş, bu tur atlandı.`);
      }
      continue;
    }

    const formatMember = (m, i) =>
      `**${i + 1}.** ${m} <t:${Math.floor(m.joinedTimestamp / 1000)}:f>  (<t:${Math.floor(m.joinedTimestamp / 1000)}:R>)`;

    const guncelle = async (kanalID, mesajID, baslik, liste1, liste2, baslik2) => {
      const kanal = guild.channels.cache.get(kanalID);
      if (!kanal) return;

      try {
        const mesaj = await kanal.messages.fetch(mesajID);
        await mesaj.edit(`${baslik} \n${liste1.join('\n') || '*Kimse yok*'} \n\n${baslik2} \n${liste2.join('\n') || '*Kimse yok*'}`);
      } catch (e) {
        console.log(`🔴 [ESKİ YENİ ÜYE KONTROL] ${guild.name}:`, e.message);
      }
    };

    const role = ayar.rol ? guild.roles.cache.get(ayar.rol) : null;

    if (!role) {
      const rolYokMesaj = async (kanalID, mesajID, baslik) => {
        const kanal = guild.channels.cache.get(kanalID);
        if (!kanal) return;
        try {
          const mesaj = await kanal.messages.fetch(mesajID);
          await mesaj.edit(`${baslik} \n${emojiler.uyari} **Rol ayarlanmamış.** \n\n# Roldekiler \n${emojiler.uyari} **Rol ayarlanmamış.**`);
        } catch (e) {
          console.log(`🔴 [ESKİ YENİ ÜYE KONTROL] ${guild.name}:`, e.message);
        }
      };

      if (ayar.eskiUyeKanal && ayar.eskiUyeMesaj)
        await rolYokMesaj(ayar.eskiUyeKanal, ayar.eskiUyeMesaj, '# En eski üyeler');

      if (ayar.yeniUyeKanal && ayar.yeniUyeMesaj)
        await rolYokMesaj(ayar.yeniUyeKanal, ayar.yeniUyeMesaj, '# En yeni üyeler');

      continue;
    }

    const roleMembers = allMembers.filter(m => m.roles.cache.has(role.id));

    if (ayar.eskiUyeKanal && ayar.eskiUyeMesaj) {
      const enEskiler = allMembers.slice(0, 10).map((m, i) => formatMember(m, i));
      const rolEskiler = roleMembers.slice(0, 10).map((m, i) => formatMember(m, i));
      await guncelle(
        ayar.eskiUyeKanal,
        ayar.eskiUyeMesaj,
        '# En eski üyeler',
        enEskiler,
        rolEskiler,
        '# En eski üye rolündekiler'
      );
    }

    if (ayar.yeniUyeKanal && ayar.yeniUyeMesaj) {
      const enYeniler = allMembers.slice(-10).reverse().map((m, i) => formatMember(m, i));
      const rolYeniler = roleMembers.slice(-10).reverse().map((m, i) => formatMember(m, i));
      await guncelle(
        ayar.yeniUyeKanal,
        ayar.yeniUyeMesaj,
        '# En yeni üyeler',
        enYeniler,
        rolYeniler,
        '# En yeni üye rolündekiler'
      );
    }
  }
}

module.exports = (client) => {
  if (client.eskiYeniUyeKontrolStarted) return;
  client.eskiYeniUyeKontrolStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runKontrol(client);
    } catch (err) {
      console.error('🔴 [ESKİ YENİ ÜYE KONTROL] Genel hata:', err);
    } finally {
      running = false;
    }
  };

  const start = () => {
    if (client.eskiYeniUyeKontrolInterval) return;
    client.eskiYeniUyeKontrolInterval = setInterval(tick, CHECK_INTERVAL_MS);
    setTimeout(tick, 30 * 1000);
  };

  if (typeof client.isReady === 'function' && client.isReady()) {
    start();
  } else {
    client.once(Events.ClientReady, start);
  }
};
module.exports.refreshGuild = runKontrol;