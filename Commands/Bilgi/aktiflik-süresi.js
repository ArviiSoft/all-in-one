const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const WIDTH = 1000;
const HEIGHT = 530;
const DAY_MS = 86_400_000;
const FONT_FAMILY = '"Google Sans", "Product Sans", "Noto Sans", Arial, sans-serif';
const REFRESH_CUSTOM_ID = "aktifliksuresi_refresh";

const COLORS = {
  bg: "#070A12",
  panel: "rgba(12, 18, 32, 0.84)",
  panelSoft: "rgba(255, 255, 255, 0.055)",
  border: "rgba(255, 255, 255, 0.13)",
  text: "#F8FAFC",
  muted: "#AAB4C8",
  cyan: "#25D7FF",
  green: "#52F2A0",
  amber: "#F7C861",
  rose: "#FF5B8D",
  violet: "#8B7CFF"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("aktiflik-süresi")
    .setDescription("Botun açık olduğu süreyi gösterir."),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });
    const payload = await createUptimePayload(client, interaction.user.id);
    return interaction.editReply(payload);
  },

  async handleRefresh(interaction) {
    const [, requesterId] = interaction.customId.split(":");

    if (requesterId && interaction.user.id !== requesterId) {
      return interaction.reply({
        content: `${emojiler.uyari || "🔴"} **Bu paneli sadece komutu kullanan kişi güncelleyebilir.**`,
        flags: 64
      });
    }

    await interaction.deferUpdate();
    const payload = await createUptimePayload(interaction.client, requesterId || interaction.user.id);
    return interaction.editReply(payload);
  },

  buildUptimeCard
};

async function createUptimePayload(client, requesterId) {
    const uptime = Math.max(0, Number(client.uptime) || 0);
    const now = Date.now();
    const bannerURL = await getBotBannerURL(client);
    const avatarURL = client.user.displayAvatarURL({ extension: "png", size: 256 });

    const buffer = await buildUptimeCard({
      botName: client.user.globalName || client.user.username,
      username: client.user.username,
      avatarURL,
      bannerURL,
      uptime,
      now
    });

    const attachment = new AttachmentBuilder(buffer, {
      name: "aktiflik-süresi.png"
    });

  return {
    files: [attachment],
    attachments: [],
    components: [buildControls(requesterId)]
  };
}

function buildControls(requesterId) {
  const refreshButton = new ButtonBuilder()
    .setCustomId(`${REFRESH_CUSTOM_ID}:${requesterId}`)
    .setLabel("Verileri güncelle")
    .setStyle(ButtonStyle.Primary)
    .setEmoji(`${emojiler.yukleniyor}`);

  return new ActionRowBuilder().addComponents(refreshButton);
}

async function getBotBannerURL(client) {
  const cachedBanner = client.user.bannerURL?.({ extension: "png", size: 1024 });
  if (cachedBanner) return cachedBanner;

  try {
    const userData = await client.rest.get(`/users/${client.user.id}`);
    if (!userData.banner) return null;
    return `https://cdn.discordapp.com/banners/${client.user.id}/${userData.banner}.png?size=1024`;
  } catch (error) {
    console.warn("⚠️ [AKTİFLİK SÜRESİ] Banner bilgisi alınamadı:", error);
    return null;
  }
}

async function buildUptimeCard({
  botName,
  username,
  avatarURL = null,
  bannerURL = null,
  uptime = 0,
  now = Date.now()
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const stats = getUptimeStats(uptime, now);

  await drawBackground(ctx, bannerURL);
  drawGrid(ctx);
  drawNoise(ctx);
  await drawHeader(ctx, { botName, username, avatarURL, now });
  drawUptimePanel(ctx, stats);
  drawSessionPanel(ctx, stats);

  return canvas.toBuffer("image/png");
}

function getUptimeStats(uptime, now) {
  const safeUptime = Math.max(0, Number(uptime) || 0);
  const totalSeconds = Math.floor(safeUptime / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor(totalSeconds / 3_600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const dayProgress = (safeUptime % DAY_MS) / DAY_MS;

  return {
    days,
    hours,
    minutes,
    seconds,
    dayProgress,
    clock: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    startedAt: new Date(now - safeUptime),
    totalText: formatTotalUptime(days, hours, minutes, seconds)
  };
}

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

async function drawBackground(ctx, bannerURL) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#07131D");
  gradient.addColorStop(0.42, "#141126");
  gradient.addColorStop(0.75, "#091522");
  gradient.addColorStop(1, COLORS.bg);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const banner = await loadImageSafe(bannerURL);
  if (banner) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.filter = "blur(18px) brightness(0.5) saturate(1.2)";
    drawCoverImage(ctx, banner, -28, -28, WIDTH + 56, HEIGHT + 56);
    ctx.restore();
  }

  drawGlow(ctx, 170, 70, 350, "rgba(37, 215, 255, 0.25)");
  drawGlow(ctx, 790, 145, 380, "rgba(139, 124, 255, 0.22)");
  drawGlow(ctx, 710, 520, 330, "rgba(82, 242, 160, 0.12)");

  ctx.fillStyle = "rgba(3, 5, 10, 0.5)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 8, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawGrid(ctx) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNoise(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 700; i++) {
    const alpha = Math.random() * 0.75;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 1, 1);
  }
  ctx.restore();
}

async function drawHeader(ctx, { botName, username, avatarURL, now }) {
  const avatar = await loadImageSafe(avatarURL);
  const displayName = String(botName || username || "Discord Bot");

  drawAvatarHalo(ctx, 108, 104, 88);
  drawAvatarFrame(ctx, 108, 104, 62);
  drawAvatar(ctx, avatar, 108, 104, 55, displayName);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, displayName, 400, 39, 18), 700);
  ctx.fillText(displayName, 194, 91);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(18, 400);
  ctx.fillText(truncateText(ctx, `@${username || "bot"}  •  Sistem çalışma özeti`, 500), 196, 124);

  drawStatusPill(ctx, 785, 49, 173, 42);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(14, 500);
  ctx.fillText("SON KONTROL", 958, 118);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(17, 600);
  ctx.fillText(formatDateTime(now), 958, 143);
  ctx.restore();
}

function drawAvatarHalo(ctx, cx, cy, radius) {
  const halo = ctx.createRadialGradient(cx, cy, 18, cx, cy, radius);
  halo.addColorStop(0, "rgba(82, 242, 160, 0.34)");
  halo.addColorStop(1, "rgba(82, 242, 160, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function drawAvatarFrame(ctx, cx, cy, radius) {
  const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  gradient.addColorStop(0, COLORS.cyan);
  gradient.addColorStop(0.48, COLORS.violet);
  gradient.addColorStop(1, COLORS.green);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawStatusPill(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "rgba(82, 242, 160, 0.1)";
  fillRoundedRect(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = "rgba(82, 242, 160, 0.32)";
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2);

  ctx.shadowColor = COLORS.green;
  ctx.shadowBlur = 12;
  ctx.fillStyle = COLORS.green;
  ctx.beginPath();
  ctx.arc(x + 24, y + h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = COLORS.green;
  ctx.font = font(14, 700);
  ctx.fillText("ÇEVRİMİÇİ", x + 42, y + 26);
  ctx.restore();
}

function drawUptimePanel(ctx, stats) {
  const x = 42;
  const y = 180;
  const w = 576;
  const h = 324;
  drawPanel(ctx, x, y, w, h);

  ctx.fillStyle = COLORS.cyan;
  ctx.font = font(14, 700);
  ctx.fillText("KESİNTİSİZ ÇALIŞMA", x + 24, y + 34);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(56, 700);
  ctx.fillText(stats.clock, x + 24, y + 99);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(16, 400);
  ctx.fillText(truncateText(ctx, stats.totalText, w - 48), x + 27, y + 129);

  const cards = [
    { label: "GÜN", value: stats.days, color: COLORS.green },
    { label: "SAAT", value: stats.hours, color: COLORS.cyan },
    { label: "DAKİKA", value: stats.minutes, color: COLORS.amber },
    { label: "SANİYE", value: stats.seconds, color: COLORS.rose }
  ];

  cards.forEach((card, index) => {
    drawMetricCard(ctx, x + 24 + index * 132, y + 156, 120, 78, card);
  });

  const progress = stats.dayProgress;
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(13, 500);
  ctx.fillText("24 SAATLİK DÖNGÜ", x + 24, y + 268);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(13, 700);
  ctx.fillText(formatProgress(progress), x + w - 24, y + 268);
  ctx.restore();

  drawProgressBar(ctx, x + 24, y + 285, w - 48, 11, progress);
}

function drawMetricCard(ctx, x, y, w, h, { label, value, color }) {
  ctx.fillStyle = COLORS.panelSoft;
  fillRoundedRect(ctx, x, y, w, h, 17);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 17);

  ctx.fillStyle = color;
  ctx.font = font(12, 700);
  ctx.fillText(label, x + 15, y + 23);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(28, 700);
  ctx.fillText(formatNumber(value), x + 15, y + 58);
}

function drawProgressBar(ctx, x, y, w, h, progress) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  fillRoundedRect(ctx, x, y, w, h, h / 2);

  const fillWidth = Math.max(0, w * Math.min(1, Math.max(0, progress)));
  if (fillWidth <= 0) return;

  const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
  gradient.addColorStop(0, COLORS.cyan);
  gradient.addColorStop(0.52, COLORS.violet);
  gradient.addColorStop(1, COLORS.green);
  ctx.fillStyle = gradient;
  fillRoundedRect(ctx, x, y, Math.max(h, fillWidth), h, h / 2);
}

function drawSessionPanel(ctx, stats) {
  const x = 638;
  const y = 180;
  const w = 320;
  const h = 324;
  drawPanel(ctx, x, y, w, h);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(22, 700);
  ctx.fillText("Oturum Durumu", x + 24, y + 36);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(13, 400);
  ctx.fillText("Günlük çalışma döngüsü", x + 24, y + 59);

  drawProgressRing(ctx, x + w / 2, y + 151, 68, stats.dayProgress);

  drawInfoRow(
    ctx,
    x + 24,
    y + 241,
    w - 48,
    "ÇALIŞMA BAŞLANGICI",
    formatDateTime(stats.startedAt),
    COLORS.violet
  );
  drawInfoRow(
    ctx,
    x + 24,
    y + 287,
    w - 48,
    "OTURUM",
    stats.days > 0 ? `${formatNumber(stats.days + 1)}. çalışma günü` : "İlk çalışma günü",
    COLORS.green
  );
}

function drawProgressRing(ctx, cx, cy, radius, progress) {
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * Math.min(1, Math.max(0, progress));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.075)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (progress > 0) {
    const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    gradient.addColorStop(0, COLORS.cyan);
    gradient.addColorStop(0.55, COLORS.violet);
    gradient.addColorStop(1, COLORS.green);
    ctx.strokeStyle = gradient;
    ctx.shadowColor = "rgba(37, 215, 255, 0.34)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(30, 700);
  ctx.fillText(formatProgress(progress), cx, cy + 4);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 700);
  ctx.fillText("24 SAAT", cx, cy + 27);
  ctx.restore();
}

function drawInfoRow(ctx, x, y, w, label, value, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 10, 3, 34);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(10, 700);
  ctx.fillText(label, x + 13, y);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(14, 600);
  ctx.fillText(truncateText(ctx, value, 155), x + w, y + 20);
  ctx.restore();
}

function drawPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = COLORS.panel;
  fillRoundedRect(ctx, x, y, w, h, 22);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 22);
  ctx.restore();
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
    gradient.addColorStop(0, "rgba(37, 215, 255, 0.82)");
    gradient.addColorStop(1, "rgba(139, 124, 255, 0.8)");
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(31, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitial(label), cx, cy + 1);
  }
  ctx.restore();
}

function drawCoverImage(ctx, image, x, y, w, h) {
  const sourceRatio = image.width / image.height;
  const destRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (sourceRatio > destRatio) {
    sw = image.height * destRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / destRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
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

async function loadImageSafe(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
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

function formatTotalUptime(days, hours, minutes, seconds) {
  const parts = [];
  if (days) parts.push(`${formatNumber(days)} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (minutes) parts.push(`${minutes} dakika`);
  if (!parts.length || seconds) parts.push(`${seconds} saniye`);
  return parts.slice(0, 3).join("  •  ");
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
}

function formatProgress(progress) {
  if (progress > 0 && progress < 0.001) return "%0,1";
  if (progress > 0 && progress < 0.1) {
    return `%${(progress * 100).toLocaleString("tr-TR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}`;
  }
  return `%${Math.floor(progress * 100)}`;
}

function getInitial(label) {
  return Array.from(String(label || "?").trim())[0]?.toUpperCase() || "?";
}

function pad(value) {
  return String(value).padStart(2, "0");
}