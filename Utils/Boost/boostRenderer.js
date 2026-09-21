'use strict';

const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const BOOST_MONTHS = Object.freeze([1, 2, 3, 6, 9, 12, 15, 18, 24]);
const ASSET_DIRECTORY = path.resolve(__dirname, '../../assets/Boost');
const WIDTH = 1060;
const HEIGHT = 240;
const COLORS = Object.freeze({
  background: '#303237',
  track: '#aaaeb0',
  achieved: '#ba6de8',
  achievedEnd: '#df86dd',
  label: '#b9bbbe',
  arrow: '#c5c6c8',
});

let imagePromise;
const badgeCache = new Map();

function validateLevel(value, fieldName = 'level') {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 0 || level > BOOST_MONTHS.length) {
    throw new RangeError(`${fieldName} must be an integer between 0 and 9.`);
  }
  return level;
}

function normalizeProgress(value = 0) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) throw new TypeError('progress must be a finite number.');
  return Math.min(1, Math.max(0, progress));
}

async function loadBadges() {
  if (!imagePromise) {
    imagePromise = Promise.all(BOOST_MONTHS.map(async (_, index) => {
      const image = await loadImage(path.join(ASSET_DIRECTORY, `boost-level-${index + 1}.png`));
      const grayscale = createCanvas(image.width, image.height);
      const context = grayscale.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height);
      for (let pixel = 0; pixel < pixels.data.length; pixel += 4) {
        const gray = Math.round(
          pixels.data[pixel] * 0.2126 +
          pixels.data[pixel + 1] * 0.7152 +
          pixels.data[pixel + 2] * 0.0722,
        );
        const silver = Math.round(100 + (gray / 255) * 155);
        pixels.data[pixel] = silver;
        pixels.data[pixel + 1] = silver;
        pixels.data[pixel + 2] = silver;
      }
      context.putImageData(pixels, 0, 0);
      return { color: image, gray: grayscale };
    })).catch(error => {
      imagePromise = undefined;
      throw error;
    });
  }
  return imagePromise;
}

function roundedRectangle(context, x, y, width, height, radius, fill) {
  if (width <= 0 || height <= 0) return;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function setupContext(canvas) {
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

function drawTimeline(context, badges, { level, progress, top = 0 }) {
  roundedRectangle(context, 0, top, WIDTH, HEIGHT, 26, COLORS.background);

  const firstCenter = 120;
  const spacing = 102.5;
  const iconSize = 48;
  const trackX = 20;
  const trackY = top + 126;
  const trackWidth = WIDTH - trackX * 2;

  roundedRectangle(context, trackX, trackY, trackWidth, 10, 5, COLORS.track);
  if (level > 0) {
    const endX = level === BOOST_MONTHS.length
      ? WIDTH - trackX
      : firstCenter + ((level - 1) + progress) * spacing;
    const gradient = context.createLinearGradient(trackX, 0, WIDTH - trackX, 0);
    gradient.addColorStop(0, COLORS.achieved);
    gradient.addColorStop(1, COLORS.achievedEnd);
    context.save();
    context.beginPath();
    context.roundRect(trackX, trackY, trackWidth, 10, 5);
    context.clip();
    context.fillStyle = gradient;
    context.fillRect(trackX, trackY, endX - trackX, 10);
    context.restore();
  }

  context.font = 'bold 17px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  BOOST_MONTHS.forEach((months, index) => {
    const achieved = index < level;
    const center = firstCenter + spacing * index;
    context.drawImage(
      achieved ? badges[index].color : badges[index].gray,
      center - iconSize / 2,
      top + 62,
      iconSize,
      iconSize,
    );
    context.fillStyle = achieved ? COLORS.achieved : COLORS.label;
    context.fillText(`${months} Ay`, center, top + 160);
  });
}

async function renderProgression({ level = 0, progress = 0 } = {}) {
  level = validateLevel(level);
  progress = normalizeProgress(progress);
  const canvas = createCanvas(WIDTH, HEIGHT);
  drawTimeline(setupContext(canvas), await loadBadges(), { level, progress });
  return canvas.encode('png');
}

async function renderBadge(level) {
  level = validateLevel(level);
  if (!badgeCache.has(level)) {
    const badges = await loadBadges();
    const canvas = createCanvas(128, 128);
    setupContext(canvas).drawImage(level === 0 ? badges[0].gray : badges[level - 1].color, 0, 0, 128, 128);
    badgeCache.set(level, await canvas.encode('png'));
  }
  return Buffer.from(badgeCache.get(level));
}

async function renderPromotion({ fromLevel, toLevel, progress = 0 } = {}) {
  fromLevel = validateLevel(fromLevel, 'fromLevel');
  toLevel = validateLevel(toLevel, 'toLevel');
  progress = normalizeProgress(progress);
  const badges = await loadBadges();
  const canvas = createCanvas(WIDTH, HEIGHT + 100);
  const context = setupContext(canvas);

  context.drawImage(fromLevel === 0 ? badges[0].gray : badges[fromLevel - 1].color, 0, 0, 64, 64);
  context.drawImage(toLevel === 0 ? badges[0].gray : badges[toLevel - 1].color, 136, 0, 64, 64);
  context.fillStyle = COLORS.arrow;
  context.beginPath();
  context.moveTo(76, 27);
  context.lineTo(103, 27);
  context.lineTo(103, 19);
  context.lineTo(120, 32);
  context.lineTo(103, 45);
  context.lineTo(103, 37);
  context.lineTo(76, 37);
  context.closePath();
  context.fill();

  drawTimeline(context, badges, { level: toLevel, progress, top: 100 });
  return canvas.encode('png');
}

module.exports = { BOOST_MONTHS, renderProgression, renderBadge, renderPromotion };
