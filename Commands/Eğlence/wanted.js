const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const CANVAFY_PATH = path.dirname(require.resolve('canvafy'));
GlobalFonts.registerFromPath(
  path.join(CANVAFY_PATH, 'assets/fonts/Poppins/Poppins-Bold.ttf'),
  'Wanted Sans'
);
GlobalFonts.registerFromPath(
  path.join(CANVAFY_PATH, 'assets/fonts/Others/AbyssinicaSIL-Regular.ttf'),
  'Wanted Serif'
);

const POSTER_PATH = path.join(__dirname, '../../assets/Eğlence/wanted-v2.png');
const INK_COLOR = '#2b1b17';
const PHOTO_FRAME = { x: 190, y: 388, width: 742, height: 594, radius: 18 };

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawImageCover(ctx, image, frame) {
  const imageRatio = image.width / image.height;
  const frameRatio = frame.width / frame.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > frameRatio) {
    sourceWidth = image.height * frameRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / frameRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    frame.x,
    frame.y,
    frame.width,
    frame.height
  );
}

function fitFontSize(ctx, text, maxWidth, startSize, fontFamily) {
  let size = startSize;

  do {
    ctx.font = `${size}px "${fontFamily}"`;
    size -= 2;
  } while (size > 22 && ctx.measureText(text).width > maxWidth);

  return size + 2;
}

function drawCenteredText(ctx, text, y, maxWidth, startSize, fontFamily) {
  const size = fitFontSize(ctx, text, maxWidth, startSize, fontFamily);
  ctx.font = `${size}px "${fontFamily}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 561, y);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wanted')
    .setDescription('Bir kişinin "Wanted" posterini yapar.')
    .addUserOption(option =>
      option.setName('kişi')
        .setDescription('İsteğe bağlı: Kişi seç.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('kişi') || interaction.user;

    try {

      await interaction.deferReply();

      const avatarURL = user.displayAvatarURL({ extension: 'png', size: 512 });
      const avatar = await loadImage(avatarURL);

      const poster = await loadImage(POSTER_PATH);
      const canvas = createCanvas(poster.width, poster.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(poster, 0, 0);

      ctx.save();
      roundedRect(
        ctx,
        PHOTO_FRAME.x,
        PHOTO_FRAME.y,
        PHOTO_FRAME.width,
        PHOTO_FRAME.height,
        PHOTO_FRAME.radius
      );
      ctx.clip();
      ctx.filter = 'grayscale(35%) sepia(60%) contrast(110%)';
      drawImageCover(ctx, avatar, PHOTO_FRAME);
      ctx.filter = 'none';

      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(126, 76, 35, 0.20)';
      ctx.fillRect(PHOTO_FRAME.x, PHOTO_FRAME.y, PHOTO_FRAME.width, PHOTO_FRAME.height);

      const vignette = ctx.createRadialGradient(561, 680, 170, 561, 680, 480);
      vignette.addColorStop(0, 'rgba(43, 27, 23, 0)');
      vignette.addColorStop(0.72, 'rgba(43, 27, 23, 0.05)');
      vignette.addColorStop(1, 'rgba(43, 27, 23, 0.38)');
      ctx.fillStyle = vignette;
      ctx.fillRect(PHOTO_FRAME.x, PHOTO_FRAME.y, PHOTO_FRAME.width, PHOTO_FRAME.height);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(43, 27, 23, 0.82)';
      ctx.lineWidth = 5;
      roundedRect(
        ctx,
        PHOTO_FRAME.x,
        PHOTO_FRAME.y,
        PHOTO_FRAME.width,
        PHOTO_FRAME.height,
        PHOTO_FRAME.radius
      );
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = INK_COLOR;
      ctx.shadowColor = 'rgba(43, 27, 23, 0.18)';
      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 1;
      drawCenteredText(ctx, 'A R A N I Y O R', 145, 850, 145, 'Wanted Sans');

      ctx.shadowColor = 'transparent';
      drawCenteredText(ctx, 'ÖLÜ YADA DİRİ', 248, 720, 51, 'Wanted Serif');

      const displayName = (user.globalName || user.username).toLocaleUpperCase('tr-TR');
      drawCenteredText(ctx, displayName, 1155, 790, 62, 'Wanted Sans');

      ctx.fillStyle = '#6f311f';
      drawCenteredText(ctx, '$1,000,000 ÖDÜL', 1238, 800, 71, 'Wanted Serif');

      ctx.fillStyle = INK_COLOR;
      drawCenteredText(ctx, 'YAKALAYANA NAKİT ÖDÜL', 1296, 720, 31, 'Wanted Sans');

      const buffer = canvas.toBuffer('image/png');

      await interaction.editReply({
        content: `🤠 ${user.id === interaction.user.id ? 'Aranıyorsun!' : `<@${user.id}> arananlar listesinde!`}`,
        files: [{ attachment: buffer, name: 'wanted.png' }]
      });

    } catch (err) {
      console.error('🔴 [WANTED] Wanted posteri hatası:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `${emojiler.uyari} **Wanted posteri oluşturulamadı.**`
        });
      } else {
        await interaction.reply({
          content: `${emojiler.uyari} **Wanted posteri oluşturulamadı.**`,
        });
      }
    }
  }
};  