const fs = require("../Core/databaseFs");
const path = require("path");
const request = require("request");
const { parseStringPromise } = require("xml2js");
const { WebhookClient } = require("discord.js");
const store = require("./aboneStore");

const legacyConfigPath = path.join(__dirname, "../../Database/Bildirimler ve Sosyal Medya/youtubeAlert.json");
const watchedVideosPath = path.join(__dirname, "../../Database/Bildirimler ve Sosyal Medya/izlenenVideolar.json");
const startedClients = new WeakSet();

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeWatched(data) {
  fs.writeFileSync(watchedVideosPath, JSON.stringify(data, null, 2), "utf8");
}

function fetchFeed(channelId) {
  return new Promise(resolve => {
    request({
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      timeout: 20_000,
    }, (error, response, body) => {
      if (error || response?.statusCode !== 200 || !body) return resolve(null);
      resolve(body);
    });
  });
}

function parseEntry(entry) {
  if (!entry) return null;
  const videoId = entry["yt:videoId"]?.[0];
  const link = entry.link?.[0]?.$?.href;
  if (!videoId || !link) return null;
  return {
    videoId,
    link,
    title: entry.title?.[0] || "Yeni video",
    author: entry.author?.[0]?.name?.[0] || "YouTube",
    published: entry.published?.[0] || null,
  };
}

async function fetchLatestVideoForChannels(channelIds) {
  const videos = [];
  for (const channelId of channelIds || []) {
    try {
      const body = await fetchFeed(channelId);
      if (!body) continue;
      const parsed = await parseStringPromise(body);
      const video = parseEntry(parsed?.feed?.entry?.[0]);
      if (video) videos.push(video);
    } catch (error) {
      console.warn(`⚠️ [YOUTUBE ALERT] ${channelId} son videosu alınamadı:`, error.message || error);
    }
  }

  return videos.sort((a, b) => {
    const aPublished = Date.parse(a.published || 0) || 0;
    const bPublished = Date.parse(b.published || 0) || 0;
    return bPublished - aPublished;
  })[0] || null;
}

function renderVideoText(template, video, roleId) {
  const variables = {
    "{kanal}": video.author,
    "{video_baslik}": video.title,
    "{video_link}": video.link,
    "{rol}": roleId ? `<@&${roleId}>` : "",
  };
  let content = String(template || store.DEFAULT_VIDEO_TEXT);
  for (const [variable, value] of Object.entries(variables)) {
    content = content.split(variable).join(value);
  }
  return content.slice(0, 2000);
}

function configsToCheck() {
  const rawSettings = store.readSetup();
  const configs = Object.entries(store.getAllGuildSettings()).map(([guildId, setting]) => ({
    scopeId: guildId,
    guildId,
    roleId: Object.hasOwn(rawSettings[guildId]?.youtube || {}, 'bildirimRol') ? setting.youtube.bildirimRol : setting.rol,
    active: setting.youtube.aktif,
    webhookUrl: setting.youtube.webhookUrl,
    webhookName: setting.youtube.webhookName,
    webhookAvatar: setting.youtube.webhookAvatar,
    videoText: setting.youtube.videoMetni,
    channels: setting.youtube.kaynakKanallar,
  }));

  const legacy = readJson(legacyConfigPath);
  if (legacy.aktif && legacy.webhook && Array.isArray(legacy.kanallar) && legacy.kanallar.length) {
    configs.push({
      scopeId: "legacy",
      guildId: null,
      roleId: legacy.rol || null,
      active: true,
      webhookUrl: legacy.webhook,
      webhookName: legacy.webhookName || null,
      webhookAvatar: legacy.webhookAvatar || null,
      videoText: legacy.videoMetni || store.DEFAULT_VIDEO_TEXT,
      channels: legacy.kanallar,
    });
  }
  return configs;
}

async function rememberLatestVideo(config, video) {
  if (!config.guildId) return;
  store.updateGuildSetting(config.guildId, draft => {
    const currentPublished = Date.parse(draft.youtube.sonVideoPublished || 0) || 0;
    const nextPublished = Date.parse(video.published || 0) || 0;
    if (draft.youtube.sonVideoId && currentPublished > nextPublished) return;
    draft.youtube.sonVideoId = video.videoId;
    draft.youtube.sonVideoUrl = video.link;
    draft.youtube.sonVideoBaslik = video.title;
    draft.youtube.sonVideoKanal = video.author;
    draft.youtube.sonVideoPublished = video.published;
  });
}

async function sendVideo(webhookUrl, config, video) {
  const webhook = new WebhookClient({ url: webhookUrl });
  try {
    await webhook.send({
      content: renderVideoText(config.videoText, video, config.roleId),
      username: config.webhookName || undefined,
      avatarURL: config.webhookAvatar || undefined,
      allowedMentions: {
        parse: [],
        roles: config.roleId ? [config.roleId] : [],
      },
    });
  } finally {
    webhook.destroy();
  }
}

async function checkYoutubeFeeds() {
  const watched = readJson(watchedVideosPath);
  let watchedChanged = false;

  for (const config of configsToCheck()) {
    if (!config.active || !config.webhookUrl || !config.channels.length) continue;

    for (const channelId of config.channels) {
      try {
        const body = await fetchFeed(channelId);
        if (!body) continue;
        const parsed = await parseStringPromise(body);
        const video = parseEntry(parsed?.feed?.entry?.[0]);
        if (!video) continue;

        await rememberLatestVideo(config, video);
        const watchKey = `${config.scopeId}:${video.videoId}`;
        if (watched[watchKey] || watched[video.videoId]) continue;

        await sendVideo(config.webhookUrl, config, video);
        watched[watchKey] = {
          channelId,
          published: video.published,
          sentAt: new Date().toISOString(),
        };
        watchedChanged = true;
        console.log(`🔴 [YOUTUBE ALERT] ${video.title} bildirimi gönderildi.`);
      } catch (error) {
        console.error(`🔴 [YOUTUBE ALERT] ${channelId} kontrol edilemedi:`, error.message || error);
      }
    }
  }

  if (watchedChanged) writeWatched(watched);
}

module.exports = async client => {
  if (startedClients.has(client)) return;
  startedClients.add(client);
  console.log("▶️ [YOUTUBE ALERT] Video bildirim kontrolü başlatıldı.");

  const initialTimer = setTimeout(() => {
    checkYoutubeFeeds().catch(error => console.error("🔴 [YOUTUBE ALERT]", error));
  }, 5_000);
  initialTimer.unref?.();

  const timer = setInterval(() => {
    checkYoutubeFeeds().catch(error => console.error("🔴 [YOUTUBE ALERT]", error));
  }, 60_000);
  timer.unref?.();
};

module.exports.checkYoutubeFeeds = checkYoutubeFeeds;
module.exports.fetchLatestVideoForChannels = fetchLatestVideoForChannels;
module.exports.renderVideoText = renderVideoText;
module.exports.configsToCheck = configsToCheck;