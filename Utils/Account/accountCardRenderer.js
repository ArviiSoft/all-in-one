'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { formatAccountDate: formatCreatedAt } = require('./accountTime');

const WIDTH = 1100;
const HEIGHT = 368;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 4000;
const MAX_BADGES = 14;
const FONT = 'Arial, "Segoe UI", sans-serif';
const CDN_HOSTS = new Set([
  'cdn.discordapp.com', 'media.discordapp.net', 'images.discordapp.net',
]);

function isSafeImageURL(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && (!url.port || url.port === '443')
      && (CDN_HOSTS.has(url.hostname)
        || (url.hostname === 'discord.com' && url.pathname.startsWith('/assets/')));
  } catch {
    return false;
  }
}

function imageDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  if (buffer.toString('ascii', 0, 3) === 'GIF') {
    return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const type = buffer.toString('ascii', 12, 16);
    if (type === 'VP8X' && buffer.length >= 30) {
      return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
    }
    if (type === 'VP8 ' && buffer.length >= 30) {
      return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
    }
    if (type === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset++] !== 0xff) return null;
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return [buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3)];
      }
      offset += length;
    }
  }
  return null;
}

async function fetchImageBuffer(url, fetchImpl = globalThis.fetch) {
  if (!isSafeImageURL(url) || typeof fetchImpl !== 'function') return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok || !response.body) return null;
    const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase();
    if (contentType && !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'].includes(contentType)) {
      await response.body.cancel();
      return null;
    }
    if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
      await response.body.cancel();
      return null;
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_IMAGE_BYTES) {
        controller.abort();
        return null;
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, length);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeLoadImage(source) {
  try {
    const buffer = Buffer.isBuffer(source) ? source : await fetchImageBuffer(source);
    if (!buffer || buffer.length > MAX_IMAGE_BYTES) return null;
    const dimensions = imageDimensions(buffer);
    if (!dimensions || dimensions.some(value => value <= 0 || value > 8192)
      || dimensions[0] * dimensions[1] > MAX_IMAGE_PIXELS) return null;
    return await loadImage(buffer);
  } catch {
    return null;
  }
}

function roundedRect(context, x, y, width, height, radius, fill) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function cover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2,
    sourceWidth, sourceHeight, x, y, width, height);
}

function contain(context, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  context.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2,
    drawnWidth, drawnHeight);
}

function cleanText(value) {
  // eslint-disable-next-line no-control-regex -- Kart metnindeki ASCII kontrol karakterleri bilerek boşlukla değiştirilir.
  return String(value || '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 256);
}

function fitText(context, value, maxWidth, initialSize, minimumSize, bold = false) {
  let size = initialSize;
  let text = cleanText(value);
  const setFont = () => { context.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; };
  setFont();
  while (context.measureText(text).width > maxWidth && size > minimumSize) {
    size -= 1;
    setFont();
  }
  if (context.measureText(text).width > maxWidth) {
    const characters = Array.from(text);
    while (characters.length && context.measureText(`${characters.join('')}…`).width > maxWidth) characters.pop();
    text = `${characters.join('')}…`;
  }
  return text;
}

function drawStatus(context, status, x, y) {
  if (!status) return;
  const radius = 29;
  context.save();
  context.fillStyle = '#111318';
  context.beginPath();
  context.arc(x, y, radius + 7, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = { online: '#23a55a', idle: '#f0b232', dnd: '#f23f43', offline: '#80848e', invisible: '#80848e' }[status] || '#80848e';
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#111318';
  if (status === 'idle') {
    context.beginPath();
    context.arc(x - 11, y - 11, 24, 0, Math.PI * 2);
    context.fill();
  } else if (status === 'dnd') {
    roundedRect(context, x - 18, y - 5, 36, 10, 4, '#111318');
  } else if (status !== 'online') {
    context.beginPath();
    context.arc(x, y, 16, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawFallbackBadge(context, badge, x, y, size) {
  roundedRect(context, x + 3, y + 3, size - 6, size - 6, 9, '#515a75');
  context.font = `bold ${Math.round(size * 0.36)}px ${FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f2f3f5';
  const text = cleanText(badge.label || badge.name || badge.id || '?');
  context.fillText(Array.from(text).slice(0, 2).join('').toUpperCase(), x + size / 2, y + size / 2);
  context.textAlign = 'left';
}

async function renderAccountCard(options = {}) {
  const { user = {}, member, presence, primaryGuild = {} } = options;
  const badges = (Array.isArray(options.badges) ? options.badges : []).filter(Boolean).slice(0, MAX_BADGES);
  const avatarURL = options.avatarImage || options.avatarURL
    || member?.displayAvatarURL?.({ extension: 'png', size: 512 })
    || user.displayAvatarURL?.({ extension: 'png', size: 512 });
  const bannerURL = options.bannerImage || options.bannerURL || user.bannerURL?.({ extension: 'png', size: 1024 });
  const decorationURL = options.avatarDecorationImage || options.avatarDecorationURL;
  const guild = primaryGuild || {};
  const [avatar, banner, decoration, guildBadge, ...badgeImages] = await Promise.all([
    safeLoadImage(avatarURL), safeLoadImage(bannerURL), safeLoadImage(decorationURL),
    safeLoadImage(guild.badgeImage || guild.badgeURL || guild.iconURL),
    ...badges.map(badge => safeLoadImage(badge.image || badge.imageURL || badge.iconURL)),
  ]);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  roundedRect(context, 0, 0, WIDTH, HEIGHT, 42, '#050608');
  context.save();
  context.beginPath();
  context.roundRect(10, 10, WIDTH - 20, HEIGHT - 20, 33);
  context.clip();

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#232d42');
  background.addColorStop(1, '#171b24');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (banner) {
    context.save();
    context.filter = 'blur(5px)';
    cover(context, banner, -14, -14, WIDTH + 28, HEIGHT + 28);
    context.restore();
    context.fillStyle = 'rgba(8, 12, 20, 0.50)';
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }
  const shade = context.createLinearGradient(0, 0, WIDTH, 0);
  shade.addColorStop(0, 'rgba(11, 16, 26, 0.1)');
  shade.addColorStop(0.38, 'rgba(11, 16, 26, 0.22)');
  shade.addColorStop(1, 'rgba(11, 16, 26, 0.02)');
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const avatarX = 181;
  const avatarY = 189;
  const avatarRadius = 137;
  context.save();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius + 3, 0, Math.PI * 2);
  context.fillStyle = '#0a0c10';
  context.fill();
  context.beginPath();
  context.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  context.clip();
  if (avatar) {
    cover(context, avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
  } else {
    context.fillStyle = '#5865f2';
    context.fillRect(avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    context.fillStyle = '#ffffff';
    context.font = `bold 110px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(Array.from(cleanText(user.globalName || user.username || '?'))[0] || '?', avatarX, avatarY);
  }
  context.restore();
  if (decoration) contain(context, decoration, avatarX - 166, avatarY - 166, 332, 332);
  drawStatus(context, presence?.status, 292, 291);

  if (badges.length) {
    const iconSize = Math.min(48, Math.floor(628 / badges.length));
    const width = badges.length * iconSize + 18;
    const startX = WIDTH - width - 29;
    roundedRect(context, startX, 21, width, 59, 20, 'rgba(6, 15, 25, 0.87)');
    badges.forEach((badge, index) => {
      const x = startX + 9 + index * iconSize;
      if (badgeImages[index]) contain(context, badgeImages[index], x, 25, iconSize, 48);
      else drawFallbackBadge(context, badge, x, 25 + (48 - iconSize) / 2, iconSize);
    });
  }

  const textX = 363;
  const availableWidth = WIDTH - textX - 35;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 5;
  context.fillStyle = '#ffffff';
  const displayName = options.displayName || user.globalName || member?.displayName || user.username || 'Discord Kullanıcısı';
  const name = fitText(context, displayName, availableWidth, 56, 35, true);
  context.fillText(name, textX, 194);

  const tagText = cleanText(guild.tag);
  let tagWidth = 0;
  if (tagText) {
    context.font = `bold 28px ${FONT}`;
    tagWidth = Math.min(250, Math.ceil(context.measureText(tagText).width) + (guildBadge ? 59 : 26));
  }
  const username = fitText(context, `@${user.username || user.id || 'bilinmiyor'}`,
    availableWidth - (tagWidth ? tagWidth + 30 : 0), 49, 30);
  context.fillStyle = '#e1e3e7';
  context.fillText(username, textX, 253);
  const usernameWidth = context.measureText(username).width;
  context.shadowBlur = 0;

  if (tagText) {
    const tagX = textX + usernameWidth + 30;
    context.fillStyle = '#d2d5da';
    context.beginPath();
    context.arc(tagX - 15, 235, 8, 0, Math.PI * 2);
    context.fill();
    roundedRect(context, tagX, 208, tagWidth, 55, 12, 'rgba(78, 82, 91, 0.91)');
    if (guildBadge) contain(context, guildBadge, tagX + 8, 217, 36, 36);
    context.fillStyle = '#f2f3f5';
    const tag = fitText(context, tagText, tagWidth - (guildBadge ? 55 : 20), 28, 22, true);
    context.fillText(tag, tagX + (guildBadge ? 49 : 12), 245);
  }

  const timestamp = formatCreatedAt(options.createdAt || user.createdAt || user.createdTimestamp);
  if (timestamp) {
    context.font = `22px ${FONT}`;
    const width = Math.ceil(context.measureText(timestamp).width) + 22;
    roundedRect(context, WIDTH - width - 24, HEIGHT - 54, width, 35, 8, 'rgba(0, 0, 0, 0.53)');
    context.fillStyle = '#e4e4e7';
    context.fillText(timestamp, WIDTH - width - 13, HEIGHT - 29);
  }

  context.restore();
  return canvas.encode('png');
}

module.exports = { renderAccountCard, isSafeImageURL, formatCreatedAt, fetchImageBuffer, WIDTH, HEIGHT };
