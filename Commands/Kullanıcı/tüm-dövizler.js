const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const { parseStringPromise } = require("xml2js");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const csfetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const BIGPARA_URL = "https://api.bigpara.hurriyet.com.tr/doviz/headerlist/anasayfa";
const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const WIDTH = 1200;
const SIDE_PADDING = 48;
const CARD_GAP = 20;
const CARD_HEIGHT = 240;
const CARD_TOP = 305;
const FONT_FAMILY = '"Manrope", "Noto Sans", Arial, sans-serif';
const REFRESH_CUSTOM_ID = "doviz_refresh";
const refreshLocks = new Set();

const COLORS = {
  background: "#050914",
  panel: "#0D1525",
  panelSoft: "#111D31",
  border: "rgba(151, 174, 210, 0.16)",
  text: "#F4F8FF",
  muted: "#8594AC",
  blue: "#4C8DFF",
  cyan: "#32D7E8",
  green: "#38E2A0",
  red: "#FF6685",
  amber: "#F8C86A"
};

const INSTRUMENTS = [
  { symbol: "USDTRY", code: "USD", name: "Amerikan Doları", sign: "$" },
  { symbol: "EURTRY", code: "EUR", name: "Euro", sign: "€" },
  { symbol: "GBPTRY", code: "GBP", name: "İngiliz Sterlini", sign: "£" },
  { symbol: "CHFTRY", code: "CHF", name: "İsviçre Frangı", sign: "₣" },
  { symbol: "JPYTRY", code: "JPY", name: "Japon Yeni", sign: "¥" },
  { symbol: "CADTRY", code: "CAD", name: "Kanada Doları", sign: "C$" },
  { symbol: "AUDTRY", code: "AUD", name: "Avustralya Doları", sign: "A$" },
  { symbol: "SARTRY", code: "SAR", name: "Suudi Arabistan Riyali", sign: "SR" },
  { symbol: "GLDGR", code: "XAU", name: "Gram Altın", sign: "Au" }
];

registerFonts();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tüm-dövizler")
    .setDescription("Canlı döviz kurlarını modern piyasa ekranında gösterir."),

  async execute(interaction) {
    await interaction.reply("💱 Döviz piyasası hazırlanıyor...");

    const payload = await createMarketPayload(interaction.user.id);
    if (!payload) {
      return interaction.editReply("⚠️ **Döviz verileri şu anda alınamıyor. Lütfen biraz sonra tekrar dene.**");
    }

    return interaction.editReply(payload);
  },

  async handleRefresh(interaction) {
    const [, requesterId] = interaction.customId.split(":");

    if (requesterId && interaction.user.id !== requesterId) {
      return interaction.reply({
        content: "⚠️ **Bu döviz panelini yalnızca komutu kullanan kişi güncelleyebilir.**",
        flags: 64
      });
    }

    const lockId = interaction.message?.id || requesterId || interaction.id;
    if (refreshLocks.has(lockId)) {
      return interaction.reply({
        content: "⏳ **Döviz verileri zaten güncelleniyor.**",
        flags: 64
      });
    }

    refreshLocks.add(lockId);

    try {
      await interaction.deferUpdate();
      const payload = await createMarketPayload(requesterId || interaction.user.id);
      if (!payload) {
        return await interaction.followUp({
          content: "⚠️ **Yeni döviz verileri alınamadı; mevcut panel korundu.**",
          flags: 64
        });
      }

      return await interaction.editReply(payload);
    } finally {
      refreshLocks.delete(lockId);
    }
  },

  renderCurrencyDashboard,
  mergeMarketData,
  parseTcmbCurrencies,
  buildRefreshRow
};

async function createMarketPayload(requesterId) {
  const market = await fetchMarketData();
  if (!market.instruments.length) return null;

  const image = renderCurrencyDashboard(market);
  const attachment = new AttachmentBuilder(image, { name: "doviz-piyasasi.png" });

  return {
    content: "",
    attachments: [],
    files: [attachment],
    components: [buildRefreshRow(requesterId)]
  };
}

function buildRefreshRow(requesterId) {
  const button = new ButtonBuilder()
    .setCustomId(`${REFRESH_CUSTOM_ID}:${requesterId}`)
    .setLabel("Verileri Güncelle")
    .setEmoji(`${emojiler.yukleniyor}`)
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(button);
}

async function fetchMarketData() {
  const [bigparaResult, tcmbResult] = await Promise.allSettled([
    fetchJson(BIGPARA_URL),
    fetchText(TCMB_URL)
  ]);

  const bigparaItems = bigparaResult.status === "fulfilled" && Array.isArray(bigparaResult.value?.data)
    ? bigparaResult.value.data
    : [];
  let tcmbItems = [];

  if (bigparaResult.status === "rejected") {
    console.warn("⚠️ [TÜM DÖVİZLER] BigPara verisi alınamadı:", bigparaResult.reason?.message);
  }

  if (tcmbResult.status === "fulfilled") {
    try {
      tcmbItems = await parseTcmbCurrencies(tcmbResult.value);
    } catch (error) {
      console.warn("⚠️ [TÜM DÖVİZLER] TCMB verisi işlenemedi:", error.message);
    }
  } else {
    console.warn("⚠️ [TÜM DÖVİZLER] TCMB verisi alınamadı:", tcmbResult.reason?.message);
  }

  const instruments = mergeMarketData(bigparaItems, tcmbItems);
  const sources = [...new Set(instruments.map(item => item.source))];
  const newestTimestamp = instruments
    .map(item => Date.parse(item.timestamp))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return {
    instruments,
    sources,
    updatedAt: newestTimestamp || Date.now()
  };
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  return response.text();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await csfetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; DiscordCurrencyBot/1.0)" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseTcmbCurrencies(xml) {
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
  const root = parsed?.Tarih_Date;
  const entries = root?.Currency ? [].concat(root.Currency) : [];

  return entries.map(entry => {
    const code = entry?.$?.CurrencyCode;
    const unit = Math.max(1, toNumber(entry.Unit) || 1);

    return {
      symbol: `${code}TRY`,
      code,
      name: safeText(entry.Isim || entry.CurrencyName || code),
      buy: toNumber(entry.ForexBuying),
      sell: toNumber(entry.ForexSelling),
      current: toNumber(entry.ForexSelling),
      low: null,
      high: null,
      change: null,
      source: "TCMB",
      unit,
      timestamp: parseTcmbDate(root?.$?.Tarih)
    };
  }).filter(item => item.code && Number.isFinite(item.buy) && Number.isFinite(item.sell));
}

function mergeMarketData(bigparaItems, tcmbItems) {
  const bigparaMap = new Map(
    bigparaItems
      .filter(item => item?.SEMBOL)
      .map(item => [item.SEMBOL, normalizeBigparaItem(item)])
  );
  const tcmbMap = new Map(tcmbItems.map(item => [item.code, item]));

  return INSTRUMENTS.map(definition => {
    const liveData = bigparaMap.get(definition.symbol);
    const data = Number.isFinite(liveData?.buy) && Number.isFinite(liveData?.sell)
      ? liveData
      : tcmbMap.get(definition.code);
    if (!data) return null;

    return {
      ...data,
      ...definition,
      unit: data.unit || 1
    };
  }).filter(Boolean);
}

function normalizeBigparaItem(item) {
  return {
    symbol: item.SEMBOL,
    buy: toNumber(item.ALIS),
    sell: toNumber(item.SATIS),
    current: toNumber(item.KAPANIS) ?? toNumber(item.SATIS),
    low: toNumber(item.DUSUK),
    high: toNumber(item.YUKSEK),
    change: toNumber(item.YUZDEDEGISIM),
    source: "BigPara",
    unit: 1,
    timestamp: item.TARIH || null
  };
}

function renderCurrencyDashboard({ instruments, sources = [], updatedAt = Date.now() }) {
  const columns = 3;
  const rows = Math.ceil(instruments.length / columns);
  const footerTop = CARD_TOP + rows * CARD_HEIGHT + Math.max(0, rows - 1) * CARD_GAP + 36;
  const height = footerTop + 70;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, height);
  drawHeader(ctx, instruments, updatedAt);
  drawSectionHeading(ctx, instruments.length);

  const cardWidth = (WIDTH - SIDE_PADDING * 2 - CARD_GAP * (columns - 1)) / columns;
  instruments.forEach((item, index) => {
    const x = SIDE_PADDING + (index % columns) * (cardWidth + CARD_GAP);
    const y = CARD_TOP + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP);
    drawCurrencyCard(ctx, item, x, y, cardWidth, CARD_HEIGHT);
  });

  drawFooter(ctx, footerTop, sources, updatedAt);
  return canvas.toBuffer("image/png");
}

function drawBackground(ctx, height) {
  const background = ctx.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, "#060A15");
  background.addColorStop(0.55, "#07111E");
  background.addColorStop(1, "#040812");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, height);

  drawGlow(ctx, 110, 80, 360, "rgba(45, 117, 255, 0.18)");
  drawGlow(ctx, WIDTH - 80, 250, 400, "rgba(45, 221, 195, 0.11)");
  drawGlow(ctx, WIDTH * 0.55, height, 460, "rgba(106, 80, 255, 0.08)");

  ctx.save();
  ctx.strokeStyle = "rgba(113, 142, 184, 0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeader(ctx, instruments, updatedAt) {
  const headerGradient = ctx.createLinearGradient(SIDE_PADDING, 36, WIDTH - SIDE_PADDING, 246);
  headerGradient.addColorStop(0, "rgba(14, 27, 48, 0.96)");
  headerGradient.addColorStop(1, "rgba(8, 19, 35, 0.92)");
  fillRoundedRect(ctx, SIDE_PADDING, 34, WIDTH - SIDE_PADDING * 2, 208, 26, headerGradient);
  strokeRoundedRect(ctx, SIDE_PADDING, 34, WIDTH - SIDE_PADDING * 2, 208, 26, "rgba(121, 161, 221, 0.18)");

  const logoGradient = ctx.createLinearGradient(72, 61, 129, 119);
  logoGradient.addColorStop(0, COLORS.blue);
  logoGradient.addColorStop(1, COLORS.cyan);
  fillRoundedRect(ctx, 72, 61, 58, 58, 18, logoGradient);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 31px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₺", 101, 91);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 31px ${FONT_FAMILY}`;
  ctx.fillText("DÖVİZ PİYASASI", 151, 84);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 15px ${FONT_FAMILY}`;
  ctx.fillText("TRY bazlı canlı kurlar ve kıymetli maden terminali", 151, 110);

  drawStatusPill(ctx, WIDTH - 256, 67, "CANLI PİYASA");
  ctx.fillStyle = "#52627B";
  ctx.font = `700 11px ${FONT_FAMILY}`;
  ctx.textAlign = "right";
  ctx.fillText("FX TERMINAL  /  01", WIDTH - 76, 119);

  const changed = instruments.filter(item => Number.isFinite(item.change));
  const rising = changed.filter(item => item.change > 0).length;
  const falling = changed.filter(item => item.change < 0).length;
  const neutral = changed.length - rising - falling;
  const cards = [
    { label: "TAKİP EDİLEN", value: `${instruments.length} VARLIK`, color: COLORS.cyan },
    { label: "PİYASA EĞİLİMİ", value: `${rising} YÜKSELİŞ  ·  ${falling} DÜŞÜŞ`, color: rising >= falling ? COLORS.green : COLORS.red },
    { label: "SON GÜNCELLEME", value: formatDateTime(updatedAt), color: COLORS.blue }
  ];

  cards.forEach((card, index) => {
    const x = 72 + index * 352;
    drawSummaryCard(ctx, x, 145, 330, 70, card, index === 1 ? { rising, falling, neutral } : null);
  });
}

function drawSummaryCard(ctx, x, y, width, height, card, distribution) {
  fillRoundedRect(ctx, x, y, width, height, 15, "rgba(255, 255, 255, 0.035)");
  strokeRoundedRect(ctx, x, y, width, height, 15, "rgba(255, 255, 255, 0.07)");

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = card.color;
  ctx.fillRect(x + 17, y + 17, 3, 35);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 10px ${FONT_FAMILY}`;
  ctx.fillText(card.label, x + 32, y + 27);
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 17px ${FONT_FAMILY}`;
  ctx.fillText(card.value, x + 32, y + 51);

  if (distribution) {
    const total = Math.max(1, distribution.rising + distribution.falling + distribution.neutral);
    const barX = x + 228;
    const barY = y + 46;
    const barWidth = 82;
    let cursor = barX;
    [
      [distribution.rising, COLORS.green],
      [distribution.falling, COLORS.red],
      [distribution.neutral, COLORS.amber]
    ].forEach(([count, color]) => {
      const segmentWidth = (count / total) * barWidth;
      ctx.fillStyle = color;
      ctx.fillRect(cursor, barY, segmentWidth, 4);
      cursor += segmentWidth;
    });
  }
}

function drawSectionHeading(ctx, count) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 17px ${FONT_FAMILY}`;
  ctx.fillText("PİYASA KARTLARI", SIDE_PADDING, 278);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 12px ${FONT_FAMILY}`;
  ctx.textAlign = "right";
  ctx.fillText(`${count} seçilmiş varlık  •  Alış / satış / günlük aralık`, WIDTH - SIDE_PADDING, 278);
  ctx.textAlign = "left";
}

function drawCurrencyCard(ctx, item, x, y, width, height) {
  const direction = getDirection(item.change);
  const accent = direction.color;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 9;
  const cardGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  cardGradient.addColorStop(0, "rgba(17, 30, 51, 0.98)");
  cardGradient.addColorStop(1, "rgba(9, 18, 33, 0.98)");
  fillRoundedRect(ctx, x, y, width, height, 21, cardGradient);
  ctx.restore();

  strokeRoundedRect(ctx, x, y, width, height, 21, COLORS.border);
  ctx.save();
  roundedPath(ctx, x, y, width, height, 21);
  ctx.clip();
  const accentGradient = ctx.createLinearGradient(x, y, x + width, y);
  accentGradient.addColorStop(0, accent);
  accentGradient.addColorStop(0.72, colorWithAlpha(accent, 0.15));
  accentGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = accentGradient;
  ctx.fillRect(x, y, width, 3);
  ctx.restore();

  const iconGradient = ctx.createLinearGradient(x + 20, y + 20, x + 70, y + 70);
  iconGradient.addColorStop(0, colorWithAlpha(accent, 0.27));
  iconGradient.addColorStop(1, "rgba(255, 255, 255, 0.035)");
  fillRoundedRect(ctx, x + 20, y + 21, 48, 48, 15, iconGradient);
  strokeRoundedRect(ctx, x + 20, y + 21, 48, 48, 15, colorWithAlpha(accent, 0.38));
  ctx.fillStyle = accent;
  ctx.font = `800 ${item.sign.length > 1 ? 15 : 23}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.sign, x + 44, y + 46);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 18px ${FONT_FAMILY}`;
  ctx.fillText(item.symbol === "GLDGR" ? "GRAM ALTIN" : `${item.code} / TRY`, x + 82, y + 40);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 11px ${FONT_FAMILY}`;
  ctx.fillText(item.unit > 1 ? `${item.unit} ${item.name}` : item.name, x + 82, y + 60);

  drawChangeBadge(ctx, item.change, x + width - 100, y + 25, 80, 31);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.strokeStyle = "rgba(151, 174, 210, 0.10)";
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 85);
  ctx.lineTo(x + width - 20, y + 85);
  ctx.stroke();

  drawPrice(ctx, "ALIŞ", item.buy, x + 21, y + 107, width / 2 - 26);
  drawPrice(ctx, "SATIŞ", item.sell, x + width / 2 + 5, y + 107, width / 2 - 26);

  const hasRange = Number.isFinite(item.low) && Number.isFinite(item.high) && item.high >= item.low;
  if (hasRange) {
    drawDailyRange(ctx, item, x + 21, y + 165, width - 42);
  } else {
    drawOfficialRateBar(ctx, item, x + 21, y + 165, width - 42);
  }

  ctx.fillStyle = "#61718A";
  ctx.font = `700 9px ${FONT_FAMILY}`;
  ctx.fillText(item.source === "TCMB" ? "●  TCMB GÖSTERGE KURU" : "●  BIGPARA CANLI VERİ", x + 21, y + 224);
}

function drawPrice(ctx, label, value, x, y, maxWidth) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 10px ${FONT_FAMILY}`;
  ctx.fillText(label, x, y);
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 20px ${FONT_FAMILY}`;
  fitText(ctx, `${formatRate(value)} ₺`, x, y + 27, maxWidth, 20, 14);
}

function drawDailyRange(ctx, item, x, y, width) {
  const low = item.low;
  const high = item.high;
  const current = Number.isFinite(item.current) ? item.current : item.sell;
  const position = high === low ? 0.5 : clamp((current - low) / (high - low), 0, 1);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 9px ${FONT_FAMILY}`;
  ctx.fillText("GÜN İÇİ ARALIK", x, y);
  ctx.textAlign = "right";
  ctx.fillText(`${formatRate(low)} — ${formatRate(high)}`, x + width, y);
  ctx.textAlign = "left";

  const trackY = y + 18;
  fillRoundedRect(ctx, x, trackY, width, 7, 4, "rgba(126, 149, 184, 0.15)");
  const rangeGradient = ctx.createLinearGradient(x, trackY, x + width, trackY);
  rangeGradient.addColorStop(0, COLORS.red);
  rangeGradient.addColorStop(0.5, COLORS.amber);
  rangeGradient.addColorStop(1, COLORS.green);
  fillRoundedRect(ctx, x, trackY, Math.max(7, width * position), 7, 4, rangeGradient);

  const markerX = x + width * position;
  ctx.beginPath();
  ctx.arc(markerX, trackY + 3.5, 6, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.text;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(6, 12, 23, 0.9)";
  ctx.stroke();
}

function drawOfficialRateBar(ctx, item, x, y, width) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 9px ${FONT_FAMILY}`;
  ctx.fillText("ALIŞ — SATIŞ MAKASI", x, y);
  ctx.textAlign = "right";
  ctx.fillText(formatSpread(item.buy, item.sell), x + width, y);
  ctx.textAlign = "left";

  const trackY = y + 18;
  fillRoundedRect(ctx, x, trackY, width, 7, 4, "rgba(126, 149, 184, 0.15)");
  const spreadGradient = ctx.createLinearGradient(x, trackY, x + width, trackY);
  spreadGradient.addColorStop(0, COLORS.blue);
  spreadGradient.addColorStop(1, COLORS.cyan);
  fillRoundedRect(ctx, x, trackY, width, 7, 4, spreadGradient);
  [x + 3.5, x + width - 3.5].forEach(pointX => {
    ctx.beginPath();
    ctx.arc(pointX, trackY + 3.5, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.text;
    ctx.fill();
  });
}

function drawChangeBadge(ctx, change, x, y, width, height) {
  if (!Number.isFinite(change)) {
    fillRoundedRect(ctx, x, y, width, height, 10, "rgba(76, 141, 255, 0.10)");
    ctx.fillStyle = COLORS.blue;
    ctx.font = `800 9px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RESMÎ KUR", x + width / 2, y + height / 2);
    return;
  }

  const direction = getDirection(change);
  fillRoundedRect(ctx, x, y, width, height, 10, colorWithAlpha(direction.color, 0.11));
  strokeRoundedRect(ctx, x, y, width, height, 10, colorWithAlpha(direction.color, 0.24));
  ctx.fillStyle = direction.color;
  ctx.font = `800 11px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${direction.prefix}${formatPercent(change)}`, x + width / 2, y + height / 2);
}

function drawFooter(ctx, y, sources, updatedAt) {
  ctx.strokeStyle = "rgba(151, 174, 210, 0.11)";
  ctx.beginPath();
  ctx.moveTo(SIDE_PADDING, y);
  ctx.lineTo(WIDTH - SIDE_PADDING, y);
  ctx.stroke();

  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 11px ${FONT_FAMILY}`;
  ctx.fillText(`VERİ KAYNAĞI  ${sources.join(" + ") || "—"}`, SIDE_PADDING, y + 30);
  ctx.textAlign = "right";
  ctx.fillText(`GÜNCELLEME  ${formatDateTime(updatedAt)}  •  YATIRIM TAVSİYESİ DEĞİLDİR`, WIDTH - SIDE_PADDING, y + 30);
  ctx.textAlign = "left";
}

function drawStatusPill(ctx, x, y, text) {
  fillRoundedRect(ctx, x, y, 180, 32, 12, "rgba(56, 226, 160, 0.09)");
  strokeRoundedRect(ctx, x, y, 180, 32, 12, "rgba(56, 226, 160, 0.23)");
  ctx.beginPath();
  ctx.arc(x + 19, y + 16, 4, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.green;
  ctx.fill();
  ctx.fillStyle = COLORS.green;
  ctx.font = `800 11px ${FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 31, y + 16);
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, strokeStyle) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function roundedPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
}

function fitText(ctx, text, x, y, maxWidth, startSize, minimumSize) {
  let size = startSize;
  do {
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  } while (size >= minimumSize);
  ctx.fillText(text, x, y);
}

function getDirection(value) {
  if (!Number.isFinite(value) || value === 0) return { color: COLORS.amber, prefix: "" };
  return value > 0
    ? { color: COLORS.green, prefix: "+" }
    : { color: COLORS.red, prefix: "−" };
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1000 ? 2 : absolute >= 10 ? 4 : absolute >= 1 ? 4 : 5;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: absolute >= 1000 ? 2 : 0,
    maximumFractionDigits
  }).format(value);
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "never"
  }).format(Math.abs(value))}%`;
}

function formatSpread(buy, sell) {
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy === 0) return "—";
  const spread = ((sell - buy) / buy) * 100;
  return `MAKAS ${formatPercent(spread)}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseTcmbDate(value) {
  if (typeof value !== "string") return null;
  const [day, month, year] = value.split(".").map(Number);
  if (!day || !month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T15:30:00+03:00`;
}

function safeText(value, fallback = "—") {
  return typeof value === "string" ? value : (value?.toString() ?? fallback);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function colorWithAlpha(hex, alpha) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function registerFonts() {
  try {
    const canvafyRoot = path.dirname(require.resolve("canvafy"));
    const fontRoot = path.join(canvafyRoot, "assets/fonts/Manrope");
    GlobalFonts.registerFromPath(path.join(fontRoot, "Manrope-Regular.ttf"), "Manrope");
    GlobalFonts.registerFromPath(path.join(fontRoot, "Manrope-Bold.ttf"), "Manrope");
  } catch {
  }
}
