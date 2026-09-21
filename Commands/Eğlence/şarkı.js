const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const { useMainPlayer } = require("discord-player");
const { DEFAULT_PLATFORM, PLATFORM_CHOICES, MusicSearchError, createMusicNodeOptions, getPlatform, inferPlatformKey, searchLink, searchPlatformTrack } = require("../../Utils/Media/musicService.js");
const { resumePersistentVoiceConnection, suspendPersistentVoiceConnection } = require("../../Utils/Voice/persistentVoiceConnection.js");

const V2_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const ERROR_COLOR = 0xed4245;
const WARNING_COLOR = 0xfee75c;
const SUCCESS_COLOR = 0x2fba72;

function spacer() {
  return new SeparatorBuilder()
    .setDivider(false)
    .setSpacing(SeparatorSpacingSize.Small);
}

function safeText(value, fallback = "Bilinmiyor") {
  const text = String(value ?? "").replaceAll("\\", "").trim() || fallback;
  return escapeMarkdown(text, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
}

function safeURL(value) {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function trackTitle(track) {
  return safeText(track?.cleanTitle || track?.title, "Bilinmeyen şarkı").slice(0, 180);
}

function trackSourceLink(track) {
  const url = safeURL(track?.url);
  return url ? `[**Platformda aç 🔗**](${url})` : null;
}

function getTrackPlatform(track) {
  return getPlatform(inferPlatformKey(track) || DEFAULT_PLATFORM);
}

function buildProgress(queue, track) {
  const timestamp = queue?.currentTrack?.id === track?.id
    ? queue.node.getTimestamp()
    : null;
  const currentLabel = timestamp?.current?.label || "0:00";
  const totalLabel = timestamp?.total?.label || track?.duration || "0:00";
  const progress = Math.max(0, Math.min(100, Number(timestamp?.progress) || 0));
  const length = 16;
  const activeIndex = Math.min(length - 1, Math.floor((progress / 100) * length));
  const bar = Array.from(
    { length },
    (_, index) => index === activeIndex ? "●" : index < activeIndex ? "━" : "─"
  ).join("");
  return `-# ${currentLabel}  ${bar}  ${totalLabel}`;
}

function addTrackHeader(container, content, thumbnailURL) {
  if (!thumbnailURL) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return;
  }

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL))
  );
}

function buildPlayerButtons({ isPaused, isStopped, queue }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("safir_mzk_durdur")
      .setLabel("Duraklat")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isPaused || isStopped),
    new ButtonBuilder()
      .setCustomId("safir_mzk_devam")
      .setLabel("Devam")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!isPaused || isStopped),
    new ButtonBuilder()
      .setCustomId("safir_mzk_gec")
      .setLabel("Atla")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isStopped || !queue?.tracks?.size),
    new ButtonBuilder()
      .setCustomId("safir_mzk_bitir")
      .setLabel("Bitir")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isStopped)
  );
}

function buildMusicContainer(track, status = "caliyor", queue = null) {
  const platform = getTrackPlatform(track);
  const isPaused = status === "duraklatildi";
  const isStopped = status === "bitti";
  const accentColor = isStopped ? ERROR_COLOR : isPaused ? WARNING_COLOR : platform.accentColor;
  const heading = isStopped
    ? "ŞARKI SONA ERDİ"
    : isPaused
      ? "OYNATMA DURAKLATILDI"
      : "ŞİMDİ ÇALIYOR";
  const thumbnail = safeURL(track?.thumbnail);
  const queueSize = Number(queue?.tracks?.size) || 0;
  const sourceLink = trackSourceLink(track);

  const container = new ContainerBuilder().setAccentColor(accentColor);
  addTrackHeader(container, [
    `-# ${heading}  ·  ${platform.label.toLocaleUpperCase("tr-TR")}`,
    `## ${trackTitle(track)}`,
    safeText(track?.author, "Bilinmeyen sanatçı"),
  ].join("\n"), thumbnail);

  container
    .addSeparatorComponents(spacer())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        buildProgress(queue, track),
        "",
        `- **${queueSize}** parça sırada`,
      ].join("\n"))
    )
    .addSeparatorComponents(spacer())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${sourceLink}`
      )
    )
    .addActionRowComponents(buildPlayerButtons({ isPaused, isStopped, queue }));

  return container;
}

function buildQueueContainer(track, queue) {
  const platform = getTrackPlatform(track);
  const thumbnail = safeURL(track?.thumbnail);
  const position = Math.max(1, Number(queue?.tracks?.size) || 1);
  const sourceLink = trackSourceLink(track);
  const container = new ContainerBuilder().setAccentColor(platform.accentColor);

  addTrackHeader(container, [
    `-# SIRAYA EKLENDİ  ·  #${position}`,
    `## ${trackTitle(track)}`,
    safeText(track?.author, "Bilinmeyen sanatçı"),
  ].join("\n"), thumbnail);

  return container
    .addSeparatorComponents(spacer())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**${track?.duration || "0:00"}**  ·  ${platform.label}`,
        `-# ${sourceLink}`
      ].join("\n"))
    );
}

function buildNoticeContainer(title, description, color = WARNING_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );
}

function noticePayload(title, description, color = WARNING_COLOR, isPrivate = false) {
  return {
    components: [buildNoticeContainer(title, description, color)],
    flags: isPrivate ? PRIVATE_V2_FLAGS : V2_FLAGS,
  };
}

function hasActiveTrack(queue) {
  return Boolean(queue?.currentTrack);
}

function looksLikeURL(value) {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function addPlatformOption(subcommand) {
  return subcommand.addStringOption(option => option
    .setName("platform")
    .setDescription("Arama platformunu seç. Seçilmezse Spotify kullanılır.")
    .setRequired(false)
    .addChoices(...PLATFORM_CHOICES));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("şarkı")
    .setDescription("Modern ve çok platformlu şarkı sistemi.")
    .setDMPermission(false)
    .addSubcommand(subcommand => addPlatformOption(
      subcommand
        .setName("oynat")
        .setDescription("Şarkı adıyla veya bağlantıyla müzik oynatır.")
        .addStringOption(option => option
          .setName("isim")
          .setDescription("Şarkı adını gir. Örnek: Alkan - Farkım Yok")
          .setRequired(false))
        .addStringOption(option => option
          .setName("link")
          .setDescription("Desteklenen bir şarkı veya oynatma listesi bağlantısı gir.")
          .setRequired(false))
    ))
    .addSubcommand(subcommand => addPlatformOption(
      subcommand
        .setName("sıraya-ekle")
        .setDescription("Sıraya platformdan veya linkten yeni bir şarkı ekler.")
        .addStringOption(option => option
          .setName("isim_yada_url")
          .setDescription("Şarkı adı veya desteklenen bir URL gir.")
          .setRequired(true))
    ))
    .addSubcommand(subcommand => subcommand.setName("durdur").setDescription("Şarkıyı duraklatır."))
    .addSubcommand(subcommand => subcommand.setName("devam-et").setDescription("Duraklatılan şarkıya devam eder."))
    .addSubcommand(subcommand => subcommand.setName("bitir").setDescription("Oynatmayı ve sırayı sonlandırır.")),

  async execute(interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply(noticePayload(
        "🎧 Ses Kanalı Gerekli",
        "Bu komutu kullanmak için önce bir ses kanalına katılmalısın.",
        WARNING_COLOR,
        true
      ));
    }

    const botVoiceChannel = interaction.guild?.members?.me?.voice?.channel;
    if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
      return interaction.reply(noticePayload(
        "🔊 Farklı Ses Kanalı",
        `Müzik sistemi şu anda <#${botVoiceChannel.id}> kanalında kullanılıyor.`,
        WARNING_COLOR,
        true
      ));
    }

    await interaction.deferReply();

    const player = useMainPlayer();
    const subcommand = interaction.options.getSubcommand();
    const existingQueue = player.nodes.get(interaction.guildId);
    const playbackCommands = ["oynat", "sıraya-ekle"];

    try {
      if (playbackCommands.includes(subcommand)) {
        const wasActive = hasActiveTrack(existingQueue);
        const queueOwner = existingQueue?.metadata?.requestedBy;

        if (subcommand === "oynat"
          && wasActive
          && queueOwner?.id
          && queueOwner.id !== interaction.user.id) {
          return interaction.editReply(noticePayload(
            "🎶 Oynatma Devam Ediyor",
            `Sırayı <@${queueOwner.id}> yönetiyor. Yeni parça eklemek için \`/şarkı sıraya-ekle\` komutunu kullanabilirsin.`,
            WARNING_COLOR
          ));
        }

        const nameInput = interaction.options.getString("isim")
          || interaction.options.getString("isim_yada_url");
        const linkInput = interaction.options.getString("link");

        if (subcommand === "oynat" && nameInput && linkInput) {
          return interaction.editReply(noticePayload(
            "🎵 Tek Bir Kaynak Seç",
            "Şarkı adı ve bağlantı alanlarından yalnızca birini doldurmalısın.",
            WARNING_COLOR
          ));
        }

        const input = linkInput || nameInput;
        if (!input) {
          return interaction.editReply(noticePayload(
            "🔎 Şarkı Bilgisi Eksik",
            "`isim` veya `link` alanlarından birini doldurmalısın.",
            WARNING_COLOR
          ));
        }

        const platformKey = interaction.options.getString("platform") || DEFAULT_PLATFORM;
        const shouldResolveLink = Boolean(linkInput) || looksLikeURL(input);
        const playable = shouldResolveLink
          ? await searchLink(player, input, interaction.user)
          : await searchPlatformTrack(player, input, platformKey, interaction.user);

        suspendPersistentVoiceConnection(interaction.guildId);
        const { track, queue } = await player.play(voiceChannel, playable, {
          nodeOptions: createMusicNodeOptions(interaction.channel, interaction.user, player),
        });

        if (wasActive) {
          return interaction.editReply({
            components: [buildQueueContainer(track, queue)],
            flags: V2_FLAGS,
          });
        }

        return interaction.editReply({
          components: [buildMusicContainer(track, "caliyor", queue)],
          flags: V2_FLAGS,
        });
      }

      const queue = player.nodes.get(interaction.guildId);
      if (!hasActiveTrack(queue)) {
        return interaction.editReply(noticePayload(
          "🎵 Oynatma Bulunamadı",
          "Şu anda kontrol edilebilecek bir şarkı yok.",
          WARNING_COLOR
        ));
      }

      const queueOwner = queue.metadata?.requestedBy;
      if (queueOwner?.id && interaction.user.id !== queueOwner.id) {
        return interaction.editReply(noticePayload(
          "🔒 Kontrol Yetkisi Yok",
          `Bu sırayı yalnızca şarkıyı başlatan <@${queueOwner.id}> kontrol edebilir.`,
          WARNING_COLOR
        ));
      }

      if (subcommand === "durdur") {
        if (queue.node.isPaused()) {
          return interaction.editReply(noticePayload(
            "⏸️ Zaten Duraklatıldı",
            "Şarkı zaten duraklatılmış durumda.",
            WARNING_COLOR
          ));
        }
        queue.node.pause();
        return interaction.editReply(noticePayload(
          "⏸️ Oynatma Duraklatıldı",
          `**${trackTitle(queue.currentTrack)}** kaldığı yerden devam etmeye hazır.`,
          WARNING_COLOR
        ));
      }

      if (subcommand === "devam-et") {
        if (!queue.node.isPaused()) {
          return interaction.editReply(noticePayload(
            "▶️ Oynatma Zaten Aktif",
            "Şarkı şu anda çalmaya devam ediyor.",
            WARNING_COLOR
          ));
        }
        queue.node.resume();
        return interaction.editReply(noticePayload(
          "▶️ Oynatma Devam Ediyor",
          `**${trackTitle(queue.currentTrack)}** yeniden çalmaya başladı.`,
          SUCCESS_COLOR
        ));
      }

      if (subcommand === "bitir") {
        queue.delete();
        return interaction.editReply(noticePayload(
          "⏹️ Oynatma Sonlandırıldı",
          "Müzik sırası temizlendi ve ses bağlantısı kapatıldı.",
          ERROR_COLOR
        ));
      }
    } catch (error) {
      const queue = useMainPlayer().nodes.get(interaction.guildId);
      if (!queue?.currentTrack) resumePersistentVoiceConnection(interaction.guildId);
      console.error("🔴 [MÜZİK] Şarkı komutu hatası:", error);
      const message = error instanceof MusicSearchError
        ? error.message
        : "Şarkı aranırken veya oynatılırken beklenmeyen bir hata oluştu.";

      return interaction.editReply(noticePayload(
        "⚠️ Müzik İşlemi Başarısız",
        `${message}\n-# Farklı bir arama ifadesi veya platform deneyebilirsin.`,
        ERROR_COLOR
      ));
    }
  },

  buildMusicContainer,
  buildNoticeContainer,
};
