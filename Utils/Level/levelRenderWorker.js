'use strict';

const { parentPort, workerData, isMainThread } = require('node:worker_threads');
const { createCanvas, loadImage, ImageData, GifEncoder, GifDisposal } = require('@napi-rs/canvas');
const { GifReader } = require('omggif');

const WIDTH = 1000;
const HEIGHT = 320;
const FONT = '"Segoe UI", Arial, sans-serif';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 4 * 1024 * 1024;
const MAX_GIF_DECODE_PIXELS = 64 * 1024 * 1024;
const FORMAT = new Intl.NumberFormat('tr-TR');

function dimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  if (/^GIF8[79]a/.test(buffer.toString('ascii', 0, 6))) return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const type = buffer.toString('ascii', 12, 16);
    if (type === 'VP8X' && buffer.length >= 30) return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
    if (type === 'VP8 ' && buffer.length >= 30) return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
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

function checkedBuffer(source) {
  if (!source || source.byteLength > MAX_IMAGE_BYTES) return null;
  const buffer = Buffer.from(source);
  const size = dimensions(buffer);
  if (!size || size.some(value => value <= 0 || value > 8192) || size[0] * size[1] > MAX_IMAGE_PIXELS) return null;
  return buffer;
}

async function safeImage(source) {
  try {
    const buffer = checkedBuffer(source);
    return buffer ? await loadImage(buffer) : null;
  } catch { return null; }
}

function round(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, width), Math.max(0, height), radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function circle(ctx, x, y, radius, fill) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}

function cover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale; const sh = height / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, width, height);
}

function gradient(ctx, x, y, x2, y2, stops) {
  const result = ctx.createLinearGradient(x, y, x2, y2);
  for (const [position, color] of stops) result.addColorStop(position, color);
  return result;
}

function glow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color); g.addColorStop(1, '#00000000');
  circle(ctx, x, y, radius, g);
}

function label(ctx, value, x, y, size = 16, color = '#e7e8f6', weight = 400, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(String(value), x, y);
}

function fitLabel(ctx, value, x, y, maxWidth, size = 24, color = '#ffffff', weight = 600, align = 'left') {
  let current = size;
  ctx.font = `${weight} ${current}px ${FONT}`;
  while (ctx.measureText(value).width > maxWidth && current > size * 0.75) {
    current -= 1; ctx.font = `${weight} ${current}px ${FONT}`;
  }
  let chars = Array.from(value);
  let result = value;
  while (ctx.measureText(result).width > maxWidth && chars.length) {
    chars.pop(); result = `${chars.join('')}…`;
  }
  label(ctx, result, x, y, current, color, weight, align);
  return ctx.measureText(result).width;
}

function avatar(ctx, image, name, x, y, radius, border = '#b7a4ff', borderWidth = 3) {
  circle(ctx, x, y, radius + borderWidth + 4, '#0e1123');
  circle(ctx, x, y, radius + borderWidth, border);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
  if (image) cover(ctx, image, x - radius, y - radius, radius * 2, radius * 2);
  else {
    ctx.fillStyle = gradient(ctx, x - radius, y - radius, x + radius, y + radius,
      [[0, '#876bd8'], [0.6, '#3d427b'], [1, '#253559']]);
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    label(ctx, Array.from(name || '?').slice(0, 1).join('').toLocaleUpperCase('tr-TR'), x, y + radius * 0.32,
      radius, '#ffffff', 700, 'center');
  }
  ctx.restore();
}

function diamond(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.65, y);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.65, y); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function crown(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 30, size / 30);
  ctx.beginPath(); ctx.moveTo(-15, -9); ctx.lineTo(-9, 7); ctx.lineTo(9, 7);
  ctx.lineTo(15, -9); ctx.lineTo(6, -3); ctx.lineTo(0, -14); ctx.lineTo(-6, -3); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); round(ctx, -9, 10, 18, 3, 1, color);
  ctx.restore();
}

function background(ctx, width, height) {
  ctx.fillStyle = gradient(ctx, 0, 0, width, height, [[0, '#0b1022'], [0.45, '#17172e'], [1, '#0c1427']]);
  ctx.fillRect(0, 0, width, height);
  glow(ctx, width * 0.72, 0, width * 0.55, '#7464ed30');
  glow(ctx, 0, height * 0.65, width * 0.5, '#37cbd315');
  ctx.save(); ctx.strokeStyle = '#b4a5fd0a'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(width * 0.92, height * 0.15, width * (0.15 + i * 0.085), 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < 36; i++) {
    circle(ctx, 26 + ((i * 193) % (width - 52)), 24 + ((i * 127) % (height - 48)), i % 3 ? 1 : 1.7, '#c9c5ff20');
  }
  ctx.restore();
}

function status(ctx, value, x, y) {
  const color = { online: '#4de7ac', idle: '#ffc96c', dnd: '#f57b94', offline: '#8993ae', invisible: '#8993ae' }[value] || '#8993ae';
  circle(ctx, x, y, 16, '#0d1222'); circle(ctx, x, y, 11.5, color);
  if (value === 'dnd') round(ctx, x - 6, y - 2, 12, 4, 2, '#0d1222');
  else if (value === 'idle') circle(ctx, x - 4, y - 4, 8, '#0d1222');
  else if (!value || value === 'offline' || value === 'invisible') circle(ctx, x, y, 6, '#0d1222');
}

function pill(ctx, x, y, width, title, value, tint) {
  round(ctx, x, y, width, 38, 19, '#0e1421bd', `${tint}70`);
  label(ctx, title, x + 15, y + 24, 12, '#c2c6d7', 600);
  label(ctx, value, x + width - 15, y + 25, 17, tint, 700, 'right');
}

function progressBar(ctx, x, y, width, height, progress, phase = 0, shimmer = false) {
  round(ctx, x, y, width, height, height / 2, '#0d1023dc', '#e0dcff18');
  const filled = Math.min(width, Math.max(0, width * progress));
  if (filled > 0) {
    round(ctx, x, y, filled, height, Math.min(height / 2, filled / 2),
      gradient(ctx, x, y, x + width, y, [[0, '#8974fc'], [0.55, '#d7acff'], [1, '#ffe0a4']]));
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, filled, height, Math.min(height / 2, filled / 2)); ctx.clip();
    ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 7;
    for (let stripe = -height; stripe < filled + height; stripe += 26) {
      ctx.beginPath(); ctx.moveTo(x + stripe, y + height); ctx.lineTo(x + stripe + height, y); ctx.stroke();
    }
    if (shimmer) {
      const sx = x - 120 + phase * (width + 240);
      const g = gradient(ctx, sx - 70, y, sx + 70, y, [[0, '#ffffff00'], [0.5, '#ffffff9a'], [1, '#ffffff00']]);
      ctx.fillStyle = g; ctx.fillRect(sx - 70, y, 140, height);
    }
    ctx.fillStyle = '#ffffff40'; ctx.fillRect(x + 6, y + 2, Math.max(0, filled - 12), 2);
    ctx.restore();
  }
  if (shimmer && progress === 0) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, height / 2); ctx.clip();
    glow(ctx, x + phase * width, y + height / 2, 44, '#c4a7ff40'); ctx.restore();
  }
}

function drawCard(ctx, model, assets, banner, phase = 0) {
  background(ctx, WIDTH, HEIGHT);
  ctx.save(); ctx.beginPath(); ctx.roundRect(3, 3, WIDTH - 6, HEIGHT - 6, 25); ctx.clip();
  if (banner) cover(ctx, banner, 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = gradient(ctx, 0, 0, WIDTH, 0,
    [[0, '#0a1024bc'], [0.22, '#0a1024b3'], [0.58, '#0a102473'], [1, '#0a102430']]);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = gradient(ctx, 0, 0, 0, HEIGHT, [[0, '#0c102643'], [0.45, '#0c102629'], [1, '#0a1024ec']]);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  glow(ctx, 160, 240, 170, '#aa85ff24');
  round(ctx, 224, 92, 735, 181, 22, '#0b102445', '#faf1ff0b');
  pill(ctx, 688, 30, 127, 'SEVİYE', FORMAT.format(model.level), '#f7cea2');
  pill(ctx, 827, 30, 132, 'SIRA', model.rank ? `#${FORMAT.format(model.rank)}` : '—', '#c5afff');

  const avatarBorder = gradient(ctx, 60, 90, 200, 230, [[0, '#f8d8ae'], [0.45, '#c5a7ff'], [1, '#7e86fb']]);
  avatar(ctx, assets.avatar, model.displayName, 125, 166, 72, avatarBorder, 3);
  if (assets.decoration) ctx.drawImage(assets.decoration, 33, 74, 184, 184);
  status(ctx, model.status, 180, 219);

  const tag = model.primaryGuild?.tag;
  const nameWidth = fitLabel(ctx, model.displayName, 244, 145, tag ? 492 : 685, 37, '#ffffff', 700);
  if (tag) {
    ctx.font = `600 15px ${FONT}`;
    const tagWidth = Math.min(124, ctx.measureText(tag).width + (assets.badge ? 48 : 26));
    const x = Math.min(945 - tagWidth, 256 + nameWidth);
    round(ctx, x, 118, tagWidth, 31, 9, '#242c40d9', '#f0e9ff35');
    if (assets.badge) ctx.drawImage(assets.badge, x + 8, 124, 19, 19);
    fitLabel(ctx, tag, x + (assets.badge ? 33 : 13), 139, tagWidth - (assets.badge ? 41 : 26), 15, '#e6e8f5', 600);
  }
  fitLabel(ctx, model.username ? `@${model.username.replace(/^@/, '')}` : 'Her mesajla bir adım ileri.', 245, 171, 685, 16, '#c1c8de', 400);
  label(ctx, 'PUAN', 245, 203, 11, '#bac3db', 600);
  label(ctx, `${FORMAT.format(model.currentXp)} / ${FORMAT.format(model.requiredXp)} XP`, 938, 203, 14, '#e2e5f4', 600, 'right');
  progressBar(ctx, 244, 215, 694, 22, model.progress, phase, true);
  label(ctx, `%${Math.floor(model.progress * 100)}`, 245, 260, 14, '#d6c1ff', 700);
  label(ctx, `${FORMAT.format(Math.max(0, model.requiredXp - model.currentXp))} XP sonra seviye ${FORMAT.format(model.level + 1)}`, 295, 260, 13, '#d3d9e9');
  label(ctx, `${FORMAT.format(model.totalXp)} toplam XP`, 938, 260, 13, '#c0c9e1', 400, 'right');
  ctx.fillStyle = gradient(ctx, 36, 0, 964, 0, [[0, '#a996f700'], [0.35, '#b8a0fa50'], [0.7, '#ffdaa13b'], [1, '#a996f700']]);
  ctx.fillRect(36, 291, 928, 1);
  ctx.restore();
  round(ctx, 2, 2, WIDTH - 4, HEIGHT - 4, 26, null,
    gradient(ctx, 0, 0, WIDTH, HEIGHT, [[0, '#fbd9b890'], [0.4, '#b9a5fd80'], [1, '#6f85bb60']]));
}

function decodeGifFrames(input, maxFrames = 36, targetWidth = WIDTH, targetHeight = HEIGHT) {
  const buffer = checkedBuffer(input);
  if (!buffer || !/^GIF8[79]a/.test(buffer.toString('ascii', 0, 6))) return null;
  const reader = new GifReader(buffer);
  const count = reader.numFrames();
  const pixels = reader.width * reader.height;
  if (!count || count > 300 || pixels * count > MAX_GIF_DECODE_PIXELS) return null;
  const frames = [];
  const source = createCanvas(reader.width, reader.height);
  const context = source.getContext('2d');
  const composed = new Uint8ClampedArray(pixels * 4);
  const selected = new Set();
  const limit = Math.min(count, maxFrames);
  for (let i = 0; i < limit; i++) selected.add(Math.floor(i * count / limit));
  let previous = null; let restore = null; let elapsed = 0;
  for (let i = 0; i < count; i++) {
    if (previous?.disposal === 2) {
      for (let y = previous.y; y < Math.min(reader.height, previous.y + previous.height); y++) {
        composed.fill(0, (y * reader.width + previous.x) * 4, (y * reader.width + Math.min(reader.width, previous.x + previous.width)) * 4);
      }
    } else if (previous?.disposal === 3 && restore) composed.set(restore);
    const frame = reader.frameInfo(i);
    const before = frame.disposal === 3 ? composed.slice() : null;
    reader.decodeAndBlitFrameRGBA(i, composed);
    if (selected.has(i)) {
      context.putImageData(new ImageData(composed, reader.width, reader.height), 0, 0);
      const scaled = createCanvas(targetWidth, targetHeight);
      cover(scaled.getContext('2d'), source, 0, 0, targetWidth, targetHeight);
      frames.push({ image: scaled, start: elapsed, duration: 0, sourceIndex: i });
    }
    elapsed += Math.max(20, (frame.delay || 10) * 10);
    previous = frame; restore = before;
  }
  frames.forEach((frame, i) => { frame.duration = (frames[i + 1]?.start ?? elapsed) - frame.start; });
  return { frames, duration: elapsed };
}

function frameAt(animation, time) {
  const t = time % animation.duration;
  for (let i = animation.frames.length - 1; i >= 0; i--) if (t >= animation.frames[i].start) return animation.frames[i].image;
  return animation.frames[0].image;
}

async function renderCard(model, inputAssets, options = {}, onPreview) {
  const loaded = await Promise.all(['avatar', 'banner', 'decoration', 'badge'].map(key => safeImage(inputAssets[key])));
  const assets = { avatar: loaded[0], banner: loaded[1], decoration: loaded[2], badge: loaded[3] };
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  drawCard(ctx, model, assets, assets.banner, 0.3);
  const preview = canvas.toBuffer('image/png');
  onPreview?.(preview);
  try {
    const animation = decodeGifFrames(inputAssets.banner, options.maxFrames || 36);
    const frameCount = options.maxFrames || 36;
    const duration = animation ? Math.min(8000, Math.max(1600, animation.duration)) : 2880;
    const delay = Math.max(20, Math.round(duration / frameCount / 10) * 10);
    const encoder = new GifEncoder(WIDTH, HEIGHT, { repeat: 0, quality: 12 });
    let output;
    try {
      for (let index = 0; index < frameCount; index++) {
        const time = (index / frameCount) * (animation?.duration || duration);
        drawCard(ctx, model, assets, animation ? frameAt(animation, time) : assets.banner, index / frameCount);
        const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        encoder.addFrame(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), WIDTH, HEIGHT, { delay, disposal: GifDisposal.Keep });
      }
      output = encoder.finish();
    } finally { encoder.dispose(); }
    if (output.length > (options.maxOutputBytes || 8 * 1024 * 1024)) {
      return { buffer: preview, name: 'seviye.png', animated: false, fallbackReason: 'ANIMATION_SIZE_LIMIT' };
    }
    return { buffer: output, name: 'seviye.gif', animated: true,
      ...(inputAssets.banner && /^GIF8[79]a/.test(Buffer.from(inputAssets.banner).toString('ascii', 0, 6)) && !animation
        ? { fallbackReason: 'BANNER_ANIMATION_LIMIT' } : {}) };
  } catch {
    return { buffer: preview, name: 'seviye.png', animated: false, fallbackReason: 'ANIMATION_FAILED' };
  }
}

function drawPodium(ctx, entry, image, x, width, rank, viewerId) {
  const winner = rank === 1;
  const y = winner ? 170 : 205;
  const bottom = 448;
  const tint = { 1: '#f3d49a', 2: '#c4c9f1', 3: '#d5a68e' }[rank];
  const mine = viewerId === entry.userId;
  glow(ctx, x + width / 2, y + 104, 165, winner ? '#a78aef22' : '#7989ea0d');
  round(ctx, x, y, width, bottom - y, 22,
    gradient(ctx, x, y, x, bottom, [[0, winner ? '#35304da8' : '#2529408c'], [1, '#161c32c9']]), mine ? '#af94fcb0' : `${tint}40`);
  if (winner) {
    round(ctx, x + width / 2 - 68, y - 15, 136, 28, 14, '#f2d29f');
    label(ctx, 'ZİRVENİN SAHİBİ', x + width / 2, y + 4, 10, '#30253d', 700, 'center');
  }
  const avY = y + (winner ? 78 : 62);
  avatar(ctx, image, entry.displayName, x + width / 2, avY, winner ? 45 : 38, tint, 2);
  if (winner) crown(ctx, x + width / 2, avY - 63, 22, tint);
  round(ctx, x + width / 2 - 17, avY + (winner ? 33 : 27), 34, 25, 12, tint);
  label(ctx, String(rank).padStart(2, '0'), x + width / 2, avY + (winner ? 50 : 44), 13, '#262335', 700, 'center');
  const nameY = avY + (winner ? 83 : 77);
  fitLabel(ctx, entry.displayName, x + width / 2, nameY, width - 28, winner ? 24 : 21, '#f3f2fc', 700, 'center');
  label(ctx, `SEVİYE ${FORMAT.format(entry.level)}`, x + width / 2, nameY + 25, 12, tint, 600, 'center');
  label(ctx, `${FORMAT.format(entry.totalXp)} XP`, x + width / 2, bottom - 23, 18, '#f1f2fa', 600, 'center');
  if (mine) { circle(ctx, x + width - 20, y + 19, 3, '#cbb5ff'); label(ctx, 'SEN', x + width - 30, y + 23, 9, '#dacaff', 700, 'right'); }
}

async function renderBoard(model, inputAssets) {
  const images = await Promise.all((inputAssets.avatars || []).map(safeImage));
  const icon = await safeImage(inputAssets.guildIcon);
  const hasPodium = model.page === 1 && model.entries.length > 0;
  const rest = hasPodium ? model.entries.slice(3) : model.entries;
  const height = model.entries.length === 0 ? 560 : (hasPodium ? 558 : 232) + Math.max(1, rest.length) * 65;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  background(ctx, WIDTH, height);
  round(ctx, 1, 1, WIDTH - 2, height - 2, 28, null, '#b6a5ef38');
  round(ctx, 37, 38, 58, 58, 17, '#bba3ff16', '#bba3ff40');
  crown(ctx, 66, 67, 31, '#e3c2a0');
  label(ctx, 'Liderlik', 113, 73, 37, '#faf8ff', 700);
  const guildX = icon ? 137 : 113;
  if (icon) avatar(ctx, icon, model.guildName, 122, 102, 9, '#22293c', 0);
  fitLabel(ctx, model.guildName, guildX, 108, 500, 16, '#aeb8d0');
  round(ctx, 777, 41, 182, 56, 16, '#bec1ff09', '#c6c3ff25');
  label(ctx, FORMAT.format(model.total), 804, 76, 25, '#e5daff', 700);
  ctx.font = `700 25px ${FONT}`;
  const totalWidth = ctx.measureText(FORMAT.format(model.total)).width;
  if (totalWidth < 86) label(ctx, 'KİŞİ', 815 + totalWidth, 75, 10, '#aeb8d0', 600);

  if (model.entries.length === 0) {
    glow(ctx, 500, 292, 186, '#a688ff23');
    ctx.strokeStyle = '#c9afff2b'; ctx.lineWidth = 1;
    for (const radius of [70, 104]) { ctx.beginPath(); ctx.arc(500, 288, radius, 0, Math.PI * 2); ctx.stroke(); }
    crown(ctx, 500, 286, 76, '#d5baf7');
    diamond(ctx, 403, 253, 7, '#ffe0aa'); diamond(ctx, 586, 341, 5, '#ad95f7');
    label(ctx, 'İlk sırada sen olabilirsin.', 500, 421, 27, '#f3edff', 600, 'center');
    label(ctx, 'Sohbete katıl, XP kazan ve bu tabloya adını yazdır.', 500, 455, 16, '#aeb8d0', 400, 'center');
  } else {
    if (hasPodium) {
      const positions = { 1: [365, 270], 2: [62, 274], 3: [664, 274] };
      model.entries.slice(0, 3).forEach((entry, index) => {
        const rank = index + 1; const [x, width] = positions[rank];
        drawPodium(ctx, entry, images[index], x, width, rank, model.viewerId);
      });
    }
    const headY = hasPodium ? 482 : 173;
    if (rest.length) {
      label(ctx, 'SIRA', 63, headY, 10, '#8d9cb9', 600);
      label(ctx, 'ÜYE', 164, headY, 10, '#8d9cb9', 600);
      label(ctx, 'SEVİYE', 649, headY, 10, '#8d9cb9', 600);
      label(ctx, 'TOPLAM XP', 930, headY, 10, '#8d9cb9', 600, 'right');
    }
    rest.forEach((entry, index) => {
      const y = headY + 14 + index * 65;
      const mine = entry.userId === model.viewerId;
      round(ctx, 38, y, 924, 56, 13, mine ? '#ac8cff18' : index % 2 ? '#c0caff05' : '#c0caff09', mine ? '#b69cff65' : '#c6caff0c');
      if (mine) round(ctx, 38, y + 13, 3, 30, 1.5, '#bea1ff');
      label(ctx, String(entry.rank || ((model.page - 1) * 10 + index + (hasPodium ? 4 : 1))).padStart(2, '0'), 79, y + 35, 19, mine ? '#d5bcff' : '#9daecb', 600, 'center');
      avatar(ctx, images[index + (hasPodium ? 3 : 0)], entry.displayName, 129, y + 28, 18, mine ? '#ad96df' : '#364058', 1);
      const width = fitLabel(ctx, entry.displayName, 166, y + 35, mine ? 344 : 388, 17, '#edf0fb', 600);
      if (mine) { round(ctx, 176 + width, y + 18, 35, 20, 6, '#ba9aff24'); label(ctx, 'SEN', 193 + width, y + 32, 9, '#d6c3ff', 700, 'center'); }
      label(ctx, FORMAT.format(entry.level), 669, y + 28, 17, '#dcc9ff', 700, 'center');
      progressBar(ctx, 631, y + 37, 76, 4, entry.progress);
      label(ctx, FORMAT.format(entry.totalXp), 930, y + 34, 18, '#dce6f6', 600, 'right');
    });
    if (hasPodium && !rest.length) label(ctx, 'Bir sonraki sıra seni bekliyor.', 500, 510, 15, '#a3afca', 400, 'center');
  }
  const footerY = height - 30;
  ctx.fillStyle = '#b2a4ff14'; ctx.fillRect(38, footerY - 21, 924, 1);
  diamond(ctx, 47, footerY + 1, 4, '#bca2f6');
  label(ctx, 'SOHBETİN YILDIZLARI', 61, footerY + 5, 10, '#9dacc8', 600);
  label(ctx, `${model.page} / ${model.pages}`, 956, footerY + 5, 12, '#c3cbe0', 600, 'right');
  return { buffer: canvas.toBuffer('image/png'), name: 'seviye-liderlik.png', animated: false };
}

if (!isMainThread) {
  (async () => {
    try {
      const { type, model, assets, options } = workerData;
      const result = type === 'leaderboard' ? await renderBoard(model, assets)
        : await renderCard(model, assets, options, preview => parentPort.postMessage({ preview }));
      parentPort.postMessage({ result });
    } catch (error) { parentPort.postMessage({ error: { message: error.message, code: error.code || 'LEVEL_RENDER_FAILED' } }); }
  })();
}

module.exports = { decodeGifFrames, renderCard, renderBoard, checkedBuffer, WIDTH, HEIGHT };