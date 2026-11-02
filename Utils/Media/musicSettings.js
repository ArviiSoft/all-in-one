const { QueueRepeatMode } = require("discord-player");

const VOLUMES = Object.freeze(Array.from({ length: 21 }, (_, index) => index * 10));
const SPEEDS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
const EQ_PRESETS = Object.freeze({
  flat: { label: "Düz", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  pop: { label: "Pop", gains: [-0.06, 0, 0.08, 0.14, 0.18, 0.20, 0.16, 0.10, 0.02, -0.04, -0.04, 0, 0.04, 0.06, 0.06] },
  rock: { label: "Rock", gains: [0.22, 0.20, 0.14, 0.04, -0.06, -0.10, -0.06, 0.02, 0.10, 0.16, 0.20, 0.22, 0.22, 0.18, 0.14] },
  jazz: { label: "Caz", gains: [0.14, 0.12, 0.08, 0.04, -0.02, -0.04, 0, 0.06, 0.10, 0.12, 0.14, 0.14, 0.10, 0.06, 0.04] },
  classical: { label: "Klasik", gains: [0.14, 0.12, 0.10, 0.04, 0, -0.04, -0.06, -0.04, 0, 0.06, 0.10, 0.14, 0.16, 0.16, 0.12] },
  electronic: { label: "Elektronik", gains: [0.28, 0.24, 0.18, 0.08, 0, -0.08, -0.06, 0, 0.08, 0.16, 0.20, 0.18, 0.14, 0.10, 0.08] },
  hiphop: { label: "Hip-hop", gains: [0.30, 0.26, 0.20, 0.12, 0.04, -0.04, -0.04, 0, 0.04, 0.08, 0.12, 0.10, 0.06, 0.02, 0] },
  vocal: { label: "Vokal", gains: [-0.16, -0.12, -0.08, 0, 0.08, 0.16, 0.22, 0.24, 0.24, 0.18, 0.12, 0.06, 0, -0.04, -0.06] },
  treble: { label: "Tiz", gains: [-0.08, -0.06, -0.04, 0, 0, 0.02, 0.04, 0.06, 0.10, 0.14, 0.18, 0.22, 0.24, 0.26, 0.26] },
  soft: { label: "Yumuşak", gains: [0.08, 0.10, 0.10, 0.08, 0.06, 0.04, 0, -0.02, -0.04, -0.06, -0.10, -0.14, -0.18, -0.20, -0.22] },
});
const BASS_PRESETS = Object.freeze({
  off: { label: "Kapalı", gain: 0 },
  low: { label: "Hafif", gain: 0.12 },
  medium: { label: "Orta", gain: 0.24 },
  high: { label: "Güçlü", gain: 0.40 },
  max: { label: "Maksimum", gain: 0.55 },
});

function getSettings(queue) {
  queue.metadata ||= {};
  return queue.metadata.musicSettings ||= { speed: 1, eq: "flat", bass: "off" };
}

function equalizerBands(eq, bass) {
  if (!Object.hasOwn(EQ_PRESETS, eq) || !Object.hasOwn(BASS_PRESETS, bass)) throw new Error("Geçersiz ses efekti seçimi.");
  const preset = EQ_PRESETS[eq];
  const boost = BASS_PRESETS[bass];
  const weights = [1, 1, 0.8, 0.5, 0.25];
  return preset.gains.map((gain, band) => ({
    band, gain: Math.max(-0.25, Math.min(1, gain + boost.gain * (weights[band] || 0))),
  }));
}

function applySetting(queue, setting, value) {
  const settings = getSettings(queue);
  if (setting === "volume") {
    const volume = Number(value);
    if (!VOLUMES.includes(volume)) throw new Error("Ses seviyesi %0–%200 arasında olmalı.");
    if (!queue.node.setVolume(volume)) throw new Error("Ses seviyesi şu anda değiştirilemiyor.");
  } else if (setting === "speed") {
    const speed = Number(value);
    if (!SPEEDS.includes(speed)) throw new Error("Geçersiz oynatma hızı.");
    if (!queue.filters.resampler) throw new Error("Hız filtresi henüz hazır değil.");
    queue.filters.resampler.setSampleRate(48_000 * speed);
    settings.speed = speed;
  } else if (setting === "eq" || setting === "bass") {
    const next = { ...settings, [setting]: value };
    const bands = equalizerBands(next.eq, next.bass);
    if (!queue.filters.equalizer) throw new Error("Ekolayzır henüz hazır değil.");
    queue.filters.equalizer.setEQ(bands);
    settings[setting] = value;
  } else {
    throw new Error("Geçersiz müzik ayarı.");
  }
}

function repeatLabel(queue) {
  return ({ [QueueRepeatMode.TRACK]: "Tek parça", [QueueRepeatMode.QUEUE]: "Tüm sıra" })[queue?.repeatMode] || "Kapalı";
}

function cycleRepeat(queue) {
  const modes = [QueueRepeatMode.OFF, QueueRepeatMode.TRACK, QueueRepeatMode.QUEUE];
  queue.setRepeatMode(modes[(modes.indexOf(queue.repeatMode) + 1) % modes.length]);
}

function toggleAutoplay(queue) {
  queue.setRepeatMode(queue.repeatMode === QueueRepeatMode.AUTOPLAY ? QueueRepeatMode.OFF : QueueRepeatMode.AUTOPLAY);
}

module.exports = { VOLUMES, SPEEDS, EQ_PRESETS, BASS_PRESETS, getSettings, equalizerBands, applySetting, repeatLabel, cycleRepeat, toggleAutoplay };
