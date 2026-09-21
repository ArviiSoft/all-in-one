const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const db = require("../../Utils/Core/jsonDB");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const path = require("path");

const WIDTH = 1100;
const CARD_HEIGHT = 650;
const CHART_HEIGHT = 650;
const FONT_FAMILY = '"Manrope", "Google Sans", "Noto Sans", Arial, sans-serif';
const CHART_CUSTOM_ID = "stat_chart";
const DEFAULT_BACKGROUND = path.join(__dirname, "../../assets/Stat/arviis.png");

const COLORS = {
  background: "#070912",
  panel: "rgba(11, 15, 29, 0.88)",
  panelSoft: "rgba(255, 255, 255, 0.052)",
  border: "rgba(255, 255, 255, 0.115)",
  text: "#F8FAFF",
  muted: "#98A4BA",
  purple: "#9B7BFF",
  blue: "#4A8FFF",
  cyan: "#32D9F4",
  mint: "#4BE7B0",
  coral: "#FF718D",
  amber: "#FFC766"
};

registerFonts();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stat")
    .setDescription("İstatistik kartını gösterir.")
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName("kişi")
        .setDescription("İstatistiklerini görüntülemek istediğin kişiyi seç.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const requestedUser = interaction.options.getUser("kişi") || interaction.user;
    const ephemeral = requestedUser.id !== interaction.user.id;

    await interaction.deferReply(ephemeral ? { flags: 64 } : {});

    const user = await interaction.client.users.fetch(requestedUser.id, { force: true }).catch(() => requestedUser);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const stats = collectUserStats({ guild: interaction.guild, user, member });
    const buffer = await buildStatCard(stats);
    const attachment = new AttachmentBuilder(buffer, { name: "istatistik-karti.png" });

    return interaction.editReply({
      files: [attachment],
      components: [buildControls(interaction.user.id, user.id)]
    });
  },

  async handleChart(interaction) {
    const [, requesterId, targetUserId] = interaction.customId.split(":");

    if (interaction.user.id !== requesterId) {
      return interaction.reply({
        content: `${emojiler.uyari || "⚠️"} **Bu analiz panelini sadece komutu kullanan kişi açabilir.**`,
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    const user = await interaction.client.users.fetch(targetUserId, { force: true }).catch(() => null);
    if (!user) {
      return interaction.editReply({
        content: `${emojiler.uyari || "⚠️"} **Kullanıcı bilgileri alınamadı.**`
      });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const stats = collectUserStats({ guild: interaction.guild, user, member });
    const buffer = await buildActivityChart(stats);
    const attachment = new AttachmentBuilder(buffer, { name: "aktivite-analizi.png" });

    return interaction.editReply({ files: [attachment] });
  },

  buildStatCard,
  buildActivityChart,
  collectUserStats
};

function buildControls(requesterId, targetUserId) {
  const chartButton = new ButtonBuilder()
    .setCustomId(`${CHART_CUSTOM_ID}:${requesterId}:${targetUserId}`)
    .setLabel("Aktivite Analizini Aç")
    .setStyle(ButtonStyle.Primary);

  if (emojiler.chart) chartButton.setEmoji(emojiler.chart);
  return new ActionRowBuilder().addComponents(chartButton);
}

function collectUserStats({ guild, user, member }) {
  const entries = normalizeDbEntries(db.all());
  const messages = {
    day: normalizeCount(db.get(`msg_1d_${user.id}`)),
    week: normalizeCount(db.get(`msg_7d_${user.id}`)),
    total: normalizeCount(db.get(`msg_total_${user.id}`))
  };
  const voice = {
    day: normalizeCount(db.get(`voice_1d_${user.id}`)),
    week: normalizeCount(db.get(`voice_7d_${user.id}`)),
    total: normalizeCount(db.get(`voice_total_${user.id}`))
  };

  const topMessageChannel = findTopChannel(entries, "message", user.id, guild);
  const topVoiceChannel = findTopChannel(entries, "voice", user.id, guild);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: member?.displayName || user.globalName || user.username,
      avatarURL: user.displayAvatarURL({ extension: "png", size: 256 }),
      bannerURL: user.bannerURL?.({ extension: "png", size: 1024 }) || null,
      createdAt: user.createdAt,
      joinedAt: member?.joinedAt || null
    },
    guildName: guild?.name || "Discord Sunucusu",
    messages,
    voice,
    topMessageChannel,
    topVoiceChannel,
    generatedAt: Date.now()
  };
}

async function buildStatCard(stats) {
  const canvas = createCanvas(WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx, stats.user?.bannerURL, CARD_HEIGHT);
  drawAmbientPattern(ctx, CARD_HEIGHT);
  drawHeader(ctx, stats);
  await drawProfilePanel(ctx, stats.user || {});

  drawTotalCard(ctx, {
    x: 332,
    y: 137,
    width: 354,
    title: "TOPLAM MESAJ",
    value: formatNumber(stats.messages?.total),
    detail: "Kaydedilen tüm mesajlar",
    accent: COLORS.purple,
    icon: "message"
  });
  drawTotalCard(ctx, {
    x: 704,
    y: 137,
    width: 354,
    title: "TOPLAM SES",
    value: formatDuration(stats.voice?.total),
    detail: "Ses kanallarında geçirilen süre",
    accent: COLORS.cyan,
    icon: "voice"
  });

  drawPeriodCard(ctx, {
    x: 332,
    y: 286,
    width: 354,
    title: "Mesaj Aktivitesi",
    subtitle: "Dönemlere göre aktiflik",
    values: stats.messages,
    formatter: formatNumber,
    accent: COLORS.purple,
    icon: "message"
  });
  drawPeriodCard(ctx, {
    x: 704,
    y: 286,
    width: 354,
    title: "Ses Aktivitesi",
    subtitle: "Dönemlere göre sohbet süresi",
    values: stats.voice,
    formatter: formatCompactDuration,
    accent: COLORS.cyan,
    icon: "voice"
  });

  drawChannelCard(ctx, {
    x: 332,
    y: 510,
    width: 354,
    title: "TOP MESAJ KANALI",
    channel: stats.topMessageChannel,
    accent: COLORS.coral,
    formatter: value => `${formatNumber(value)} mesaj`,
    icon: "hash"
  });
  drawChannelCard(ctx, {
    x: 704,
    y: 510,
    width: 354,
    title: "TOP SES KANALI",
    channel: stats.topVoiceChannel,
    accent: COLORS.mint,
    formatter: formatDuration,
    icon: "voice"
  });

  drawFooter(ctx, stats.generatedAt);
  return canvas.toBuffer("image/png");
}

async function buildActivityChart(stats) {
  const canvas = createCanvas(WIDTH, CHART_HEIGHT);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx, stats.user?.bannerURL, CHART_HEIGHT);
  drawAmbientPattern(ctx, CHART_HEIGHT);
  await drawChartHeader(ctx, stats);

  drawAnalysisPanel(ctx, {
    x: 42,
    y: 145,
    width: 500,
    height: 350,
    title: "Mesaj",
    subtitle: "Mesaj dönemleri ortak ölçekte karşılaştırılır",
    values: stats.messages,
    formatter: value => `${formatNumber(value)} mesaj`,
    accent: COLORS.purple,
    secondary: COLORS.coral,
    icon: "message"
  });
  drawAnalysisPanel(ctx, {
    x: 558,
    y: 145,
    width: 500,
    height: 350,
    title: "Ses",
    subtitle: "Ses dönemleri kendi ortak ölçeğinde gösterilir",
    values: stats.voice,
    formatter: formatDuration,
    accent: COLORS.cyan,
    secondary: COLORS.mint,
    icon: "voice"
  });

  drawAverageCard(ctx, {
    x: 42,
    y: 513,
    width: 500,
    title: "7 GÜNLÜK GÜNLÜK ORTALAMA",
    leftLabel: "MESAJ",
    leftValue: `${formatNumber((stats.messages?.week || 0) / 7, 1)} / gün`,
    rightLabel: "SES",
    rightValue: `${formatCompactDuration((stats.voice?.week || 0) / 7)} / gün`,
    leftColor: COLORS.purple,
    rightColor: COLORS.cyan
  });
  drawFavoriteCard(ctx, {
    x: 558,
    y: 513,
    width: 500,
    messageChannel: stats.topMessageChannel,
    voiceChannel: stats.topVoiceChannel
  });

  drawFooter(ctx, stats.generatedAt, "Dönemler farklı birimlerde olduğu için iki bağımsız ölçek kullanıldı.");
  return canvas.toBuffer("image/png");
}

async function drawBackground(ctx, bannerURL, height) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, height);
  gradient.addColorStop(0, "#0B1021");
  gradient.addColorStop(0.42, "#11112B");
  gradient.addColorStop(0.72, "#071827");
  gradient.addColorStop(1, COLORS.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, height);

  const background = (await loadImageSafe(bannerURL)) || (await loadImageSafe(DEFAULT_BACKGROUND));
  if (background) {
    ctx.save();
    ctx.globalAlpha = bannerURL ? 0.2 : 0.13;
    ctx.filter = "blur(24px) brightness(0.46) saturate(1.45)";
    drawCoverImage(ctx, background, -35, -35, WIDTH + 70, height + 70);
    ctx.restore();
  }

  drawGlow(ctx, 95, 60, 330, "rgba(155, 123, 255, 0.28)");
  drawGlow(ctx, 1020, 135, 360, "rgba(50, 217, 244, 0.2)");
  drawGlow(ctx, 720, height + 30, 350, "rgba(75, 231, 176, 0.12)");

  ctx.fillStyle = "rgba(3, 5, 12, 0.47)";
  ctx.fillRect(0, 0, WIDTH, height);

  const topLine = ctx.createLinearGradient(0, 0, WIDTH, 0);
  topLine.addColorStop(0, COLORS.purple);
  topLine.addColorStop(0.48, COLORS.coral);
  topLine.addColorStop(1, COLORS.cyan);
  ctx.fillStyle = topLine;
  ctx.fillRect(0, 0, WIDTH, 4);
}

function drawAmbientPattern(ctx, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  for (let x = 20; x < WIDTH; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 150, height);
    ctx.stroke();
  }

  for (let index = 0; index < 340; index += 1) {
    const x = (index * 83) % WIDTH;
    const y = (index * 137) % height;
    const alpha = 0.025 + (index % 7) * 0.006;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawHeader(ctx, stats) {
  drawBrandMark(ctx, 44, 44);

  ctx.fillStyle = COLORS.purple;
  ctx.font = font(11, 800);
  ctx.fillText("AKTİVİTE RAPORU", 82, 46);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(30, 800);
  ctx.fillText("İstatistik Merkezi", 82, 80);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(13, 500);
  ctx.fillText(truncateText(ctx, `${stats.guildName} • Canlı üye verileri`, 570), 83, 104);

  drawPill(ctx, 866, 48, "SON 7 GÜN + TOPLAM", COLORS.mint);
}

async function drawProfilePanel(ctx, user) {
  const x = 42;
  const y = 137;
  const width = 270;
  const height = 472;
  drawPanel(ctx, x, y, width, height, 27, true);

  const strip = ctx.createLinearGradient(x, y, x + width, y);
  strip.addColorStop(0, COLORS.purple);
  strip.addColorStop(0.52, COLORS.coral);
  strip.addColorStop(1, COLORS.cyan);
  ctx.fillStyle = strip;
  fillRoundedRect(ctx, x + 20, y + 20, width - 40, 5, 3);

  const avatar = await loadImageSafe(user.avatarURL);
  drawAvatarFrame(ctx, x + width / 2, y + 103, 67);
  drawAvatar(ctx, avatar, x + width / 2, y + 103, 59, user.displayName);
  drawOnlineBadge(ctx, x + width / 2 + 47, y + 103 + 42);

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, user.displayName || user.username || "Kullanıcı", 224, 23, 15, 800), 800);
  ctx.fillText(truncateText(ctx, user.displayName || user.username || "Kullanıcı", 224), x + width / 2, y + 203);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.fillText(truncateText(ctx, `@${user.username || "kullanıcı"}`, 220), x + width / 2, y + 228);
  ctx.restore();

  drawProfileDate(ctx, {
    x: x + 20,
    y: y + 258,
    width: width - 40,
    label: "HESAP OLUŞTURMA",
    value: formatDate(user.createdAt),
    accent: COLORS.purple
  });
  drawProfileDate(ctx, {
    x: x + 20,
    y: y + 337,
    width: width - 40,
    label: "SUNUCUYA KATILMA",
    value: user.joinedAt ? formatDate(user.joinedAt) : "Sunucuda değil",
    accent: COLORS.cyan
  });

  ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
  ctx.fillRect(x + 20, y + 433, width - 40, 1);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(10, 700);
  ctx.fillText(`ID • ${user.id || "—"}`, x + 20, y + 455);
}

function drawTotalCard(ctx, { x, y, width, title, value, detail, accent, icon }) {
  const height = 132;
  drawPanel(ctx, x, y, width, height, 23, true);

  const glow = ctx.createRadialGradient(x + width, y, 5, x + width, y, 165);
  glow.addColorStop(0, withAlpha(accent, 0.3));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  fillRoundedRect(ctx, x, y, width, height, 23);

  drawIconBadge(ctx, x + 29, y + 29, 34, accent, icon);
  ctx.fillStyle = withAlpha(accent, 0.95);
  ctx.font = font(11, 800);
  ctx.fillText(title, x + 54, y + 33);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, String(value), width - 46, 34, 21, 800), 800);
  ctx.fillText(String(value), x + 23, y + 80);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 500);
  ctx.fillText(detail, x + 23, y + 106);

  ctx.fillStyle = accent;
  fillRoundedRect(ctx, x + 23, y + height - 8, width - 46, 3, 2);
}

function drawPeriodCard(ctx, { x, y, width, title, subtitle, values, formatter, accent, icon }) {
  const height = 206;
  drawPanel(ctx, x, y, width, height, 23, false);

  drawIconBadge(ctx, x + 31, y + 31, 38, accent, icon);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(16, 800);
  ctx.fillText(title, x + 58, y + 30);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(10, 500);
  ctx.fillText(subtitle, x + 58, y + 48);

  const periods = [
    ["1 GÜN", values?.day || 0],
    ["7 GÜN", values?.week || 0],
    ["TOPLAM", values?.total || 0]
  ];
  const columnWidth = (width - 38) / 3;

  periods.forEach(([label, value], index) => {
    const columnX = x + 19 + index * columnWidth;
    if (index > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.065)";
      ctx.fillRect(columnX, y + 80, 1, 88);
    }
    ctx.fillStyle = index === 2 ? accent : COLORS.muted;
    ctx.font = font(10, 800);
    ctx.fillText(label, columnX + 12, y + 103);

    const formatted = formatter(value);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(fitFontSize(ctx, formatted, columnWidth - 22, 17, 11, 800), 800);
    ctx.fillText(formatted, columnX + 12, y + 135);

    const maximum = Math.max(1, values?.total || 0, values?.week || 0, values?.day || 0);
    const ratio = Math.min(1, value / maximum);
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    fillRoundedRect(ctx, columnX + 12, y + 157, columnWidth - 24, 6, 3);
    if (ratio > 0) {
      const bar = ctx.createLinearGradient(columnX + 12, 0, columnX + columnWidth - 12, 0);
      bar.addColorStop(0, withAlpha(accent, 0.48));
      bar.addColorStop(1, accent);
      ctx.fillStyle = bar;
      fillRoundedRect(ctx, columnX + 12, y + 157, Math.max(5, (columnWidth - 24) * ratio), 6, 3);
    }
  });

  ctx.fillStyle = withAlpha(accent, 0.08);
  fillRoundedRect(ctx, x + 19, y + 181, width - 38, 7, 4);
}

function drawChannelCard(ctx, { x, y, width, title, channel, accent, formatter, icon }) {
  const height = 99;
  drawPanel(ctx, x, y, width, height, 21, false);
  drawIconBadge(ctx, x + 33, y + 32, 42, accent, icon);

  ctx.fillStyle = accent;
  ctx.font = font(9, 800);
  ctx.fillText(title, x + 66, y + 24);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(15, 800);
  ctx.fillText(truncateText(ctx, channel?.name || "Henüz veri yok", width - 91), x + 66, y + 50);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(10, 600);
  ctx.fillText(channel?.value ? formatter(channel.value) : "Aktivite kaydı bulunamadı", x + 66, y + 73);
}

async function drawChartHeader(ctx, stats) {
  const avatar = await loadImageSafe(stats.user?.avatarURL);
  drawAvatarFrame(ctx, 76, 76, 35);
  drawAvatar(ctx, avatar, 76, 76, 30, stats.user?.displayName);

  ctx.fillStyle = COLORS.mint;
  ctx.font = font(10, 800);
  ctx.fillText("DETAYLI AKTİVİTE ANALİZİ", 128, 48);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(28, 800);
  ctx.fillText("Dönem Karşılaştırması", 128, 80);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.fillText(truncateText(ctx, `${stats.user?.displayName || "Kullanıcı"} • ${stats.guildName}`, 590), 129, 104);

  drawPill(ctx, 850, 58, "BAĞIMSIZ ÖLÇEKLER", COLORS.amber);
}

function drawAnalysisPanel(ctx, {
  x,
  y,
  width,
  height,
  title,
  subtitle,
  values,
  formatter,
  accent,
  secondary,
  icon
}) {
  drawPanel(ctx, x, y, width, height, 27, true);
  drawIconBadge(ctx, x + 35, y + 35, 44, accent, icon);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(20, 800);
  ctx.fillText(title, x + 67, y + 33);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(10, 500);
  ctx.fillText(subtitle, x + 67, y + 53);

  const rows = [
    ["BUGÜN", values?.day || 0],
    ["SON 7 GÜN", values?.week || 0],
    ["TÜM ZAMANLAR", values?.total || 0]
  ];
  const actualMaximum = Math.max(0, ...rows.map(([, value]) => value));
  const scaleMaximum = Math.max(1, actualMaximum);

  rows.forEach(([label, value], index) => {
    const rowY = y + 105 + index * 78;
    ctx.fillStyle = index === 2 ? accent : COLORS.muted;
    ctx.font = font(10, 800);
    ctx.fillText(label, x + 27, rowY);

    ctx.save();
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.text;
    ctx.font = font(13, 800);
    ctx.fillText(formatter(value), x + width - 27, rowY);
    ctx.restore();

    const trackX = x + 27;
    const trackY = rowY + 17;
    const trackWidth = width - 54;
    ctx.fillStyle = "rgba(255, 255, 255, 0.065)";
    fillRoundedRect(ctx, trackX, trackY, trackWidth, 13, 7);

    const ratio = value / scaleMaximum;
    if (ratio > 0) {
      const fillWidth = Math.max(9, trackWidth * ratio);
      const bar = ctx.createLinearGradient(trackX, 0, trackX + fillWidth, 0);
      bar.addColorStop(0, withAlpha(secondary, 0.6));
      bar.addColorStop(0.55, accent);
      bar.addColorStop(1, secondary);
      ctx.fillStyle = bar;
      ctx.save();
      ctx.shadowColor = withAlpha(accent, 0.5);
      ctx.shadowBlur = 10;
      fillRoundedRect(ctx, trackX, trackY, fillWidth, 13, 7);
      ctx.restore();
    }
  });

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(x + 27, y + height - 27, width - 54, 1);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9, 600);
  ctx.fillText(`REKOR • ${formatter(actualMaximum)}`, x + 27, y + height - 11);
}

function drawAverageCard(ctx, {
  x,
  y,
  width,
  title,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  leftColor,
  rightColor
}) {
  const height = 99;
  drawPanel(ctx, x, y, width, height, 21, false);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9, 800);
  ctx.fillText(title, x + 23, y + 22);

  drawMiniMetric(ctx, x + 23, y + 43, 205, leftLabel, leftValue, leftColor);
  ctx.fillStyle = "rgba(255, 255, 255, 0.075)";
  ctx.fillRect(x + width / 2, y + 39, 1, 42);
  drawMiniMetric(ctx, x + width / 2 + 20, y + 43, 205, rightLabel, rightValue, rightColor);
}

function drawMiniMetric(ctx, x, y, width, label, value, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 4, y + 5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9, 800);
  ctx.fillText(label, x + 15, y + 8);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(fitFontSize(ctx, value, width, 17, 12, 800), 800);
  ctx.fillText(value, x, y + 34);
}

function drawFavoriteCard(ctx, { x, y, width, messageChannel, voiceChannel }) {
  const height = 99;
  drawPanel(ctx, x, y, width, height, 21, false);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9, 800);
  ctx.fillText("AKTİVİTE NOKTALARI", x + 23, y + 22);

  drawFavoriteLine(ctx, x + 24, y + 46, width - 48, "MESAJ", messageChannel?.name, COLORS.coral, "hash");
  drawFavoriteLine(ctx, x + 24, y + 75, width - 48, "SES", voiceChannel?.name, COLORS.mint, "voice");
}

function drawFavoriteLine(ctx, x, y, width, label, value, color, icon) {
  drawSmallIcon(ctx, x + 6, y - 4, color, icon);
  ctx.fillStyle = color;
  ctx.font = font(9, 800);
  ctx.fillText(label, x + 22, y);
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.text;
  ctx.font = font(12, 700);
  ctx.fillText(truncateText(ctx, value || "Henüz veri yok", width - 70), x + width, y);
  ctx.restore();
}

function drawProfileDate(ctx, { x, y, width, label, value, accent }) {
  ctx.fillStyle = COLORS.panelSoft;
  fillRoundedRect(ctx, x, y, width, 62, 15);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.075)";
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, 61, 15);
  ctx.fillStyle = accent;
  fillRoundedRect(ctx, x + 13, y + 13, 4, 36, 2);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9, 800);
  ctx.fillText(label, x + 29, y + 24);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(14, 800);
  ctx.fillText(value, x + 29, y + 46);
}

function drawPanel(ctx, x, y, width, height, radius, shadow) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
  }
  ctx.fillStyle = COLORS.panel;
  fillRoundedRect(ctx, x, y, width, height, radius);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, radius);
  ctx.restore();
}

function drawAvatarFrame(ctx, cx, cy, radius) {
  const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  gradient.addColorStop(0, COLORS.purple);
  gradient.addColorStop(0.48, COLORS.coral);
  gradient.addColorStop(1, COLORS.cyan);
  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(155, 123, 255, 0.55)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx, image, cx, cy, radius, fallbackLabel) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (image) {
    drawCoverImage(ctx, image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    const fallback = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    fallback.addColorStop(0, COLORS.purple);
    fallback.addColorStop(1, COLORS.cyan);
    ctx.fillStyle = fallback;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(Math.max(18, radius * 0.7), 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitial(fallbackLabel), cx, cy + 1);
  }
  ctx.restore();
}

function drawOnlineBadge(ctx, cx, cy) {
  ctx.fillStyle = COLORS.panel;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = COLORS.mint;
  ctx.shadowColor = COLORS.mint;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBrandMark(ctx, x, y) {
  const gradient = ctx.createLinearGradient(x, y, x + 25, y + 25);
  gradient.addColorStop(0, COLORS.purple);
  gradient.addColorStop(0.55, COLORS.coral);
  gradient.addColorStop(1, COLORS.cyan);
  ctx.fillStyle = gradient;
  fillRoundedRect(ctx, x, y - 4, 25, 25, 8);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.arc(x + 9, y + 5, 3, 0, Math.PI * 2);
  ctx.arc(x + 17, y + 12, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPill(ctx, x, y, label, color) {
  ctx.font = font(10, 800);
  const width = Math.ceil(ctx.measureText(label).width) + 48;
  ctx.fillStyle = withAlpha(color, 0.1);
  fillRoundedRect(ctx, x, y, width, 36, 18);
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, 35, 18);
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x + 19, y + 18, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.fillText(label, x + 32, y + 22);
}

function drawIconBadge(ctx, cx, cy, size, color, icon) {
  ctx.fillStyle = withAlpha(color, 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
  drawSmallIcon(ctx, cx, cy, color, icon);
}

function drawSmallIcon(ctx, cx, cy, color, icon) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (icon === "voice") {
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 7, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy + 1);
    ctx.lineTo(cx - 7, cy + 7);
    ctx.moveTo(cx + 7, cy + 1);
    ctx.lineTo(cx + 7, cy + 7);
    ctx.stroke();
    fillRoundedRect(ctx, cx - 9, cy + 3, 4, 7, 2);
    fillRoundedRect(ctx, cx + 5, cy + 3, 4, 7, 2);
  } else if (icon === "hash") {
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 8);
    ctx.lineTo(cx - 6, cy + 8);
    ctx.moveTo(cx + 5, cy - 8);
    ctx.lineTo(cx + 3, cy + 8);
    ctx.moveTo(cx - 9, cy - 3);
    ctx.lineTo(cx + 9, cy - 3);
    ctx.moveTo(cx - 10, cy + 4);
    ctx.lineTo(cx + 8, cy + 4);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    fillRoundedRect(ctx, cx - 9, cy - 7, 18, 13, 5);
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 5);
    ctx.lineTo(cx - 6, cy + 10);
    ctx.lineTo(cx + 1, cy + 6);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#FFFFFF", 0.82);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 2);
    ctx.lineTo(cx + 5, cy - 2);
    ctx.moveTo(cx - 5, cy + 2);
    ctx.lineTo(cx + 2, cy + 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFooter(ctx, generatedAt, note = null) {
  const y = CARD_HEIGHT - 19;
  ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
  ctx.fillRect(42, y - 7, WIDTH - 84, 1);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9, 600);
  if (note) ctx.fillText(truncateText(ctx, note, 670), 42, y + 9);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`GÜNCELLENDİ • ${formatDateTime(generatedAt)}`, WIDTH - 42, y + 9);
  ctx.restore();
}

function findTopChannel(entries, type, userId, guild) {
  const expression = type === "message"
    ? /^channelMsgCount_(\d+)_(\d+)$/
    : /^channelVoiceTime_(\d+)_(\d+)$/;

  const matches = entries
    .map(entry => {
      const match = expression.exec(entry.ID);
      if (!match || match[2] !== userId) return null;
      return { channelId: match[1], value: normalizeCount(entry.data) };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);

  if (!matches.length || matches[0].value <= 0) return { name: "Henüz veri yok", value: 0 };

  const top = matches[0];
  const channel = guild?.channels?.cache?.get(top.channelId);
  return {
    id: top.channelId,
    name: channel?.name ? `#${cleanText(channel.name)}` : "#silinmiş-kanal",
    value: top.value
  };
}

function normalizeDbEntries(rawEntries) {
  if (Array.isArray(rawEntries)) return rawEntries;
  if (!rawEntries || typeof rawEntries !== "object") return [];
  return Object.entries(rawEntries).map(([ID, data]) => ({ ID, data }));
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  if (totalSeconds < 60) return `${formatNumber(totalSeconds)} sn`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes} dk ${seconds} sn` : `${minutes} dk`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours} sa ${remainingMinutes} dk` : `${hours} sa`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} gün ${remainingHours} sa` : `${days} gün`;
}

function formatCompactDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) return `${formatNumber(seconds)} sn`;
  if (seconds < 3600) return `${formatNumber(seconds / 60, 1)} dk`;
  if (seconds < 86400) return `${formatNumber(seconds / 3600, 1)} sa`;
  return `${formatNumber(seconds / 86400, 1)} gün`;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function cleanText(value) {
  return String(value || "")
    // eslint-disable-next-line no-control-regex -- Kart metnindeki ASCII kontrol karakterleri bilerek temizlenir.
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function font(size, weight = 500) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

function fitFontSize(ctx, text, maxWidth, startSize, minimumSize, weight = 800) {
  let size = startSize;
  while (size > minimumSize) {
    ctx.font = font(size, weight);
    if (ctx.measureText(String(text)).width <= maxWidth) return size;
    size -= 1;
  }
  return minimumSize;
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;

  let shortened = value;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function getInitial(value) {
  return Array.from(String(value || "?").trim())[0]?.toLocaleUpperCase("tr-TR") || "?";
}

function drawGlow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 8, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sx = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sy = (image.height - sourceHeight) / 2;
  }
  ctx.drawImage(image, sx, sy, sourceWidth, sourceHeight, x, y, width, height);
}

function withAlpha(hex, alpha) {
  const normalized = String(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function loadImageSafe(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}

function registerFonts() {
  try {
    const canvafyRoot = path.dirname(require.resolve("canvafy"));
    const fontRoot = path.join(canvafyRoot, "assets", "fonts", "Manrope");
    GlobalFonts.registerFromPath(path.join(fontRoot, "Manrope-Regular.ttf"), "Manrope");
    GlobalFonts.registerFromPath(path.join(fontRoot, "Manrope-Bold.ttf"), "Manrope");
  } catch {
  }
}
