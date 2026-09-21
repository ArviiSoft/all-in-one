const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const WIDTH = 1000;
const HEIGHT = 570;
const FONT_FAMILY = '"Google Sans", "Product Sans", "Noto Sans", Arial, sans-serif';
const REFRESH_CUSTOM_ID = "ping_refresh";
const GRAPH_CUSTOM_ID = "ping_graph";

const COLORS = {
  bg: "#060914",
  panel: "rgba(10, 16, 31, 0.86)",
  panelSoft: "rgba(255, 255, 255, 0.052)",
  border: "rgba(255, 255, 255, 0.12)",
  text: "#F7FAFF",
  muted: "#9CAAC2",
  cyan: "#27D9FF",
  blue: "#4D8DFF",
  green: "#4FF0A3",
  amber: "#F8C85C",
  rose: "#FF658D",
  violet: "#8B7DFF"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botun gecikme ve bağlantı sağlığı değerlerini gösterir."),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });
    const payload = await createPingPayload(client, interaction.user.id, interaction.createdTimestamp);
    return interaction.editReply(payload);
  },

  async handleRefresh(interaction) {
    const [, requesterId] = interaction.customId.split(":");

    if (!isRequester(interaction, requesterId)) return;

    await interaction.deferUpdate();
    const payload = await createPingPayload(
      interaction.client,
      requesterId || interaction.user.id,
      interaction.createdTimestamp
    );
    return interaction.editReply(payload);
  },

  async handleGraph(interaction) {
    const [, requesterId, websocketPing, responsePing, restPing, measuredAt] = interaction.customId.split(":");

    if (!isRequester(interaction, requesterId)) return;

    await interaction.deferReply({ flags: 64 });
    const metrics = {
      websocketPing: decodeMetric(websocketPing),
      responsePing: decodeMetric(responsePing),
      restPing: decodeMetric(restPing)
    };
    const buffer = await buildLatencyChart({ metrics, measuredAt: decodeTimestamp(measuredAt) });
    const attachment = new AttachmentBuilder(buffer, { name: "ping-grafigi.png" });
    return interaction.editReply({ files: [attachment] });
  },

  buildPingCard,
  buildLatencyChart,
  getConnectionSummary
};

async function createPingPayload(client, requesterId, interactionCreatedAt) {
  const { metrics, botData } = await measurePing(client, interactionCreatedAt);
  const bannerURL = getBotBannerURL(client, botData);
  const measuredAt = Date.now();
  const buffer = await buildPingCard({
    botName: client.user.globalName || client.user.username,
    username: client.user.username,
    avatarURL: client.user.displayAvatarURL({ extension: "png", size: 256 }),
    bannerURL,
    metrics,
    measuredAt
  });

  const attachment = new AttachmentBuilder(buffer, { name: "ping-bilgileri.png" });
  return {
    files: [attachment],
    attachments: [],
    components: [buildControls(requesterId, metrics, measuredAt)]
  };
}

async function measurePing(client, interactionCreatedAt) {
  const websocketPing = normalizeMetric(client.ws?.ping);
  const responsePing = normalizeMetric(Date.now() - Number(interactionCreatedAt || Date.now()));
  let restPing = null;
  let botData = null;

  try {
    const startedAt = performance.now();
    botData = await client.rest.get("/users/@me");
    restPing = normalizeMetric(performance.now() - startedAt);
  } catch (error) {
    console.warn("⚠️ [PING] Discord REST API ölçümü alınamadı:", error);
  }

  return { metrics: { websocketPing, responsePing, restPing }, botData };
}

function getBotBannerURL(client, botData) {
  const cachedBanner = client.user.bannerURL?.({ extension: "png", size: 1024 });
  if (cachedBanner) return cachedBanner;
  if (!botData?.banner) return null;
  return `https://cdn.discordapp.com/banners/${client.user.id}/${botData.banner}.png?size=1024`;
}

function buildControls(requesterId, metrics, measuredAt) {
  const encodedMetrics = [
    encodeMetric(metrics.websocketPing),
    encodeMetric(metrics.responsePing),
    encodeMetric(metrics.restPing)
  ].join(":");

  const graphButton = new ButtonBuilder()
    .setCustomId(`${GRAPH_CUSTOM_ID}:${requesterId}:${encodedMetrics}:${Math.round(measuredAt)}`)
    .setLabel("Grafiği Göster")
    .setStyle(ButtonStyle.Success);

  const refreshButton = new ButtonBuilder()
    .setCustomId(`${REFRESH_CUSTOM_ID}:${requesterId}`)
    .setLabel("Verileri Güncelle")
    .setStyle(ButtonStyle.Primary);

  setButtonEmoji(graphButton, emojiler.chart);
  setButtonEmoji(refreshButton, emojiler.yukleniyor);

  return new ActionRowBuilder().addComponents(graphButton, refreshButton);
}

function isRequester(interaction, requesterId) {
  if (!requesterId || interaction.user.id === requesterId) return true;

  interaction.reply({
    content: `${emojiler.uyari || "🔴"} **Bu paneli sadece komutu kullanan kişi kullanabilir.**`,
    flags: 64
  }).catch(() => null);
  return false;
}

function setButtonEmoji(button, emoji) {
  if (emoji) button.setEmoji(emoji);
  return button;
}

async function buildPingCard({
  botName,
  username,
  avatarURL = null,
  bannerURL = null,
  metrics,
  measuredAt = Date.now()
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const summary = getConnectionSummary(metrics);

  await drawBackground(ctx, bannerURL);
  drawCircuitPattern(ctx);
  drawNoise(ctx);
  await drawHeader(ctx, { botName, username, avatarURL, summary });
  drawScorePanel(ctx, summary);
  drawMetricCards(ctx, metrics);
  drawLatencySpectrum(ctx, metrics);
  drawFooter(ctx, measuredAt, summary);

  return canvas.toBuffer("image/png");
}

async function buildLatencyChart({ metrics, measuredAt = Date.now() }) {
  const canvas = createCanvas(WIDTH, 535);
  const ctx = canvas.getContext("2d");
  const items = getMetricItems(metrics);
  const validValues = items.map(item => item.value).filter(Number.isFinite);
  const maximum = Math.max(300, ...validValues);
  const scaleMax = Math.ceil((maximum + 40) / 100) * 100;

  await drawBackground(ctx, null, 535);
  drawCircuitPattern(ctx, 535);
  drawNoise(ctx, 535);

  ctx.fillStyle = COLORS.green;
  ctx.font = font(13, 700);
  ctx.fillText("CANLI GECİKME ANALİZİ", 44, 54);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(34, 700);
  ctx.fillText("Gecikme Karşılaştırması", 44, 94);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(15, 400);
  ctx.fillText("Her servis, aynı milisaniye ölçeğinde karşılaştırılır.", 45, 120);

  drawScaleLegend(ctx, 707, 53);

  const chartX = 252;
  const chartWidth = 690;
  const rowStart = 176;
  const rowGap = 100;

  items.forEach((item, index) => {
    const y = rowStart + index * rowGap;
    drawChartRow(ctx, item, chartX, y, chartWidth, scaleMax);
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.fillText(`0 ms`, chartX, 484);
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillText(`${formatNumber(scaleMax)} ms`, chartX + chartWidth, 484);
  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.fillRect(44, 504, 898, 1);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.fillText(`Ölçüm: ${formatDateTime(measuredAt)}`, 44, 526);

  return canvas.toBuffer("image/png");
}

async function drawBackground(ctx, bannerURL, height = HEIGHT) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, height);
  gradient.addColorStop(0, "#07121D");
  gradient.addColorStop(0.38, "#10132B");
  gradient.addColorStop(0.72, "#091525");
  gradient.addColorStop(1, COLORS.bg);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, height);

  const banner = await loadImageSafe(bannerURL);
  if (banner) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.filter = "blur(20px) brightness(0.42) saturate(1.25)";
    drawCoverImage(ctx, banner, -30, -30, WIDTH + 60, height + 60);
    ctx.restore();
  }

  drawGlow(ctx, 105, 55, 280, "rgba(39, 217, 255, 0.22)");
  drawGlow(ctx, 865, 165, 360, "rgba(139, 125, 255, 0.2)");
  drawGlow(ctx, 650, height + 10, 330, "rgba(79, 240, 163, 0.12)");

  ctx.fillStyle = "rgba(3, 6, 13, 0.44)";
  ctx.fillRect(0, 0, WIDTH, height);
}

function drawCircuitPattern(ctx, height = HEIGHT) {
  ctx.save();
  ctx.strokeStyle = "rgba(39, 217, 255, 0.045)";
  ctx.fillStyle = "rgba(39, 217, 255, 0.11)";
  ctx.lineWidth = 1;

  for (let y = 28; y < height; y += 68) {
    const offset = (Math.floor(y / 68) % 2) * 34;
    for (let x = -40 + offset; x < WIDTH; x += 136) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 38, y);
      ctx.lineTo(x + 52, y + 14);
      ctx.lineTo(x + 92, y + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 96, y + 14, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawNoise(ctx, height = HEIGHT) {
  ctx.save();
  ctx.globalAlpha = 0.055;
  for (let index = 0; index < 620; index++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.75})`;
    ctx.fillRect(Math.random() * WIDTH, Math.random() * height, 1, 1);
  }
  ctx.restore();
}

async function drawHeader(ctx, { botName, username, avatarURL, summary }) {
  const avatar = await loadImageSafe(avatarURL);
  const displayName = String(botName || username || "Discord Bot");

  drawAvatarFrame(ctx, 90, 83, 54, summary.color);
  drawAvatar(ctx, avatar, 90, 83, 47, displayName);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, displayName, 430, 34, 18), 700);
  ctx.fillText(displayName, 163, 76);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(15, 400);
  ctx.fillText(truncateText(ctx, `@${username || "bot"}`, 450), 164, 106);

  drawLivePill(ctx, 790, 54, 168, 43, summary);
}

function drawScorePanel(ctx, summary) {
  const x = 42;
  const y = 154;
  const w = 270;
  const h = 250;
  drawPanel(ctx, x, y, w, h, 24);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 700);
  ctx.fillText("BAĞLANTI SKORU", x + 22, y + 31);

  drawScoreRing(ctx, x + w / 2, y + 126, 66, summary);

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = summary.color;
  ctx.font = font(18, 700);
  ctx.fillText(summary.label, x + w / 2, y + 215);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 400);
  ctx.fillText(summary.description, x + w / 2, y + 237);
  ctx.restore();
}

function drawScoreRing(ctx, cx, cy, radius, summary) {
  const start = Math.PI * 0.75;
  const length = Math.PI * 1.5;

  ctx.save();
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.075)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + length);
  ctx.stroke();

  if (summary.score > 0) {
    const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    gradient.addColorStop(0, COLORS.cyan);
    gradient.addColorStop(0.55, COLORS.violet);
    gradient.addColorStop(1, summary.color);
    ctx.strokeStyle = gradient;
    ctx.shadowColor = summary.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + length * (summary.score / 100));
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(46, 700);
  ctx.fillText(String(summary.score), cx, cy + 10);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 700);
  ctx.fillText("/ 100", cx, cy + 31);
  ctx.restore();
}

function drawMetricCards(ctx, metrics) {
  const items = getMetricItems(metrics);
  const x = 330;
  const y = 154;
  const gap = 14;
  const cardWidth = 200;

  items.forEach((item, index) => {
    drawMetricCard(ctx, x + index * (cardWidth + gap), y, cardWidth, 126, item);
  });
}

function drawMetricCard(ctx, x, y, w, h, item) {
  drawPanel(ctx, x, y, w, h, 20, false);

  ctx.fillStyle = item.color;
  fillRoundedRect(ctx, x + 17, y + 17, 38, 5, 3);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 700);
  ctx.fillText(item.shortLabel, x + 17, y + 45);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(31, 700);
  ctx.fillText(formatMetric(item.value), x + 17, y + 82);

  ctx.fillStyle = item.color;
  ctx.font = font(11, 700);
  ctx.fillText(item.status.toUpperCase(), x + 17, y + 107);
}

function drawLatencySpectrum(ctx, metrics) {
  const x = 330;
  const y = 298;
  const w = 628;
  const h = 106;
  drawPanel(ctx, x, y, w, h, 20, false);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(15, 700);
  ctx.fillText("Gecikme Spektrumu", x + 19, y + 27);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 500);
  ctx.fillText("0 — 500+ ms", x + w - 19, y + 27);
  ctx.restore();

  const barX = x + 19;
  const barY = y + 47;
  const barWidth = w - 38;
  const barHeight = 12;
  drawThresholdTrack(ctx, barX, barY, barWidth, barHeight, 500);

  getMetricItems(metrics).forEach((item, index) => {
    const value = Number.isFinite(item.value) ? item.value : 500;
    const markerX = barX + Math.min(1, value / 500) * barWidth;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(markerX, barY + barHeight / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = item.color;
    ctx.font = font(10, 700);
    ctx.fillText(item.marker, barX + index * 196, y + 87);
  });
}

function drawFooter(ctx, measuredAt, summary) {
  const y = 432;
  drawPanel(ctx, 42, y, 916, 96, 20);

  drawPulse(ctx, 70, y + 34, summary.color);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(15, 700);
  ctx.fillText("Discord bağlantısı izleniyor", 91, y + 38);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 400);
  ctx.fillText("WebSocket, komut yanıtı ve REST API tek ölçümde değerlendirildi.", 67, y + 67);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(10, 700);
  ctx.fillText("SON ÖLÇÜM", 929, y + 31);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(14, 600);
  ctx.fillText(formatDateTime(measuredAt), 929, y + 57);
  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
  ctx.fillRect(0, HEIGHT - 18, WIDTH, 18);
}

function drawLivePill(ctx, x, y, w, h, summary) {
  ctx.save();
  ctx.fillStyle = withAlpha(summary.color, 0.1);
  fillRoundedRect(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = withAlpha(summary.color, 0.35);
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2);

  drawPulse(ctx, x + 23, y + h / 2, summary.color);
  ctx.fillStyle = summary.color;
  ctx.font = font(13, 700);
  ctx.fillText(summary.pill, x + 40, y + 26);
  ctx.restore();
}

function drawPulse(ctx, x, y, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAvatarFrame(ctx, cx, cy, radius, color) {
  const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  gradient.addColorStop(0, COLORS.cyan);
  gradient.addColorStop(0.52, COLORS.violet);
  gradient.addColorStop(1, color);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawAvatar(ctx, image, cx, cy, radius, label) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (image) {
    drawCoverImage(ctx, image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    gradient.addColorStop(0, "rgba(39, 217, 255, 0.85)");
    gradient.addColorStop(1, "rgba(139, 125, 255, 0.82)");
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(29, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitial(label), cx, cy + 1);
  }
  ctx.restore();
}

function drawPanel(ctx, x, y, w, h, radius, shadow = true) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.36)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
  }
  ctx.fillStyle = COLORS.panel;
  fillRoundedRect(ctx, x, y, w, h, radius);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.restore();
}

function drawScaleLegend(ctx, x, y) {
  const items = [
    ["Hızlı", COLORS.green],
    ["Dengeli", COLORS.cyan],
    ["Yoğun", COLORS.amber],
    ["Yavaş", COLORS.rose]
  ];

  items.forEach(([label, color], index) => {
    const itemX = x + (index % 2) * 118;
    const itemY = y + Math.floor(index / 2) * 25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(itemX, itemY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(11, 600);
    ctx.fillText(label, itemX + 11, itemY + 4);
  });
}

function drawChartRow(ctx, item, x, y, width, scaleMax) {
  ctx.fillStyle = COLORS.text;
  ctx.font = font(15, 700);
  ctx.fillText(item.label, 44, y + 3);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 500);
  ctx.fillText(item.description, 44, y + 25);

  drawThresholdTrack(ctx, x, y - 9, width, 18, scaleMax);
  const fillWidth = Number.isFinite(item.value) ? Math.max(8, width * Math.min(1, item.value / scaleMax)) : 0;
  if (fillWidth > 0) {
    const gradient = ctx.createLinearGradient(x, 0, x + fillWidth, 0);
    gradient.addColorStop(0, withAlpha(item.color, 0.45));
    gradient.addColorStop(1, item.color);
    ctx.fillStyle = gradient;
    fillRoundedRect(ctx, x, y - 9, fillWidth, 18, 9);
  }

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = item.color;
  ctx.font = font(16, 700);
  ctx.fillText(formatMetric(item.value), x + width, y - 20);
  ctx.restore();
}

function drawThresholdTrack(ctx, x, y, width, height, scaleMax) {
  const stops = [
    [0, Math.min(80, scaleMax), "rgba(79, 240, 163, 0.16)"],
    [80, Math.min(150, scaleMax), "rgba(39, 217, 255, 0.14)"],
    [150, Math.min(250, scaleMax), "rgba(248, 200, 92, 0.14)"],
    [250, scaleMax, "rgba(255, 101, 141, 0.13)"]
  ];

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
  ctx.fillRect(x, y, width, height);
  stops.forEach(([start, end, color]) => {
    if (end <= start || start >= scaleMax) return;
    ctx.fillStyle = color;
    ctx.fillRect(x + (start / scaleMax) * width, y, ((end - start) / scaleMax) * width, height);
  });
  ctx.restore();
}

function getMetricItems(metrics = {}) {
  return [
    createMetricItem("WebSocket", "WEBSOCKET", "WS", "Discord ağ geçidi", metrics.websocketPing),
    createMetricItem("Komut Yanıtı", "YANIT SÜRESİ", "YANIT", "Etkileşim geri dönüşü", metrics.responsePing, COLORS.cyan),
    createMetricItem("REST API", "REST API", "REST", "Discord veri servisi", metrics.restPing, COLORS.blue)
  ];
}

function createMetricItem(label, shortLabel, marker, description, value, color = null) {
  const state = getLatencyState(value);
  return { label, shortLabel, marker, description, value, ...state, color: color || state.color };
}

function getConnectionSummary(metrics = {}) {
  const values = [metrics.websocketPing, metrics.responsePing, metrics.restPing]
    .map(normalizeMetric)
    .filter(Number.isFinite);

  if (!values.length) {
    return {
      score: 0,
      label: "Ölçülemiyor",
      pill: "VERİ BEKLENİYOR",
      description: "Bağlantı verisi alınamadı",
      color: COLORS.muted
    };
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const score = Math.max(1, Math.min(100, Math.round(100 - average / 4.5)));

  if (score >= 84) {
    return { score, label: "Mükemmel", pill: "BAĞLANTI HIZLI", description: "Tüm servisler akıcı", color: COLORS.green };
  }
  if (score >= 68) {
    return { score, label: "İyi", pill: "BAĞLANTI İYİ", description: "Yanıtlar dengeli", color: COLORS.cyan };
  }
  if (score >= 46) {
    return { score, label: "Orta", pill: "AĞ YOĞUN", description: "Kısa gecikmeler olabilir", color: COLORS.amber };
  }
  return { score, label: "Yavaş", pill: "GECİKME YÜKSEK", description: "Ağ yanıtı beklenenden yavaş", color: COLORS.rose };
}

function getLatencyState(value) {
  if (!Number.isFinite(value)) return { status: "Alınamadı", color: COLORS.muted };
  if (value <= 80) return { status: "Hızlı", color: COLORS.green };
  if (value <= 150) return { status: "Dengeli", color: COLORS.cyan };
  if (value <= 250) return { status: "Yoğun", color: COLORS.amber };
  return { status: "Yavaş", color: COLORS.rose };
}

function normalizeMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function encodeMetric(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "x";
}

function decodeMetric(value) {
  return value === "x" ? null : normalizeMetric(value);
}

function decodeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function formatMetric(value) {
  return Number.isFinite(value) ? `${formatNumber(value)} ms` : "—";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
}

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 8, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawCoverImage(ctx, image, x, y, w, h) {
  const sourceRatio = image.width / image.height;
  const destinationRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (sourceRatio > destinationRatio) {
    sw = image.height * destinationRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / destinationRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

async function loadImageSafe(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}

function fillRoundedRect(ctx, x, y, w, h, radius) {
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, w, h, radius) {
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function roundedRectPath(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function truncateText(ctx, text, maxWidth) {
  const source = String(text ?? "-");
  if (ctx.measureText(source).width <= maxWidth) return source;
  let output = source;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
}

function fitFontSize(ctx, text, maxWidth, preferredSize, minimumSize) {
  let size = preferredSize;
  while (size > minimumSize) {
    ctx.font = font(size, 700);
    if (ctx.measureText(String(text)).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function getInitial(label) {
  return Array.from(String(label || "?").trim())[0]?.toUpperCase() || "?";
}

function withAlpha(hex, alpha) {
  const normalized = String(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(156, 170, 194, ${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}