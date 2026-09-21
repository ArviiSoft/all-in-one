const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');

const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/twitter.json');
const X_RENKLER = {
  arkaPlan: '#000000',
  anaMetin: '#e7e9ea',
  ikincilMetin: '#71767b',
  kenarlik: '#2f3336',
  mavi: '#1d9bf0'
};
const X_FONT = GlobalFonts.families.some(font => font.family === 'Noto Sans')
  ? '"Noto Sans"'
  : 'Arial';

function font(size, weight = 400) {
  return `${weight} ${size}px ${X_FONT}`;
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

function urldenBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot)'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return urldenBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('twitter')
    .setDescription('Sahte bir Tweet oluşturur.')
    .addStringOption(option =>
      option.setName('tweet-metni')
        .setDescription('Tweet metni gir.')
        .setMaxLength(280)
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const metin = interaction.options.getString('tweet-metni');
    const user = interaction.user;
    const avatarURL = user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 128 });

    let avatarBuffer;
    try {
      avatarBuffer = await urldenBuffer(avatarURL);
    } catch (err) {
      console.error('🔴 [TWITTER] Avatar indirilemedi:', avatarURL, err);
      return interaction.editReply({ content: '❌ Avatar yüklenirken bir hata oluştu. Lütfen tekrar dene.' });
    }

    const tweetId = `tweet_${uuidv4()}`;
    const data = veriOku();

    const tweetData = {
      text: metin,
      likes: 0,
      retweets: 0,
      comments: 0,
      yorumlar: [],
      username: user.username,
      globalName: user.globalName || user.username,
      avatarURL: avatarURL,
      createdAt: new Date().toISOString()
    };

    data[tweetId] = tweetData;
    veriYaz(data);

    let imageBuffer;
    try {
      imageBuffer = await createTweetImage(tweetData, avatarBuffer);
    } catch (err) {
      console.error('🔴 [TWITTER] Resim oluşturulamadı:', err);
      return interaction.editReply({ content: '❌ Tweet görseli oluşturulurken bir hata oluştu.' });
    }

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'tweet.png' });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`like_${tweetId}`).setLabel(`❤️ Beğeni: 0`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`retweet_${tweetId}`).setLabel(`🔁 Retweet: 0`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`comment_${tweetId}`).setLabel(`💬 Yorum: 0`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`showcomments_${tweetId}`).setLabel('Yorumları Göster').setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({ files: [attachment], components: [buttons] });
  }
};

async function createTweetImage(data, avatarBuffer) {
  const text = String(data.text || '');
  const username = String(data.username || 'kullanici');
  const globalName = String(data.globalName || username);
  const canvasWidth = 1200;
  const horizontalPadding = 48;
  const bodyTop = 174;
  const lineHeight = 52;

  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = font(40);
  const lines = wrapText(measureCtx, text, canvasWidth - horizontalPadding * 2);
  const bodyHeight = Math.max(1, lines.length) * lineHeight;
  const dateBaseline = bodyTop + bodyHeight + 48;
  const dividerY = dateBaseline + 38;
  const canvasHeight = dividerY + 122;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  roundedRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 28);
  ctx.fillStyle = X_RENKLER.arkaPlan;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = X_RENKLER.kenarlik;
  ctx.stroke();

  const avatar = await loadImage(avatarBuffer);
  const avatarSize = 104;
  const avatarX = horizontalPadding;
  const avatarY = 40;
  const sourceSize = Math.min(avatar.width, avatar.height);
  const sourceX = (avatar.width - sourceSize) / 2;
  const sourceY = (avatar.height - sourceSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    avatar,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    avatarX,
    avatarY,
    avatarSize,
    avatarSize
  );
  ctx.restore();

  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = X_RENKLER.kenarlik;
  ctx.stroke();

  const identityX = avatarX + avatarSize + 28;
  ctx.font = font(34, 700);
  const displayName = ellipsizeText(ctx, globalName, 720);
  ctx.fillStyle = X_RENKLER.anaMetin;
  ctx.fillText(displayName, identityX, 79);

  const badgeX = identityX + ctx.measureText(displayName).width + 22;
  drawVerifiedBadge(ctx, badgeX, 68, 17);

  ctx.font = font(27);
  ctx.fillStyle = X_RENKLER.ikincilMetin;
  ctx.fillText(ellipsizeText(ctx, `@${username}`, 760), identityX, 121);
  drawXLogo(ctx, canvasWidth - 98, 48, 50);

  ctx.font = font(40);
  ctx.fillStyle = X_RENKLER.anaMetin;
  let yOffset = bodyTop + 39;
  for (const line of lines) {
    ctx.fillText(line, horizontalPadding, yOffset);
    yOffset += lineHeight;
  }

  ctx.font = font(25);
  ctx.fillStyle = X_RENKLER.ikincilMetin;
  ctx.fillText(formatTweetDate(data.createdAt), horizontalPadding, dateBaseline);

  ctx.beginPath();
  ctx.moveTo(horizontalPadding, dividerY);
  ctx.lineTo(canvasWidth - horizontalPadding, dividerY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = X_RENKLER.kenarlik;
  ctx.stroke();

  const iconY = dividerY + 61;
  drawReplyIcon(ctx, 174, iconY);
  drawRepostIcon(ctx, 390, iconY);
  drawHeartIcon(ctx, 606, iconY);
  drawBookmarkIcon(ctx, 822, iconY);
  drawShareIcon(ctx, 1038, iconY);

  return canvas.toBuffer('image/png');
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

function formatTweetDate(value) {
  const date = new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const formatOptions = { timeZone: 'Europe/Istanbul' };
  const time = new Intl.DateTimeFormat('tr-TR', {
    ...formatOptions,
    hour: '2-digit',
    minute: '2-digit'
  }).format(safeDate);
  const day = new Intl.DateTimeFormat('tr-TR', {
    ...formatOptions,
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(safeDate);
  return `${time} · ${day}`;
}

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

function prepareIcon(ctx) {
  ctx.strokeStyle = X_RENKLER.ikincilMetin;
  ctx.fillStyle = X_RENKLER.ikincilMetin;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawVerifiedBadge(ctx, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = X_RENKLER.mavi;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 2, y + 6);
  ctx.lineTo(x + 9, y - 7);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawXLogo(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  ctx.moveTo(18.24, 2.25);
  ctx.lineTo(21.55, 2.25);
  ctx.lineTo(14.33, 10.51);
  ctx.lineTo(22.83, 21.75);
  ctx.lineTo(16.17, 21.75);
  ctx.lineTo(10.96, 14.93);
  ctx.lineTo(4.99, 21.75);
  ctx.lineTo(1.68, 21.75);
  ctx.lineTo(9.41, 12.92);
  ctx.lineTo(1.25, 2.25);
  ctx.lineTo(8.08, 2.25);
  ctx.lineTo(12.79, 8.48);
  ctx.closePath();
  ctx.fillStyle = X_RENKLER.anaMetin;
  ctx.fill();
  ctx.restore();
}

function drawReplyIcon(ctx, x, y) {
  ctx.save();
  prepareIcon(ctx);
  ctx.beginPath();
  ctx.arc(x, y - 2, 17, 0.45, Math.PI * 2 + 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 13, y + 9);
  ctx.lineTo(x - 17, y + 19);
  ctx.lineTo(x - 5, y + 14);
  ctx.stroke();
  ctx.restore();
}

function drawRepostIcon(ctx, x, y) {
  ctx.save();
  prepareIcon(ctx);
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 8);
  ctx.lineTo(x - 13, y - 15);
  ctx.lineTo(x - 6, y - 8);
  ctx.moveTo(x - 13, y - 14);
  ctx.lineTo(x + 14, y - 14);
  ctx.quadraticCurveTo(x + 20, y - 14, x + 20, y - 8);
  ctx.moveTo(x + 20, y + 8);
  ctx.lineTo(x + 13, y + 15);
  ctx.lineTo(x + 6, y + 8);
  ctx.moveTo(x + 13, y + 14);
  ctx.lineTo(x - 14, y + 14);
  ctx.quadraticCurveTo(x - 20, y + 14, x - 20, y + 8);
  ctx.stroke();
  ctx.restore();
}

function drawHeartIcon(ctx, x, y) {
  ctx.save();
  prepareIcon(ctx);
  ctx.beginPath();
  ctx.moveTo(x, y + 17);
  ctx.bezierCurveTo(x - 5, y + 12, x - 20, y + 2, x - 20, y - 8);
  ctx.bezierCurveTo(x - 20, y - 20, x - 5, y - 23, x, y - 12);
  ctx.bezierCurveTo(x + 5, y - 23, x + 20, y - 20, x + 20, y - 8);
  ctx.bezierCurveTo(x + 20, y + 2, x + 5, y + 12, x, y + 17);
  ctx.stroke();
  ctx.restore();
}

function drawBookmarkIcon(ctx, x, y) {
  ctx.save();
  prepareIcon(ctx);
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 19);
  ctx.lineTo(x + 14, y - 19);
  ctx.lineTo(x + 14, y + 19);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x - 14, y + 19);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawShareIcon(ctx, x, y) {
  ctx.save();
  prepareIcon(ctx);
  ctx.beginPath();
  ctx.moveTo(x - 17, y - 2);
  ctx.lineTo(x - 17, y + 17);
  ctx.lineTo(x + 17, y + 17);
  ctx.lineTo(x + 17, y - 2);
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x, y - 20);
  ctx.moveTo(x - 9, y - 11);
  ctx.lineTo(x, y - 20);
  ctx.lineTo(x + 9, y - 11);
  ctx.stroke();
  ctx.restore();
}