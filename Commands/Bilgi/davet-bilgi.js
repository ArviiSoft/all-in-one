const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getInviteHistory } = require("../../Utils/Membership/inviteTracker");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const WIDTH = 1000;
const HEIGHT = 620;
const FONT_FAMILY = '"Google Sans", "Product Sans", "Noto Sans", Arial, sans-serif';
const REFRESH_CUSTOM_ID = "davetbilgi_refresh";

const COLORS = {
  bg: "#070A12",
  panel: "rgba(12, 18, 32, 0.82)",
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
    .setName("davet-bilgi")
    .setDescription("Kişinin davet bilgilerini gösterir.")
    .addUserOption(option =>
      option
        .setName("kişi")
        .setDescription("Kişi seç veya ID gir.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    await interaction.deferReply({ flags: 64 });

    if (!guild) {
      return interaction.editReply({ content: "Bu komut sadece sunucularda kullanılabilir." });
    }

    const user = interaction.options.getUser("kişi");
    const payload = await createInviteInfoPayload(interaction, user);
    return interaction.editReply(payload);
  },

  async handleRefresh(interaction) {
    const [, requesterId, targetId] = interaction.customId.split(":");

    if (requesterId && interaction.user.id !== requesterId) {
      return interaction.reply({
        content: `${emojiler.uyari || "🔴"} **Bu paneli sadece komutu kullanan kişi güncelleyebilir.**`,
        flags: 64
      });
    }

    await interaction.deferUpdate();
    const user = await interaction.client.users.fetch(targetId).catch(() => null);

    if (!user) {
      return interaction.followUp({
        content: `${emojiler.uyari || "🔴"} **Kişi bulunamadı.**`,
        flags: 64
      });
    }

    const payload = await createInviteInfoPayload(interaction, user, requesterId);
    return interaction.editReply(payload);
  },

  buildInviteInfoCard
};

async function createInviteInfoPayload(interaction, user, requesterId = interaction.user.id) {
  const { guild, client } = interaction;
  let invites;

  try {
    invites = await guild.invites.fetch();
  } catch (err) {
    console.error("🔴 [DAVET BİLGİ] Davetler çekilemedi:", err);
    return {
      content: "Davet bilgileri alınamadı. Botta **Sunucuyu Yönet** izni olduğundan emin ol.",
      components: [],
      files: [],
      attachments: []
    };
  }

  const userInvites = invites.filter(invite => invite.inviter?.id === user.id);
  const activeInvites = Array.from(userInvites.values()).sort(
    (a, b) => (Number(b.uses) || 0) - (Number(a.uses) || 0)
  );
  const totalInvites = activeInvites.reduce((total, invite) => total + (Number(invite.uses) || 0), 0);
  const bestInvite = activeInvites[0] || null;
  const historyRecords = getInviteHistory(guild.id, user.id);
  const leftCount = historyRecords.filter(record => record.leftAt).length;
  const recentInvites = await Promise.all(
    historyRecords.slice(0, 5).map(record => resolveRecentInvite(client, record))
  );
  const latestRecord = historyRecords[0] || null;
  const latestActiveInvite = latestRecord?.inviteCode ? userInvites.get(latestRecord.inviteCode) : null;
  const lastInvite = latestRecord
    ? {
        code: latestRecord.inviteCode,
        url: latestRecord.inviteUrl,
        channelId: latestRecord.channelId || latestActiveInvite?.channelId,
        uses: Number(latestActiveInvite?.uses ?? latestRecord.usesAfter) || 0,
        maxUses: Number(latestActiveInvite?.maxUses) || 0,
        invitedName: recentInvites[0]?.name || latestRecord.invitedName,
        joinedAt: latestRecord.joinedAt
      }
    : bestInvite
      ? {
          code: bestInvite.code,
          url: `https://discord.gg/${bestInvite.code}`,
          channelId: bestInvite.channelId,
          uses: Number(bestInvite.uses) || 0,
          maxUses: Number(bestInvite.maxUses) || 0,
          invitedName: null,
          joinedAt: null
        }
      : null;

  const bannerURL = await getUserBannerURL(user, client);
  const buffer = await buildInviteInfoCard({
    guild,
    user,
    bannerURL,
    totalInvites,
    activeInviteCount: activeInvites.length,
    bestInvite,
    lastInvite,
    recentInvites,
    historyRecords
  });

  const attachment = new AttachmentBuilder(buffer, { name: "davet-bilgi.png" });
  const counts = { joined: totalInvites, left: leftCount };

  return {
    files: [attachment],
    attachments: [],
    components: [buildControls(user.id, requesterId, counts)]
  };
}

async function getUserBannerURL(user, client) {
  let bannerURL = user.bannerURL({ extension: "png", size: 1024 });
  if (bannerURL) return bannerURL;

  try {
    const userData = await client.rest.get(`/users/${user.id}`);
    if (userData.banner) {
      return `https://cdn.discordapp.com/banners/${user.id}/${userData.banner}.png?size=1024`;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveRecentInvite(client, record) {
  const invitedUser = await client.users.fetch(record.invitedId).catch(() => null);
  return {
    ...record,
    name: invitedUser?.globalName || invitedUser?.username || record.invitedName || record.invitedUsername || "Bilinmiyor",
    username: invitedUser?.username || record.invitedUsername || null,
    avatarURL: invitedUser?.displayAvatarURL({ extension: "png", size: 128 }) || record.invitedAvatarURL || null,
    invitedBot: invitedUser?.bot ?? record.invitedBot
  };
}

function buildControls(targetUserId, requesterId, counts) {
  const row = new ActionRowBuilder();
  const enterEmoji = emojiler.girissagok || emojiler.girisok;
  const exitEmoji = emojiler.cikissagok || emojiler.cikisOk;
  const refreshEmoji = emojiler.yukleniyor || emojiler.chart;

  const enteredButton = new ButtonBuilder()
    .setCustomId(`davetbilgi_enter:${targetUserId}`)
    .setLabel(`Girenler: ${formatCount(counts.joined)}`)
    .setStyle(ButtonStyle.Success)
    .setDisabled(true);

  const refreshButton = new ButtonBuilder()
    .setCustomId(`${REFRESH_CUSTOM_ID}:${requesterId}:${targetUserId}`)
    .setLabel("Verileri güncelle")
    .setStyle(ButtonStyle.Primary);

  const leftButton = new ButtonBuilder()
    .setCustomId(`davetbilgi_left:${targetUserId}`)
    .setLabel(`Çıkanlar: ${formatCount(counts.left)}`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);

  setButtonEmoji(enteredButton, enterEmoji);
  setButtonEmoji(refreshButton, refreshEmoji);
  setButtonEmoji(leftButton, exitEmoji);

  return row.addComponents(enteredButton, refreshButton, leftButton);
}

function setButtonEmoji(button, emoji) {
  if (emoji) button.setEmoji(emoji);
  return button;
}

async function buildInviteInfoCard({
  guild,
  user,
  bannerURL,
  totalInvites,
  activeInviteCount,
  bestInvite,
  lastInvite,
  recentInvites,
  historyRecords
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  await drawBackground(ctx, bannerURL);
  drawNoise(ctx);
  await drawHeader(ctx, guild, user, totalInvites);
  drawMetricRow(ctx, { totalInvites, activeInviteCount, bestInvite, lastInvite });
  drawGraph(ctx, historyRecords);
  await drawRecentInvites(ctx, recentInvites);
  drawFooter(ctx, historyRecords);

  return canvas.toBuffer("image/png");
}

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

async function drawBackground(ctx, bannerURL) {
  const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, "#0B1020");
  bgGradient.addColorStop(0.42, "#171023");
  bgGradient.addColorStop(0.72, "#071821");
  bgGradient.addColorStop(1, "#0B0E17");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const banner = await loadImageSafe(bannerURL);
  if (banner) {
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.filter = "blur(16px) brightness(0.42)";
    drawCoverImage(ctx, banner, -24, -24, WIDTH + 48, HEIGHT + 48);
    ctx.restore();
  }

  const glowA = ctx.createRadialGradient(230, 95, 10, 230, 95, 310);
  glowA.addColorStop(0, "rgba(37, 215, 255, 0.24)");
  glowA.addColorStop(1, "rgba(37, 215, 255, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowB = ctx.createRadialGradient(760, 160, 10, 760, 160, 340);
  glowB.addColorStop(0, "rgba(255, 91, 141, 0.18)");
  glowB.addColorStop(1, "rgba(255, 91, 141, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(3, 5, 10, 0.48)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawNoise(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.09;
  for (let i = 0; i < 850; i++) {
    const alpha = Math.random() * 0.8;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 1, 1);
  }
  ctx.restore();
}

async function drawHeader(ctx, guild, user, totalInvites) {
  const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImageSafe(avatarURL);

  ctx.save();
  const halo = ctx.createRadialGradient(112, 112, 18, 112, 112, 92);
  halo.addColorStop(0, "rgba(82, 242, 160, 0.35)");
  halo.addColorStop(1, "rgba(82, 242, 160, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(20, 20, 190, 190);
  ctx.restore();

  drawAvatarFrame(ctx, 110, 112, 65, COLORS.cyan, COLORS.green);
  drawAvatar(ctx, avatar, 110, 112, 58, user.globalName || user.username);

  const displayName = user.globalName || user.username;
  ctx.fillStyle = COLORS.text;
  ctx.font = font(44, 700);
  ctx.fillText(truncateText(ctx, displayName, 430), 198, 90);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(20, 400);
  ctx.fillText(truncateText(ctx, `@${user.username}  •  ${guild.name}`, 500), 200, 123);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(248, 250, 252, 0.78)";
  ctx.font = font(16, 500);
  ctx.fillText("Güncel davet özeti", 958, 60);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(30, 700);
  ctx.fillText(formatCount(totalInvites), 958, 98);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(15, 400);
  ctx.fillText("toplam kullanılan davet", 958, 124);
  ctx.restore();
}

function drawMetricRow(ctx, stats) {
  drawMetricCard(
    ctx,
    42,
    190,
    210,
    82,
    "Toplam Davet",
    formatCount(stats.totalInvites),
    "Link kullanım toplamı",
    COLORS.green
  );

  drawMetricCard(
    ctx,
    270,
    190,
    160,
    82,
    "Aktif Link",
    formatCount(stats.activeInviteCount),
    "Silinmemiş kodlar",
    COLORS.cyan
  );

  const bestCode = stats.bestInvite?.code ? `${stats.bestInvite.code}` : "Yok";
  drawMetricCard(
    ctx,
    448,
    190,
    172,
    82,
    "Zirve Link",
    bestCode,
    stats.bestInvite ? `${formatCount(stats.bestInvite.uses)} kullanım` : "Henüz link yok",
    COLORS.amber
  );

  drawLastInviteCard(ctx, 640, 190, 318, 82, stats.lastInvite);
}

function drawMetricCard(ctx, x, y, w, h, title, value, note, color) {
  drawPanel(ctx, x, y, w, h);
  ctx.fillStyle = color;
  ctx.font = font(14, 700);
  ctx.fillText(title.toUpperCase(), x + 18, y + 24);

  ctx.fillStyle = COLORS.text;
  ctx.font = value.length > 12 ? font(20, 700) : font(25, 700);
  ctx.fillText(truncateText(ctx, value, w - 34), x + 18, y + 51);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 400);
  ctx.fillText(truncateText(ctx, note, w - 34), x + 18, y + 70);
}

function drawLastInviteCard(ctx, x, y, w, h, invite) {
  drawPanel(ctx, x, y, w, h);
  ctx.fillStyle = COLORS.rose;
  ctx.font = font(14, 700);
  ctx.fillText("SON KULLANILAN LINK", x + 18, y + 24);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(21, 700);
  const linkText = invite?.code ? `discord.gg/${invite.code}` : "Kayıt yok";
  ctx.fillText(truncateText(ctx, linkText, w - 36), x + 18, y + 50);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 400);
  const note = invite
    ? `${formatInviteUses(invite)}  •  ${invite.invitedName ? truncatePlain(invite.invitedName, 18) : "son kullanıcı bekleniyor"}`
    : "Yeni katılımlardan sonra dolar";
  ctx.fillText(truncateText(ctx, note, w - 36), x + 18, y + 69);
}

function drawGraph(ctx, records) {
  const x = 42;
  const y = 304;
  const w = 578;
  const h = 272;
  const days = getLastSevenDays(records);
  const max = Math.max(1, ...days.map(day => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);

  drawPanel(ctx, x, y, w, h);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(24, 700);
  ctx.fillText("Son 7 Gün Davet Grafiği", x + 24, y + 38);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(15, 400);

  const chartX = x + 36;
  const chartY = y + 92;
  const chartW = w - 72;
  const chartH = 126;
  const baseY = chartY + chartH;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);
  for (let i = 0; i <= 3; i++) {
    const gy = chartY + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }
  ctx.restore();

  const slot = chartW / days.length;
  const barW = Math.min(42, slot * 0.48);
  const points = [];

  days.forEach((day, index) => {
    const cx = chartX + slot * index + slot / 2;
    const barH = Math.max(4, (day.count / max) * chartH);
    const barX = cx - barW / 2;
    const barY = baseY - barH;
    const gradient = ctx.createLinearGradient(0, barY, 0, baseY);
    gradient.addColorStop(0, COLORS.green);
    gradient.addColorStop(0.55, COLORS.cyan);
    gradient.addColorStop(1, "rgba(37, 215, 255, 0.18)");

    ctx.fillStyle = gradient;
    fillRoundedRect(ctx, barX, barY, barW, barH, 10);
    points.push({ x: cx, y: barY, count: day.count });

    ctx.fillStyle = COLORS.muted;
    ctx.font = font(13, 500);
    ctx.textAlign = "center";
    ctx.fillText(day.label, cx, baseY + 24);

    ctx.fillStyle = COLORS.text;
    ctx.font = font(13, 700);
    ctx.fillText(String(day.count), cx, barY - 8);
  });

  ctx.textAlign = "left";
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();

  points.forEach(point => {
    ctx.fillStyle = point.count > 0 ? COLORS.amber : "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  if (total === 0) {
    drawEmptyHint(ctx, x + 128, y + 96, w - 256, "Yeni davet kayıtları geldikçe bu grafik dolacak.");
  }
}

async function drawRecentInvites(ctx, recentInvites) {
  const x = 640;
  const y = 304;
  const w = 318;
  const h = 272;
  drawPanel(ctx, x, y, w, h);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(23, 700);
  ctx.fillText("Son Davet Edilenler", x + 22, y + 36);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(14, 400);

  if (!recentInvites.length) {
    drawEmptyHint(ctx, x + 22, y + 92, w - 44, "Bu kullanıcı için henüz takip edilen katılım yok.");
    return;
  }

  for (let i = 0; i < recentInvites.length; i++) {
    const item = recentInvites[i];
    const rowY = y + 84 + i * 36;
    const avatar = await loadImageSafe(item.avatarURL);

    if (i > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(x + 22, rowY - 9);
      ctx.lineTo(x + w - 22, rowY - 9);
      ctx.stroke();
    }

    drawAvatar(ctx, avatar, x + 39, rowY + 10, 15, item.name);

    ctx.fillStyle = COLORS.text;
    ctx.font = font(14, 700);
    const botMark = item.invitedBot ? " [BOT]" : "";
    ctx.fillText(truncateText(ctx, `${item.name}${botMark}`, 150), x + 62, rowY + 5);

    ctx.fillStyle = COLORS.muted;
    ctx.font = font(12, 400);
    const detail = `${item.inviteCode ? `gg/${item.inviteCode}` : "kod yok"}  •  ${formatShortTime(item.joinedAt)}`;
    ctx.fillText(truncateText(ctx, detail, 185), x + 62, rowY + 24);
  }
}

function drawFooter(ctx, records) {
  const tracked = records.length;
  ctx.fillStyle = "rgba(255, 255, 255, 0.46)";
  ctx.font = font(13, 400);
  ctx.fillText(
    `Takip verisi: ${formatCount(tracked)} kayıt  •  Son güncelleme: ${formatShortTime(Date.now())}`,
    42,
    594
  );
}

function getLastSevenDays(records) {
  const labels = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const count = records.filter(record => {
      const joinedAt = Number(record.joinedAt) || 0;
      return joinedAt >= start.getTime() && joinedAt < end.getTime();
    }).length;

    days.push({ label: labels[start.getDay()], count });
  }

  return days;
}

function drawPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = COLORS.panel;
  fillRoundedRect(ctx, x, y, w, h, 22);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 22);
  ctx.restore();
}

function drawEmptyHint(ctx, x, y, w, text) {
  ctx.save();
  ctx.fillStyle = COLORS.panelSoft;
  fillRoundedRect(ctx, x, y, w, 52, 16);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(14, 400);
  wrapText(ctx, text, x + 15, y + 22, w - 30, 17, 2);
  ctx.restore();
}

function drawAvatarFrame(ctx, cx, cy, r, from, to) {
  ctx.save();
  const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  gradient.addColorStop(0, from);
  gradient.addColorStop(0.5, COLORS.amber);
  gradient.addColorStop(1, to);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx, image, cx, cy, r, label) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (image) {
    drawCoverImage(ctx, image, cx - r, cy - r, r * 2, r * 2);
  } else {
    const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    gradient.addColorStop(0, "rgba(37, 215, 255, 0.75)");
    gradient.addColorStop(1, "rgba(255, 91, 141, 0.65)");
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(Math.max(12, Math.floor(r * 0.72)), 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitials(label), cx, cy + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
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

function truncatePlain(text, maxLength) {
  const source = String(text ?? "-");
  if (source.length <= maxLength) return source;
  return `${source.slice(0, Math.max(1, maxLength - 3))}...`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(" ");
  let line = "";
  let lines = 0;

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines++;
      if (lines >= maxLines) return;
    } else {
      line = next;
    }
  }

  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

function getInitials(label) {
  const clean = String(label || "?").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${Array.from(parts[0])[0] || ""}${Array.from(parts[1])[0] || ""}`.toUpperCase();
  return Array.from(clean)[0]?.toUpperCase() || "?";
}

function formatCount(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
}

function formatInviteUses(invite) {
  const uses = formatCount(invite?.uses || 0);
  if (!invite?.maxUses) return `${uses} kullanım`;
  return `${uses}/${formatCount(invite.maxUses)} kullanım`;
}

function formatShortTime(timestamp) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month} ${hour}:${minute}`;
}
