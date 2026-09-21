const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const emojiler = require('../../Utils/Emojis/emojiler.js');

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 560;

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

function fitText(ctx, text, maxWidth, startSize, minSize, fontFamily, weight = 'normal') {
  let size = startSize;

  do {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size >= minSize);
}

function createSeededRandom(seedText) {
  let seed = 0;

  for (const character of seedText) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  }

  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function drawBackground(ctx, userId) {
  const background = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  background.addColorStop(0, '#050607');
  background.addColorStop(0.48, '#111315');
  background.addColorStop(1, '#060607');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const glow = ctx.createRadialGradient(220, 250, 10, 220, 250, 430);
  glow.addColorStop(0, 'rgba(91, 94, 91, 0.3)');
  glow.addColorStop(0.45, 'rgba(35, 37, 37, 0.18)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const random = createSeededRandom(userId);
  for (let i = 0; i < 85; i += 1) {
    const x = random() * CANVAS_WIDTH;
    const y = random() * CANVAS_HEIGHT;
    const radius = 0.4 + random() * 1.3;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 218, 211, ${0.025 + random() * 0.09})`;
    ctx.fill();
  }

  const vignette = ctx.createRadialGradient(500, 275, 170, 500, 275, 640);
  vignette.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawFuneralBackdrop(ctx) {
  const leftDrape = ctx.createLinearGradient(0, 0, 300, 190);
  leftDrape.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
  leftDrape.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftDrape;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(330, 0);
  ctx.bezierCurveTo(270, 42, 155, 112, 0, 205);
  ctx.closePath();
  ctx.fill();

  const rightDrape = ctx.createLinearGradient(CANVAS_WIDTH, 0, 740, 180);
  rightDrape.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  rightDrape.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rightDrape;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH, 0);
  ctx.lineTo(720, 0);
  ctx.bezierCurveTo(785, 45, 880, 108, CANVAS_WIDTH, 185);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.moveTo(0, 510);
  ctx.bezierCurveTo(150, 486, 315, 506, 470, 492);
  ctx.bezierCurveTo(655, 475, 810, 505, CANVAS_WIDTH, 486);
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.lineTo(0, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  const graveStones = [
    [55, 455, 34, 62],
    [398, 467, 27, 48],
    [910, 458, 32, 58]
  ];

  for (const [x, y, width, height] of graveStones) {
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x, y + 14);
    ctx.quadraticCurveTo(x + width / 2, y - 8, x + width, y + 14);
    ctx.lineTo(x + width, y + height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFrame(ctx) {
  roundedRect(ctx, 18, 18, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 36, 26);
  ctx.strokeStyle = 'rgba(184, 169, 139, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(ctx, 27, 27, CANVAS_WIDTH - 54, CANVAS_HEIGHT - 54, 20);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(184, 169, 139, 0.48)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(470, 95);
  ctx.lineTo(865, 95);
  ctx.stroke();

  ctx.fillStyle = '#b8a98b';
  ctx.beginPath();
  ctx.moveTo(875, 90);
  ctx.lineTo(880, 95);
  ctx.lineTo(875, 100);
  ctx.lineTo(870, 95);
  ctx.closePath();
  ctx.fill();
}

function drawPortrait(ctx, avatar) {
  const centerX = 250;
  const centerY = 280;
  const radius = 164;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 35;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 12, 0, Math.PI * 2);
  ctx.fillStyle = '#050607';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(190, 181, 161, 0.76)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 5, 0, Math.PI * 2);
  ctx.clip();

  const avatarRatio = avatar.width / avatar.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = avatar.width;
  let sourceHeight = avatar.height;

  if (avatarRatio > 1) {
    sourceWidth = avatar.height;
    sourceX = (avatar.width - sourceWidth) / 2;
  } else if (avatarRatio < 1) {
    sourceHeight = avatar.width;
    sourceY = (avatar.height - sourceHeight) / 2;
  }

  const portraitCanvas = createCanvas(radius * 2, radius * 2);
  const portraitContext = portraitCanvas.getContext('2d');

  portraitContext.drawImage(
    avatar,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    radius * 2,
    radius * 2
  );

  const portraitPixels = portraitContext.getImageData(0, 0, radius * 2, radius * 2);
  for (let i = 0; i < portraitPixels.data.length; i += 4) {
    const red = portraitPixels.data[i];
    const green = portraitPixels.data[i + 1];
    const blue = portraitPixels.data[i + 2];
    const grayscale = red * 0.299 + green * 0.587 + blue * 0.114;

    portraitPixels.data[i] = grayscale * 0.93;
    portraitPixels.data[i + 1] = grayscale * 0.94;
    portraitPixels.data[i + 2] = grayscale * 0.92;
  }

  portraitContext.putImageData(portraitPixels, 0, 0);
  ctx.drawImage(portraitCanvas, centerX - radius, centerY - radius);

  const portraitShade = ctx.createLinearGradient(centerX, centerY - radius, centerX, centerY + radius);
  portraitShade.addColorStop(0, 'rgba(7, 12, 12, 0.12)');
  portraitShade.addColorStop(0.62, 'rgba(4, 7, 8, 0.2)');
  portraitShade.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
  ctx.fillStyle = portraitShade;
  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawFlower(ctx, x, y, scale, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  for (let i = 0; i < 5; i += 1) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -9 * scale, 4.5 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(225, 224, 218, 0.82)';
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 3.2 * scale, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(159, 148, 121, 0.92)';
  ctx.fill();
  ctx.restore();
}

function drawMourningFlowers(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(112, 121, 108, 0.62)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 442);
  ctx.bezierCurveTo(105, 415, 128, 383, 145, 342);
  ctx.stroke();

  for (const [x, y, rotation] of [[91, 422, -0.7], [111, 398, 0.6], [130, 367, -0.4]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(91, 105, 91, 0.72)';
    ctx.fill();
    ctx.restore();
  }

  drawFlower(ctx, 82, 438, 0.82, -0.35);
  drawFlower(ctx, 116, 406, 0.67, 0.25);
  drawFlower(ctx, 142, 356, 0.5, -0.15);

  ctx.strokeStyle = 'rgba(112, 121, 108, 0.55)';
  ctx.beginPath();
  ctx.moveTo(371, 118);
  ctx.bezierCurveTo(389, 141, 399, 169, 403, 196);
  ctx.stroke();
  drawFlower(ctx, 374, 122, 0.62, 0.4);
  drawFlower(ctx, 397, 171, 0.45, -0.2);
  ctx.restore();
}

function drawCandle(ctx, x, y) {
  const candleGlow = ctx.createRadialGradient(x, y - 12, 1, x, y - 12, 27);
  candleGlow.addColorStop(0, 'rgba(223, 194, 130, 0.2)');
  candleGlow.addColorStop(1, 'rgba(223, 194, 130, 0)');
  ctx.fillStyle = candleGlow;
  ctx.fillRect(x - 28, y - 40, 56, 56);

  ctx.fillStyle = 'rgba(211, 207, 195, 0.78)';
  roundedRect(ctx, x - 5, y, 10, 20, 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y - 1);
  ctx.bezierCurveTo(x - 8, y - 9, x - 2, y - 20, x, y - 24);
  ctx.bezierCurveTo(x + 4, y - 17, x + 7, y - 9, x, y - 1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(201, 165, 94, 0.9)';
  ctx.fill();
}

function drawTypography(ctx, displayName) {
  const contentCenter = 715;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b8a98b';
  ctx.font = '600 19px Arial';
  ctx.fillText('A N I S I N A', contentCenter, 76);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#e8e6df';
  ctx.font = 'bold 116px Georgia';
  ctx.fillText('R.I.P', contentCenter, 190);
  ctx.restore();

  ctx.strokeStyle = 'rgba(184, 169, 139, 0.44)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(565, 270);
  ctx.lineTo(865, 270);
  ctx.stroke();

  fitText(ctx, displayName, 430, 48, 26, 'Arial', 'bold');
  ctx.fillStyle = '#ffffff';
  ctx.fillText(displayName, contentCenter, 325);

  ctx.fillStyle = 'rgba(228, 224, 214, 0.68)';
  ctx.font = '20px Georgia';
  ctx.fillText('Huzur içinde uyu', contentCenter, 375);

  drawCandle(ctx, contentCenter, 421);

  ctx.fillStyle = 'rgba(228, 224, 214, 0.38)';
  ctx.font = '14px Arial';
  ctx.fillText('SONSUZLUĞA UĞURLANDI', contentCenter, 476);
}

function createRipImage(avatar, target) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  const displayName = target.globalName || target.username;

  drawBackground(ctx, target.id);
  drawFuneralBackdrop(ctx);
  drawFrame(ctx);
  drawPortrait(ctx, avatar);
  drawMourningFlowers(ctx);
  drawTypography(ctx, displayName);

  return canvas.toBuffer('image/png');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rip')
    .setDescription('R.I.P efekti uygular.')
    .addUserOption(option =>
      option.setName('kişi')
        .setDescription('Kişi seç.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const hedef = interaction.options.getUser('kişi') || interaction.user;
    const avatarURL = hedef.displayAvatarURL({ extension: 'png', size: 512 });

    try {
      const response = await fetch(avatarURL);

      if (!response.ok) {
        throw new Error(`Avatar indirilemedi: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const avatar = await loadImage(buffer);
      const ripImage = createRipImage(avatar, hedef);
      const attachment = new AttachmentBuilder(ripImage, { name: 'rip.png' });

      await interaction.reply({
        content: `🪦 ${hedef.id === interaction.user.id ? 'Kendi anısına...' : `<@${hedef.id}> anısına...`}`,
        files: [attachment]
      });
    } catch (err) {
      console.error('🔴 [R.I.P] Efekt oluşturulurken hata oluştu:', err);

      const errorMessage = {
        content: `${emojiler.uyari} **Hata oluştu, tekrar dene.**`
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  },

  createRipImage
};
