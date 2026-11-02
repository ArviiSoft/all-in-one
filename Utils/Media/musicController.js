const { randomUUID } = require("node:crypto");
const { useMainPlayer, QueueRepeatMode } = require("discord-player");
const { applySetting, cycleRepeat, toggleAutoplay } = require("./musicSettings");
const { toggleFavorite } = require("./musicFavorites");
const { bindMusicPlayback, cancelMusicStream } = require("./musicPlayback");
const {
  PREFIX, payload, noticePayload, trackTitle, buildMusicContainer, buildControlsContainer, buildQueueContainer,
} = require("./musicUI");

const UPDATE_INTERVAL = 60_000;
const PANEL_LIFETIME = 14 * 60_000;
const sessions = new WeakMap();
const boundPlayers = new WeakSet();

function sessionFor(queue) {
  queue.metadata ||= {};
  queue.metadata.musicSession ||= randomUUID();
  let session = sessions.get(queue);
  if (!session) {
    session = { main: null, panels: new Map(), track: queue.currentTrack, stopped: false, timer: null, pending: null, dirty: false, busy: false };
    sessions.set(queue, session);
  }
  return session;
}

function stopTimer(session) {
  if (session.timer) clearInterval(session.timer);
  session.timer = null;
}

function logError(error) {
  console.warn(`⚠️ [MÜZİK] Panel güncellenemedi: ${error?.code || error?.message || "Bilinmeyen hata"}`);
}

function startTimer(queue, session) {
  if (session.timer || session.stopped || !session.main) return;
  session.timer = setInterval(() => { void refreshMusicMessages(queue).catch(logError); }, UPDATE_INTERVAL);
  session.timer.unref?.();
}

function panelContainer(queue, session, panel) {
  return panel.view === "queue"
    ? buildQueueContainer(queue, panel.page || 0, session.stopped)
    : buildControlsContainer(queue, { stopped: session.stopped, track: queue.currentTrack || session.track });
}

async function renderSession(queue, session) {
  if (!session.stopped && queue.currentTrack) session.track = queue.currentTrack;
  if (session.main && session.track) {
    try {
      await session.main.edit(payload(buildMusicContainer(session.track,
        session.stopped ? "bitti" : queue.node.isPaused() ? "duraklatildi" : "caliyor", queue)));
    } catch (error) {
      if ([10003, 10008, 50001, 50013].includes(error.code)) {
        session.main = null;
        stopTimer(session);
      } else logError(error);
    }
  }
  for (const [userId, panel] of session.panels) {
    if (Date.now() - panel.createdAt >= PANEL_LIFETIME) {
      session.panels.delete(userId);
      continue;
    }
    try {
      await panel.interaction.webhook.editMessage(panel.id, payload(panelContainer(queue, session, panel)));
    } catch (error) {
      if ([10008, 10015, 50027, 50001, 50013].includes(error.code)) session.panels.delete(userId);
      else logError(error);
    }
  }
}

async function refreshMusicMessages(queue) {
  const session = sessions.get(queue);
  if (!session) return;
  session.dirty = true;
  if (session.pending) return session.pending;
  session.pending = (async () => {
    while (session.dirty) {
      session.dirty = false;
      await renderSession(queue, session);
    }
  })().finally(() => { session.pending = null; });
  return session.pending;
}

async function attachMusicMessage(queue, message) {
  const session = sessionFor(queue);
  session.main = message;
  session.track = queue.currentTrack || session.track;
  session.stopped = Boolean(queue.deleted || !queue.currentTrack);
  startTimer(queue, session);
  await refreshMusicMessages(queue);
}

async function finishMusicSession(queue) {
  cancelMusicStream(queue);
  const session = sessions.get(queue);
  if (!session) return;
  session.stopped = true;
  stopTimer(session);
  await refreshMusicMessages(queue);
  if (session.stopped) session.panels.clear();
}

function bindMusicPlayerEvents(player) {
  if (boundPlayers.has(player)) return;
  boundPlayers.add(player);
  bindMusicPlayback(player);
  player.events.on("playerStart", (queue, track) => {
    const session = sessionFor(queue);
    session.track = track;
    session.stopped = false;
    startTimer(queue, session);
    void refreshMusicMessages(queue).catch(logError);
  });
  for (const event of ["musicPlaybackUpdate", "playerPause", "playerResume", "audioTrackAdd", "audioTracksAdd", "audioTrackRemove", "audioTracksRemove", "volumeChange", "equalizerUpdate", "sampleRateUpdate", "playerSeek"]) {
    player.events.on(event, queue => { void refreshMusicMessages(queue).catch(logError); });
  }
  for (const event of ["emptyQueue", "queueDelete", "disconnect", "connectionDestroyed"]) {
    player.events.on(event, queue => { void finishMusicSession(queue).catch(logError); });
  }
}

function rememberPanel(queue, interaction, id, view, page = 0) {
  const session = sessionFor(queue);
  if (session.panels.size >= 20 && !session.panels.has(interaction.user.id)) {
    session.panels.delete(session.panels.keys().next().value);
  }
  session.panels.set(interaction.user.id, { interaction, id, view, page, createdAt: Date.now() });
}

async function openMusicPanel(interaction, queue, view = "controls") {
  const session = sessionFor(queue);
  await interaction.reply(payload(panelContainer(queue, session, { view }), true));
  const message = await interaction.fetchReply();
  rememberPanel(queue, interaction, message.id, view);
}

const LEGACY_ACTIONS = { durdur: "legacy-pause", devam: "legacy-resume", gec: "next", bitir: "stop" };
async function handleMusicInteraction(interaction, player = useMainPlayer()) {
  if ((!interaction.isButton() && !interaction.isStringSelectMenu()) || !interaction.customId.startsWith(PREFIX)) return false;
  const [rawAction, token, view = "player"] = interaction.customId.slice(PREFIX.length).split(":");
  const action = LEGACY_ACTIONS[rawAction] || rawAction;
  const queue = player.nodes.get(interaction.guildId);
  const notice = (title, description) => interaction.reply(noticePayload(title, description, 0xfee75c, true));
  if (!queue?.currentTrack || queue.deleted) {
    await notice("Oynatma bulunamadı", "Şu anda kontrol edilebilecek bir şarkı yok.");
    return true;
  }
  const session = sessionFor(queue);
  if (token !== queue.metadata.musicSession) {
    await notice("Panelin süresi doldu", "Bu panel önceki müzik oturumuna ait. Güncel oynatma panelini kullan.");
    return true;
  }
  const voiceId = interaction.member?.voice?.channelId || interaction.member?.voice?.channel?.id;
  const botVoiceId = queue.channel?.id || interaction.guild?.members?.me?.voice?.channelId;
  if (!voiceId || voiceId !== botVoiceId) {
    await notice("Aynı ses kanalına katıl", "Müzik kontrollerini kullanmak için botla aynı ses kanalında olmalısın.");
    return true;
  }
  const readOnly = ["controls", "queue", "favorite"].includes(action) || /^page-\d+$/.test(action);
  const owner = queue.metadata.requestedBy;
  if (!readOnly && owner?.id && owner.id !== interaction.user.id) {
    await notice("Kontrol yetkisi yok", `Bu sırayı yalnızca başlatan <@${owner.id}> kontrol edebilir.`);
    return true;
  }

  try {
    if (action === "controls" && view === "player") {
      await openMusicPanel(interaction, queue);
      return true;
    }
    if (session.busy) {
      await notice("İşlem sürüyor", "Önceki müzik işlemi tamamlanınca tekrar dene.");
      return true;
    }
    session.busy = true;
    try {
      await interaction.deferUpdate();
      if (view !== "player") rememberPanel(queue, interaction, interaction.message.id, view);
      if (interaction.isStringSelectMenu()) {
        if (interaction.values.length !== 1) throw new Error("Tek bir ayar seçmelisin.");
        applySetting(queue, action, interaction.values[0]);
      } else if (action === "pause" || action === "legacy-pause" || action === "legacy-resume") {
        const pause = action === "legacy-pause" || (action === "pause" && !queue.node.isPaused());
        if (!(pause ? queue.node.pause() : queue.node.resume())) throw new Error("Oynatma durumu değiştirilemedi.");
      } else if (action === "previous") {
        if (!queue.history.size) throw new Error("Önceki parça bulunmuyor.");
        await queue.history.previous(true);
      } else if (action === "next") {
        if (!queue.node.skip()) throw new Error("Sonraki parçaya geçilemedi.");
      } else if (action === "repeat") {
        cycleRepeat(queue);
      } else if (action === "autoplay") {
        toggleAutoplay(queue);
        await interaction.followUp(noticePayload("Otomatik Oynatma", queue.repeatMode === QueueRepeatMode.AUTOPLAY
          ? "Otomatik oynatma açıldı. Kuyruk bitince benzer parçalar çalmaya devam edecek, tekrar çalma özelliği kapatıldı."
          : "Otomatik oynatma kapatıldı. Kuyruk bitince oynatma sona erecek.", 0x5865f2, true));
      } else if (action === "shuffle") {
        queue.toggleShuffle(true);
      } else if (action === "favorite") {
        const track = queue.currentTrack;
        const added = toggleFavorite(interaction.user.id, track);
        await interaction.followUp(noticePayload(added ? "Favorilere eklendi" : "Favorilerden kaldırıldı",
          `**${trackTitle(track)}**\n-# Kaydettiklerini görmek için /şarkı favoriler komutunu kullan.`, 0x5865f2, true));
      } else if (action === "controls" || action === "queue" || /^page-\d+$/.test(action)) {
        const targetView = action === "controls" ? "controls" : "queue";
        const page = action.startsWith("page-") ? Number(action.slice(5)) : 0;
        rememberPanel(queue, interaction, interaction.message.id, targetView, page);
      } else if (action === "stop") {
        queue.delete();
        await finishMusicSession(queue);
        return true;
      } else {
        throw new Error("Bu müzik kontrolü tanınmıyor. Paneli yeniden aç.");
      }
      await refreshMusicMessages(queue);
    } finally { session.busy = false; }
  } catch (error) {
    console.error("🔴 [MÜZİK] Kontrol uygulanamadı:", error.message);
    const response = noticePayload("Kontrol uygulanamadı", error.message || "Lütfen yeniden dene.", 0xed4245, true);
    if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => null);
    else await interaction.reply(response).catch(() => null);
  }
  return true;
}

module.exports = {
  UPDATE_INTERVAL, attachMusicMessage, bindMusicPlayerEvents, finishMusicSession, refreshMusicMessages, openMusicPanel, handleMusicInteraction,
  __testing: { sessionFor, renderSession, rememberPanel },
};
