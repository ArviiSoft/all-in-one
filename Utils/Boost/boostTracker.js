const { createHash } = require("node:crypto");
const { createBoostStore } = require("./boostStore");
const { DEFAULT_THANKS, getSystemBoostSource, isBoostSystemMessage, normalizeThanksConfig } = require("./boostConfig");

const trackers = new WeakMap();

function startedAtOf(member) {
  const value = member?.premiumSinceTimestamp ?? member?.premiumSince?.getTime?.();
  return Number.isFinite(value) && value > 0 ? value : null;
}

function deterministicNonce(guildId, userId, startedAt, level) {
  return createHash("sha256").update(`${guildId}:${userId}:${startedAt}:${level}`).digest("hex").slice(0, 24);
}

function createBoostTracker(client, options = {}) {
  const store = options.store || createBoostStore();
  const now = options.now || Date.now;
  const logger = options.logger || console;
  const getLevel = options.getLevel || ((startedAt, timestamp) => require("./boostTime").getProgression(startedAt, timestamp)?.level || 0);
  const payloadFactory = options.payloadFactory || ((...args) => require("./boostView").buildPromotionPayload(...args));
  const thanksPayloadFactory = options.thanksPayloadFactory || ((...args) => require("./boostView").buildThankPayload(...args));
  const reactionEmoji = options.reactionEmoji || ((level) => require("./boostEmojis").getBadgeEmoji(client, level)?.id || "💎");
  const guildQueues = new Map();
  const reconciled = new Set();
  let scanPromise = null;
  let timer = null;

  function warn(context, error) {
    logger.warn?.(`⚠️ [BOOST] ${context}: ${error?.message || error}`);
  }

  function serial(guildId, operation) {
    const previous = guildQueues.get(guildId) || Promise.resolve();
    const result = previous.catch(() => {}).then(operation);
    guildQueues.set(guildId, result);
    result.finally(() => {
      if (guildQueues.get(guildId) === result) guildQueues.delete(guildId);
    }).catch(() => {});
    return result;
  }

  function getConfig(guildId) {
    const state = store.get(String(guildId));
    return { enabled: state?.enabled === true, channelId: state?.channelId || null };
  }

  function getSettings(guildId) {
    const state = store.get(String(guildId));
    return {
      level: getConfig(guildId),
      thanks: normalizeThanksConfig(state?.thanks || DEFAULT_THANKS),
      memberCount: Object.keys(state?.members || {}).length,
      updatedAt: state?.updatedAt || null,
    };
  }

  function baselineMember(member, previous, timestamp, preserveProgress = true) {
    const startedAt = startedAtOf(member);
    if (!startedAt) return null;
    const level = getLevel(startedAt, timestamp);
    const sameStreak = previous?.startedAt === startedAt;
    return {
      startedAt,
      lastNotifiedLevel: sameStreak && preserveProgress && Number.isInteger(previous.lastNotifiedLevel)
        ? previous.lastNotifiedLevel
        : level,
    };
  }

  function reconcileMembers(members, previous, timestamp, preserveProgress = true) {
    const records = {};
    for (const member of members.values()) {
      const record = baselineMember(member, previous?.[member.id], timestamp, preserveProgress);
      if (record) records[member.id] = record;
    }
    return records;
  }

  function configure(guild, channel) {
    return serial(guild.id, async () => {
      if (!channel || channel.guild?.id !== guild.id || typeof channel.send !== "function") {
        throw new Error("Boost bildirimleri için bu sunucudaki bir metin kanalı seçmelisin.");
      }
      const members = await guild.members.fetch();
      const previous = store.get(guild.id);
      const timestamp = now();
      const state = {
        ...previous,
        enabled: true,
        channelId: channel.id,
        members: reconcileMembers(members, previous?.members, timestamp, previous?.enabled === true),
        thanks: { ...previous?.thanks, ...normalizeThanksConfig(previous?.thanks || DEFAULT_THANKS) },
        updatedAt: timestamp,
      };
      store.set(guild.id, state);
      reconciled.add(guild.id);
      return getConfig(guild.id);
    });
  }

  function disable(guildId) {
    guildId = String(guildId);
    return serial(guildId, () => {
      const previous = store.get(guildId);
      if (previous) store.set(guildId, { ...previous, enabled: false, updatedAt: now() });
      reconciled.delete(guildId);
      return getConfig(guildId);
    });
  }

  function setLevelChannel(guildId, channelId) {
    return serial(String(guildId), () => {
      const previous = store.get(String(guildId)) || {};
      store.set(String(guildId), { ...previous, channelId: channelId || null, updatedAt: now() });
      return getConfig(guildId);
    });
  }

  function setThanksChannel(guild, channel) {
    return serial(guild.id, () => {
      if (!channel || channel.guild?.id !== guild.id || typeof channel.send !== "function") {
        throw new Error("Boost teşekkür mesajları için bu sunucudaki bir metin kanalı seçmelisin.");
      }
      const previous = store.get(guild.id) || {};
      const thanks = normalizeThanksConfig({ ...(previous.thanks || DEFAULT_THANKS), channelId: channel.id, enabled: true });
      store.set(guild.id, {
        ...previous,
        enabled: previous.enabled === true,
        channelId: previous.channelId || null,
        members: previous.members || {},
        thanks: { ...previous.thanks, ...thanks },
        updatedAt: now(),
      });
      return getSettings(guild.id);
    });
  }

  function setThanksEnabled(guildId, enabled) {
    guildId = String(guildId);
    return serial(guildId, () => {
      const previous = store.get(guildId) || {};
      const current = normalizeThanksConfig(previous.thanks || DEFAULT_THANKS);
      if (enabled && !current.channelId) throw new Error("Teşekkür mesajını açmadan önce bir teşekkür kanalı seçmelisin.");
      store.set(guildId, {
        ...previous,
        enabled: previous.enabled === true,
        channelId: previous.channelId || null,
        members: previous.members || {},
        thanks: { ...previous.thanks, ...normalizeThanksConfig({ ...current, enabled }) },
        updatedAt: now(),
      });
      return getSettings(guildId);
    });
  }

  function setThanksMessage(guildId, updates) {
    guildId = String(guildId);
    return serial(guildId, () => {
      const previous = store.get(guildId) || {};
      const current = normalizeThanksConfig(previous.thanks || DEFAULT_THANKS);
      store.set(guildId, {
        ...previous,
        enabled: previous.enabled === true,
        channelId: previous.channelId || null,
        members: previous.members || {},
        thanks: { ...previous.thanks, ...normalizeThanksConfig({ ...current, ...updates }) },
        updatedAt: now(),
      });
      return getSettings(guildId);
    });
  }

  async function sendBoostThanks(member, options = {}) {
    const state = store.get(member.guild.id);
    const thanks = normalizeThanksConfig({ ...(state?.thanks || DEFAULT_THANKS), ...(options.thanks || {}) });
    if (!options.force && !thanks.enabled) return null;
    if (!thanks.channelId) throw new Error("Boost teşekkür kanalı ayarlı değil.");
    const channel = await member.guild.channels.fetch(thanks.channelId);
    if (!channel || typeof channel.send !== "function") throw new Error("Boost teşekkür kanalı bulunamadı veya mesaj gönderilemiyor.");
    const payload = await thanksPayloadFactory(member, thanks, now());
    return channel.send({
      ...payload,
      allowedMentions: { parse: [], users: [member.id], repliedUser: false },
    });
  }

  function saveBaselineIfTracked(member, previousState = null) {
    const state = previousState || store.get(member.guild.id);
    if (!state?.enabled) return;
    saveMember(member.guild.id, member.id, baselineMember(member, state.members?.[member.id], now()));
  }

  function saveMember(guildId, userId, record) {
    store.update((data) => {
      const state = data[guildId];
      if (!state) return;
      state.members ||= {};
      if (record) state.members[userId] = record;
      else delete state.members[userId];
      state.updatedAt = now();
    });
  }

  async function getFreshMember(guild, userId) {
    try {
      return await guild.members.fetch({ user: userId, force: true, cache: true });
    } catch (error) {
      if (Number(error?.code) === 10007) return null;
      throw error;
    }
  }

  async function scanGuild(guildId) {
    let state = store.get(guildId);
    if (!state?.enabled) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild || guild.available === false) return;

    if (!reconciled.has(guildId)) {
      const members = await guild.members.fetch();
      state = { ...state, members: reconcileMembers(members, state.members, now()), updatedAt: now() };
      store.set(guildId, state);
      reconciled.add(guildId);
    }

    let channel;
    for (const [userId, record] of Object.entries(state.members || {})) {
      if (getLevel(record.startedAt, now()) <= record.lastNotifiedLevel) continue;

      try {
        const member = await getFreshMember(guild, userId);
        const startedAt = startedAtOf(member);
        if (!startedAt) {
          saveMember(guildId, userId, null);
          continue;
        }
        if (startedAt !== record.startedAt) {
          saveMember(guildId, userId, baselineMember(member, null, now()));
          continue;
        }

        const targetLevel = getLevel(startedAt, now());
        if (targetLevel <= record.lastNotifiedLevel) continue;
        if (!channel) channel = await guild.channels.fetch(state.channelId);
        if (!channel || typeof channel.send !== "function") continue;

        const payload = await payloadFactory(member, record.lastNotifiedLevel, targetLevel, now());
        const sent = await channel.send({
          ...payload,
          nonce: deterministicNonce(guildId, userId, startedAt, targetLevel),
          enforceNonce: true,
          allowedMentions: { parse: [], users: [userId], repliedUser: false },
        });
        saveMember(guildId, userId, { startedAt, lastNotifiedLevel: targetLevel });
        try {
          await sent.react(reactionEmoji(targetLevel));
          await sent.react("🎉");
        } catch (error) {
          warn(`${guildId}/${userId} bildirim tepkisi eklenemedi`, error);
        }
      } catch (error) {
        warn(`${guildId}/${userId} bildirimi ertelendi`, error);
      }
    }
  }

  function scan() {
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const guildIds = Object.entries(store.loadData()).filter(([, state]) => state?.enabled).map(([id]) => id);
      for (const guildId of guildIds) {
        try {
          await serial(guildId, () => scanGuild(guildId));
        } catch (error) {
          warn(`${guildId} taraması ertelendi`, error);
        }
      }
    })().finally(() => { scanPromise = null; });
    return scanPromise;
  }

  async function initialize() {
    if (!timer) {
      timer = setInterval(() => { scan().catch((error) => warn("Tarama çalıştırılamadı", error)); }, options.intervalMs || 60_000);
      timer.unref?.();
    }
    await scan();
  }

  async function reconcile(guildId) {
    const guildIds = guildId === undefined
      ? Object.entries(store.loadData()).filter(([, state]) => state?.enabled).map(([id]) => id)
      : [String(guildId)];
    for (const id of guildIds) {
      if (!getConfig(id).enabled) continue;
      try {
        await serial(id, async () => {
          reconciled.delete(id);
          await scanGuild(id);
        });
      } catch (error) {
        warn(`${id} yeniden eşitlenemedi`, error);
      }
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function onMemberUpdate(oldMember, member) {
    const oldStartedAt = startedAtOf(oldMember);
    const newStartedAt = startedAtOf(member);
    if (!member?.guild || oldStartedAt === newStartedAt) return Promise.resolve();
    return serial(member.guild.id, async () => {
      const state = store.get(member.guild.id);
      if (!state?.enabled) return;
      const fresh = member.partial ? await getFreshMember(member.guild, member.id) : member;
      saveMember(member.guild.id, member.id, baselineMember(fresh, state.members?.[member.id], now()));
    });
  }

  function onMessageCreate(message) {
    if (!message?.guild || !message.guildId || !isBoostSystemMessage(message)) return Promise.resolve();
    const guild = message.guild;
    return serial(guild.id, async () => {
      const state = store.get(guild.id);
      const thanks = normalizeThanksConfig(state?.thanks || DEFAULT_THANKS);
      if (!thanks.enabled) return;
      const source = getSystemBoostSource(guild);
      if (!source.active || message.channelId !== source.channelId) return;

      const userId = message.author?.id || message.member?.id;
      if (!userId) return;
      const member = message.member && !message.member.partial
        ? message.member
        : await getFreshMember(guild, userId);
      if (!member || !startedAtOf(member)) return;

      try {
        await sendBoostThanks(member, { thanks });
      } catch (error) {
        warn(`${guild.id}/${userId} sistem mesajı teşekkür bildirimi gönderilemedi`, error);
        return;
      }
      saveBaselineIfTracked(member, state);
    });
  }

  function onMemberRemove(member) {
    if (!member?.guild) return Promise.resolve();
    return serial(member.guild.id, () => {
      if (store.get(member.guild.id)?.members?.[member.id]) saveMember(member.guild.id, member.id, null);
    });
  }

  return {
    configure,
    disable,
    getConfig,
    getSettings,
    scan,
    initialize,
    reconcile,
    stop,
    onMemberUpdate,
    onMessageCreate,
    onMemberRemove,
    sendBoostThanks,
    setThanksChannel,
    setThanksEnabled,
    setThanksMessage,
    setLevelChannel,
  };
}

function getTracker(client) {
  if (!trackers.has(client)) trackers.set(client, createBoostTracker(client));
  return trackers.get(client);
}

module.exports = { createBoostTracker, getTracker, deterministicNonce, startedAtOf };