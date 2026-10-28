const fs = require('../Core/databaseFs');
const path = require('path');
const { fetchPublicFeed, getFeedImageUrl } = require('./publicRss');
const { createJsonStore } = require('../Core/safeJsonStore');
const { createNewsThreadWorker } = require('./haberThread');

const dataPath = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/haberSistemi.json');
const store = createJsonStore(dataPath);

function normalizeId(item) {
  if (!item) return '';
  const raw = (item.guid || item.link || '').toString();
  return raw
    .split('?')[0]   
    .split('#')[0] 
    .trim()
    .toLowerCase();
}

module.exports = async (client) => {
  const threadWorker = createNewsThreadWorker(client, store);
  setInterval(() => {
    threadWorker.retryPending().catch(error => console.error('🔴 [HABER ALT BAŞLIK] Kontrol hatası:', error));
  }, 60_000);
  let checking = false;
  setInterval(async () => {
    if (checking || !fs.existsSync(dataPath)) return;
    checking = true;
    try {
      const data = store.loadData();

      for (const guildId of Object.keys(data)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const ayar = data[guild.id];
        if (!ayar || ayar.enabled === false || !ayar.kanal || !ayar.url) continue;
        const kanal = await guild.channels.fetch(ayar.kanal).catch(() => null);
        if (!kanal) continue;
        if (kanal.type !== 0 && kanal.type !== 5) continue;

        const rolTag = ayar.rol ? `<@&${ayar.rol}>` : '';

        let feed;
        try {
          feed = await fetchPublicFeed(ayar.url);
        } catch (err) {
          console.error(`🔴 [HABER KONTROL] ( ${guild.name} ) Haber verisi alınamadı: ${err.message}`);
          continue;
        }

        const eskiIdler = (ayar.sonHaberler || []).map(x => normalizeId({ link: x }));
        const yeniHaberler = feed.items.filter(item => {
          const id = normalizeId(item);
          return id && !eskiIdler.includes(id);
        });

        if (!yeniHaberler.length) continue;

        for (const haber of yeniHaberler.slice(0, 1)) {
          const description = haber.contentSnippet || haber.content || 'Detay yok';
          const uzunMu = description.length > 500;
          const trimmed = uzunMu ? description.slice(0, 500) + '...' : description;
          const image = getFeedImageUrl(haber);

          const embed = {
            color: 0x575757,
            title: haber.title,
            description: `${trimmed}\n\n[**__\`[𝙷𝙰𝙱𝙴𝚁𝙸̇𝙽 𝚃𝙰𝙼𝙰𝙼𝙸𝙽𝙸 𝙾𝙺𝚄]\`__**](${haber.link})`,
            image: image ? { url: image } : undefined,
          };

          const msg = await kanal.send({ content: rolTag, embeds: [embed], allowedMentions: { parse: [], roles: ayar.rol ? [ayar.rol] : [] } }).catch(error => {
            console.error(`🔴 [HABER KONTROL] (${guild.name}) Haber gönderilemedi:`, error);
            return null;
          });
          if (!msg) continue;

          const id = normalizeId(haber);
          const threadTask = { messageId: msg.id, channelId: kanal.id, title: haber.title, nextAttemptAt: 0 };
          ayar.sonHaberler = ayar.sonHaberler || [];
          if (!ayar.sonHaberler.includes(id)) ayar.sonHaberler.push(id);
          store.update(current => {
            const config = current[guildId];
            if (!config || config.url !== ayar.url) return;
            config.sonHaberler = [...new Set([...(config.sonHaberler || []), id])].slice(-1000);
            if (config.threads !== false && config.enabled !== false) {
              config.pendingThreads ||= {};
              config.pendingThreads[msg.id] = threadTask;
            }
          });
          await threadWorker.run(guildId, threadTask, kanal);
        }
      }
    } catch (error) {
      console.error('🔴 [HABER KONTROL] Kontrol hatası:', error);
    } finally {
      checking = false;
    }
  }, 600000); 
};
