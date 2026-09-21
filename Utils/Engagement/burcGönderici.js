const axios = require("axios");
const cron = require("node-cron");
const { ChannelType, EmbedBuilder } = require("discord.js");
const emojiler = require("../Emojis/emojiler.js");
const { BURCLAR, getGuildBurcSettingFrom, readBurcSettings } = require("./burcSistemi");

const HOROSCOPE_API_URL = "https://freehoroscopeapi.com/api/v1/get-horoscope/daily";
const TRANSLATE_API_URL = "https://translate.googleapis.com/translate_a/single";
const TIMEZONE = "Europe/Istanbul";
const REQUEST_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 3;
let cacheDate = null;
const dailyReadingCache = new Map();

function getIstanbulDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatTurkishDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return value || "Bugün";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : "";
}

async function translateToTurkish(text) {
  const response = await axios.get(TRANSLATE_API_URL, {
    params: {
      client: "gtx",
      sl: "en",
      tl: "tr",
      dt: "t",
      q: text,
    },
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Accept: "application/json" },
  });
  const translated = response.data?.[0]
    ?.map(part => (Array.isArray(part) ? part[0] : ""))
    .join("");

  if (!normalizeText(translated)) {
    throw new Error("Çeviri servisi boş yanıt döndürdü.");
  }

  return normalizeText(translated);
}

async function fetchDailyHoroscope(burc, expectedDate = getIstanbulDate()) {
  const response = await axios.get(HOROSCOPE_API_URL, {
    params: { sign: burc.apiSign },
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "User-Agent": "All-In-One-Discord-Bot/0.0.7",
    },
  });
  const payload = response.data?.data;
  const sourceText = normalizeText(payload?.horoscope);
  const sourceDate = normalizeText(payload?.date);

  if (!sourceText || !sourceDate) {
    throw new Error("API yanıtında tarih veya günlük yorum bulunamadı.");
  }

  if (sourceDate !== expectedDate) {
    throw new Error(`API güncel olmayan veri döndürdü (${sourceDate}; beklenen ${expectedDate}).`);
  }

  try {
    return {
      date: sourceDate,
      text: await translateToTurkish(sourceText),
      translated: true,
    };
  } catch (error) {
    console.warn(`⚠️ [BURÇ] ${burc.name} yorumu Türkçeye çevrilemedi; özgün metin kullanılacak:`, error.message);
    return {
      date: sourceDate,
      text: sourceText,
      translated: false,
    };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker())
  );
  return results;
}

async function fetchDailyHoroscopesFor(signs = BURCLAR) {
  const expectedDate = getIstanbulDate();
  if (cacheDate !== expectedDate) {
    dailyReadingCache.clear();
    cacheDate = expectedDate;
  }

  const requestedSigns = BURCLAR.filter(burc => signs.some(sign => sign.key === burc.key));
  const missingSigns = requestedSigns.filter(burc => !dailyReadingCache.has(burc.key));
  const results = await mapWithConcurrency(
    missingSigns,
    FETCH_CONCURRENCY,
    burc => fetchDailyHoroscope(burc, expectedDate)
  );

  results.forEach((result, index) => {
    const burc = missingSigns[index];
    if (result.status === "fulfilled") {
      dailyReadingCache.set(burc.key, result.value);
      return;
    }

    console.error(`🔴 [BURÇ] ${burc.name} için güncel veri alınamadı:`, result.reason?.message || result.reason);
  });

  return new Map(
    requestedSigns
      .filter(burc => dailyReadingCache.has(burc.key))
      .map(burc => [burc.key, dailyReadingCache.get(burc.key)])
  );
}

async function fetchAllDailyHoroscopes() {
  return fetchDailyHoroscopesFor(BURCLAR);
}

function buildHoroscopeEmbed(burc, reading) {
  const emoji = emojiler[burc.emojiAlias] || burc.symbol;
  const mottoEmoji = emojiler.motto || "✦";
  const planetEmoji = emojiler.gezegen || "🪐";
  const elementEmoji = emojiler.element || "◈";

  return new EmbedBuilder()
    .setColor(burc.color)
    .setDescription(`## ${emoji} ${burc.name} Burcu Yorumu\n${reading.text}`)
    .addFields(
      { name: `${mottoEmoji} Mottosu`, value: `- ${burc.motto}`, inline: false },
      { name: `${planetEmoji} Gezegeni`, value: `- ${burc.planet}`, inline: true },
      { name: `${elementEmoji} Elementi`, value: `- ${burc.element}`, inline: true },
      { name: `${emojiler.Takvim || "📅"} Gökyüzü Tarihi`, value: `- ${formatTurkishDate(reading.date)}`, inline: false }
    )
    .setImage(burc.image)
}

function getSelectedSigns(setting) {
  const selectedKeys = new Set(setting.gonderilecekBurclar || []);
  return BURCLAR.filter(burc => selectedKeys.has(burc.key));
}

function resolveTargetChannel(guild, setting) {
  const channel = guild.channels.cache.get(setting.kanal);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    throw new Error("Kayıtlı yayın kanalı bulunamadı. Önce panelden geçerli bir kanal seç.");
  }
  return channel;
}

async function sendReadingsToGuild(guild, setting, readings) {
  const channel = resolveTargetChannel(guild, setting);
  const selectedSigns = getSelectedSigns(setting);
  let sentMessages = 0;

  for (const burc of selectedSigns) {
    const reading = readings.get(burc.key);
    if (!reading) continue;

    const roleId = setting.roller[burc.key];
    const mentionableRoleId = roleId && guild.roles.cache.has(roleId) ? roleId : null;

    try {
      await channel.send({
        content: mentionableRoleId ? `<@&${mentionableRoleId}>` : undefined,
        embeds: [buildHoroscopeEmbed(burc, reading)],
        allowedMentions: mentionableRoleId ? { roles: [mentionableRoleId] } : { parse: [] },
      });
      sentMessages += 1;
    } catch (error) {
      console.error(`🔴 [BURÇ] ${guild.name} / ${burc.name} mesajı gönderilemedi:`, error.message || error);
    }
  }

  return {
    channelId: channel.id,
    requested: selectedSigns.length,
    readings: readings.size,
    messages: sentMessages,
  };
}

async function sendLatestHoroscopesToGuild(guild, setting) {
  resolveTargetChannel(guild, setting);
  const selectedSigns = getSelectedSigns(setting);
  if (selectedSigns.length === 0) {
    throw new Error("Gönderilecek en az bir burç seçmelisin.");
  }

  const readings = await fetchDailyHoroscopesFor(selectedSigns);
  if (readings.size === 0) {
    throw new Error("Seçili burçların güncel yorumları alınamadı.");
  }

  const result = await sendReadingsToGuild(guild, setting, readings);
  if (result.messages === 0) {
    throw new Error("Güncel yorumlar yayın kanalına gönderilemedi. Botun kanal izinlerini kontrol et.");
  }
  return result;
}

async function sendDailyHoroscopes(client) {
  const allSettings = readBurcSettings();
  const configuredGuilds = Object.entries(allSettings)
    .map(([guildId]) => [guildId, getGuildBurcSettingFrom(allSettings, guildId)])
    .filter(([, setting]) => Boolean(setting.kanal));

  if (configuredGuilds.length === 0) return { guilds: 0, readings: 0, messages: 0 };

  const selectedKeys = new Set(
    configuredGuilds.flatMap(([, setting]) => setting.gonderilecekBurclar)
  );
  const requestedSigns = BURCLAR.filter(burc => selectedKeys.has(burc.key));
  if (requestedSigns.length === 0) {
    return { guilds: configuredGuilds.length, readings: 0, messages: 0 };
  }

  const readings = await fetchDailyHoroscopesFor(requestedSigns);
  if (readings.size === 0) {
    console.error("🔴 [BURÇ] Güncel yorumların hiçbiri alınamadığı için günlük yayın iptal edildi.");
    return { guilds: configuredGuilds.length, readings: 0, messages: 0 };
  }

  let sentMessages = 0;
  for (const [guildId, setting] of configuredGuilds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    try {
      const result = await sendReadingsToGuild(guild, setting, readings);
      sentMessages += result.messages;
    } catch (error) {
      console.warn(`⚠️ [BURÇ] ${guild.name} sunucusuna yorum gönderilemedi:`, error.message || error);
    }
  }

  console.log(`✔️ [BURÇ] ${readings.size} güncel yorum alındı; ${sentMessages} mesaj gönderildi.`);
  return { guilds: configuredGuilds.length, readings: readings.size, messages: sentMessages };
}

function setupDailyHoroscopeSender(client) {
  let running = false;

  cron.schedule("0 12 * * *", async () => {
    if (running) {
      console.warn("⚠️ [BURÇ] Önceki günlük yayın hâlâ sürdüğü için yinelenen çalışma atlandı.");
      return;
    }

    running = true;
    try {
      await sendDailyHoroscopes(client);
    } catch (error) {
      console.error("🔴 [BURÇ] Günlük yayın çalışması tamamlanamadı:", error);
    } finally {
      running = false;
    }
  }, { timezone: TIMEZONE });
}

module.exports = setupDailyHoroscopeSender;
module.exports.buildHoroscopeEmbed = buildHoroscopeEmbed;
module.exports.fetchAllDailyHoroscopes = fetchAllDailyHoroscopes;
module.exports.fetchDailyHoroscope = fetchDailyHoroscope;
module.exports.fetchDailyHoroscopesFor = fetchDailyHoroscopesFor;
module.exports.formatTurkishDate = formatTurkishDate;
module.exports.getIstanbulDate = getIstanbulDate;
module.exports.sendDailyHoroscopes = sendDailyHoroscopes;
module.exports.sendLatestHoroscopesToGuild = sendLatestHoroscopesToGuild;
module.exports.sendReadingsToGuild = sendReadingsToGuild;
module.exports.translateToTurkish = translateToTurkish;
