const path = require("path");
const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const db = require("../../Utils/Core/jsonDB");
const { getBadges, getPrimaryGuild } = require("../../Utils/Account/accountBadges");

const WIDTH = 1120;
const HEIGHT = 640;
const CARD = { x: 20, y: 20, width: 1080, height: 600, radius: 32 };
const FONT_FAMILY = '"Manrope", "Noto Sans", Arial, sans-serif';

const COLORS = {
  background: "#070A11",
  surface: "#0B101A",
  surfaceSoft: "rgba(255, 255, 255, 0.055)",
  border: "rgba(255, 255, 255, 0.105)",
  text: "#F8FAFC",
  muted: "#9AA6BA",
  faint: "#69758A"
};

const STATUS = {
  online: { label: "Çevrimiçi", color: "#3DDC97" },
  idle: { label: "Boşta", color: "#F6C65B" },
  dnd: { label: "Rahatsız etmeyin", color: "#F05D6F" },
  offline: { label: "Çevrimdışı", color: "#778195" }
};

registerFonts();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profil-kart")
    .setDescription("Kişi için görsel profil kartı oluşturur.")
    .addUserOption((option) =>
      option
        .setName("kişi")
        .setDescription("Kişi seç.")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = interaction.options.getUser("kişi") || interaction.user;
    const member = await interaction.guild.members.fetch({ user: user.id, force: true }).catch(() => null);
    const fetchedUser = await interaction.client.users
      .fetch(user.id, { force: true })
      .catch(() => user);

    const buffer = await buildProfileCard({
      user: fetchedUser,
      member,
      guildName: interaction.guild.name,
      messageTotal: db.get(`msg_total_${user.id}`) || 0,
      voiceTotal: db.get(`voice_total_${user.id}`) || 0
    });

    const attachment = new AttachmentBuilder(buffer, {
      name: `profil-kart-${user.id}.png`
    });

    await interaction.editReply({ files: [attachment] });
  },

  buildProfileCard
};

async function buildProfileCard({
  user,
  member = null,
  guildName = "Discord",
  messageTotal = 0,
  voiceTotal = 0,
  bannerURL,
  avatarURL,
  avatarDecorationURL,
  badges = getBadges(user),
  primaryGuild = getPrimaryGuild(user)
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const displayName = user.globalName || user.username || "Kullanıcı";
  const username = user.username || "kullanıcı";
  const accent = resolveAccent(user, member);
  const secondaryAccent = mixHex(accent, "#8B5CF6", 0.48);
  const status = STATUS[member?.presence?.status] || STATUS.offline;
  const roles = Math.max(0, (member?.roles?.cache?.size || 1) - 1);
  const createdAt = toDate(user.createdAt || user.createdTimestamp);
  const joinedAt = toDate(member?.joinedAt || member?.joinedTimestamp);
  const accountDays = daysSince(createdAt);
  const joinedDays = daysSince(joinedAt);

  const resolvedBannerURL = bannerURL === undefined
    ? user.bannerURL?.({ extension: "png", size: 2048 })
    : bannerURL;
  const resolvedAvatarURL = avatarURL === undefined
    ? member?.avatarURL?.({ extension: "png", size: 512, forceStatic: true })
      || user.displayAvatarURL?.({ extension: "png", size: 512, forceStatic: true })
    : avatarURL;
  const resolvedDecorationURL = avatarDecorationURL === undefined
    ? member?.avatarDecorationURL?.() || user.avatarDecorationURL?.()
    : avatarDecorationURL;

  const [banner, avatar, decoration, guildBadge, ...badgeImages] = await Promise.all([
    loadImageSafe(resolvedBannerURL),
    loadImageSafe(resolvedAvatarURL),
    loadImageSafe(resolvedDecorationURL),
    loadImageSafe(primaryGuild?.badgeImage || primaryGuild?.badgeURL),
    ...badges.map((badge) => loadImageSafe(badge.image || badge.imageURL))
  ]);

  drawCanvasBackground(ctx, accent, secondaryAccent);
  drawCardShadow(ctx);

  ctx.save();
  roundedRectPath(ctx, CARD.x, CARD.y, CARD.width, CARD.height, CARD.radius);
  ctx.clip();

  drawFallbackBanner(ctx, accent, secondaryAccent, displayName);
  if (banner) drawBannerImage(ctx, banner);
  drawBannerOverlays(ctx, Boolean(banner));
  drawProfileSurface(ctx);
  drawTopLabels(ctx, guildName);
  drawAvatar(ctx, avatar, displayName, accent, status, decoration);
  drawIdentity(ctx, {
    displayName, username, isBot: user.bot, status, accent,
    badges, badgeImages, primaryGuild, guildBadge
  });
  drawMembership(ctx, { createdAt, joinedAt, accountDays, joinedDays, accent });
  drawStats(ctx, { messageTotal, voiceTotal, roles, accent, secondaryAccent });
  drawFooter(ctx, { userId: user.id, guildName });

  ctx.restore();
  drawCardBorder(ctx);

  return canvas.toBuffer("image/png");
}

function drawCanvasBackground(ctx, accent, secondaryAccent) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, 630);
  glow.addColorStop(0, colorWithAlpha(accent, 0.12));
  glow.addColorStop(0.52, colorWithAlpha(secondaryAccent, 0.055));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawCardShadow(ctx) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = COLORS.background;
  fillRoundedRect(ctx, CARD.x, CARD.y, CARD.width, CARD.height, CARD.radius);
  ctx.restore();
}

function drawFallbackBanner(ctx, accent, secondaryAccent, displayName) {
  const gradient = ctx.createLinearGradient(CARD.x, CARD.y, CARD.x + CARD.width, CARD.y + 310);
  gradient.addColorStop(0, shadeHex(accent, -0.48));
  gradient.addColorStop(0.5, accent);
  gradient.addColorStop(1, shadeHex(secondaryAccent, -0.46));
  ctx.fillStyle = gradient;
  ctx.fillRect(CARD.x, CARD.y, CARD.width, 320);

  drawGlow(ctx, 200, 40, 290, colorWithAlpha("#FFFFFF", 0.13));
  drawGlow(ctx, 870, 150, 360, colorWithAlpha(secondaryAccent, 0.44));

  ctx.save();
  ctx.translate(810, 70);
  ctx.rotate(-0.13);
  ctx.globalAlpha = 0.11;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i += 1) {
    roundedRectPath(ctx, i * 34, -80, 18, 390, 9);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255, 255, 255, 0.065)";
  ctx.font = font(190, 800);
  ctx.fillText(getInitial(displayName), CARD.x + CARD.width - 48, 220);
  ctx.restore();
}

function drawBannerImage(ctx, banner) {
  ctx.save();
  ctx.filter = "saturate(1.08) brightness(0.88)";
  drawCoverImage(ctx, banner, CARD.x, CARD.y, CARD.width, 310);
  ctx.restore();
}

function drawBannerOverlays(ctx, hasBanner) {
  const topShade = ctx.createLinearGradient(0, CARD.y, 0, CARD.y + 140);
  topShade.addColorStop(0, hasBanner ? "rgba(4, 7, 12, 0.46)" : "rgba(4, 7, 12, 0.18)");
  topShade.addColorStop(1, "rgba(4, 7, 12, 0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(CARD.x, CARD.y, CARD.width, 150);

  const bottomShade = ctx.createLinearGradient(0, 150, 0, 325);
  bottomShade.addColorStop(0, "rgba(7, 10, 17, 0)");
  bottomShade.addColorStop(0.62, "rgba(7, 10, 17, 0.54)");
  bottomShade.addColorStop(1, COLORS.surface);
  ctx.fillStyle = bottomShade;
  ctx.fillRect(CARD.x, 150, CARD.width, 180);
}

function drawProfileSurface(ctx) {
  const surfaceGradient = ctx.createLinearGradient(0, 260, 0, CARD.y + CARD.height);
  surfaceGradient.addColorStop(0, "rgba(11, 16, 26, 0.86)");
  surfaceGradient.addColorStop(0.17, COLORS.surface);
  surfaceGradient.addColorStop(1, "#090D16");
  ctx.fillStyle = surfaceGradient;
  ctx.fillRect(CARD.x, 260, CARD.width, CARD.height - 240);

  const subtleGlow = ctx.createRadialGradient(275, 320, 10, 275, 320, 330);
  subtleGlow.addColorStop(0, "rgba(255, 255, 255, 0.035)");
  subtleGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = subtleGlow;
  ctx.fillRect(CARD.x, 230, 600, 280);
}

function drawTopLabels(ctx, guildName) {
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.font = font(13, 700);
  ctx.fillText(truncateText(ctx, String(guildName || "Discord").toUpperCase(), 310), 1065, 71);
  ctx.restore();
}

function drawAvatar(ctx, avatar, displayName, accent, status, decoration) {
  const cx = 151;
  const cy = 292;
  const radius = 82;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = COLORS.surface;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.strokeStyle = colorWithAlpha(accent, 0.95);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    drawCoverImage(ctx, avatar, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    const fallback = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    fallback.addColorStop(0, accent);
    fallback.addColorStop(1, shadeHex(accent, -0.48));
    ctx.fillStyle = fallback;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(62, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitial(displayName), cx, cy + 2);
  }
  ctx.restore();

  if (decoration) {
    const size = radius * 2 * 1.2;
    drawContainImage(ctx, decoration, cx - size / 2, cy - size / 2, size, size);
  }

  ctx.fillStyle = COLORS.surface;
  ctx.beginPath();
  ctx.arc(208, 349, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = status.color;
  ctx.beginPath();
  ctx.arc(208, 349, 13, 0, Math.PI * 2);
  ctx.fill();
}

function drawIdentity(ctx, {
  displayName, username, isBot, status, accent, badges, badgeImages, primaryGuild, guildBadge
}) {
  const x = 270;
  const availableWidth = 350;
  const badgeSize = 24;
  const badgeGap = 4;
  const badgeColumns = Math.min(6, badges.length);
  const badgeRows = badgeColumns ? Math.ceil(badges.length / badgeColumns) : 0;
  const badgesWidth = badgeColumns ? badgeColumns * (badgeSize + badgeGap) - badgeGap : 0;
  ctx.font = font(10, 800);
  const botWidth = isBot ? Math.ceil(ctx.measureText("BOT").width) + 16 : 0;
  const nameMaxWidth = availableWidth - (botWidth ? botWidth + 12 : 0)
    - (badgesWidth ? badgesWidth + 12 : 0);

  ctx.fillStyle = COLORS.text;
  const nameSize = fitFontSize(ctx, displayName, nameMaxWidth, 36, 27, 800);
  ctx.font = font(nameSize, 800);
  const renderedName = truncateText(ctx, displayName, nameMaxWidth);
  ctx.fillText(renderedName, x, 287);
  let badgeX = x + ctx.measureText(renderedName).width + 12;

  if (isBot) {
    drawSmallBadge(ctx, badgeX, 259, "BOT", accent);
    badgeX += botWidth + 12;
  }

  const badgesTop = 273 - (badgeRows * (badgeSize + badgeGap) - badgeGap) / 2;
  badges.forEach((badge, index) => {
    const iconX = badgeX + (index % badgeColumns) * (badgeSize + badgeGap);
    const iconY = badgesTop + Math.floor(index / badgeColumns) * (badgeSize + badgeGap);
    if (badgeImages[index]) {
      drawContainImage(ctx, badgeImages[index], iconX, iconY, badgeSize, badgeSize);
    } else {
      drawBadgeFallback(ctx, iconX, iconY, badgeSize, accent);
    }
  });

  ctx.font = font(13, 800);
  const tag = primaryGuild?.tag ? truncateText(ctx, primaryGuild.tag, 84) : "";
  const tagWidth = tag ? Math.ceil(ctx.measureText(tag).width) + (guildBadge ? 42 : 20) : 0;
  const usernameMaxWidth = availableWidth - (tagWidth ? tagWidth + 10 : 0);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(16, 500);
  const renderedUsername = truncateText(ctx, `@${username}`, usernameMaxWidth);
  ctx.fillText(renderedUsername, x, 318);

  if (tag) {
    const tagX = x + ctx.measureText(renderedUsername).width + 10;
    drawGuildTag(ctx, tagX, 299, tagWidth, tag, guildBadge);
  }

  drawPill(ctx, x, 338, status.label, {
    background: colorWithAlpha(status.color, 0.12),
    border: colorWithAlpha(status.color, 0.3),
    color: status.color,
    dotColor: status.color
  });
}

function drawBadgeFallback(ctx, x, y, size, accent) {
  ctx.save();
  ctx.fillStyle = colorWithAlpha(accent, 0.18);
  fillRoundedRect(ctx, x, y, size, size, 6);
  ctx.strokeStyle = mixHex(accent, "#FFFFFF", 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + 9, 5, 0, Math.PI * 2);
  ctx.moveTo(x + 9, y + 13);
  ctx.lineTo(x + 7, y + 21);
  ctx.lineTo(x + 12, y + 18);
  ctx.lineTo(x + 17, y + 21);
  ctx.lineTo(x + 15, y + 13);
  ctx.stroke();
  ctx.restore();
}

function drawGuildTag(ctx, x, y, width, tag, badge) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  fillRoundedRect(ctx, x, y, width, 26, 7);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, 25, 7);
  if (badge) drawContainImage(ctx, badge, x + 7, y + 3, 20, 20);
  ctx.fillStyle = COLORS.text;
  ctx.font = font(13, 800);
  ctx.textBaseline = "middle";
  ctx.fillText(tag, x + (badge ? 32 : 10), y + 13);
  ctx.restore();
}

function drawMembership(ctx, { createdAt, joinedAt, accountDays, joinedDays, accent }) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
  ctx.fillRect(640, 276, 1, 92);

  drawInfoBlock(ctx, 682, 274, "HESAP OLUŞTURMA", formatDate(createdAt), formatDayCount(accountDays), accent);
  drawInfoBlock(ctx, 880, 274, "SUNUCUYA KATILMA", formatDate(joinedAt), formatDayCount(joinedDays), "#B798FF");
}

function drawInfoBlock(ctx, x, y, label, value, detail, accent) {
  ctx.fillStyle = colorWithAlpha(accent, 0.9);
  fillRoundedRect(ctx, x, y, 28, 4, 2);

  ctx.fillStyle = COLORS.faint;
  ctx.font = font(11, 800);
  ctx.fillText(label, x, y + 24);

  ctx.fillStyle = COLORS.text;
  ctx.font = font(15, 700);
  ctx.fillText(truncateText(ctx, value, 172), x, y + 51);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(12, 500);
  ctx.fillText(truncateText(ctx, detail, 172), x, y + 74);
}

function drawStats(ctx, { messageTotal, voiceTotal, roles, accent, secondaryAccent }) {
  const y = 416;
  const cardWidth = 328;
  const cardHeight = 142;

  drawStatCard(ctx, 52, y, cardWidth, cardHeight, {
    label: "MESAJ",
    value: formatNumber(messageTotal),
    detail: "",
    color: accent,
    icon: "message"
  });
  drawStatCard(ctx, 396, y, cardWidth, cardHeight, {
    label: "SES AKTİFLİĞİ",
    value: formatDuration(voiceTotal),
    detail: "",
    color: secondaryAccent,
    icon: "voice"
  });
  drawStatCard(ctx, 740, y, cardWidth, cardHeight, {
    label: "ROLLER",
    value: formatNumber(roles),
    detail: "",
    color: "#49D7B1",
    icon: "roles"
  });
}

function drawStatCard(ctx, x, y, width, height, { label, value, detail, color, icon }) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = COLORS.surfaceSoft;
  fillRoundedRect(ctx, x, y, width, height, 20);
  ctx.restore();

  const wash = ctx.createLinearGradient(x, y, x + width, y + height);
  wash.addColorStop(0, colorWithAlpha(color, 0.12));
  wash.addColorStop(0.52, "rgba(255, 255, 255, 0.015)");
  wash.addColorStop(1, "rgba(255, 255, 255, 0.025)");
  ctx.fillStyle = wash;
  fillRoundedRect(ctx, x, y, width, height, 20);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 20);

  ctx.fillStyle = colorWithAlpha(color, 0.15);
  fillRoundedRect(ctx, x + 20, y + 20, 42, 42, 12);
  drawStatIcon(ctx, icon, x + 41, y + 41, color);

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(11, 800);
  ctx.fillText(label, x + 77, y + 35);

  ctx.fillStyle = COLORS.text;
  const valueSize = fitFontSize(ctx, value, width - 102, 31, 22, 800);
  ctx.font = font(valueSize, 800);
  ctx.fillText(truncateText(ctx, value, width - 102), x + 77, y + 65);

  ctx.fillStyle = COLORS.faint;
  ctx.font = font(12, 500);
  ctx.fillText(detail, x + 21, y + 112);

  ctx.fillStyle = color;
  fillRoundedRect(ctx, x + 20, y + height - 9, 56, 3, 2);
}

function drawStatIcon(ctx, icon, cx, cy, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (icon === "message") {
    roundedRectPath(ctx, cx - 10, cy - 8, 20, 15, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy + 7);
    ctx.lineTo(cx - 7, cy + 11);
    ctx.lineTo(cx + 2, cy + 7);
    ctx.stroke();
  } else if (icon === "voice") {
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 9, Math.PI, 0);
    ctx.stroke();
    ctx.fillRect(cx - 11, cy, 4, 10);
    ctx.fillRect(cx + 7, cy, 4, 10);
  } else {
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 4, 4, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 5, cy + 9, 8, Math.PI, 0);
    ctx.arc(cx + 7, cy + 9, 6, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFooter(ctx, { userId, guildName }) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.fillRect(52, 578, 1016, 1);

  ctx.fillStyle = COLORS.faint;
  ctx.font = font(11, 700);
  ctx.fillText(`KULLANICI ID  •  ${userId || "Bilinmiyor"}`, 52, 602);

  ctx.save();
  ctx.textAlign = "right";
  ctx.fillText(truncateText(ctx, String(guildName || "Discord"), 330), 1068, 602);
  ctx.restore();
}

function drawPill(ctx, x, y, label, { background, border, color, dotColor }) {
  ctx.font = font(11, 800);
  const width = Math.ceil(ctx.measureText(label).width) + (dotColor ? 39 : 24);
  ctx.fillStyle = background;
  fillRoundedRect(ctx, x, y, width, 32, 16);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, 31, 16);

  if (dotColor) {
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + (dotColor ? 28 : 12), y + 16.5);
  ctx.textBaseline = "alphabetic";
  return width;
}

function drawSmallBadge(ctx, x, y, label, color) {
  ctx.font = font(10, 800);
  const width = Math.ceil(ctx.measureText(label).width) + 16;
  ctx.fillStyle = colorWithAlpha(color, 0.2);
  fillRoundedRect(ctx, x, y, width, 24, 7);
  ctx.strokeStyle = colorWithAlpha(color, 0.5);
  strokeRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, 23, 7);
  ctx.fillStyle = mixHex(color, "#FFFFFF", 0.6);
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 8, y + 12.5);
  ctx.textBaseline = "alphabetic";
}

function drawCardBorder(ctx) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  strokeRoundedRect(ctx, CARD.x + 0.5, CARD.y + 0.5, CARD.width - 1, CARD.height - 1, CARD.radius);
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

function drawContainImage(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2,
    drawnWidth, drawnHeight);
}

function drawGlow(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
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
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, safeRadius);
    return;
  }
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

function fitFontSize(ctx, text, maxWidth, preferredSize, minimumSize, weight = 700) {
  let size = preferredSize;
  while (size > minimumSize) {
    ctx.font = font(size, weight);
    if (ctx.measureText(String(text)).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function truncateText(ctx, text, maxWidth) {
  const source = String(text ?? "—");
  if (ctx.measureText(source).width <= maxWidth) return source;
  let output = source;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function formatDate(date) {
  if (!date) return "Bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatDayCount(days) {
  if (days === null) return "Üyelik bilgisi yok";
  return `${formatNumber(days)} gün`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor(total / 3_600) % 24;
  const minutes = Math.floor(total / 60) % 60;

  if (days > 0) return `${formatNumber(days)} gün ${hours} sa`;
  if (hours > 0) return `${formatNumber(hours)} sa ${minutes} dk`;
  if (minutes > 0) return `${formatNumber(minutes)} dk`;
  return `${total} sn`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Math.max(0, Number(value) || 0));
}

function daysSince(date) {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveAccent(user, member) {
  const memberColor = member?.displayColor;
  if (Number.isInteger(memberColor) && memberColor > 0) return intToHex(memberColor);
  if (Number.isInteger(user.accentColor) && user.accentColor > 0) return intToHex(user.accentColor);
  if (typeof user.hexAccentColor === "string" && user.hexAccentColor !== "#000000") {
    return normalizeHex(user.hexAccentColor);
  }

  const palette = ["#6C7CFF", "#A66CFF", "#F06D9D", "#FF8A5B", "#21B8A6", "#258DFF"];
  return palette[hashString(user.id || user.username || "discord") % palette.length];
}

function intToHex(value) {
  return `#${Number(value).toString(16).padStart(6, "0").slice(-6).toUpperCase()}`;
}

function normalizeHex(value) {
  const cleaned = String(value).replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(cleaned) ? `#${cleaned.toUpperCase()}` : "#6C7CFF";
}

function colorWithAlpha(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHex(first, second, amount) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const ratio = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    Math.round(a[0] + (b[0] - a[0]) * ratio),
    Math.round(a[1] + (b[1] - a[1]) * ratio),
    Math.round(a[2] + (b[2] - a[2]) * ratio)
  );
}

function shadeHex(hex, amount) {
  return mixHex(hex, amount < 0 ? "#000000" : "#FFFFFF", Math.abs(amount));
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex).slice(1);
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hashString(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return Math.abs(hash);
}

function getInitial(label) {
  return Array.from(String(label || "?").trim())[0]?.toUpperCase() || "?";
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

async function loadImageSafe(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}
