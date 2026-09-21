const settings = require('../Core/generalSettings').settings;

const GUARD_INSTALLED = Symbol("blacklistServersGuardInstalled");

function normalizeConfig(rawSettings = {}) {
  const config = rawSettings.BlacklistServers;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      guildIds: new Set(),
      ignoreBotEvents: false,
    };
  }

  const guildIds = Array.isArray(config.SunucuIDleri)
    ? config.SunucuIDleri
        .map((id) => String(id).trim())
        .filter((id) => /^\d{17,20}$/.test(id))
    : [];

  return {
    guildIds: new Set(guildIds),
    ignoreBotEvents: config.BotOlaylariniYoksay === true,
  };
}

function getGuildId(eventName, args) {
  for (const value of args) {
    if (!value || typeof value !== "object") continue;

    let firstItem = null;
    if (typeof value.first === "function") {
      try {
        firstItem = value.first();
      } catch {
        firstItem = null;
      }
    }
    const guildId =
      value.guildId ??
      value.guild?.id ??
      value.message?.guildId ??
      value.message?.guild?.id ??
      value.channel?.guildId ??
      value.channel?.guild?.id ??
      value.member?.guild?.id ??
      firstItem?.guildId ??
      firstItem?.guild?.id ??
      firstItem?.message?.guildId ??
      firstItem?.member?.guild?.id;

    if (guildId) return String(guildId);
  }

  if (eventName === "guildCreate" || eventName === "guildDelete" || eventName === "guildUnavailable") {
    return args[0]?.id ? String(args[0].id) : null;
  }

  if (eventName === "guildUpdate") {
    const guild = args[1] || args[0];
    return guild?.id ? String(guild.id) : null;
  }

  if (eventName === "guildIntegrationsUpdate") {
    return args[0]?.id ? String(args[0].id) : null;
  }

  //guildAuditLogEntryCreate: (auditLogEntry, guild) - Not by ArviS
  if (eventName === "guildAuditLogEntryCreate") {
    return args[1]?.id ? String(args[1].id) : null;
  }

  return null;
}

function getEventUser(eventName, args, client) {
  if (eventName.startsWith("messageReaction")) {
    return args[1] || null;
  }

  if (eventName === "messageCreate" || eventName === "messageDelete" || eventName === "messageUpdate") {
    const message = eventName === "messageUpdate" ? (args[1] || args[0]) : args[0];
    return message?.author || null;
  }

  if (eventName === "messagePollVoteAdd" || eventName === "messagePollVoteRemove") {
    const user = args[1];
    return typeof user === "string" ? client?.users?.cache?.get(user) || null : user || null;
  }

  if (eventName === "interactionCreate") {
    return args[0]?.user || null;
  }

  if (eventName === "typingStart") {
    return args[0]?.user || null;
  }

  if (eventName === "voiceStateUpdate") {
    return args[1]?.member?.user || args[0]?.member?.user || null;
  }

  if (eventName === "presenceUpdate") {
    return args[1]?.user || args[0]?.user || null;
  }

  if (eventName.startsWith("guildMember")) {
    const member = eventName === "guildMemberUpdate" ? (args[1] || args[0]) : args[0];
    return member?.user || null;
  }

  if (eventName === "inviteCreate") {
    return args[0]?.inviter || null;
  }

  if (eventName === "guildAuditLogEntryCreate") {
    const entry = args[0];
    if (entry?.executorId === client?.user?.id) return client.user;
    return entry?.executor || client?.users?.cache?.get(entry?.executorId) || null;
  }

  if (eventName === "autoModerationActionExecution") {
    const execution = args[0];
    return client?.users?.cache?.get(execution?.userId) || null;
  }

  return null;
}

function shouldIgnoreEvent(eventName, args, config, client) {
  if (typeof eventName !== "string") {
    return false;
  }

  const guildId = getGuildId(eventName, args);

  if (guildId && config.guildIds.has(guildId)) {
    return true;
  }

  if (!config.ignoreBotEvents) {
    return false;
  }

  return getEventUser(eventName, args, client)?.bot === true;
}

function setupBlacklistServers(client, rawSettings = settings) {
  if (!client || typeof client.emit !== "function") {
    throw new TypeError("Blacklist koruması için geçerli bir Discord client gerekli.");
  }

  if (client[GUARD_INSTALLED]) {
    return client[GUARD_INSTALLED];
  }

  let config = normalizeConfig(rawSettings);
  const originalEmit = client.emit;

  client.emit = function guardedEmit(eventName, ...args) {
    if (shouldIgnoreEvent(eventName, args, config, client)) {
      return false;
    }

    return originalEmit.call(this, eventName, ...args);
  };

  const state = {
    guildIds: [...config.guildIds],
    ignoreBotEvents: config.ignoreBotEvents,
    update(next) {
      config = normalizeConfig(next);
      this.guildIds = [...config.guildIds];
      this.ignoreBotEvents = config.ignoreBotEvents;
    },
  };

  Object.defineProperty(client, GUARD_INSTALLED, {
    value: state,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  if (state.guildIds.length > 0 || state.ignoreBotEvents) {
    console.log(
      `🛡️ [SERVER BLACKLIST] ${state.guildIds.length} sunucu engellendi ● Olaylar: ${state.ignoreBotEvents ? "yok sayılıyor" : "işleniyor"}`
    );
  }

  return state;
}

module.exports = {
  updateBlacklistServers(client, next) { client?.[GUARD_INSTALLED]?.update(next); },
  getGuildId,
  normalizeConfig,
  setupBlacklistServers,
  shouldIgnoreEvent,
};
