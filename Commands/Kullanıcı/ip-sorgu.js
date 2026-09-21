const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const dns = require("dns").promises;
const fs = require("../../Utils/Core/databaseFs");
const net = require("net");
const path = require("path");
const fetchModule = import("node-fetch").then(({ default: nodeFetch }) => nodeFetch);
const fetch = (...args) => fetchModule.then((nodeFetch) => nodeFetch(...args));
const { getEnv } = require("../../Utils/Core/env");

const limitDosyasi = path.join(__dirname, "../../Database/Sistem/ipSorgulaSinir.json");
const GUNLUK_LIMIT = 3;
const RESET_SURE = 24 * 60 * 60 * 1000;
const COLLECTOR_TIME = 3 * 60 * 1000;
const FETCH_TIMEOUT = 6_000;
const DNS_TIMEOUT = 3_000;
const INITIAL_AUXILIARY_WAIT = 900;
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 250;
const ACCENT_COLOR = 0x00a8fc;
const SAFE_COLOR = 0x2fba72;
const RISK_COLOR = 0xed4245;
const V2_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const ABUSEIPDB_API_KEY = getEnv("ABUSEIPDB_API_KEY");
const IPINFO_TOKEN = getEnv("IPINFO_TOKEN");
const OPENWEATHER_API_KEY = getEnv("OPENWEATHER_API_KEY");
const queryCache = new Map();
const inFlightQueries = new Map();

const DETAIL_META = Object.freeze({
  network: {
    label: "Ağ ve sağlayıcı",
    emoji: "📡",
    description: "ASN, İSS, organizasyon ve PTR bilgileri",
  },
  security: {
    label: "Güvenlik sinyalleri",
    emoji: "🛡️",
    description: "Proxy, Tor, hosting ve AbuseIPDB skoru",
  },
  country: {
    label: "Ülke ve çevre",
    emoji: "🌍",
    description: "Başkent, nüfus, dil, para ve hava durumu",
  },
});

function loadLimitData() {
  try {
    if (!fs.existsSync(limitDosyasi)) {
      fs.writeFileSync(limitDosyasi, JSON.stringify({}));
      return {};
    }

    const data = JSON.parse(fs.readFileSync(limitDosyasi, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error("🔴 [IP SORGU] Limit verisi okunamadı:", error);
    return {};
  }
}

function saveLimitData(data) {
  fs.writeFileSync(limitDosyasi, JSON.stringify(data, null, 2));
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function cleanText(value, fallback = "Bilinmiyor") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

function inlineCode(value, fallback = "Bilinmiyor") {
  return `\`${cleanText(value, fallback).replace(/`/g, "'")}\``;
}

function countryFlag(countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

function yesNo(value, positiveText = "Evet", negativeText = "Hayır") {
  return value ? `🔴 ${positiveText}` : `🟢 ${negativeText}`;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "Bilinmiyor";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("tr-TR") : "Bilinmiyor";
}

function getRiskSignals(data, abuseData) {
  const security = data.security || {};
  const connection = data.connection || {};
  const abuseScore = Number(abuseData?.data?.abuseConfidenceScore);

  return {
    proxy: Boolean(security.proxy || connection.proxy),
    tor: Boolean(security.tor),
    hosting: Boolean(security.hosting || connection.hosting),
    mobile: Boolean(connection.mobile),
    abuseScore: Number.isFinite(abuseScore) ? abuseScore : null,
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function optionalRequest(label, request, fallback = {}) {
  try {
    return await request();
  } catch (error) {
    console.warn(`🟡 [IP SORGU] ${label} alınamadı:`, error?.message || error);
    return fallback;
  }
}

async function waitAtMost(promise, milliseconds) {
  let timeout;
  await Promise.race([
    promise,
    new Promise((resolve) => {
      timeout = setTimeout(resolve, milliseconds);
    }),
  ]);
  clearTimeout(timeout);
}

async function resolveHostname(ip) {
  let timeout;

  try {
    const hostnames = await Promise.race([
      dns.reverse(ip),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve([]), DNS_TIMEOUT);
      }),
    ]);
    return hostnames[0] || null;
  } catch (error) {
    if (!["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(error?.code)) {
      console.warn("🟡 [IP SORGU] PTR kaydı alınamadı:", error?.code || error?.message || error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function collectEnrichment(data) {
  const coordinatesAvailable = data.latitude !== null
    && data.latitude !== undefined
    && data.longitude !== null
    && data.longitude !== undefined
    && Number.isFinite(Number(data.latitude))
    && Number.isFinite(Number(data.longitude));
  const countryRequest = data.country_code
    ? optionalRequest("ülke verisi", () => fetchJson(
      `https://restcountries.com/v3.1/alpha/${encodeURIComponent(data.country_code)}`
    ), [])
    : Promise.resolve([]);
  const weatherRequest = OPENWEATHER_API_KEY && coordinatesAvailable
    ? optionalRequest("hava durumu", () => fetchJson(
      `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(data.latitude)}&lon=${encodeURIComponent(data.longitude)}&appid=${encodeURIComponent(OPENWEATHER_API_KEY)}&units=metric&lang=tr`
    ))
    : Promise.resolve({});
  const [countryResult, weatherData] = await Promise.all([countryRequest, weatherRequest]);

  return {
    countryInfo: Array.isArray(countryResult) ? countryResult[0] || null : null,
    weatherInfo: weatherData?.weather?.[0] && weatherData?.main
      ? `${cleanText(weatherData.weather[0].description)}, ${cleanText(weatherData.main.temp)}°C`
      : null,
  };
}

function getCachedQuery(ip) {
  const cached = queryCache.get(ip);
  if (!cached) return null;
  if (Date.now() - cached.createdAt < CACHE_TTL) return cached.value;
  queryCache.delete(ip);
  return null;
}

function setCachedQuery(ip, value) {
  if (queryCache.size >= MAX_CACHE_SIZE) {
    queryCache.delete(queryCache.keys().next().value);
  }
  queryCache.set(ip, { createdAt: Date.now(), value });
}

async function collectIpData(ip) {
  const encodedIp = encodeURIComponent(ip);
  const primaryRequest = fetchJson(`https://ipwho.is/${encodedIp}`);
  const hostnameRequest = resolveHostname(ip);
  const abuseRequest = ABUSEIPDB_API_KEY
    ? optionalRequest("AbuseIPDB verisi", () => fetchJson(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodedIp}&maxAgeInDays=90`,
      { headers: { Key: ABUSEIPDB_API_KEY, Accept: "application/json" } }
    ))
    : Promise.resolve({});
  const ipinfoRequest = IPINFO_TOKEN
    ? optionalRequest("IPinfo verisi", () => fetchJson(
      `https://ipinfo.io/${encodedIp}/json?token=${encodeURIComponent(IPINFO_TOKEN)}`
    ))
    : Promise.resolve({});

  const data = await primaryRequest;

  if (!data || data.success === false) {
    const error = new Error(cleanText(data?.message, "Geçersiz IP veya servis hatası."));
    error.code = "IP_LOOKUP_FAILED";
    throw error;
  }

  const result = {
    abuseData: {},
    auxiliaryReady: false,
    countryInfo: null,
    data,
    enrichmentReady: false,
    hostname: null,
    ipinfoData: {},
    queriedAt: Date.now(),
    weatherInfo: null,
  };
  result.auxiliaryPromise = Promise.all([hostnameRequest, abuseRequest, ipinfoRequest])
    .then(([hostname, abuseData, ipinfoData]) => Object.assign(result, { hostname, abuseData, ipinfoData }))
    .catch((error) => {
      console.warn("🟡 [IP SORGU] Yardımcı ağ verileri tamamlanamadı:", error?.message || error);
    })
    .finally(() => {
      result.auxiliaryReady = true;
    });
  result.enrichmentPromise = collectEnrichment(data)
    .then((enrichment) => Object.assign(result, enrichment))
    .catch((error) => {
      console.warn("🟡 [IP SORGU] Ülke ve çevre verileri tamamlanamadı:", error?.message || error);
    })
    .finally(() => {
      result.enrichmentReady = true;
    });

  await waitAtMost(result.auxiliaryPromise, INITIAL_AUXILIARY_WAIT);

  return result;
}

async function queryIp(ip) {
  const cached = getCachedQuery(ip);
  if (cached) return cached;
  if (inFlightQueries.has(ip)) return inFlightQueries.get(ip);

  const pendingQuery = collectIpData(ip)
    .then((result) => {
      setCachedQuery(ip, result);
      return result;
    })
    .finally(() => inFlightQueries.delete(ip));

  inFlightQueries.set(ip, pendingQuery);
  return pendingQuery;
}

function buildNoticePayload(title, description, isError = false) {
  const container = new ContainerBuilder()
    .setAccentColor(isError ? RISK_COLOR : ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );

  return {
    components: [container],
    flags: PRIVATE_V2_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildDetailSelect(sessionId, disabled = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ip:${sessionId}:details`)
    .setPlaceholder(disabled ? "Sorgu panelinin süresi doldu" : "Ayrıntılı bilgi bölümünü seç...")
    .setDisabled(disabled)
    .addOptions(
      Object.entries(DETAIL_META).map(([value, meta]) => ({
        label: meta.label,
        value,
        emoji: meta.emoji,
        description: meta.description,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildMainContainer(result, ip, sessionId, remainingQueries, disabled = false) {
  const { abuseData, data, hostname, ipinfoData } = result;
  const risk = getRiskSignals(data, abuseData);
  const hasRisk = risk.proxy || risk.tor || (risk.abuseScore !== null && risk.abuseScore >= 25);
  const location = [data.city, data.region, data.country].filter(Boolean).join(", ");
  const coordinates = [data.latitude, data.longitude].every((value) => value !== null && value !== undefined)
    ? `${data.latitude}, ${data.longitude}`
    : ipinfoData.loc;
  const asn = data.connection?.asn;
  const provider = data.connection?.isp || data.connection?.org || ipinfoData.org;
  const flagUrl = /^[A-Z]{2}$/i.test(data.country_code || "")
    ? `https://flagcdn.com/w160/${data.country_code.toLowerCase()}.png`
    : null;
  const mapUrl = coordinates
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(coordinates)}&zoom=10&size=700x320&markers=${encodeURIComponent(coordinates)},red-pushpin`
    : null;
  const googleMapsUrl = coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`
    : `https://www.google.com/maps`;
  const jsonViewUrl = `https://ipwho.is/${encodeURIComponent(ip)}`;
  const statusText = hasRisk ? "🔴 Risk sinyali algılandı" : "🟢 Belirgin risk sinyali yok";

  const headerText = new TextDisplayBuilder().setContent([
    "## 🌐 IP Sorgu",
    `### ${escapeMarkdown(ip)}`,
    `${statusText}  •  <t:${Math.floor((result.queriedAt || Date.now()) / 1000)}:R>`,
  ].join("\n"));
  const header = new SectionBuilder().addTextDisplayComponents(headerText);

  if (flagUrl) header.setThumbnailAccessory(new ThumbnailBuilder().setURL(flagUrl));

  const locationDetails = new TextDisplayBuilder().setContent([
    "### Konum",
    `**Ülke**  ${countryFlag(data.country_code)} ${inlineCode(data.country)}`,
    `**Bölge**  ${inlineCode(location)}`,
    `**Koordinatlar**  ${inlineCode(coordinates)}`,
    `**Zaman dilimi**  ${inlineCode(data.timezone?.id)}${data.timezone?.utc ? `  •  ${inlineCode(data.timezone.utc)}` : ""}`,
  ].join("\n"));

  const networkDetails = new TextDisplayBuilder().setContent([
    "### Ağ Özeti",
    `**IP türü**  ${inlineCode(data.type || `IPv${net.isIP(ip)}`)}`,
    `**PTR / Hostname**  ${inlineCode(hostname, "Yok")}`,
    `**İSS**  ${inlineCode(provider)}`,
    `**Ağ**  ${asn ? inlineCode(`AS${asn}`) : inlineCode(ipinfoData.org)}`,
  ].join("\n"));

  const securityDetails = new TextDisplayBuilder().setContent([
    "### Güvenlik Özeti",
    `**VPN / Proxy**  ${yesNo(risk.proxy)}`,
    `**Tor çıkış düğümü**  ${yesNo(risk.tor)}`,
    `**Hosting ağı**  ${yesNo(risk.hosting)}`,
    `**AbuseIPDB skoru**  ${risk.abuseScore === null ? inlineCode(null) : `\`${risk.abuseScore} / 100\``}`,
  ].join("\n"));

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Google Maps'te Gör")
      .setStyle(ButtonStyle.Link)
      .setURL(googleMapsUrl),
    new ButtonBuilder()
      .setCustomId(`ip:${sessionId}:quota`)
      .setLabel(`${remainingQueries} / ${GUNLUK_LIMIT}`)
      .setEmoji("🔎")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setLabel("JSON Verisi")
      .setStyle(ButtonStyle.Link)
      .setURL(jsonViewUrl)
  );

  const container = new ContainerBuilder()
    .setAccentColor(hasRisk ? RISK_COLOR : SAFE_COLOR);

  if (flagUrl) {
    container.addSectionComponents(header);
  } else {
    container.addTextDisplayComponents(headerText);
  }

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(locationDetails)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(networkDetails)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(securityDetails);

  if (mapUrl) {
    container
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Yaklaşık Konum"))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(mapUrl)
        )
      );
  }

  return container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# ⚖️ **__Sonuçlar yalnızca bilgilendirme amaçlıdır.__** IP konumu yaklaşık olabilir, ayrıntılı veriler için aşağıdaki menüyü kullan."
      )
    )
    .addActionRowComponents(buildDetailSelect(sessionId, disabled))
    .addActionRowComponents(actionRow);
}

function buildDetailContainer(result, ip, detailType) {
  const { abuseData, countryInfo, data, hostname, ipinfoData, weatherInfo } = result;
  const meta = DETAIL_META[detailType];
  const risk = getRiskSignals(data, abuseData);
  let content;

  if (detailType === "network") {
    content = [
      `**IP adresi**  ${inlineCode(ip)}`,
      `**IP türü**  ${inlineCode(data.type || `IPv${net.isIP(ip)}`)}`,
      `**PTR / Hostname**  ${inlineCode(hostname, "Yok")}`,
      `**ASN**  ${data.connection?.asn ? inlineCode(`AS${data.connection.asn}`) : inlineCode(null)}`,
      `**İSS**  ${inlineCode(data.connection?.isp)}`,
      `**Organizasyon**  ${inlineCode(data.connection?.org || ipinfoData.org)}`,
      `**Sağlayıcı domaini**  ${inlineCode(data.connection?.domain, "Yok")}`,
    ].join("\n");
  } else if (detailType === "security") {
    const usageType = abuseData?.data?.usageType;
    const reports = abuseData?.data?.totalReports;
    const lastReport = abuseData?.data?.lastReportedAt;
    content = [
      `**VPN / Proxy**  ${yesNo(risk.proxy)}`,
      `**Tor çıkış düğümü**  ${yesNo(risk.tor)}`,
      `**Hosting / veri merkezi**  ${yesNo(risk.hosting)}`,
      `**Mobil bağlantı**  ${risk.mobile ? "🟡 Evet" : "🟢 Hayır"}`,
      `**AbuseIPDB skoru**  ${risk.abuseScore === null ? inlineCode(null) : `\`${risk.abuseScore} / 100\``}`,
      `**Toplam rapor**  ${inlineCode(reports)}`,
      `**Kullanım türü**  ${inlineCode(usageType)}`,
      `**Son rapor**  ${inlineCode(lastReport, "Yok")}`,
    ].join("\n");
  } else {
    const languages = countryInfo?.languages ? Object.values(countryInfo.languages).join(", ") : null;
    const currencies = countryInfo?.currencies
      ? Object.values(countryInfo.currencies).map((currency) => currency.name).join(", ")
      : null;
    const callingCode = data.calling_code
      ? (String(data.calling_code).startsWith("+") ? data.calling_code : `+${data.calling_code}`)
      : null;
    content = [
      `**Kıta**  ${inlineCode(data.continent)}`,
      `**Ülke**  ${countryFlag(data.country_code)} ${inlineCode(data.country)}`,
      `**Başkent**  ${inlineCode(data.capital)}`,
      `**Telefon kodu**  ${inlineCode(callingCode)}`,
      `**Posta kodu**  ${inlineCode(data.postal, "Yok")}`,
      `**AB üyesi**  ${data.is_eu ? "🟢 Evet" : "⚪ Hayır"}`,
      `**Nüfus**  ${inlineCode(formatNumber(countryInfo?.population))}`,
      `**Dil**  ${inlineCode(languages)}`,
      `**Para birimi**  ${inlineCode(currencies)}`,
      `**Hava durumu**  ${inlineCode(weatherInfo)}`,
    ].join("\n");
  }

  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${meta.emoji} ${meta.label}`,
        `**${escapeMarkdown(ip)}**`,
        meta.description,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# Veriler farklı sağlayıcılardan birleştirildiği için bazı alanlar kullanılamayabilir.")
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ip-sorgu")
    .setDescription("IP adresi hakkında modern konum, ağ ve güvenlik bilgileri verir.")
    .addStringOption((option) => option
      .setName("ip-adresi")
      .setDescription("Sorgulanacak IPv4 veya IPv6 adresi")
      .setRequired(true)),

  async execute(interaction) {
    const ip = String(interaction.options.getString("ip-adresi") || "").trim();
    const userId = interaction.user.id;
    const now = Date.now();

    if (!net.isIP(ip)) {
      return interaction.reply(
        buildNoticePayload("⚠️ Geçersiz IP adresi", "Geçerli bir IPv4 veya IPv6 adresi gir. (Örnek: `8.8.8.8`)", true)
      );
    }

    const limitData = loadLimitData();
    const currentTimestamp = Number(limitData[userId]?.timestamp) || 0;
    const currentCount = Math.max(0, Number(limitData[userId]?.count) || 0);

    if (!limitData[userId] || now - currentTimestamp >= RESET_SURE) {
      limitData[userId] = { timestamp: now, count: 0 };
    } else {
      limitData[userId] = { timestamp: currentTimestamp, count: currentCount };
    }

    if (limitData[userId].count >= GUNLUK_LIMIT) {
      const resetAt = Math.floor((limitData[userId].timestamp + RESET_SURE) / 1000);
      return interaction.reply(
        buildNoticePayload(
          "⏳ Sorgu sınırına ulaştın",
          `24 saatlik **${GUNLUK_LIMIT} sorgu** hakkını kullandın. Hakkın <t:${resetAt}:R> yenilenecek.`,
          true
        )
      );
    }

    await interaction.deferReply();

    try {
      const result = await queryIp(ip);
      limitData[userId].count += 1;
      saveLimitData(limitData);
      const remainingQueries = GUNLUK_LIMIT - limitData[userId].count;
      const sessionId = interaction.id;
      const message = await interaction.editReply({
        components: [buildMainContainer(result, ip, sessionId, remainingQueries)],
        flags: V2_FLAGS,
        allowedMentions: { parse: [] },
      });

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: COLLECTOR_TIME,
      });

      collector.on("collect", async (componentInteraction) => {
        if (componentInteraction.customId !== `ip:${sessionId}:details`) return;

        if (componentInteraction.user.id !== userId) {
          await componentInteraction.reply(
            buildNoticePayload("🔒 Bu sorgu sana ait değil", "Kendi panelini açmak için `/ip-sorgu` komutunu kullan.", true)
          ).catch(() => {});
          return;
        }

        const detailType = componentInteraction.values[0];
        if (!DETAIL_META[detailType]) {
          await componentInteraction.reply(
            buildNoticePayload("⚠️ Bölüm bulunamadı", "Seçilen ayrıntı bölümü artık kullanılamıyor.", true)
          ).catch(() => {});
          return;
        }

        try {
          const detailPromise = detailType === "country"
            ? (!result.enrichmentReady && result.enrichmentPromise)
            : (!result.auxiliaryReady && result.auxiliaryPromise);

          if (detailPromise) {
            await componentInteraction.reply(
              buildNoticePayload("⏳ Ayrıntılar hazırlanıyor", "Seçtiğin bölümün güncel verileri getiriliyor...")
            );
            await detailPromise;
            await componentInteraction.editReply({
              components: [buildDetailContainer(result, ip, detailType)],
              allowedMentions: { parse: [] },
            });
            return;
          }

          await componentInteraction.reply({
            components: [buildDetailContainer(result, ip, detailType)],
            flags: PRIVATE_V2_FLAGS,
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          console.warn("🟡 [IP SORGU] Ayrıntı paneli gösterilemedi:", error?.message || error);
        }
      });

      collector.on("end", async () => {
        await message.edit({
          components: [buildMainContainer(result, ip, sessionId, remainingQueries, true)],
          allowedMentions: { parse: [] },
        }).catch(() => {});
      });
    } catch (error) {
      console.error("🔴 [IP SORGU] Komut çalıştırılamadı:", error);
      const description = error?.code === "IP_LOOKUP_FAILED"
        ? `Sorgu servisi bu adres için sonuç döndürmedi: ${escapeMarkdown(error.message)}`
        : "IP bilgileri alınırken beklenmeyen bir sorun oluştu. Lütfen biraz sonra tekrar dene.";
      const payload = buildNoticePayload("⚠️ Sorgu tamamlanamadı", description, true);
      await interaction.editReply({
        components: payload.components,
        flags: V2_FLAGS,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
  },
};
