const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder,
  TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown,
} = require("discord.js");
const { QueueRepeatMode } = require("discord-player");
const emojiler = require("../Emojis/emojiler");
const { VOLUMES, SPEEDS, EQ_PRESETS, BASS_PRESETS, getSettings, repeatLabel } = require("./musicSettings");
const PREFIX = "safir_mzk_";

const FALLBACK_ICONS = {
  previous: "⏮", next: "⏭", pause: "⏸", play: "▶", repeat: "🔁", stop: "⏹",
  heart: "♡", sparkle: "✦", controls: "☷", volume: "🔊", speed: "◴",
  bass: "▥", queue: "☷", shuffle: "⤨", music: "♫",
};
function icon(name) { return emojiler.getEmojiString(`muzik_${name}_arviis`, FALLBACK_ICONS[name]); }
function text(content) { return new TextDisplayBuilder().setContent(content); }
function safeText(value, fallback = "Bilinmiyor") {
  return escapeMarkdown(String(value ?? "").replace(/[\r\n]+/g, " ").trim() || fallback, {
    heading: true, bulletedList: true, numberedList: true, maskedLink: true,
  });
}
function trackTitle(track) { return safeText(track?.cleanTitle || track?.title, "Bilinmeyen şarkı").slice(0, 180); }
function safeURL(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}
function separator() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }
function payload(container, isPrivate = false) {
  return { components: [container], flags: MessageFlags.IsComponentsV2 | (isPrivate ? MessageFlags.Ephemeral : 0), allowedMentions: { parse: [] } };
}
function buildNoticeContainer(title, description, color = 0xfee75c) {
  return new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(text(`## ${title}\n${description}`));
}
function noticePayload(title, description, color = 0xfee75c, isPrivate = false) {
  return payload(buildNoticeContainer(title, description, color), isPrivate);
}
function controlId(queue, action, view) {
  return `${PREFIX}${action}:${queue?.metadata?.musicSession || "expired"}:${view}`;
}
function button(queue, action, glyph, view, { label, disabled = false, active = false } = {}) {
  const result = new ButtonBuilder().setCustomId(controlId(queue, action, view))
    .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(disabled);
  const emoji = emojiler.getEmoji(`muzik_${glyph}_arviis`);
  if (emoji) result.setEmoji({ id: emoji.id, name: emoji.name });
  else result.setLabel(FALLBACK_ICONS[glyph]);
  if (label) result.setLabel(label);
  return result;
}
function playerButtons(queue, view, stopped = false) {
  const paused = queue?.node?.isPaused?.();
  const row = new ActionRowBuilder().addComponents(
    button(queue, "previous", "previous", view, { disabled: stopped || !queue?.history?.size }),
    button(queue, "pause", paused ? "play" : "pause", view, { disabled: stopped }),
    button(queue, "next", "next", view, { disabled: stopped || (!queue?.tracks?.size && queue?.repeatMode !== QueueRepeatMode.AUTOPLAY) }),
    button(queue, "repeat", "repeat", view, { disabled: stopped, active: [QueueRepeatMode.TRACK, QueueRepeatMode.QUEUE].includes(queue?.repeatMode) }),
  );
  if (view === "controls") row.addComponents(button(queue, "stop", "stop", view, { disabled: stopped }));
  return row;
}

function progress(queue, track, stopped = false) {
  const timestamp = !stopped && queue?.currentTrack?.id === track?.id ? queue.node.getTimestamp() : null;
  const live = Boolean(track?.raw?.live || track?.live);
  const current = timestamp?.current?.label || "0:00";
  const total = timestamp?.total?.label || track?.duration || "0:00";
  const percentage = Math.max(0, Math.min(100, Number(timestamp?.progress) || 0));
  const segments = 12;
  const position = Math.min(segments - 1, Math.floor(percentage / 100 * segments));
  const filled = emojiler.getEmojiString("muzik_dolu_bar_arviis", "━");
  const empty = emojiler.getEmojiString("muzik_bos_bar_arviis", "─");
  const cursor = emojiler.getEmojiString("muzik_baslangic_arviis", "●");
  const bar = filled.repeat(position) + cursor + empty.repeat(segments - position - 1);
  return `-# ${live ? `${current} / Canlı yayın` : `${current} / ${total}`}\n${bar}`;
}

function buildMusicContainer(track, status = "caliyor", queue = null) {
  const playback = queue?.metadata?.musicPlayback;
  const failed = playback?.status === "error";
  const stopped = status === "bitti" || failed;
  const paused = status === "duraklatildi" || queue?.node?.isPaused?.();
  const loading = playback?.status === "loading";
  const container = new ContainerBuilder();
  const heading = failed ? "OYNATILAMADI" : stopped ? "OYNATMA SONA ERDİ" : loading ? "SES YÜKLENİYOR" : paused ? "DURAKLATILDI" : "ŞİMDİ ÇALIYOR";
  const header = text(`-# ${icon("music")} ${heading}\n## ${trackTitle(track)}\n-# ${safeText(track?.author, "Bilinmeyen sanatçı").slice(0, 160)}`);
  const thumbnail = safeURL(track?.thumbnail);
  if (thumbnail) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(header)
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail).setDescription("Albüm kapağı")));
  else container.addTextDisplayComponents(header);
  const requester = track?.requestedBy?.id;
  const size = Number(queue?.tracks?.size) || 0;
  container.addSeparatorComponents(separator()).addTextDisplayComponents(
    text(progress(queue, track, stopped)),
    text(`-# Ekleyen: ${requester ? `<@${requester}>` : "Bilinmiyor"}\n-# ${icon("volume")} ${queue?.node?.volume ?? 100}% · ${icon("repeat")} ${repeatLabel(queue)} · ${icon("shuffle")} ${queue?.isShuffling ? "Karışık" : "Tek seferlik"} · ${icon("queue")} ${size}`),
  ).addSeparatorComponents(separator())
    .addActionRowComponents(playerButtons(queue, "player", stopped), new ActionRowBuilder().addComponents(
      button(queue, "favorite", "heart", "player", { disabled: stopped }),
      button(queue, "autoplay", "sparkle", "player", { disabled: stopped, active: queue?.repeatMode === QueueRepeatMode.AUTOPLAY }),
      button(queue, "controls", "controls", "player", { label: "Kontrol paneli", disabled: stopped }),
    ))
    .addTextDisplayComponents(text(failed ? `-# ${playback.message}` : stopped ? "-# Müzik oturumu kapatıldı." : size
      ? `-# Sıradaki: ${trackTitle(queue.tracks.toArray()[0])} · ${size} parça bekliyor.`
      : "-# Kuyrukta bekleyen parça yok."));
  return container;
}

function settingMenu(queue, key, glyph, label, values, selected, stopped) {
  const menu = new StringSelectMenuBuilder().setCustomId(controlId(queue, key, "controls"))
    .setPlaceholder(`${FALLBACK_ICONS[glyph]} ${label}`).setDisabled(stopped)
    .addOptions(values.map(({ value, label: optionLabel }) => {
      const emoji = emojiler.getEmoji(`muzik_${glyph}_arviis`);
      return { label: `${key === "volume" ? "Ses" : key === "speed" ? "Hız" : key === "eq" ? "EQ" : "Bas"} · ${optionLabel}`,
        value: String(value), default: String(value) === String(selected),
        ...(emoji ? { emoji: { id: emoji.id, name: emoji.name } } : {}) };
    }));
  return new ActionRowBuilder().addComponents(menu);
}
function buildControlsContainer(queue, { stopped = false, track = queue.currentTrack } = {}) {
  const playback = queue.metadata?.musicPlayback;
  stopped ||= playback?.status === "error";
  const settings = getSettings(queue);
  const volume = queue.node.volume;
  const eq = EQ_PRESETS[settings.eq].label;
  const bass = BASS_PRESETS[settings.bass].label;
  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`## ${icon("controls")} Müzik kontrolleri\n**${trackTitle(track)}**\n-# ${playback?.status === "error" ? "Oynatılamadı" : stopped ? "Sona erdi" : playback?.status === "loading" ? "Ses yükleniyor" : queue.node.isPaused() ? "Duraklatıldı" : "Canlı"} / ${track?.duration || "0:00"}`),
  ).addActionRowComponents(playerButtons(queue, "controls", stopped)).addTextDisplayComponents(
    text(`### Ses ve efektler\n-# ${icon("volume")} ${volume}% · ${icon("speed")} ${settings.speed}× · EQ: ${eq} · ${icon("bass")} ${bass}`),
  ).addActionRowComponents(
    settingMenu(queue, "volume", "volume", `Ses · ${volume}%`, VOLUMES.map(value => ({ value, label: `${value}%` })), volume, stopped),
    settingMenu(queue, "speed", "speed", `Hız · ${settings.speed}×`, SPEEDS.map(value => ({ value, label: `${value}×` })), settings.speed, stopped),
    settingMenu(queue, "eq", "controls", `EQ · ${eq}`, Object.entries(EQ_PRESETS).map(([value, preset]) => ({ value, label: preset.label })), settings.eq, stopped),
    settingMenu(queue, "bass", "bass", `Bas · ${bass}`, Object.entries(BASS_PRESETS).map(([value, preset]) => ({ value, label: preset.label })), settings.bass, stopped),
  ).addTextDisplayComponents(text("-# Yüksek ses ve güçlü bas bozulmaya neden olabilir."))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(queue, "favorite", "heart", "controls", { disabled: stopped }),
      button(queue, "queue", "queue", "controls", { disabled: stopped }),
      button(queue, "autoplay", "sparkle", "controls", { disabled: stopped, active: queue.repeatMode === QueueRepeatMode.AUTOPLAY }),
    ));
  return container;
}

function buildQueueContainer(queue, page = 0, stopped = false) {
  const tracks = queue.tracks.toArray();
  const pages = Math.max(1, Math.ceil(tracks.length / 10));
  page = Math.max(0, Math.min(pages - 1, page));
  const lines = tracks.slice(page * 10, page * 10 + 10).map((track, index) =>
    `${page * 10 + index + 1}. **${trackTitle(track)}** · ${safeText(track.duration, "0:00")}`);
  return new ContainerBuilder().addTextDisplayComponents(text([
    `## ${icon("queue")} Müzik kuyruğu`,
    `**Şimdi:** ${trackTitle(queue.currentTrack)}`,
    lines.join("\n") || "Kuyrukta bekleyen parça yok.",
    `-# ${tracks.length} parça · Sayfa ${page + 1}/${pages} · ${queue.isShuffling ? "Karışık oynatma açık" : "Sırayla oynatma"}`,
  ].join("\n\n"))).addActionRowComponents(new ActionRowBuilder().addComponents(
    button(queue, `page-${page - 1}`, "previous", "queue", { disabled: stopped || page === 0 }),
    button(queue, `page-${page + 1}`, "next", "queue", { disabled: stopped || page === pages - 1 }),
    button(queue, "shuffle", "shuffle", "queue", { label: "Karıştır", disabled: stopped, active: queue.isShuffling }),
    button(queue, "controls", "controls", "queue", { label: "Kontroller", disabled: stopped }),
  ));
}

function buildQueuedTrackContainer(track, queue) {
  return new ContainerBuilder().addTextDisplayComponents(text(`-# SIRAYA EKLENDİ · #${queue.tracks.size}\n### ${trackTitle(track)}\n-# ${safeText(track.author)} · ${track.duration || "0:00"}`));
}

module.exports = { PREFIX, icon, payload, trackTitle, safeText, safeURL, progress, noticePayload, buildNoticeContainer, buildMusicContainer, buildControlsContainer, buildQueueContainer, buildQueuedTrackContainer };
