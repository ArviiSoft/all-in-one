'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { fetchImageBuffer } = require('../Account/accountCardRenderer');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE = 2;
const MAX_QUEUED = 6;
const WORKER_TIMEOUT_MS = 25_000;
const QUEUE_TIMEOUT_MS = 40_000;
let active = 0;
const queue = [];

function boundedJob(callback) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      Promise.resolve().then(callback).then(resolve, reject).finally(() => {
        active -= 1;
        queue.shift()?.run();
      });
    };
    if (active < MAX_ACTIVE) return run();
    if (queue.length >= MAX_QUEUED) {
      return reject(Object.assign(new Error('Seviye kartı oluşturucu meşgul, biraz sonra tekrar dene.'), { code: 'LEVEL_RENDER_BUSY' }));
    }
    const queued = {
      run() { clearTimeout(timer); run(); },
    };
    const timer = setTimeout(() => {
      const index = queue.indexOf(queued);
      if (index >= 0) queue.splice(index, 1);
      reject(Object.assign(new Error('Seviye kartı sırası zaman aşımına uğradı.'), { code: 'LEVEL_RENDER_TIMEOUT' }));
    }, QUEUE_TIMEOUT_MS);
    queue.push(queued);
  });
}

function text(value, length = 128) {
  // eslint-disable-next-line no-control-regex -- Kart metnindeki ASCII kontrol karakterleri bilerek boşlukla değiştirilir.
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, length);
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Number(value))) : fallback;
}

function normalizeEntry(model = {}) {
  const requiredXp = Math.max(1, number(model.requiredXp, 300));
  const currentXp = number(model.currentXp);
  return {
    userId: text(model.userId, 24), displayName: text(model.displayName || model.username || 'Kullanıcı'),
    username: text(model.username, 64), level: Math.floor(number(model.level)), rank: Math.floor(number(model.rank)),
    totalXp: Math.floor(number(model.totalXp)), currentXp: Math.floor(currentXp), requiredXp: Math.floor(requiredXp),
    progress: Math.min(1, number(model.progress, currentXp / requiredXp)), status: text(model.status, 16),
  };
}

async function sourceBuffer(source, fetchImpl) {
  if (Buffer.isBuffer(source) || source instanceof Uint8Array) {
    return source.byteLength <= MAX_IMAGE_BYTES ? Buffer.from(source) : null;
  }
  return typeof source === 'string' ? fetchImageBuffer(source, fetchImpl) : null;
}

async function cardAssets(model, options) {
  const assets = options.assets || {};
  const keys = ['avatar', 'banner', 'decoration', 'badge'];
  const sources = [
    assets.avatar ?? model.avatarBuffer ?? model.avatarURL,
    assets.banner ?? model.bannerBuffer ?? model.bannerURL,
    assets.decoration ?? model.decorationBuffer ?? model.decorationURL,
    assets.badge ?? model.primaryGuild?.badgeBuffer ?? model.primaryGuild?.badgeURL,
  ];
  const results = await Promise.all(sources.map(source => sourceBuffer(source, options.fetchImpl)));
  return Object.fromEntries(keys.map((key, index) => [key, results[index]]));
}

function workerJob(type, model, assets, options) {
  return new Promise((resolve, reject) => {
    let preview = null;
    let settled = false;
    const worker = new Worker(path.join(__dirname, 'levelRenderWorker.js'), {
      workerData: { type, model, assets, options },
      resourceLimits: { maxOldGenerationSizeMb: 160, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error && preview) {
        return resolve({ buffer: Buffer.from(preview), name: 'seviye.png', animated: false,
          fallbackReason: error.code || 'ANIMATION_FAILED' });
      }
      if (error) return reject(error);
      const buffer = Buffer.from(result.buffer);
      if (buffer.length > MAX_OUTPUT_BYTES) {
        if (preview) {
          return resolve({ buffer: Buffer.from(preview), name: 'seviye.png', animated: false,
            fallbackReason: 'ANIMATION_SIZE_LIMIT' });
        }
        return reject(new Error('Seviye kartı dosya boyutu sınırını aştı.'));
      }
      resolve({ ...result, buffer });
    };
    const timer = setTimeout(() => finish(Object.assign(new Error('Kart oluşturma zaman aşımı.'), { code: 'ANIMATION_TIMEOUT' })), WORKER_TIMEOUT_MS);
    worker.on('message', message => {
      if (message.preview) preview = message.preview;
      else if (message.error) finish(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else finish(null, message.result);
    });
    worker.once('error', error => finish(error));
    worker.once('exit', code => {
      if (!settled) finish(new Error(`Kart oluşturucu beklenmedik biçimde kapandı (${code}).`));
    });
  });
}

async function renderLevelCard(model = {}, options = {}) {
  return boundedJob(async () => {
    const normalized = normalizeEntry(model);
    normalized.primaryGuild = model.primaryGuild?.tag ? { tag: text(model.primaryGuild.tag, 16) } : null;
    const assets = await cardAssets(model, options);
    return workerJob('card', normalized, assets, {
      maxFrames: Math.max(2, Math.min(48, Math.floor(number(options.maxFrames, 36)))),
      maxOutputBytes: Math.min(MAX_OUTPUT_BYTES, Math.max(1024, number(options.maxOutputBytes, MAX_OUTPUT_BYTES))),
    });
  });
}

async function renderLeaderboard(model = {}, options = {}) {
  return boundedJob(async () => {
    const entries = (Array.isArray(model.entries) ? model.entries : []).slice(0, 10);
    const assets = options.assets || {};
    const avatars = await Promise.all(entries.map(entry => sourceBuffer(
      assets.avatarsById?.[entry.userId] ?? entry.avatarBuffer ?? entry.avatarURL, options.fetchImpl)));
    const guildIcon = await sourceBuffer(assets.guildIcon ?? model.guildIconBuffer ?? model.guildIconURL, options.fetchImpl);
    return workerJob('leaderboard', {
      guildName: text(model.guildName || 'Sunucu'), entries: entries.map(normalizeEntry),
      page: Math.max(1, Math.floor(number(model.page, 1))), pages: Math.max(1, Math.floor(number(model.pages, 1))),
      total: Math.floor(number(model.total, entries.length)), viewerId: text(model.viewerId, 24),
    }, { avatars, guildIcon }, {});
  });
}

module.exports = { renderLevelCard, renderLeaderboard, MAX_OUTPUT_BYTES };
