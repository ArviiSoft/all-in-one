const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

const CANVAFY_ROOT = path.dirname(require.resolve("canvafy/package.json"));
GlobalFonts.registerFromPath(
  path.join(CANVAFY_ROOT, "assets/fonts/Manrope/Manrope-Regular.ttf"),
  "Manrope"
);
GlobalFonts.registerFromPath(
  path.join(CANVAFY_ROOT, "assets/fonts/Manrope/Manrope-Bold.ttf"),
  "Manrope"
);

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 400;
const BACKGROUND_PATH = path.join(
  __dirname,
  "../../assets/Giriş-Çıkış/dm-welcome-background-v2.png"
);

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
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

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
}

function fitText(ctx, text, maxWidth, options = {}) {
  const {
    weight = 700,
    startSize = 56,
    minSize = 30,
    family = "Manrope"
  } = options;

  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }

  ctx.font = `${weight} ${minSize}px ${family}`;
  return minSize;
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = "…";
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}${ellipsis}`).width > maxWidth) {
    value = value.slice(0, -1);
  }

  return `${value.trimEnd()}${ellipsis}`;
}

function drawPill(ctx, x, y, text, options = {}) {
  const {
    height = 42,
    paddingX = 18,
    fill = "rgba(255, 255, 255, 0.12)",
    stroke = "rgba(255, 255, 255, 0.22)",
    color = "#fff8f2",
    font = "600 16px Manrope"
  } = options;

  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width + paddingX * 2);

  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2 + 1);

  return width;
}

function drawSparkle(ctx, x, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x + size * 0.22, y - size * 0.22, x + size, y);
  ctx.quadraticCurveTo(x + size * 0.22, y + size * 0.22, x, y + size);
  ctx.quadraticCurveTo(x - size * 0.22, y + size * 0.22, x - size, y);
  ctx.quadraticCurveTo(x - size * 0.22, y - size * 0.22, x, y - size);
  ctx.fill();
  ctx.restore();
}

function formatJoinDate(date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

async function drawAvatar(ctx, member) {
  const centerX = 178;
  const centerY = 200;

  ctx.save();
  ctx.shadowBlur = 34;
  ctx.shadowColor = "rgba(255, 183, 154, 0.62)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 92, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 224, 202, 0.22)";
  ctx.fill();
  ctx.restore();

  const ring = ctx.createLinearGradient(95, 115, 255, 285);
  ring.addColorStop(0, "#fff6e9");
  ring.addColorStop(0.5, "#ffc7b3");
  ring.addColorStop(1, "#d9b5ff");

  ctx.beginPath();
  ctx.arc(centerX, centerY, 86, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, centerY, 80, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(48, 19, 59, 0.9)";
  ctx.fill();

  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
    const avatar = await loadImage(avatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 76, 0, Math.PI * 2);
    ctx.clip();
    drawImageCover(ctx, avatar, centerX - 76, centerY - 76, 152, 152);
    ctx.restore();
  } catch (error) {
    const fallback = ctx.createLinearGradient(112, 128, 242, 272);
    fallback.addColorStop(0, "#ff9e8f");
    fallback.addColorStop(1, "#8e5cc7");

    ctx.beginPath();
    ctx.arc(centerX, centerY, 76, 0, Math.PI * 2);
    ctx.fillStyle = fallback;
    ctx.fill();

    ctx.fillStyle = "#fff8f2";
    ctx.font = "700 66px Manrope";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(member.user.username.slice(0, 1).toLocaleUpperCase("tr-TR"), centerX, centerY + 3);
  }

  ctx.beginPath();
  ctx.arc(244, 260, 17, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8f2";
  ctx.fill();
  drawSparkle(ctx, 244, 260, 9, "#e56d81");
}

async function createDmWelcomeCard(member, now = new Date()) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  const background = await loadImage(BACKGROUND_PATH);

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 32);
  ctx.clip();
  drawImageCover(ctx, background, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  const atmosphere = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  atmosphere.addColorStop(0, "rgba(64, 20, 74, 0.12)");
  atmosphere.addColorStop(0.42, "rgba(59, 18, 68, 0.22)");
  atmosphere.addColorStop(1, "rgba(36, 10, 53, 0.42)");
  ctx.fillStyle = atmosphere;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = "rgba(47, 13, 55, 0.2)";
  roundedRect(ctx, 286, 38, 674, 324, 28);
  ctx.fillStyle = "rgba(47, 18, 59, 0.52)";
  ctx.fill();
  ctx.restore();

  roundedRect(ctx, 286, 38, 674, 324, 28);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  await drawAvatar(ctx, member);

  const contentX = 332;
  const maxTextWidth = 580;

  drawPill(ctx, contentX, 67, "YENİ BİR MERHABA", {
    height: 36,
    paddingX: 16,
    fill: "rgba(255, 238, 225, 0.14)",
    stroke: "rgba(255, 238, 225, 0.24)",
    color: "#ffe8d8",
    font: "700 14px Manrope"
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fffaf6";
  ctx.font = "600 34px Manrope";
  ctx.fillText("Aramıza hoş geldin,", contentX, 153);

  const username = member.user.username;
  const usernameSize = fitText(ctx, username, maxTextWidth, {
    weight: 800,
    startSize: 58,
    minSize: 34
  });
  ctx.font = `800 ${usernameSize}px Manrope`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(ellipsize(ctx, username, maxTextWidth), contentX, 215);

  const guildName = member.guild.name || "topluluğumuz";
  ctx.font = "500 19px Manrope";
  ctx.fillStyle = "rgba(255, 245, 238, 0.84)";
  const communityLine = ellipsize(
    ctx,
    `${guildName} topluluğunda seni görmek çok güzel.`,
    maxTextWidth
  );
  ctx.fillText(communityLine, contentX, 257);

  const memberCount = Number(member.guild.memberCount || 0).toLocaleString("tr-TR");
  const memberPillWidth = drawPill(ctx, contentX, 291, `${memberCount}. üyemiz oldun`, {
    fill: "rgba(255, 196, 169, 0.2)",
    stroke: "rgba(255, 222, 202, 0.32)",
    color: "#fff1e7"
  });

  drawPill(ctx, contentX + memberPillWidth + 12, 291, formatJoinDate(now), {
    fill: "rgba(218, 189, 255, 0.14)",
    stroke: "rgba(229, 211, 255, 0.25)",
    color: "#f4eaff"
  });

  drawSparkle(ctx, 908, 83, 9, "#ffe3c7", 0.85);
  drawSparkle(ctx, 928, 104, 4, "#f4d9ff", 0.72);

  roundedRect(ctx, 1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, 31);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

module.exports = {
  createDmWelcomeCard,
  formatJoinDate
};
