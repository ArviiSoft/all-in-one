const { ActivityType } = require('discord.js');
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const schedule = require('node-schedule');

const dataPathpanel = path.join(__dirname, "../../Database/Ses Sistemleri/sesPanelleri.json");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const db2 = require('../../Utils/Core/jsonDB');
const { resetPeriodStats, buildStatResetPayload } = require('../../Utils/Scheduling/statResetReport');
const { initializeInviteCache } = require("../../Utils/Membership/inviteTracker");
const { startPersistentVoiceConnection } = require("../../Utils/Voice/persistentVoiceConnection");
const { startClockChannelUpdater } = require("../../Utils/Voice/sesPanelClock");

const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function getTotalMembers(client) {
    let count = 0;
    client.guilds.cache.forEach(guild => {
        count += guild.memberCount;
    });
    return count;
}

function getOnlineCount(client) {
    let count = 0;
    client.guilds.cache.forEach(guild => {
        guild.members.cache.forEach(member => {
            if (
                !member.user.bot &&
                member.presence &&
                ["online", "dnd", "idle"].includes(member.presence.status)
            ) {
                count++;
            }
        });
    });
    return count;
}

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        try {
            await emojiler.ensureApplicationEmojis(client);
        } catch (error) {
            console.error("🔴 [EMOJİ] Hazır servisleri başlatmadan önce emojiler yüklenemedi:", error);
            return;
        }

        console.log(`\n🟢 [AKTİF] ${client.user.username}`);
        initializeInviteCache(client).catch(err => {
            console.warn(`⚠️ [DAVET] Invite cache başlatılamadı:`, err.message);
        });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//CLAN TAG TAKİP SİSTEMİ
    const clanTagSystem = require('../Guild/clanTagUpdate.js');
    clanTagSystem.synchronizeClanRoles(client)
        .then(() => console.log('✅ [CLAN] Tag takip sistemi aktif, mevcut üyeler eşitlendi.'))
        .catch(error => console.error('🔴 [CLAN] Başlangıç eşitlemesi başarısız:', error));
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//BOT OYNUYOR
        client.user.setPresence({
            activities: [{ name: `${getOnlineCount(client)} Çevrimiçi ・ ${getTotalMembers(client)} Üye`, type: ActivityType.Custom }],
            status: require('../../Utils/Core/generalSettings').settings.BotStatus || 'online'
        });

        setInterval(() => {
            client.user.setPresence({
                activities: [{ name: `${getOnlineCount(client)} Çevrimiçi ・ ${getTotalMembers(client)} Üye`, type: ActivityType.Custom }],
                status: require('../../Utils/Core/generalSettings').settings.BotStatus || 'online'
            });
        }, 5 * 60 * 1000);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ZAMAN KAPSÜLÜ SİSTEMİ
setTimeout(() => {
  const zamanKapsulu = client.commands.get('zaman-kapsülü');
  if (zamanKapsulu?.startChecker) zamanKapsulu.startChecker(client);
}, 3000);
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//AKTİF ÜYE OTOMATİK THREAD MESAJI
const { startAktifUyeScheduler } = require('../../Utils/Engagement/aktifUyeScheduler');
startAktifUyeScheduler(client);
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//SES PANELLERİ VERİ GÜNCELEME
if (!global.sesPanelTimer) {
  global.sesPanelTimer = setInterval(async () => {
    if (!fs.existsSync(dataPathpanel)) return;
    const fileData = JSON.parse(fs.readFileSync(dataPathpanel, "utf8"));
    for (const [guildId, guildData] of Object.entries(fileData)) {
      const g = client.guilds.cache.get(guildId);
      if (!g) continue;
      const sesCount = g.members.cache.filter(m => m.voice.channel).size;
      if (guildData.uyeKanalId) {
        const ch = g.channels.cache.get(guildData.uyeKanalId);
        if (ch) await ch.setName(`👤・Üyeler · ${g.memberCount}`).catch(() => {});
      }
      if (guildData.aktifUyeKanalId) {
        const aktifCount = g.members.cache.filter(m => m.presence && m.presence.status !== "offline").size;
        const ch = g.channels.cache.get(guildData.aktifUyeKanalId);
        if (ch) await ch.setName(`🟩・Çevrimiçi · ${aktifCount}`).catch(() => {});
      }
      if (guildData.durumKanalId) {
        const online = g.members.cache.filter(m => m.presence?.status === "online").size;
        const dnd = g.members.cache.filter(m => m.presence?.status === "dnd").size;
        const idle = g.members.cache.filter(m => m.presence?.status === "idle").size;
        const ch = g.channels.cache.get(guildData.durumKanalId);
        if (ch) await ch.setName(`🟢・${online} | 🔴・${dnd} | 🟡・${idle}`).catch(() => {});
      }
      if (guildData.rekorKanalId) {
        const onlineNow = g.members.cache.filter(m => m.presence && m.presence.status !== "offline").size;
        if (onlineNow > guildData.rekorSayi) guildData.rekorSayi = onlineNow;
        const ch = g.channels.cache.get(guildData.rekorKanalId);
        if (ch) await ch.setName(`🏆・Rekor Çevrimiçi · ${onlineNow} / ${guildData.rekorSayi}`).catch(() => {});
      }
      if (guildData.sestekiUyeKanalId) {
        const ch = g.channels.cache.get(guildData.sestekiUyeKanalId);
        if (ch) await ch.setName(`🔊・Sesteki Üyeler · ${sesCount}`).catch(() => {});
      }

      const latestData = JSON.parse(fs.readFileSync(dataPathpanel, "utf8"));
      const latestGuildData = latestData[guildId];
      if (latestGuildData?.rekorKanalId && latestGuildData.rekorKanalId === guildData.rekorKanalId
        && Number.isFinite(guildData.rekorSayi)
        && (!Number.isFinite(latestGuildData.rekorSayi) || guildData.rekorSayi > latestGuildData.rekorSayi)) {
        latestGuildData.rekorSayi = guildData.rekorSayi;
        fs.writeFileSync(dataPathpanel, JSON.stringify(latestData, null, 2));
      }
    }
  }, 600000);
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//HATIRLATICI SİSTEMİ
        const hatirlaticilariKontrolEt = require('../../Utils/Scheduling/hatirlaticiKontrol');
        await hatirlaticilariKontrolEt(client);
        setInterval(() => {
            hatirlaticilariKontrolEt(client);
        }, 60 * 1000);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//OTOMATİK TARİH SİSTEMİ
        setInterval(() => updateDateChannel(client), 60 * 60 * 1000);
        updateDateChannel(client);
        startClockChannelUpdater(client);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//SÜRELİ MESAJ SİSTEMİ
        const { initializeTimedMessages } = require("../../Utils/Scheduling/sureliMesajScheduler");
        initializeTimedMessages(client);
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//GÜNLÜK-HAFTALIK VERİ SIFIRLAMA
        const lastReset = { daily: null, weekly: null };

        schedule.scheduleJob({ hour: 0, minute: 0, tz: 'Europe/Istanbul' }, async () => {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
            if (lastReset.daily === today) return;

            const summary = db2.update(data => resetPeriodStats(data, 'daily'));
            const completedAt = new Date();
            lastReset.daily = today;

            const kanalID = db2.get("reset_log_channel");
            if (kanalID) {
                try {
                    const kanal = await client.channels.fetch(kanalID);
                    await kanal.send(buildStatResetPayload({ period: 'daily', summary, completedAt }));
                } catch (err) {
                    console.error("🔴 [GÜNLÜK SIFIRLAMA] Veriler sıfırlandı ancak günlük sıfırlama raporu gönderilemedi:", err);
                }
            }
        });

        schedule.scheduleJob({ hour: 0, minute: 0, dayOfWeek: 0, tz: 'Europe/Istanbul' }, async () => {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
            if (lastReset.weekly === today) return;

            const summary = db2.update(data => resetPeriodStats(data, 'weekly'));
            const completedAt = new Date();
            lastReset.weekly = today;

            const kanalID = db2.get("reset_log_channel");
            if (kanalID) {
                try {
                    const kanal = await client.channels.fetch(kanalID);
                    await kanal.send(buildStatResetPayload({ period: 'weekly', summary, completedAt }));
                } catch (err) {
                    console.error("🔴 [HAFTALIK SIFIRLAMA] Veriler sıfırlandı ancak haftalık sıfırlama raporu gönderilemedi:", err);
                }
            }
        });
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//DISCORD.JS SES
        await startPersistentVoiceConnection(client);
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//YOUTUBE ALERT
        require("../../Utils/Membership/ytalertconf")(client);

        Promise.prototype.sil = function (time) {
            if (this) this.then(s => {
                if (s.deletable) {
                    setTimeout(async () => {
                        s.delete().catch(() => { });
                    }, time * 1000);
                }
            });
        };
    },
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function getIstanbulParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const obj = {};
  for (const p of parts) {
    if (p.type !== 'literal') obj[p.type] = p.value;
  }
  return obj; 
}

//TARİH GÜNCELLEME
function updateDateChannel(client) {
  const p = getIstanbulParts();
  const gun = p.day;
  const ayIndex = Number(p.month) - 1;
  const ay = aylar[ayIndex] || aylar[new Date().getMonth()];
  const yil = p.year;

  if (!fs.existsSync(dataPathpanel)) return;

  let panelData;
  try {
    panelData = JSON.parse(fs.readFileSync(dataPathpanel, "utf8"));
  } catch (error) {
    console.error("🔴 [TAKVİM KANALI] Ses paneli verileri okunamadı:", error);
    return;
  }

  for (const guildData of Object.values(panelData)) {
    if (!guildData.takvimKanalId) continue;
    const channel = client.channels.cache.get(guildData.takvimKanalId);
    if (channel) {
      channel.setName(`🗓️・Tarih · ${gun} ${ay} ${yil}`).catch(error => {
        console.error("🔴 [TAKVİM KANALI] Kanal adı güncellenemedi:", error);
      });
    }
  }
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
