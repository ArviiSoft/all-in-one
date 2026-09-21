const fs = require("../Core/databaseFs");
const path = require("path");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { VoiceConnectionDisconnectReason, VoiceConnectionStatus, entersState, joinVoiceChannel } = require("@discordjs/voice");

const CONFIG_PATH = path.join(__dirname, "../../Database/Ses Sistemleri/sesKanali.json");
const CONNECTION_GROUP = "persistent-voice";
const READY_TIMEOUT_MS = 20_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const WARNING_COOLDOWN_MS = 5 * 60_000;
const RETRY_DELAYS_MS = [2_500, 5_000, 10_000, 20_000, 30_000];

let client = null;
let targetChannelId = null;
let targetGuildId = null;
let connection = null;
let generation = 0;
let reconnectAttempts = 0;
let retryTimer = null;
let healthTimer = null;
let voiceStateListener = null;
let lastWarningAt = 0;
let lastReadyChannelId = null;
let musicPlayer = null;

const attachedConnections = new WeakSet();
const intentionallyDestroyedConnections = new WeakSet();
const suspendedGuilds = new Set();
const musicResumeTimers = new Map();

function readConfiguredChannelId() {
  if (!fs.existsSync(CONFIG_PATH)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return typeof data.aktifSesKanali === "string" ? data.aktifSesKanali : null;
  } catch (error) {
    warn("⚠️ [SES] Ses kanalı ayarları okunamadı:", error);
    return null;
  }
}

function warn(message, error) {
  const now = Date.now();
  if (now - lastWarningAt < WARNING_COOLDOWN_MS) return;
  lastWarningAt = now;
  console.warn(message, error?.message || error || "");
}

function clearRetryTimer() {
  if (!retryTimer) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

function clearMusicResumeTimer(guildId) {
  const timer = musicResumeTimers.get(guildId);
  if (!timer) return;
  clearTimeout(timer);
  musicResumeTimers.delete(guildId);
}

function isSuspended() {
  return Boolean(targetGuildId && suspendedGuilds.has(targetGuildId));
}

function destroyConnection(currentConnection = connection) {
  if (!currentConnection) return;
  intentionallyDestroyedConnections.add(currentConnection);
  if (connection === currentConnection) connection = null;

  try {
    if (currentConnection.state.status !== VoiceConnectionStatus.Destroyed) {
      currentConnection.destroy();
    }
  } catch (error) {
    warn("⚠️ [SES] Ses bağlantısı kapatılırken hata oluştu:", error);
  }
}

function scheduleRetry(reason) {
  if (!client || !targetChannelId || isSuspended() || retryTimer) return;

  const delay = RETRY_DELAYS_MS[Math.min(reconnectAttempts, RETRY_DELAYS_MS.length - 1)];
  reconnectAttempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void ensurePersistentVoiceConnection(`yeniden deneme: ${reason}`);
  }, delay);
  retryTimer.unref?.();
}

async function resolveTargetChannel(expectedGeneration) {
  if (!client || !targetChannelId || expectedGeneration !== generation) return null;

  const channel = client.channels.cache.get(targetChannelId)
    || await client.channels.fetch(targetChannelId).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`Ayarlı ses kanalı bulunamadı: ${targetChannelId}`);
  }

  const permissions = channel.permissionsFor(client.user);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel)
    || !permissions.has(PermissionFlagsBits.Connect)) {
    throw new Error(`Botun ${channel.id} kanalını görme veya kanala bağlanma yetkisi yok`);
  }

  targetGuildId = channel.guild.id;
  return channel;
}

function attachConnectionListeners(currentConnection, expectedGeneration) {
  if (attachedConnections.has(currentConnection)) return;
  attachedConnections.add(currentConnection);

  currentConnection.on("error", error => {
    if (currentConnection !== connection) return;
    warn("⚠️ [SES] Discord.js ses bağlantısı hatası:", error);
  });

  currentConnection.on(VoiceConnectionStatus.Ready, () => {
    if (currentConnection !== connection || expectedGeneration !== generation) return;
    clearRetryTimer();
    reconnectAttempts = 0;
    lastWarningAt = 0;

    if (lastReadyChannelId !== targetChannelId) {
      lastReadyChannelId = targetChannelId;
      console.log(`🔉 [SES] Bot, (${targetChannelId}) ses kanalına bağlandı.`);
    }
  });

  currentConnection.on(VoiceConnectionStatus.Disconnected, async (_oldState, newState) => {
    if (currentConnection !== connection
      || expectedGeneration !== generation
      || intentionallyDestroyedConnections.has(currentConnection)
      || isSuspended()) return;

    if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose
      && newState.closeCode === 4014) {
      try {
        await Promise.race([
          entersState(currentConnection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(currentConnection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        return;
      } catch {
        destroyConnection(currentConnection);
        scheduleRetry("Discord ses oturumu kapandı");
        return;
      }
    }

    if (currentConnection.rejoinAttempts < 5) {
      const waitMs = Math.min((currentConnection.rejoinAttempts + 1) * 5_000, 25_000);
      const reconnectGeneration = generation;
      setTimeout(() => {
        if (currentConnection === connection
          && reconnectGeneration === generation
          && currentConnection.state.status !== VoiceConnectionStatus.Destroyed
          && !isSuspended()) {
          try {
            currentConnection.rejoin();
          } catch (error) {
            destroyConnection(currentConnection);
            warn("⚠️ [SES] Ses sunucusuna yeniden katılma isteği gönderilemedi:", error);
            scheduleRetry("yeniden katılma isteği başarısız");
          }
        }
      }, waitMs).unref?.();
      return;
    }

    destroyConnection(currentConnection);
    scheduleRetry("ses sunucusuna yeniden bağlanılamadı");
  });

  currentConnection.on(VoiceConnectionStatus.Destroyed, () => {
    if (currentConnection === connection) connection = null;
    if (intentionallyDestroyedConnections.has(currentConnection)
      || expectedGeneration !== generation
      || isSuspended()) return;
    scheduleRetry("bağlantı kapandı");
  });
}

async function ensurePersistentVoiceConnection(reason = "kontrol") {
  const expectedGeneration = generation;
  if (!client || !targetChannelId || isSuspended()) {
    return { connected: false, reason: "disabled" };
  }

  try {
    const channel = await resolveTargetChannel(expectedGeneration);
    if (!channel || expectedGeneration !== generation || isSuspended()) {
      return { connected: false, reason: "superseded" };
    }

    if (connection
      && connection.joinConfig.channelId === channel.id
      && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      if (connection.state.status !== VoiceConnectionStatus.Ready) {
        await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
      }
      return { connected: true, channelId: channel.id };
    }

    destroyConnection();
    const newConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
      group: CONNECTION_GROUP,
    });

    if (expectedGeneration !== generation || isSuspended()) {
      destroyConnection(newConnection);
      return { connected: false, reason: "superseded" };
    }

    connection = newConnection;
    attachConnectionListeners(newConnection, expectedGeneration);
    await entersState(newConnection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    return { connected: true, channelId: channel.id };
  } catch (error) {
    if (expectedGeneration !== generation || isSuspended()) {
      return { connected: false, reason: "superseded" };
    }

    destroyConnection();
    warn(`⚠️ [SES] Kalıcı ses bağlantısı kurulamadı (${reason}):`, error);
    scheduleRetry(reason);
    return { connected: false, reason: error?.message || String(error) };
  }
}

function attachVoiceStateGuard() {
  if (!client || voiceStateListener) return;

  voiceStateListener = (oldState, newState) => {
    if (newState.id !== client.user?.id
      || !targetChannelId
      || newState.guild.id !== targetGuildId
      || isSuspended()) return;

    if (!newState.channelId || newState.channelId === targetChannelId) return;

    const guardedGeneration = generation;
    setTimeout(() => {
      if (guardedGeneration !== generation || isSuspended()) return;
      const currentBotChannelId = client.guilds.cache
        .get(targetGuildId)?.members.me?.voice?.channelId;
      if (currentBotChannelId === targetChannelId) return;
      destroyConnection();
      void ensurePersistentVoiceConnection("bot ses kanalından çıkarıldı veya taşındı");
    }, 1_500).unref?.();
  };

  client.on("voiceStateUpdate", voiceStateListener);
}

function startHealthCheck() {
  if (healthTimer) return;

  healthTimer = setInterval(() => {
    if (!targetChannelId || isSuspended()) return;

    const botChannelId = targetGuildId
      ? client.guilds.cache.get(targetGuildId)?.members.me?.voice?.channelId
      : null;
    const connectionStatus = connection?.state?.status;
    const connectionInProgress = connection
      && connection.joinConfig.channelId === targetChannelId
      && [VoiceConnectionStatus.Connecting, VoiceConnectionStatus.Signalling]
        .includes(connectionStatus);
    const connectionHealthy = connection
      && connectionStatus === VoiceConnectionStatus.Ready
      && connection.joinConfig.channelId === targetChannelId;

    if (!connectionInProgress && (!connectionHealthy || botChannelId !== targetChannelId)) {
      destroyConnection();
      void ensurePersistentVoiceConnection("sağlık kontrolü");
    }
  }, HEALTH_CHECK_INTERVAL_MS);
  healthTimer.unref?.();
}

async function startPersistentVoiceConnection(discordClient) {
  client = discordClient;
  attachVoiceStateGuard();
  startHealthCheck();

  const configuredChannelId = readConfiguredChannelId();
  if (!configuredChannelId) {
    console.log("⚠️ [SES] Ses kanalı seçilmemiş, Discord.js ses bağlantısı başlatılmadı. \n");
    return { connected: false, reason: "not-configured" };
  }

  return setPersistentVoiceChannel(discordClient, configuredChannelId);
}

async function setPersistentVoiceChannel(discordClient, channelOrId) {
  client = discordClient || client;
  const channelId = typeof channelOrId === "string" ? channelOrId : channelOrId?.id;
  if (!client || !channelId) throw new TypeError("Geçerli bir Discord istemcisi ve ses kanalı gerekli");

  generation += 1;
  clearRetryTimer();
  reconnectAttempts = 0;
  lastReadyChannelId = null;
  targetChannelId = channelId;
  targetGuildId = typeof channelOrId === "string" ? null : channelOrId.guild?.id || null;
  destroyConnection();

  return ensurePersistentVoiceConnection("kanal seçimi");
}

function clearPersistentVoiceChannel() {
  generation += 1;
  clearRetryTimer();
  reconnectAttempts = 0;
  lastReadyChannelId = null;
  targetChannelId = null;
  targetGuildId = null;
  destroyConnection();
}

function suspendPersistentVoiceConnection(guildId) {
  if (!guildId) return;
  clearMusicResumeTimer(guildId);
  suspendedGuilds.add(guildId);

  if (targetGuildId === guildId) {
    clearRetryTimer();
    destroyConnection();
  }
}

function resumePersistentVoiceConnection(guildId) {
  if (!guildId) return;
  clearMusicResumeTimer(guildId);
  suspendedGuilds.delete(guildId);
  if (targetGuildId === guildId && targetChannelId) {
    void ensurePersistentVoiceConnection("müzik sonrası dönüş");
  }
}

function scheduleMusicResume(queue, delayMs) {
  const guildId = queue?.guild?.id || queue?.id;
  if (!guildId || !suspendedGuilds.has(guildId)) return;

  clearMusicResumeTimer(guildId);
  const timer = setTimeout(() => {
    musicResumeTimers.delete(guildId);
    if (!queue?.deleted && (queue?.currentTrack || queue?.node?.isPlaying?.())) return;
    resumePersistentVoiceConnection(guildId);
  }, delayMs);
  timer.unref?.();
  musicResumeTimers.set(guildId, timer);
}

function bindDiscordPlayerVoiceHandoff(player) {
  if (!player?.events || musicPlayer === player) return;
  musicPlayer = player;

  player.events.on("playerStart", queue => {
    const guildId = queue?.guild?.id || queue?.id;
    if (!guildId) return;
    clearMusicResumeTimer(guildId);
    suspendPersistentVoiceConnection(guildId);
  });
  player.events.on("emptyQueue", queue => {
    const cooldown = Number(queue?.options?.leaveOnEndCooldown) || 15_000;
    scheduleMusicResume(queue, cooldown + 1_000);
  });
  player.events.on("queueDelete", queue => {
    const cooldown = Number(queue?.options?.leaveOnStopCooldown) || 5_000;
    scheduleMusicResume(queue, cooldown + 1_000);
  });
  player.events.on("disconnect", queue => scheduleMusicResume(queue, 1_500));
  player.events.on("connectionDestroyed", queue => scheduleMusicResume(queue, 1_500));
}

module.exports = {
  bindDiscordPlayerVoiceHandoff,
  clearPersistentVoiceChannel,
  ensurePersistentVoiceConnection,
  resumePersistentVoiceConnection,
  setPersistentVoiceChannel,
  startPersistentVoiceConnection,
  suspendPersistentVoiceConnection,
};