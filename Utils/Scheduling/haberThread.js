'use strict';

const { setTimeout: delay } = require('node:timers/promises');

function threadName(title) {
  return String(title || '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Haber hakkında konuş';
}

function createNewsThreadWorker(client, store) {
  const running = new Set();
  let checking = false;

  function finish(guildId, messageId) {
    store.update(data => {
      const pending = data[guildId]?.pendingThreads;
      if (pending) delete pending[messageId];
    });
  }

  async function run(guildId, task, channel) {
    if (running.has(task.messageId)) return;
    running.add(task.messageId);
    try {
      let lastError;
      for (const waitMs of [0, 1000, 3000]) {
        if (waitMs) await delay(waitMs);
        const config = store.get(guildId);
        if (!config || config.enabled === false || config.threads === false
          || !config.pendingThreads?.[task.messageId]) return;

        try {
          if (!channel) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return;
            channel = await guild.channels.fetch(task.channelId);
          }
          if (!channel) throw Object.assign(new Error('Haber kanalı bulunamadı.'), { code: 10003 });
          if (!channel.threads || typeof channel.threads.create !== 'function') {
            throw Object.assign(new Error('Haber kanalı alt başlık desteklemiyor.'), { code: 10003 });
          }
          if (!channel.threads.cache.has(task.messageId)) {
            await channel.threads.create({
              name: threadName(task.title),
              startMessage: task.messageId,
              autoArchiveDuration: 60,
              reason: 'Haber için otomatik alt başlık',
            });
          }
          finish(guildId, task.messageId);
          return;
        } catch (error) {
          const code = Number(error.code);
          if (code === 160004) {
            finish(guildId, task.messageId);
            return;
          }
          if (code === 10003 || code === 10008) {
            finish(guildId, task.messageId);
            console.warn(`🟡 [HABER ALT BAŞLIK] Kanal/mesaj artık mevcut değil: ${task.channelId}/${task.messageId} (${code})`);
            return;
          }
          lastError = error;
          if ([400, 403, 429].includes(error.status) || code === 50001 || code === 50013) break;
        }
      }

      const code = Number(lastError?.code);
      const permissionError = lastError?.status === 403 || code === 50001 || code === 50013;
      const rateLimitMs = Number(lastError?.rawError?.retry_after || lastError?.retry_after || 0) * 1000;
      const retryMs = Math.max(permissionError ? 5 * 60_000 : 60_000, rateLimitMs || 0);
      store.update(data => {
        const pending = data[guildId]?.pendingThreads?.[task.messageId];
        if (pending) pending.nextAttemptAt = Date.now() + retryMs;
      });
      console.error(
        `🔴 [HABER ALT BAŞLIK] Sunucu=${guildId} kanal=${task.channelId} mesaj=${task.messageId} `
        + `kod=${lastError?.code || lastError?.status || 'bilinmiyor'}: ${lastError?.message}. `
        + (permissionError ? 'Botun kanalı görme ve herkese açık alt başlık oluşturma izinlerini kontrol edin. ' : '')
        + `${retryMs / 1000} saniye sonra tekrar denenecek.`
      );
    } finally {
      running.delete(task.messageId);
    }
  }

  async function retryPending() {
    if (checking) return;
    checking = true;
    try {
      for (const [guildId, config] of Object.entries(store.loadData())) {
        if (!config || config.enabled === false || config.threads === false || !client.guilds.cache.has(guildId)) continue;
        for (const task of Object.values(config.pendingThreads || {})) {
          if (task.nextAttemptAt > Date.now()) continue;
          try {
            await run(guildId, task);
          } catch (error) {
            console.error(`🔴 [HABER ALT BAŞLIK] Bekleyen iş işlenemedi (${guildId}/${task.messageId}):`, error);
          }
        }
      }
    } finally {
      checking = false;
    }
  }

  return { run, retryPending };
}

module.exports = { createNewsThreadWorker };
