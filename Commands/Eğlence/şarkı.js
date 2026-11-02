const { SlashCommandBuilder } = require("discord.js");
const { useMainPlayer } = require("discord-player");
const { DEFAULT_PLATFORM, PLATFORM_CHOICES, MusicSearchError, createMusicNodeOptions, searchLink, searchPlatformTrack } = require("../../Utils/Media/musicService.js");
const { resumePersistentVoiceConnection, suspendPersistentVoiceConnection } = require("../../Utils/Voice/persistentVoiceConnection.js");

const { buildMusicContainer, buildNoticeContainer, buildQueuedTrackContainer, noticePayload, payload, trackTitle, safeURL, safeText } = require("../../Utils/Media/musicUI");
const { attachMusicMessage, finishMusicSession, refreshMusicMessages, openMusicPanel } = require("../../Utils/Media/musicController");
const { listFavorites } = require("../../Utils/Media/musicFavorites");
const { hasMusicSession, withMusicQueueLock } = require("../../Utils/Media/musicQueue");

const WARNING_COLOR = 0xfee75c;
const ERROR_COLOR = 0xed4245;
const SUCCESS_COLOR = 0x2fba72;

function hasActiveTrack(queue) {
  return Boolean(queue?.currentTrack && !queue.deleted
    && !["error", "ended"].includes(queue.metadata?.musicPlayback?.status));
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
    .addSubcommand(subcommand => subcommand.setName("bitir").setDescription("Oynatmayı ve sırayı sonlandırır."))
    .addSubcommand(subcommand => subcommand.setName("panel").setDescription("Ses, hız, EQ ve bas kontrollerini açar."))
    .addSubcommand(subcommand => subcommand.setName("kuyruk").setDescription("Müzik kuyruğunu ve karıştırma kontrolünü açar."))
    .addSubcommand(subcommand => subcommand.setName("favoriler").setDescription("Kaydettiğin favori şarkıları gösterir.")
      .addIntegerOption(option => option.setName("sayfa").setDescription("Favori sayfası").setMinValue(1).setMaxValue(10))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "favoriler") {
      try {
        const favorites = listFavorites(interaction.user.id);
        const pages = Math.max(1, Math.ceil(favorites.length / 10));
        const page = Math.min(pages, interaction.options.getInteger("sayfa") || 1);
        const lines = favorites.slice((page - 1) * 10, page * 10).map((track, index) => {
          const url = safeURL(track.url);
          return `${(page - 1) * 10 + index + 1}. ${url ? `[${trackTitle(track)}](${url.replaceAll(")", "%29")})` : trackTitle(track)} · ${safeText(track.author).slice(0, 100)}`;
        });
        return interaction.reply(noticePayload("♡ Favori şarkıların", lines.length
          ? `${lines.join("\n")}\n\n-# Sayfa ${page}/${pages} · Oynatmak için bağlantıyı /şarkı oynat link alanına yapıştır.`
          : "Henüz favori şarkın yok. Oynatma panelindeki kalbe basarak ekleyebilirsin.", SUCCESS_COLOR, true));
      } catch (error) {
        console.error("🔴 [MÜZİK] Favoriler okunamadı:", error.message);
        return interaction.reply(noticePayload("Favoriler açılamadı", "Favori kayıtları şu anda okunamıyor.", ERROR_COLOR, true));
      }
    }
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

    const player = useMainPlayer();
    const existingQueue = player.nodes.get(interaction.guildId);
    if (["panel", "kuyruk"].includes(subcommand)) {
      if (!hasActiveTrack(existingQueue)) return interaction.reply(noticePayload(
        "Oynatma bulunamadı", "Şu anda kontrol edilebilecek bir şarkı yok.", WARNING_COLOR, true));
      return openMusicPanel(interaction, existingQueue, subcommand === "kuyruk" ? "queue" : "controls");
    }
    await interaction.deferReply();
    const playbackCommands = ["oynat", "sıraya-ekle"];

    try {
      if (playbackCommands.includes(subcommand)) {
        const initiallyActive = hasMusicSession(existingQueue);
        const queueOwner = existingQueue?.metadata?.requestedBy;

        if (subcommand === "oynat"
          && initiallyActive
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

        return await withMusicQueueLock(player, interaction.guildId, async () => {
          const latestQueue = player.nodes.get(interaction.guildId);
          const wasActive = hasMusicSession(latestQueue);
          const currentVoice = interaction.member?.voice?.channel;
          const currentBotVoice = latestQueue?.channel || interaction.guild?.members?.me?.voice?.channel;
          if (!currentVoice || currentVoice.id !== voiceChannel.id
            || (currentBotVoice && currentBotVoice.id !== currentVoice.id)) {
            return interaction.editReply(noticePayload("Ses kanalı değişti",
              "Arama sırasında ses kanalı değişti. Botla aynı ses kanalından tekrar dene.", WARNING_COLOR));
          }
          const currentOwner = latestQueue?.metadata?.requestedBy;
          if (subcommand === "oynat" && wasActive && currentOwner?.id && currentOwner.id !== interaction.user.id) {
            return interaction.editReply(noticePayload("🎶 Oynatma Devam Ediyor",
              `Sırayı <@${currentOwner.id}> yönetiyor. Yeni parça eklemek için \`/şarkı sıraya-ekle\` komutunu kullanabilirsin.`, WARNING_COLOR));
          }
          if (latestQueue && !latestQueue.deleted && !wasActive) latestQueue.delete();
          suspendPersistentVoiceConnection(interaction.guildId);
          const { track, queue } = await player.play(currentVoice, playable, {
            nodeOptions: createMusicNodeOptions(interaction.channel, interaction.user, player),
          });

          if (wasActive) {
            await refreshMusicMessages(queue);
            return interaction.editReply(payload(buildQueuedTrackContainer(track, queue)));
          }

          const message = await interaction.editReply(payload(buildMusicContainer(queue.currentTrack || track, "caliyor", queue)));
          await attachMusicMessage(queue, message);
          return message;
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
        await refreshMusicMessages(queue);
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
        await refreshMusicMessages(queue);
        return interaction.editReply(noticePayload(
          "▶️ Oynatma Devam Ediyor",
          `**${trackTitle(queue.currentTrack)}** yeniden çalmaya başladı.`,
          SUCCESS_COLOR
        ));
      }

      if (subcommand === "bitir") {
        queue.delete();
        await finishMusicSession(queue);
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
