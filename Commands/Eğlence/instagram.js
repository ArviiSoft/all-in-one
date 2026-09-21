const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { v4: uuidv4 } = require('uuid');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/instagram.json');
const CANVAS_WIDTH = 1080;
const HEADER_HEIGHT = 116;
const ACTIONS_HEIGHT = 96;
const SIDE_PADDING = 32;
const INSTAGRAM_COLORS = {
  background: '#000000',
  primaryText: '#f5f5f5',
  secondaryText: '#a8a8a8',
  border: '#262626',
};
const INSTAGRAM_ICON_ASSETS = {
  like: {
    path: path.join(__dirname, '../../assets/Eğlence/like.png'),
    crop: { x: 45, y: 71, width: 410, height: 358 },
  },
  comment: {
    path: path.join(__dirname, '../../assets/Eğlence/comment.png'),
    crop: { x: 32, y: 48, width: 448, height: 416 },
  },
  share: {
    path: path.join(__dirname, '../../assets/Eğlence/share.png'),
    crop: { x: 10, y: 10, width: 214, height: 182 },
  },
  save: {
    path: path.join(__dirname, '../../assets/Eğlence/save.png'),
    crop: { x: 111, y: 88, width: 251, height: 298 },
  },
};
const INSTAGRAM_FONT = GlobalFonts.families.some(item => item.family === 'Noto Sans')
  ? '"Noto Sans"'
  : 'Arial';

function font(size, weight = 400) {
  return `${weight} ${size}px ${INSTAGRAM_FONT}`;
}

function veriOku() {
  if (!fs.existsSync(veriYolu)) return {};
  try {
    return JSON.parse(fs.readFileSync(veriYolu, 'utf8'));
  } catch {
    return {};
  }
}

function veriYaz(data) {
  fs.writeFileSync(veriYolu, JSON.stringify(data, null, 2));
}

function normalizeInstagramUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || hostname !== 'instagram.com') return null;
    url.hostname = 'www.instagram.com';
    return url.toString();
  } catch {
    return null;
  }
}

async function drawInstagramPost(user, imageUrl, caption) {
  const avatarUrl = user.displayAvatarURL({
    forceStatic: true,
    extension: 'png',
    size: 256,
  });
  const [avatar, postImage, likeIcon, commentIcon, shareIcon, saveIcon] = await Promise.all([
    loadImage(avatarUrl),
    loadImage(imageUrl),
    loadImage(INSTAGRAM_ICON_ASSETS.like.path),
    loadImage(INSTAGRAM_ICON_ASSETS.comment.path),
    loadImage(INSTAGRAM_ICON_ASSETS.share.path),
    loadImage(INSTAGRAM_ICON_ASSETS.save.path),
  ]);

  const sourceAspect = postImage.width / postImage.height;
  const mediaAspect = Math.max(0.8, Math.min(1.91, sourceAspect || 1));
  const mediaHeight = Math.round(CANVAS_WIDTH / mediaAspect);
  const username = String(user.username || 'kullanici');
  const contentWidth = CANVAS_WIDTH - SIDE_PADDING * 2;

  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = font(28);
  const safeUsername = ellipsizeText(measureCtx, username, contentWidth * 0.55);
  const captionLines = wrapText(measureCtx, `${safeUsername} ${String(caption || '')}`, contentWidth);
  const captionLineHeight = 40;
  const actionsTop = HEADER_HEIGHT + mediaHeight;
  const captionBaseline = actionsTop + ACTIONS_HEIGHT + 36;
  const timestampBaseline = captionBaseline + (captionLines.length - 1) * captionLineHeight + 50;
  const canvasHeight = timestampBaseline + 36;

  const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = INSTAGRAM_COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawAvatar(ctx, avatar, SIDE_PADDING, 25, 66);

  ctx.font = font(28, 700);
  ctx.fillStyle = INSTAGRAM_COLORS.primaryText;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ellipsizeText(ctx, username, 780), 120, 69);
  drawMoreIcon(ctx, CANVAS_WIDTH - 51, 58);

  drawImageCover(ctx, postImage, 0, HEADER_HEIGHT, CANVAS_WIDTH, mediaHeight);

  ctx.beginPath();
  ctx.moveTo(0, HEADER_HEIGHT - 1);
  ctx.lineTo(CANVAS_WIDTH, HEADER_HEIGHT - 1);
  ctx.moveTo(0, actionsTop + 1);
  ctx.lineTo(CANVAS_WIDTH, actionsTop + 1);
  ctx.strokeStyle = INSTAGRAM_COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  const iconY = actionsTop + ACTIONS_HEIGHT / 2;
  drawAssetIcon(ctx, likeIcon, INSTAGRAM_ICON_ASSETS.like.crop, 51, iconY, 45, 43);
  drawAssetIcon(ctx, commentIcon, INSTAGRAM_ICON_ASSETS.comment.crop, 121, iconY, 45, 45);
  drawAssetIcon(ctx, shareIcon, INSTAGRAM_ICON_ASSETS.share.crop, 191, iconY, 47, 45);
  drawAssetIcon(ctx, saveIcon, INSTAGRAM_ICON_ASSETS.save.crop, CANVAS_WIDTH - 51, iconY, 42, 44);

  ctx.font = font(28);
  ctx.fillStyle = INSTAGRAM_COLORS.primaryText;
  captionLines.forEach((line, index) => {
    const y = captionBaseline + index * captionLineHeight;
    if (index !== 0) {
      ctx.fillText(line, SIDE_PADDING, y);
      return;
    }

    ctx.font = font(28, 700);
    ctx.fillText(safeUsername, SIDE_PADDING, y);
    const usernameWidth = ctx.measureText(safeUsername).width;
    ctx.font = font(28);
    ctx.fillText(line.slice(safeUsername.length), SIDE_PADDING + usernameWidth, y);
  });

  ctx.font = font(20, 500);
  ctx.fillStyle = INSTAGRAM_COLORS.secondaryText;
  ctx.fillText('ŞİMDİ', SIDE_PADDING, timestampBaseline);

  return canvas.toBuffer('image/png');
}

function drawAvatar(ctx, image, x, y, size) {
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, x, y, size, size);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = INSTAGRAM_COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceAspect = image.width / image.height;
  const targetAspect = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (sourceAspect > targetAspect) {
    sourceWidth = image.height * targetAspect;
    sourceX = (image.width - sourceWidth) / 2;
  } else if (sourceAspect < targetAspect) {
    sourceHeight = image.width / targetAspect;
    sourceY = (image.height - sourceHeight) / 2;
  }

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

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text).replace(/\r/g, '').split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }

      const pieces = splitLongWord(ctx, word, maxWidth);
      lines.push(...pieces.slice(0, -1));
      line = pieces.at(-1) || '';
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [''];
}

function splitLongWord(ctx, word, maxWidth) {
  const graphemes = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('tr', { granularity: 'grapheme' }).segment(word)].map(item => item.segment)
    : [...word];
  const pieces = [];
  let piece = '';

  for (const grapheme of graphemes) {
    const candidate = piece + grapheme;
    if (piece && ctx.measureText(candidate).width > maxWidth) {
      pieces.push(piece);
      piece = grapheme;
    } else {
      piece = candidate;
    }
  }

  if (piece) pieces.push(piece);
  return pieces;
}

function ellipsizeText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = '…';
  const graphemes = [...text];
  while (graphemes.length && ctx.measureText(`${graphemes.join('')}${ellipsis}`).width > maxWidth) {
    graphemes.pop();
  }
  return `${graphemes.join('')}${ellipsis}`;
}

function drawMoreIcon(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = INSTAGRAM_COLORS.primaryText;
  for (const offset of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.arc(x + offset, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAssetIcon(ctx, image, crop, centerX, centerY, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / crop.width, maxHeight / crop.height);
  const width = crop.width * scale;
  const height = crop.height * scale;

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    centerX - width / 2,
    centerY - height / 2,
    width,
    height
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('instagram')
    .setDescription('Sahte Instagram postu oluşturur.')
    .addAttachmentOption(option =>
      option.setName('resim')
        .setDescription('Görsel yükle.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('açıklama')
        .setDescription('Açıklama gir.')
        .setMaxLength(2200)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('instagram-hesap-url')
        .setDescription('Instagram profilinin linkini gir.')
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = interaction.user;
    const resim = interaction.options.getAttachment('resim');
    const caption = interaction.options.getString('açıklama');
    const rawInstagramUrl = interaction.options.getString('instagram-hesap-url');
    const instagramUrl = normalizeInstagramUrl(rawInstagramUrl);
    const imageUrl = resim?.url;

    try {
      new URL(imageUrl);
    } catch {
      return interaction.editReply({ content: `${emojiler.uyari} **Geçerli bir resim yükle.**` });
    }

    if (rawInstagramUrl && !instagramUrl) {
      return interaction.editReply({
        content: `${emojiler.uyari} **Geçerli bir Instagram profil linki gir.**`
      });
    }

    let buffer;
    try {
      buffer = await drawInstagramPost(user, imageUrl, caption);
    } catch (error) {
      console.error('🔴 [INSTAGRAM] Görsel oluşturulamadı:', error);
      return interaction.editReply({
        content: `${emojiler.uyari} **Instagram görseli oluşturulurken bir hata oluştu.**`
      });
    }

    const instagramId = uuidv4();
    const data = veriOku();
    data[instagramId] = {
      likes: 0,
      comments: 0,
      yorumlar: [],
      users: {},
      username: user.username,
      globalName: user.globalName || user.username,
      avatarURL: user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 }),
      caption,
      instagramUrl,
      createdAt: new Date().toISOString(),
    };
    veriYaz(data);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`instagramlike_${instagramId}`)
        .setLabel('❤️ Beğeni: 0')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`instagramcomment_${instagramId}`)
        .setLabel('💬 Yorum: 0')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`instagramshowcomments_${instagramId}`)
        .setLabel('Yorumları Göster')
        .setStyle(ButtonStyle.Primary)
    );

    const components = [buttons];

    if (instagramUrl) {
      const linkButton = new ButtonBuilder()
        .setLabel('Instagram Profili')
        .setStyle(ButtonStyle.Link)
        .setEmoji(emojiler.instagram2)
        .setURL(instagramUrl);

      components.push(new ActionRowBuilder().addComponents(linkButton));
    }

    await interaction.editReply({
      files: [{ attachment: buffer, name: 'instagram.png' }],
      components
    });
  },
};