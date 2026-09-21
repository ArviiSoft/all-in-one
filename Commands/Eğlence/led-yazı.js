const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, applyPalette } = require('gifenc');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const WIDTH = 640;
const HEIGHT = 220;
const SCREEN = { x: 40, y: 38, width: 560, height: 138 };
const LED_PITCH = 8;
const LED_RADIUS = 2.15;
const GRID = {
  startX: SCREEN.x + 6,
  startY: SCREEN.y + 5,
  columns: 69,
  rows: 17,
};

const gifCache = new Map();
const MAX_CACHE_ITEMS = 20;
const WORKER_TIMEOUT = 30_000;

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

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function createBasePanel() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const backdrop = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  backdrop.addColorStop(0, '#130b0d');
  backdrop.addColorStop(0.5, '#070506');
  backdrop.addColorStop(1, '#16090c');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const floorGlow = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT - 7,
    15,
    WIDTH / 2,
    HEIGHT - 7,
    WIDTH / 2,
  );
  floorGlow.addColorStop(0, 'rgba(255, 30, 48, 0.2)');
  floorGlow.addColorStop(0.45, 'rgba(110, 10, 22, 0.1)');
  floorGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = floorGlow;
  ctx.fillRect(30, HEIGHT - 35, WIDTH - 60, 35);

  roundedRect(ctx, 10, 10, WIDTH - 20, HEIGHT - 20, 16);
  const body = ctx.createLinearGradient(0, 10, 0, HEIGHT - 10);
  body.addColorStop(0, '#4b272c');
  body.addColorStop(0.08, '#1d1114');
  body.addColorStop(0.55, '#0b0809');
  body.addColorStop(0.9, '#241013');
  body.addColorStop(1, '#54252c');
  ctx.fillStyle = body;
  ctx.fill();

  roundedRect(ctx, 15, 15, WIDTH - 30, HEIGHT - 30, 13);
  ctx.strokeStyle = 'rgba(255, 156, 166, 0.18)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  roundedRect(ctx, 24, 25, WIDTH - 48, HEIGHT - 50, 10);
  ctx.fillStyle = '#030303';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 70, 80, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(
    ctx,
    SCREEN.x - 5,
    SCREEN.y - 5,
    SCREEN.width + 10,
    SCREEN.height + 10,
    7,
  );
  const screenGradient = ctx.createLinearGradient(
    0,
    SCREEN.y,
    0,
    SCREEN.y + SCREEN.height,
  );
  screenGradient.addColorStop(0, '#27080d');
  screenGradient.addColorStop(0.48, '#0d0305');
  screenGradient.addColorStop(1, '#26060b');
  ctx.fillStyle = screenGradient;
  ctx.fill();
  ctx.strokeStyle = '#5d151e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const innerGlow = ctx.createRadialGradient(
    WIDTH / 2,
    SCREEN.y + SCREEN.height / 2,
    10,
    WIDTH / 2,
    SCREEN.y + SCREEN.height / 2,
    SCREEN.width / 1.7,
  );
  innerGlow.addColorStop(0, 'rgba(145, 10, 24, 0.16)');
  innerGlow.addColorStop(1, 'rgba(20, 0, 4, 0)');
  ctx.fillStyle = innerGlow;
  ctx.fillRect(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height);

  ctx.fillStyle = 'rgba(255, 80, 90, 0.025)';
  for (let y = SCREEN.y + 2; y < SCREEN.y + SCREEN.height; y += 4) {
    ctx.fillRect(SCREEN.x + 2, y, SCREEN.width - 4, 1);
  }

  for (let row = 0; row < GRID.rows; row += 1) {
    for (let column = 0; column < GRID.columns; column += 1) {
      const x = GRID.startX + column * LED_PITCH;
      const y = GRID.startY + row * LED_PITCH;

      ctx.fillStyle = 'rgba(88, 21, 28, 0.72)';
      circle(ctx, x, y, LED_RADIUS);
      ctx.fillStyle = 'rgba(245, 94, 103, 0.1)';
      circle(ctx, x - 0.55, y - 0.65, 0.7);
    }
  }

  const reflection = ctx.createLinearGradient(
    SCREEN.x,
    SCREEN.y,
    SCREEN.x + SCREEN.width,
    SCREEN.y,
  );
  reflection.addColorStop(0, 'rgba(255, 255, 255, 0.01)');
  reflection.addColorStop(0.48, 'rgba(255, 255, 255, 0.055)');
  reflection.addColorStop(0.62, 'rgba(255, 255, 255, 0.008)');
  reflection.addColorStop(1, 'rgba(255, 255, 255, 0.025)');
  ctx.fillStyle = reflection;
  ctx.beginPath();
  ctx.moveTo(SCREEN.x + 20, SCREEN.y + 2);
  ctx.lineTo(SCREEN.x + SCREEN.width * 0.64, SCREEN.y + 2);
  ctx.lineTo(
    SCREEN.x + SCREEN.width * 0.43,
    SCREEN.y + SCREEN.height - 2,
  );
  ctx.lineTo(SCREEN.x + 2, SCREEN.y + SCREEN.height - 2);
  ctx.closePath();
  ctx.fill();

  const screws = [
    [25, 25],
    [WIDTH - 25, 25],
    [25, HEIGHT - 25],
    [WIDTH - 25, HEIGHT - 25],
  ];

  for (const [x, y] of screws) {
    ctx.fillStyle = '#080607';
    circle(ctx, x, y, 4.5);
    ctx.fillStyle = '#5e4549';
    circle(ctx, x, y, 2.7);
    ctx.strokeStyle = '#160e10';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 1.8, y + 1.2);
    ctx.lineTo(x + 1.8, y - 1.2);
    ctx.stroke();
  }

  ctx.font = '600 8px Arial';
  ctx.fillStyle = 'rgba(255, 127, 139, 0.35)';
  ctx.fillText('LED MATRIX', 42, 194);

  ctx.fillStyle = '#ff263d';
  circle(ctx, WIDTH - 48, 191, 2);
  ctx.fillStyle = 'rgba(255, 82, 96, 0.45)';
  ctx.font = '600 7px Arial';
  ctx.fillText('ONLINE', WIDTH - 91, 194);

  return canvas;
}

function createPalette() {
  const palette = [];

  for (let i = 0; i < 32; i += 1) {
    const t = i / 31;
    palette.push([
      Math.round(3 + 126 * t),
      Math.round(2 + 29 * t),
      Math.round(3 + 31 * t),
    ]);
  }

  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    palette.push([
      Math.round(8 + 92 * t),
      Math.round(7 + 78 * t),
      Math.round(9 + 75 * t),
    ]);
  }

  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    palette.push([
      Math.round(135 + 120 * t),
      Math.round(5 + 218 * t),
      Math.round(13 + 215 * t),
    ]);
  }

  return palette;
}

function prepareText(text) {
  const normalized = text.normalize('NFC').replace(/\s+/gu, ' ').trim();

  if (!normalized) {
    throw new Error(`${emojiler.uyari} **LED panoya yazılacak metin boş olamaz.**`);
  }

  return normalized.slice(0, 60);
}

function createAnimationState(text) {
  const maskCanvas = createCanvas(SCREEN.width, SCREEN.height);
  const maskContext = maskCanvas.getContext('2d');
  const fontSize = text.length > 42 ? 82 : text.length > 28 ? 91 : 102;
  const font = `900 ${fontSize}px Arial`;

  maskContext.font = font;
  const textWidth = Math.ceil(maskContext.measureText(text).width);
  const travelDistance = SCREEN.width + textWidth + 28;
  const frameCount = Math.max(
    48,
    Math.min(96, Math.ceil(travelDistance / 22)),
  );

  return {
    maskCanvas,
    maskContext,
    font,
    textWidth,
    frameCount,
  };
}

function drawFrame(ctx, basePanel, state, text, frameIndex) {
  const {
    maskContext,
    font,
    textWidth,
    frameCount,
  } = state;
  const progress = frameIndex / (frameCount - 1);
  const textX =
    SCREEN.width +
    14 -
    progress * (SCREEN.width + textWidth + 28);

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(basePanel, 0, 0);

  maskContext.clearRect(0, 0, SCREEN.width, SCREEN.height);
  maskContext.font = font;
  maskContext.textBaseline = 'middle';
  maskContext.fillStyle = '#ffffff';
  maskContext.fillText(text, textX, SCREEN.height / 2 + 4);

  const mask = maskContext.getImageData(
    0,
    0,
    SCREEN.width,
    SCREEN.height,
  ).data;
  const activeLeds = [];

  for (let row = 0; row < GRID.rows; row += 1) {
    for (let column = 0; column < GRID.columns; column += 1) {
      const x = GRID.startX + column * LED_PITCH;
      const y = GRID.startY + row * LED_PITCH;
      const sampleX = Math.round(x - SCREEN.x);
      const sampleY = Math.round(y - SCREEN.y);
      const alpha = mask[(sampleY * SCREEN.width + sampleX) * 4 + 3];

      if (alpha > 28) {
        activeLeds.push({ x, y, alpha, row, column });
      }
    }
  }

  for (const led of activeLeds) {
    const flicker =
      0.92 +
      0.08 *
        Math.sin(frameIndex * 0.7 + led.row * 1.9 + led.column);
    const intensity = (led.alpha / 255) * flicker;
    ctx.fillStyle = `rgba(255, 12, 35, ${0.12 + intensity * 0.2})`;
    circle(ctx, led.x, led.y, 4.8);
  }

  for (const led of activeLeds) {
    const intensity = led.alpha / 255;
    const green = Math.round(28 + 75 * intensity);
    const blue = Math.round(42 + 73 * intensity);

    ctx.fillStyle = `rgb(255, ${green}, ${blue})`;
    circle(ctx, led.x, led.y, 2.65);
    ctx.fillStyle = `rgba(255, 238, 240, ${
      0.28 + intensity * 0.64
    })`;
    circle(ctx, led.x - 0.45, led.y - 0.55, 1.05);
  }
}

function generateLedGif(text) {
  const safeText = prepareText(text);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  const basePanel = createBasePanel();
  const state = createAnimationState(safeText);
  const gif = GIFEncoder();
  const palette = createPalette();

  for (
    let frameIndex = 0;
    frameIndex < state.frameCount;
    frameIndex += 1
  ) {
    drawFrame(context, basePanel, state, safeText, frameIndex);
    const rgba = context.getImageData(0, 0, WIDTH, HEIGHT).data;
    const indexed = applyPalette(rgba, palette, 'rgb565');

    gif.writeFrame(indexed, WIDTH, HEIGHT, {
      palette: frameIndex === 0 ? palette : undefined,
      delay: 70,
      repeat: 0,
      dispose: 1,
    });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

function generateLedGifInWorker(text) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { text },
    });
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      worker.terminate().catch(() => null);
      finish(() => {
        reject(new Error(`${emojiler.uyari} **GIF oluşturma işlemi zamanaşımına uğradı.**`));
      });
    }, WORKER_TIMEOUT);

    worker.once('message', (result) => {
      finish(() => {
        if (result?.error) {
          reject(new Error(result.error));
          return;
        }

        resolve(Buffer.from(result));
      });
    });

    worker.once('error', (error) => {
      finish(() => reject(error));
    });

    worker.once('exit', (code) => {
      if (settled) return;

      finish(() => {
        const message =
          code === 0
            ? `${emojiler.glitchwarning} GIF worker yanıt vermeden kapandı.`
            : `${emojiler.glitchwarning} GIF worker beklenmedik şekilde kapandı ( ${code} ).`;
        reject(new Error(message));
      });
    });
  });
}

function readFromCache(text) {
  const cached = gifCache.get(text);

  if (!cached) {
    return null;
  }

  gifCache.delete(text);
  gifCache.set(text, cached);
  return cached;
}

function writeToCache(text, gif) {
  gifCache.set(text, gif);

  if (gifCache.size > MAX_CACHE_ITEMS) {
    const oldestKey = gifCache.keys().next().value;
    gifCache.delete(oldestKey);
  }
}

if (!isMainThread) {
  try {
    const gif = generateLedGif(workerData.text);
    parentPort.postMessage(gif);
  } catch (error) {
    parentPort.postMessage({
      error:
        error instanceof Error
          ? error.message
          : `${emojiler.uyari} LED pano oluşturulamadı.`,
    });
  }
} else {
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('led-yazı')
      .setDescription('Yazıyı LED tabelada gösterir.')
      .addStringOption((option) =>
        option
          .setName('metin')
          .setDescription('LED tabelada gözükecek yazı.')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(60),
      ),

    async execute(interaction) {
      await interaction.deferReply();

      try {
        const text = prepareText(
          interaction.options.getString('metin', true),
        );
        let gif = readFromCache(text);

        if (!gif) {
          gif = await generateLedGifInWorker(text);
          writeToCache(text, gif);
        }

        const attachment = new AttachmentBuilder(gif, {
          name: 'led-tabela.gif',
        });

        await interaction.editReply({
          files: [attachment],
        });
      } catch (error) {
        console.error('🔴 [LED YAZI] LED tabela oluşturma hatası:', error);

        const message =
          error instanceof Error
            ? error.message
            : 'Bilinmeyen bir hata oluştu.';

        await interaction.editReply({
          content: `${emojiler.uyari} **LED tabela oluşturulamadı.** ${message}`,
          files: [],
        });
      }
    },

    generateLedGif,
    generateLedGifInWorker,
    prepareText,
  };
}