const { QueueRepeatMode } = require("discord-player");

const START_TIMEOUT_MS = 45_000;
const STALL_TIMEOUT_MS = 30_000;
const CHECK_INTERVAL_MS = 5_000;
const attempts = new WeakMap();
const bound = new WeakSet();

function clearTimers(attempt) {
  clearTimeout(attempt?.startupTimer);
  clearInterval(attempt?.healthTimer);
  clearTimeout(attempt?.cleanupTimer);
}

function cancelMusicStream(queue) {
  const attempt = attempts.get(queue);
  clearTimers(attempt);
  attempt?.controller.abort();
}

function notify(queue) {
  queue.player?.events.emit("musicPlaybackUpdate", queue);
}

function messageFor(error) {
  if (error?.code === "PLAYBACK_TIMEOUT") return "Ses zamanında başlayamadı. Lütfen parçayı yeniden başlat.";
  if (error?.code === "PLAYBACK_STALLED") return "Ses bağlantısı ilerlemeyi durdurdu. Lütfen parçayı yeniden başlat.";
  return "Parçanın ses akışı alınamadı veya kesildi. Lütfen tekrar dene ya da farklı bir platform seç.";
}

function failPlayback(queue, error, track, libraryWillSkip = false) {
  const attempt = attempts.get(queue);
  if (queue.deleted || !attempt || attempt.failed || (track && attempt.track.id !== track.id)) return;
  attempt.failed = true;
  clearTimers(attempt);
  queue.metadata.musicPlayback = { status: "error", trackId: attempt.track.id, message: messageFor(error) };
  attempt.repeatMode ??= queue.repeatMode;
  queue.setRepeatMode(QueueRepeatMode.OFF);
  attempt.controller.abort();
  console.warn(`⚠️ [MÜZİK] Ses akışı başarısız (${queue.id}, ${error?.code || error?.name || "STREAM_ERROR"}).`);
  notify(queue);
  if (libraryWillSkip) return;
  if (!queue.node.skip()) {
    queue.delete();
    return;
  }
  attempt.cleanupTimer = setTimeout(() => {
    if (attempts.get(queue) === attempt && attempt.failed && !queue.deleted) queue.delete();
  }, 2_000);
  attempt.cleanupTimer.unref?.();
}

function beginMusicStream(queue, track) {
  if (!queue) return undefined;
  const previous = attempts.get(queue);
  cancelMusicStream(queue);
  const attempt = { track, controller: new AbortController(), failed: false,
    repeatMode: previous?.failed ? previous.repeatMode : undefined };
  attempts.set(queue, attempt);
  queue.metadata ||= {};
  queue.metadata.musicPlayback = { status: "loading", trackId: track.id, message: null };
  attempt.startupTimer = setTimeout(() => {
    if (attempts.get(queue) === attempt) failPlayback(queue, { code: "PLAYBACK_TIMEOUT" }, track);
  }, START_TIMEOUT_MS);
  attempt.startupTimer.unref?.();
  notify(queue);
  return attempt.controller.signal;
}

function observeMusicSource(queue, track, source, expectedSignal) {
  if (!queue || !source) return source;
  const stream = source.stream || source;
  const attempt = attempts.get(queue);
  if (!attempt || attempt.track.id !== track.id || attempt.controller.signal.aborted || queue.deleted
    || (expectedSignal && expectedSignal !== attempt.controller.signal)) {
    stream.destroy?.();
    throw new Error("Müzik oturumu kapatıldığı için ses yükleme iptal edildi.");
  }
  stream.once?.("error", error => {
    if (attempts.get(queue) === attempt && !attempt.controller.signal.aborted) failPlayback(queue, error, track);
  });
  const abort = () => stream.destroy?.();
  attempt.controller.signal.addEventListener("abort", abort, { once: true });
  stream.once?.("close", () => attempt.controller.signal.removeEventListener("abort", abort));
  return source;
}

function bindMusicPlayback(player) {
  if (bound.has(player)) return;
  bound.add(player);
  const started = (queue, track) => {
    if (!attempts.has(queue)) beginMusicStream(queue, track);
    const attempt = attempts.get(queue);
    if (queue.deleted || attempt.failed || attempt.controller.signal.aborted || attempt.track.id !== track.id) return;
    clearTimers(attempt);
    queue.metadata.musicPlayback = { status: "playing", trackId: track.id, message: null };
    if (attempt.repeatMode !== undefined) queue.setRepeatMode(attempt.repeatMode);
    let lastTime = Number(queue.node.streamTime) || 0;
    let lastAdvance = Date.now();
    attempt.healthTimer = setInterval(() => {
      if (queue.deleted || attempts.get(queue) !== attempt) return clearTimers(attempt);
      const time = Number(queue.node.streamTime) || 0;
      if (queue.node.isPaused() || time !== lastTime) {
        lastTime = time;
        lastAdvance = Date.now();
      } else if (Date.now() - lastAdvance >= STALL_TIMEOUT_MS) {
        failPlayback(queue, { code: "PLAYBACK_STALLED" }, track);
      }
    }, CHECK_INTERVAL_MS);
    attempt.healthTimer.unref?.();
    notify(queue);
  };
  player.events.on("playerStart", started);
  player.events.on("playerTrigger", (queue, track, reason) => {
    if (reason === "filters") started(queue, track);
  });
  player.events.on("playerSkip", (queue, track, reason) => {
    if (reason === "ERR_NO_STREAM") failPlayback(queue, { code: reason }, track, true);
  });
  for (const event of ["error", "playerError"]) {
    player.events.on(event, (queue, error, track) => failPlayback(queue, error, track));
  }
  for (const event of ["emptyQueue", "queueDelete", "disconnect", "connectionDestroyed"]) {
    player.events.on(event, queue => {
      cancelMusicStream(queue);
      if (queue.metadata?.musicPlayback?.status !== "error") {
        queue.metadata ||= {};
        queue.metadata.musicPlayback = { status: "ended", message: null };
      }
    });
  }
}

module.exports = { START_TIMEOUT_MS, STALL_TIMEOUT_MS, CHECK_INTERVAL_MS,
  beginMusicStream, observeMusicSource, cancelMusicStream, bindMusicPlayback, __testing: { attempts, failPlayback } };
