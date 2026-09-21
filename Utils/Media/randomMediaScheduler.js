const fs = require("../Core/databaseFs");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const { writeJsonAtomically } = require("../Core/safeJsonStore");
const { MIN_INTERVAL_MS, MAX_TIMESTAMP_MS, isValidInterval } = require("./randomMediaDuration");

const DB_PATH = path.join(__dirname, "../../Database/Eğlence ve Etkileşim/randomMedia.json");
const CHECK_INTERVAL_MS = 15 * 1000;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_BANNER_LOOKUPS = 25;
const MEMBER_FETCH_TIMEOUT_MS = 30 * 1000;
const MEMBER_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const WARN_COOLDOWN_MS = 30 * 60 * 1000;
const memberFetchState = new Map();
const warningState = new Map();
const runningClients = new WeakSet();

function shouldWarn(key) {
  const now = Date.now();
  const last = warningState.get(key) || 0;
  if (now - last < WARN_COOLDOWN_MS) return false;
  warningState.set(key, now);
  return true;
}

function warnRandomMedia(key, message, err) {
  if (!shouldWarn(key)) return;
  console.warn(message, err?.message || err || "");
}

function ensureDB() {
  if (!fs.existsSync(DB_PATH)) {
    writeConfig({});
  }
}

function readConfig() {
  ensureDB();
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("Random medya ayarları bir nesne olmalı.");
    }
    return data;
  } catch (err) {
    throw new Error("Random medya ayarları okunamadı.", { cause: err });
  }
}

function writeConfig(data) {
  writeJsonAtomically(DB_PATH, data);
}

function setRandomMediaChannel(guildId, type, channelId, intervalMs = MIN_INTERVAL_MS) {
  const now = Date.now();
  if (!isValidInterval(intervalMs, now)) throw new RangeError("Geçersiz random medya süresi.");
  const data = readConfig();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][type] = { channelId, intervalMs, nextSendAt: now + intervalMs, revision: randomUUID() };
  writeConfig(data);
}

function clearRandomMediaChannel(guildId, type) {
  const data = readConfig();
  if (!data[guildId]) return;
  delete data[guildId][type];
  if (Object.keys(data[guildId]).length === 0) delete data[guildId];
  writeConfig(data);
}

function getGuildConfig(guildId) { return readConfig()[guildId] || {}; }

function updateGuildConfig(guildId, patch) {
  const data = readConfig();
  const guild = data[guildId] ||= {};
  const now = Date.now();
  for (const type of ['icon', 'banner']) {
    if (!patch[type]) continue;
    const next = { ...guild[type], ...patch[type] };
    if (next.channelId && !isValidInterval(next.intervalMs, now)) throw new RangeError('Geçersiz random medya süresi.');
    if (next.channelId !== guild[type]?.channelId || next.intervalMs !== guild[type]?.intervalMs) {
      next.revision = randomUUID();
      next.nextSendAt = now + (next.intervalMs || MIN_INTERVAL_MS);
    }
    guild[type] = next;
  }
  writeConfig(data);
  return guild;
}

function shuffle(values) {
  const list = [...values];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getFileExtension(url, fallback = "png") {
  const pathname = url.split("?")[0];
  const extension = path.extname(pathname).replace(".", "").toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(extension) ? extension : fallback;
}

function getPreferredImageExtension(hash) {
  return typeof hash === "string" && hash.startsWith("a_") ? "gif" : "png";
}

function getImageOptions(hash) {
  const extension = getPreferredImageExtension(hash);
  return { size: extension === "gif" ? 1024 : 4096, extension, forceStatic: false };
}

async function downloadAsAttachment(url, fileName) {
  const downloadUrl = new URL(url);
  const requestedSize = Number(downloadUrl.searchParams.get("size")) || 4096;
  const sizes = [4096, 2048, 1024, 512, 256, 128, 64, 32, 16].filter((size) => size <= requestedSize);
  let lastError;

  for (const size of sizes) {
    downloadUrl.searchParams.set("size", String(size));
    try {
      const response = await axios.get(downloadUrl.toString(), {
        responseType: "arraybuffer",
        timeout: 10_000,
        maxContentLength: MAX_ATTACHMENT_BYTES,
      });
      return new AttachmentBuilder(Buffer.from(response.data), { name: fileName });
    } catch (err) {
      lastError = err;
      const canResize = err.message?.includes("maxContentLength")
        || err.response?.status === 413
        || err.code === "ECONNABORTED";
      if (!canResize) throw err;
    }
  }

  throw lastError;
}

async function getRandomAvatar(members) {
  const candidates = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (member.avatar) {
      const url = member.avatarURL(getImageOptions(member.avatar));
      if (url) candidates.push({ member, url });
    }
    if (member.user.avatar) {
      const url = member.user.avatarURL(getImageOptions(member.user.avatar));
      if (url) candidates.push({ member, url });
    }
  }

  return shuffle(candidates)[0] || null;
}

async function getRandomBanner(client, members) {
  const candidates = shuffle(members.filter((member) => !member.user.bot).values());

  for (const member of candidates.slice(0, MAX_BANNER_LOOKUPS)) {
    const user = await client.users.fetch(member.id, { force: true }).catch(() => null);
    const url = user?.bannerURL(getImageOptions(user.banner));

    if (url) return { member, url };
  }

  return null;
}

function hasChannelPermissions(channel, botMember) {
  const permissions = channel.permissionsFor(botMember);
  return permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles,
  ]);
}

async function getMembersForMedia(guild) {
  const cachedHumans = guild.members.cache.filter((member) => !member.user.bot).size;
  const state = memberFetchState.get(guild.id) || { lastFetch: 0, running: false };
  const now = Date.now();

  if (cachedHumans > 0 && state.lastFetch > 0 && now - state.lastFetch < MEMBER_REFRESH_INTERVAL_MS) {
    return guild.members.cache;
  }

  if (state.running) return guild.members.cache;

  state.running = true;
  memberFetchState.set(guild.id, state);

  try {
    const members = await guild.members.fetch({
      withPresences: false,
      time: MEMBER_FETCH_TIMEOUT_MS,
    });
    state.lastFetch = Date.now();
    return members;
  } catch (err) {
    state.lastFetch = Date.now();
    const cachedMembers = guild.members.cache;
    const cachedHumansAfterFetch = cachedMembers.filter((member) => !member.user.bot).size;

    if (cachedHumansAfterFetch === 0) {
      warnRandomMedia(
        `members:${guild.id}`,
        `⚠️ [RANDOM MEDYA] Üye listesi alınamadı ve cache boş ( ${guild.id} ):`,
        err
      );
    }

    return guild.members.cache;
  } finally {
    state.running = false;
  }
}

function isSameSetting(current, expected) {
  return current?.revision === expected.revision
    && current?.channelId === expected.channelId
    && current?.intervalMs === expected.intervalMs
    && current?.nextSendAt === expected.nextSendAt;
}

async function sendRandomMedia(client, guildId, type, setting) {
  const { channelId } = setting;
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !hasChannelPermissions(channel, guild.members.me)) return;

  const members = await getMembersForMedia(guild);
  const picked = type === "banner"
    ? await getRandomBanner(client, members)
    : await getRandomAvatar(members);

  if (!picked?.url) return;

  const label = type === "banner" ? "Banner'a Git" : "Avatar'a Git";
  const filePrefix = type === "banner" ? "banner" : "avatar";
  const extension = getFileExtension(picked.url);
  let attachment;

  try {
    attachment = await downloadAsAttachment(picked.url, `${filePrefix}-${picked.member.id}.${extension}`);
  } catch (err) {
    warnRandomMedia(
      `download:${guild.id}:${channel.id}:${type}`,
      `⚠️ [RANDOM ${type.toUpperCase()}] Dosya indirilemedi ( ${guild.id}/${channel.id} ):`,
      err
    );
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyle.Link)
      .setURL(picked.url)
  );

  if (!isSameSetting(readConfig()[guildId]?.[type], setting)) return false;

  try {
    await channel.send({
      files: [attachment],
      components: [row],
      allowedMentions: { parse: [] },
    });
    return true;
  } catch (err) {
    warnRandomMedia(
      `send:${guild.id}:${channel.id}:${type}`,
      `⚠️ [RANDOM ${type.toUpperCase()}] Gönderim hatası ( ${guild.id}/${channel.id} ):`,
      err
    );
    return false;
  }
}

async function runRandomMediaTick(client) {
  if (runningClients.has(client)) return;
  runningClients.add(client);
  try {
    const config = readConfig();
    const now = Date.now();
    let migrated = false;

    for (const guildConfig of Object.values(config)) {
      for (const type of ["icon", "banner"]) {
        const setting = guildConfig?.[type];
        if (!setting?.channelId) continue;
        if (!Number.isSafeInteger(setting.intervalMs) || setting.intervalMs < MIN_INTERVAL_MS
          || setting.intervalMs > MAX_TIMESTAMP_MS) {
          setting.intervalMs = MIN_INTERVAL_MS;
          setting.nextSendAt = Math.min(MAX_TIMESTAMP_MS, now + setting.intervalMs);
          migrated = true;
        }
        if (!Number.isSafeInteger(setting.nextSendAt) || setting.nextSendAt <= 0
          || setting.nextSendAt > MAX_TIMESTAMP_MS) {
          setting.nextSendAt = Math.min(MAX_TIMESTAMP_MS, now + setting.intervalMs);
          migrated = true;
        }
        if (!setting.revision) {
          setting.revision = randomUUID();
          migrated = true;
        }
      }
    }
    if (migrated) writeConfig(config);

    for (const [guildId, guildConfig] of Object.entries(config)) {
      for (const type of ["icon", "banner"]) {
        const setting = guildConfig?.[type];
        if (!setting?.channelId || setting.nextSendAt > Date.now()) continue;
        if (!isSameSetting(readConfig()[guildId]?.[type], setting)) continue;

        let sent = false;
        try {
          sent = await sendRandomMedia(client, guildId, type, setting);
        } catch (err) {
          warnRandomMedia(`job:${guildId}:${type}`, `⚠️ [RANDOM MEDYA] Gönderim hatası (${guildId}/${type}):`, err);
        }

        const latest = readConfig();
        if (!isSameSetting(latest[guildId]?.[type], setting)) continue;
        const delay = sent ? setting.intervalMs : MIN_INTERVAL_MS;
        latest[guildId][type].nextSendAt = Math.min(MAX_TIMESTAMP_MS, Date.now() + delay);
        writeConfig(latest);
      }
    }
  } finally {
    runningClients.delete(client);
  }
}

function startRandomMediaScheduler(client) {
  if (client.randomMediaSchedulerStarted) return;
  client.randomMediaSchedulerStarted = true;

  const tick = () => {
    runRandomMediaTick(client).catch((err) => {
      console.error("🔴 [RANDOM MEDYA] Zamanlayıcı hatası:", err);
    });
  };
  client.randomMediaSchedulerTimer = setInterval(tick, CHECK_INTERVAL_MS);
  client.randomMediaSchedulerTimer.unref?.();
  tick();

  console.log("🖼️ [RANDOM MEDYA] Avatar/banner zamanlayıcısı aktif.");
}

module.exports = startRandomMediaScheduler;
module.exports.setRandomMediaChannel = setRandomMediaChannel;
module.exports.clearRandomMediaChannel = clearRandomMediaChannel;
module.exports.runRandomMediaTick = runRandomMediaTick;
module.exports.getGuildConfig = getGuildConfig;
module.exports.updateGuildConfig = updateGuildConfig;