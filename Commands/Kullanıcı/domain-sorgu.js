const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const dns = require("dns").promises;
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const { domainToASCII } = require("url");
const fetch = (...args) => import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));
const { getEnv } = require("../../Utils/Core/env");

const limitDosyasi = path.join(__dirname, "../../Database/Sistem/domainSorgulaSinir.json");
const GUNLUK_LIMIT = 5;
const RESET_SURE = 24 * 60 * 60 * 1000;
const COLLECTOR_TIME = 3 * 60 * 1000;
const FETCH_TIMEOUT = 8_000;
const ACCENT_COLOR = 0x00a8fc;
const SUCCESS_COLOR = 0x2fba72;
const ERROR_COLOR = 0xed4245;
const V2_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const API_NINJAS_KEY = getEnv("API_NINJAS_KEY");
const SCREENSHOTMACHINE_KEY = getEnv("SCREENSHOTMACHINE_KEY");

const RECORD_META = Object.freeze({
  txt: {
    label: "TXT Kayıtları",
    emoji: "📝",
    description: "Doğrulama, e-posta güvenliği ve diğer metin tabanlı DNS verileri.",
  },
  mx: {
    label: "MX Kayıtları",
    emoji: "📨",
    description: "Domainin e-posta trafiğini karşılayan sunucular ve öncelikleri.",
  },
  ns: {
    label: "NS Kayıtları",
    emoji: "🧭",
    description: "Domainin DNS bölgesinden sorumlu yetkili ad sunucuları.",
  },
  a: {
    label: "IPv4 (A) Kayıtları",
    emoji: "🌐",
    description: "Domaini IPv4 adreslerine yönlendiren A kayıtları.",
  },
  aaaa: {
    label: "IPv6 (AAAA) Kayıtları",
    emoji: "🔗",
    description: "Domaini IPv6 adreslerine yönlendiren AAAA kayıtları.",
  },
  cname: {
    label: "CNAME Kayıtları",
    emoji: "🏷️",
    description: "Domain için tanımlanmış kanonik ad yönlendirmeleri.",
  },
  caa: {
    label: "CAA Kayıtları",
    emoji: "🔐",
    description: "TLS sertifikası düzenlemesine izin verilen sertifika otoriteleri.",
  },
  soa: {
    label: "SOA Kaydı",
    emoji: "🗃️",
    description: "DNS bölgesinin yetki, seri ve yenileme bilgileri.",
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
    console.error("🔴 [DOMAIN SORGU] Limit verisi okunamadı:", error);
    return {};
  }
}

function saveLimitData(data) {
  fs.writeFileSync(limitDosyasi, JSON.stringify(data, null, 2));
}

function normalizeDomain(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue || rawValue.length > 500) return null;

  try {
    const parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`);
    if (parsed.username || parsed.password) return null;

    const asciiDomain = domainToASCII(parsed.hostname.replace(/\.$/, "").toLowerCase());
    const labels = asciiDomain.split(".");
    const validLabel = (label) => /^(?!-)[a-z\d-]{1,63}(?<!-)$/.test(label);
    const validTld = /^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/.test(labels.at(-1) || "");

    if (!asciiDomain || asciiDomain.length > 253 || labels.length < 2 || !validTld || !labels.every(validLabel)) {
      return null;
    }

    return asciiDomain;
  } catch {
    return null;
  }
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function firstValue(value) {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (value === null || value === undefined || value === "") return null;
  return value;
}

function cleanText(value, fallback = "Bulunamadı") {
  const normalized = firstValue(value);
  if (normalized === null) return fallback;
  return String(normalized).replace(/[\r\n\t]+/g, " ").trim() || fallback;
}

function inlineCode(value, fallback = "Bulunamadı") {
  return `\`${cleanText(value, fallback).replace(/`/g, "'")}\``;
}

function countryFlag(countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

function formatWhoisDate(value) {
  const normalized = firstValue(value);
  if (normalized === null) return inlineCode(null);

  let milliseconds = null;
  const numericValue = Number(normalized);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    milliseconds = numericValue < 100_000_000_000 ? numericValue * 1000 : numericValue;
  } else {
    const parsed = Date.parse(String(normalized));
    if (Number.isFinite(parsed)) milliseconds = parsed;
  }

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return inlineCode(normalized);

  const unixTimestamp = Math.floor(milliseconds / 1000);
  return `<t:${unixTimestamp}:D>  •  <t:${unixTimestamp}:R>`;
}

function formatDuration(seconds) {
  const numericValue = Number(seconds);
  if (!Number.isFinite(numericValue) || numericValue < 0) return cleanText(seconds);

  if (numericValue % 86_400 === 0) return `${numericValue / 86_400} gün`;
  if (numericValue % 3_600 === 0) return `${numericValue / 3_600} saat`;
  if (numericValue % 60 === 0) return `${numericValue / 60} dakika`;
  return `${numericValue} saniye`;
}

async function resolveSafely(label, resolver) {
  try {
    return await resolver();
  } catch (error) {
    if (!["ENODATA", "ENOTFOUND", "ENODOMAIN", "ESERVFAIL", "EREFUSED"].includes(error?.code)) {
      console.warn(`🟡 [DOMAIN SORGU] ${label} kaydı alınamadı:`, error?.code || error?.message || error);
    }
    return null;
  }
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

function formatCaaRecord(record) {
  if (!record || typeof record !== "object") return cleanText(record);
  const property = ["issue", "issuewild", "iodef"].find((key) => record[key]);
  const value = property ? record[property] : Object.values(record).find((item) => typeof item === "string");
  const critical = record.critical ? "kritik" : "standart";
  return `${String(property || "CAA").toUpperCase()} — ${cleanText(value)} (${critical})`;
}

function formatSoaRecord(record) {
  if (!record || typeof record !== "object") return [];

  return [
    `Birincil NS — ${cleanText(record.nsname)}`,
    `Yönetici — ${cleanText(record.hostmaster)}`,
    `Seri — ${cleanText(record.serial)}`,
    `Yenileme — ${formatDuration(record.refresh)}`,
    `Yeniden deneme — ${formatDuration(record.retry)}`,
    `Geçerlilik — ${formatDuration(record.expire)}`,
    `Minimum TTL — ${formatDuration(record.minttl)}`,
  ];
}

function createRecordMap(records) {
  return {
    txt: records.txt.map((record) => Array.isArray(record) ? record.join("") : cleanText(record)),
    mx: [...records.mx]
      .sort((a, b) => (a.priority || 0) - (b.priority || 0))
      .map((record) => `${cleanText(record.exchange)} — Öncelik: ${cleanText(record.priority, "0")}`),
    ns: records.ns.map((record) => cleanText(record)),
    a: records.a.map((record) => cleanText(record)),
    aaaa: records.aaaa.map((record) => cleanText(record)),
    cname: records.cname.map((record) => cleanText(record)),
    caa: records.caa.map(formatCaaRecord),
    soa: formatSoaRecord(records.soa),
  };
}

function splitLongValue(value, maxLength = 1_350) {
  const text = cleanText(value);
  if (text.length <= maxLength) return [text];

  const chunks = [];
  for (let offset = 0; offset < text.length; offset += maxLength) {
    chunks.push(text.slice(offset, offset + maxLength));
  }
  return chunks;
}

function createRecordEntries(records) {
  return records.flatMap((record, recordIndex) => {
    const chunks = splitLongValue(record);
    return chunks.map((chunk, chunkIndex) => ({
      label: chunks.length > 1 ? `${recordIndex + 1}.${chunkIndex + 1}` : `${recordIndex + 1}`,
      value: chunk,
    }));
  });
}

function paginateEntries(entries, maxItems = 8, maxCharacters = 2_800) {
  if (!entries.length) return [[]];

  const pages = [];
  let page = [];
  let characterCount = 0;

  for (const entry of entries) {
    const lineLength = entry.label.length + entry.value.length + 12;
    if (page.length && (page.length >= maxItems || characterCount + lineLength > maxCharacters)) {
      pages.push(page);
      page = [];
      characterCount = 0;
    }

    page.push(entry);
    characterCount += lineLength;
  }

  if (page.length) pages.push(page);
  return pages;
}

function buildNoticePayload(title, description, isError = false) {
  const container = new ContainerBuilder()
    .setAccentColor(isError ? ERROR_COLOR : ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );

  return {
    components: [container],
    flags: PRIVATE_V2_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function getRecordCount(recordType, records) {
  return recordType === "soa" ? Number(records.length > 0) : records.length;
}

function buildRecordSelect(sessionId, recordMap, disabled = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`domain:${sessionId}:records`)
    .setPlaceholder(disabled ? "Sorgu panelinin süresi doldu" : "İncelenecek kayıt türünü seç...")
    .setDisabled(disabled)
    .addOptions(
      Object.entries(RECORD_META).map(([value, meta]) => ({
        label: meta.label,
        value,
        emoji: meta.emoji,
        description: `${getRecordCount(value, recordMap[value])} kayıt • ${meta.description}`.slice(0, 100),
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildMainContainer(data, sessionId, remainingQueries, disabled = false) {
  const { domain, ip, ipDetails, recordMap, screenshotURL, whoisData } = data;
  const dnsResolved = recordMap.a.length > 0 || recordMap.aaaa.length > 0 || recordMap.cname.length > 0;
  const location = [ipDetails.city, ipDetails.region, ipDetails.country].filter(Boolean).join(", ");
  const isp = ipDetails.connection?.isp || ipDetails.connection?.org;
  const asn = ipDetails.connection?.asn;
  const registrar = cleanText(whoisData.registrar);
  const faviconURL = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const statusText = dnsResolved
    ? "🟢 DNS çözümlemesi başarılı"
    : "🟠 Adres kaydı çözümlenemedi";

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 🌐 Domain Sorgu",
        `### ${escapeMarkdown(domain)}`,
        `${statusText}  •  <t:${Math.floor(Date.now() / 1000)}:R>`,
      ].join("\n"))
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(faviconURL));

  const networkDetails = new TextDisplayBuilder().setContent([
    "### Ağ ve Konum",
    `**Birincil IP**  ${inlineCode(ip)}`,
    `**Konum**  ${countryFlag(ipDetails.country_code)} ${inlineCode(location)}`,
    `**Ağ sağlayıcısı**  ${inlineCode(isp)}${asn ? `  •  ${inlineCode(`AS${asn}`)}` : ""}`,
  ].join("\n"));

  const registrationDetails = new TextDisplayBuilder().setContent([
    "### Domain",
    `**Kayıt firması**  ${inlineCode(registrar)}`,
    `**Oluşturulma**  ${formatWhoisDate(whoisData.creation_date)}`,
    `**Güncellenme**  ${formatWhoisDate(whoisData.updated_date)}`,
    `**Bitiş**  ${formatWhoisDate(whoisData.expiration_date)}`,
  ].join("\n"));

  const inventory = new TextDisplayBuilder().setContent([
    "### DNS",
    `🌐 **A** ${recordMap.a.length}  •  🔗 **AAAA** ${recordMap.aaaa.length}  •  🏷️ **CNAME** ${recordMap.cname.length}  •  📨 **MX** ${recordMap.mx.length}`,
    `🧭 **NS** ${recordMap.ns.length}  •  📝 **TXT** ${recordMap.txt.length}  •  🔐 **CAA** ${recordMap.caa.length}  •  🗃️ **SOA** ${recordMap.soa.length ? 1 : 0}`,
    `**Kanonik ad**  ${inlineCode(recordMap.cname[0])}`,
  ].join("\n"));

  const websiteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Siteyi Aç")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://${domain}`),
    new ButtonBuilder()
      .setCustomId(`domain:${sessionId}:quota`)
      .setLabel(`${remainingQueries} / ${GUNLUK_LIMIT} sorgu hakkı`)
      .setEmoji("🔎")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  const container = new ContainerBuilder()
    .setAccentColor(dnsResolved ? ACCENT_COLOR : ERROR_COLOR)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(networkDetails)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(registrationDetails)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(inventory);

  if (screenshotURL) {
    container
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Site Önizlemesi")
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(screenshotURL)
        )
      );
  }

  return container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# ⚖️ **__Sonuçlar bilgilendirme amaçlıdır.__** DNS kayıtlarını ayrıntılı ve sayfalı görüntülemek için aşağıdaki menüyü kullan."
      )
    )
    .addActionRowComponents(buildRecordSelect(sessionId, recordMap, disabled))
    .addActionRowComponents(websiteRow);
}

function buildPaginationRow(sessionId, recordType, pageIndex, pageCount, disabled = false) {
  const prefix = `domain:${sessionId}:${recordType}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:previous`)
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}:page`)
      .setLabel(`${pageIndex + 1} / ${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${prefix}:next`)
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex >= pageCount - 1)
  );
}

function buildRecordDetail(domain, recordType, records, pageIndex, sessionId, disabled = false, expiresAt = null) {
  const meta = RECORD_META[recordType];
  const pages = paginateEntries(createRecordEntries(records));
  const safePageIndex = Math.min(Math.max(0, pageIndex), pages.length - 1);
  const page = pages[safePageIndex];
  const recordCount = getRecordCount(recordType, records);
  const footer = disabled
    ? `-# Panelin süresi doldu.`
    : `-# Panel <t:${Math.floor((expiresAt || Date.now() + COLLECTOR_TIME) / 1000)}:R> kapanacak.`;
  const content = page.length
    ? page.map((entry) => `**${entry.label}.** ${inlineCode(entry.value)}`).join("\n")
    : "### Kayıt bulunamadı\nBu domain için seçilen türde yayımlanmış bir DNS kaydı yok.";

  const container = new ContainerBuilder()
    .setAccentColor(page.length ? SUCCESS_COLOR : ERROR_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${meta.emoji} ${meta.label}`,
        `**${escapeMarkdown(domain)}**  •  ${recordCount} kayıt`,
        meta.description,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footer)
    )
    .addActionRowComponents(
      buildPaginationRow(sessionId, recordType, safePageIndex, pages.length, disabled)
    );

  return { container, pageIndex: safePageIndex, pageCount: pages.length };
}

async function openRecordDetail(componentInteraction, context, recordType) {
  const records = context.recordMap[recordType];
  const expiresAt = Date.now() + COLLECTOR_TIME;
  let pageIndex = 0;
  let view = buildRecordDetail(context.domain, recordType, records, pageIndex, context.sessionId, false, expiresAt);
  const response = await componentInteraction.reply({
    components: [view.container],
    flags: PRIVATE_V2_FLAGS,
    allowedMentions: { parse: [] },
    withResponse: true,
  });
  const detailMessage = response.resource?.message || await componentInteraction.fetchReply();
  const customIdPrefix = `domain:${context.sessionId}:${recordType}:`;
  const collector = detailMessage.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_TIME,
  });

  collector.on("collect", async (buttonInteraction) => {
    if (!buttonInteraction.customId.startsWith(customIdPrefix)) return;

    if (buttonInteraction.user.id !== context.ownerId) {
      await buttonInteraction.reply(
        buildNoticePayload("🔒 Bu sorgu sana ait değil", "Kendi sorgunu açmak için `/domain-sorgu` komutunu kullan.", true)
      ).catch(() => {});
      return;
    }

    const action = buttonInteraction.customId.slice(customIdPrefix.length);
    if (action === "previous") pageIndex -= 1;
    if (action === "next") pageIndex += 1;
    if (!["previous", "next"].includes(action)) return;

    view = buildRecordDetail(context.domain, recordType, records, pageIndex, context.sessionId, false, expiresAt);
    pageIndex = view.pageIndex;
    await buttonInteraction.update({
      components: [view.container],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  });

  collector.on("end", async () => {
    view = buildRecordDetail(context.domain, recordType, records, pageIndex, context.sessionId, true, expiresAt);
    await detailMessage.edit({
      components: [view.container],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("domain-sorgu")
    .setDescription("Domain hakkında modern DNS, ağ ve WHOIS bilgileri verir.")
    .addStringOption((option) => option
      .setName("domain")
      .setDescription("Sorgulanacak domain veya adres (ör. alkan.web.tr)")
      .setRequired(true)),

  async execute(interaction) {
    const domain = normalizeDomain(interaction.options.getString("domain"));
    const userId = interaction.user.id;
    const now = Date.now();

    if (!domain) {
      return interaction.reply(
        buildNoticePayload("⚠️ Geçersiz domain", "Geçerli bir domain veya adres gir. (Örnek: `alkan.web.tr`)", true)
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
      limitData[userId].count += 1;
      saveLimitData(limitData);
      const remainingQueries = GUNLUK_LIMIT - limitData[userId].count;

      const [ aResult, aaaaResult, mxResult, txtResult, nsResult, cnameResult, caaResult, soaResult, lookupResult ] = await Promise.all([
        resolveSafely("A", () => dns.resolve4(domain)),
        resolveSafely("AAAA", () => dns.resolve6(domain)),
        resolveSafely("MX", () => dns.resolveMx(domain)),
        resolveSafely("TXT", () => dns.resolveTxt(domain)),
        resolveSafely("NS", () => dns.resolveNs(domain)),
        resolveSafely("CNAME", () => dns.resolveCname(domain)),
        resolveSafely("CAA", () => dns.resolveCaa(domain)),
        resolveSafely("SOA", () => dns.resolveSoa(domain)),
        resolveSafely("IP", () => dns.lookup(domain)),
      ]);

      const rawRecords = {
        a: aResult || [],
        aaaa: aaaaResult || [],
        mx: mxResult || [],
        txt: txtResult || [],
        ns: nsResult || [],
        cname: cnameResult || [],
        caa: caaResult || [],
        soa: soaResult || null,
      };
      const recordMap = createRecordMap(rawRecords);
      const ip = rawRecords.a[0] || lookupResult?.address || rawRecords.aaaa[0] || null;

      const [ipDetailsResult, whoisResult] = await Promise.all([
        ip
          ? fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`)
            .catch((error) => {
              console.warn("🟡 [DOMAIN SORGU] IP konumu alınamadı:", error?.message || error);
              return {};
            })
          : {},
        API_NINJAS_KEY
          ? fetchJson(`https://api.api-ninjas.com/v1/whois?domain=${encodeURIComponent(domain)}`, {
            headers: { "X-Api-Key": API_NINJAS_KEY },
          }).catch((error) => {
            console.warn("🟡 [DOMAIN SORGU] WHOIS bilgisi alınamadı:", error?.message || error);
            return {};
          })
          : {},
      ]);

      const ipDetails = ipDetailsResult?.success === false ? {} : ipDetailsResult;
      const whoisData = whoisResult && typeof whoisResult === "object" ? whoisResult : {};
      const screenshotURL = SCREENSHOTMACHINE_KEY
        ? `https://api.screenshotmachine.com/?key=${encodeURIComponent(SCREENSHOTMACHINE_KEY)}&url=${encodeURIComponent(`https://${domain}`)}&dimension=1024x768&format=png`
        : null;
      const sessionId = interaction.id;
      const context = { domain, ownerId: userId, recordMap, sessionId };
      const mainData = { domain, ip, ipDetails, recordMap, screenshotURL, whoisData };

      const message = await interaction.editReply({
        components: [buildMainContainer(mainData, sessionId, remainingQueries)],
        flags: V2_FLAGS,
        allowedMentions: { parse: [] },
      });

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: COLLECTOR_TIME,
      });

      collector.on("collect", async (componentInteraction) => {
        if (componentInteraction.customId !== `domain:${sessionId}:records`) return;

        if (componentInteraction.user.id !== userId) {
          await componentInteraction.reply(
            buildNoticePayload("🔒 Bu sorgu sana ait değil", "Kendi panelini açmak için `/domain-sorgu` komutunu kullan.", true)
          ).catch(() => {});
          return;
        }

        const recordType = componentInteraction.values[0];
        if (!RECORD_META[recordType]) {
          await componentInteraction.reply(
            buildNoticePayload("⚠️ Kayıt türü bulunamadı", "Seçilen DNS kayıt türü artık kullanılamıyor.", true)
          ).catch(() => {});
          return;
        }

        await openRecordDetail(componentInteraction, context, recordType).catch(async (error) => {
          console.error("🔴 [DOMAIN SORGU] Kayıt paneli açılamadı:", error);
          if (!componentInteraction.replied && !componentInteraction.deferred) {
            await componentInteraction.reply(
              buildNoticePayload("⚠️ Kayıtlar gösterilemedi", "Bu DNS kayıtları şu anda görüntülenemiyor.", true)
            ).catch(() => {});
          }
        });
      });

      collector.on("end", async () => {
        await message.edit({
          components: [buildMainContainer(mainData, sessionId, remainingQueries, true)],
          allowedMentions: { parse: [] },
        }).catch(() => {});
      });
    } catch (error) {
      console.error("🔴 [DOMAIN SORGU] Komut çalıştırılamadı:", error);
      const payload = buildNoticePayload(
        "⚠️ Sorgu tamamlanamadı",
        "Domain bilgileri alınırken beklenmeyen bir sorun oluştu. Lütfen biraz sonra tekrar dene.",
        true
      );
      await interaction.editReply({
        components: payload.components,
        flags: V2_FLAGS,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
  },
};
