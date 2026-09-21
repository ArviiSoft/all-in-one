const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { createJsonStore } = require("../../Utils/Core/safeJsonStore");
const { buildGameSetupPayload } = require("../../Utils/Engagement/oyunKurulumPaneli");
const { checkTdkWord } = require("../../Utils/Engagement/tdkSozluk");
const { setupNewGame } = require("../../Utils/Engagement/yeniOyunlar");

const dbPath = path.resolve(__dirname, "../../Database/Eğlence ve Etkileşim/oyunKanallari.json");
const sayiDbPath = path.resolve(__dirname, "../../Database/Eğlence ve Etkileşim/sayiSaymaca.json");
const bomDbPath = path.resolve(__dirname, "../../Database/Eğlence ve Etkileşim/bom.json");
const kelimeDbPath = path.resolve(__dirname, "../../Database/Eğlence ve Etkileşim/kelime.json");
const kelimelerPath = path.resolve(__dirname, "../../Database/Eğlence ve Etkileşim/kelimeler.txt");
const store = createJsonStore(dbPath);
const sayiStore = createJsonStore(sayiDbPath);
const bomStore = createJsonStore(bomDbPath);
const kelimeStore = createJsonStore(kelimeDbPath);
const kelimeler = Object.freeze(
  fs.readFileSync(kelimelerPath, "utf8")
    .split("\n")
    .map(kelime => kelime.trim().toLowerCase())
    .filter(Boolean)
);

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_TTL = 10 * 60_000;
const PANEL_ACCENT_COLOR = 0x5865f2;
const ACTIVE_ACCENT_COLOR = 0x57f287;
const LIST_ACCENT_COLOR = 0x2b9eb3;
const DANGER_ACCENT_COLOR = 0xed4245;
const LIST_PAGE_SIZE = 3;

const GAMES = Object.freeze([
  {
    key: "sayi",
    label: "Sayı Saymaca",
    emoji: "🔢",
    description: "Üyeler bir önceki sayının devamını sırayla yazar.",
  },
  {
    key: "bom",
    label: "Bom Oyunu",
    emoji: "💣",
    description: "Üyeler beşin katlarında sayı yerine 'bom' yazar.",
  },
  {
    key: "kelime",
    label: "Kelime Türetme",
    emoji: "🔤",
    description: "Her kelime, önceki kelimenin son harfiyle başlar.",
  },
  {
    key: "tuttu",
    label: "Tuttu / Tutmadı",
    emoji: "🎯",
    description: "Üyeler sırayla tuttu veya tutmadı mesajları paylaşır.",
  },
  {
    key: "sayiTahmini",
    label: "Sayı Tahmini",
    emoji: "🎲",
    description: "Üyeler botun 1 ile 100 arasında tuttuğu sayıyı bulur.",
  },
  {
    key: "hizliYaz",
    label: "Hızlı Yaz",
    emoji: "⚡",
    description: "Görseldeki kelimeyi 10 saniye içinde ilk yazan kazanır.",
  },
  {
    key: "adamAsmaca",
    label: "Adam Asmaca",
    emoji: "🪢",
    description: "Gizli kelime harf tahminleriyle ortaya çıkarılır.",
  },
]);

const GAME_BY_KEY = new Map(GAMES.map(game => [game.key, game]));
const BASE_CHANNEL_PERMISSIONS = Object.freeze([
  { bit: PermissionFlagsBits.ViewChannel, label: "Kanalı Görüntüle" },
  { bit: PermissionFlagsBits.SendMessages, label: "Mesaj Gönder" },
  { bit: PermissionFlagsBits.ReadMessageHistory, label: "Mesaj Geçmişini Oku" },
]);
const REACTION_PERMISSION = Object.freeze(
  { bit: PermissionFlagsBits.AddReactions, label: "Tepki Ekle" }
);
const ATTACHMENT_PERMISSION = Object.freeze(
  { bit: PermissionFlagsBits.AttachFiles, label: "Dosya Ekle" }
);
const LEGACY_GAME_PERMISSIONS = Object.freeze([
  { bit: PermissionFlagsBits.ManageMessages, label: "Mesajları Yönet" },
  { bit: PermissionFlagsBits.ManageWebhooks, label: "Webhook'ları Yönet" },
  REACTION_PERMISSION,
]);
const NEW_GAME_KEYS = new Set(["sayiTahmini", "hizliYaz", "adamAsmaca"]);

function makeId(sessionId, action) {
  return `games:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `games:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function normalizeGuildSettings(value) {
  const settings = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;

  for (const game of GAMES) {
    const channelId = value[game.key];
    if (/^\d{17,20}$/.test(String(channelId || ""))) {
      settings[game.key] = String(channelId);
    }
  }

  return settings;
}

function getGuildSettings(guildId) {
  return normalizeGuildSettings(store.get(guildId));
}

function updateGuildSettings(guildId, updater) {
  return store.update(data => {
    const settings = { ...data[guildId] };
    updater(settings);

    if (Object.keys(settings).length === 0) {
      delete data[guildId];
    } else {
      data[guildId] = settings;
    }

    return settings;
  });
}

async function initializeKelimeGame(guildId) {
  if (kelimeler.length === 0) {
    throw new Error("Kelime oyunu başlatılamadı: kelimeler.txt boş.");
  }

  let baslangicKelimesi = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = kelimeler[Math.floor(Math.random() * kelimeler.length)];
    baslangicKelimesi ||= candidate;
    const tdkKontrolu = await checkTdkWord(candidate);

    if (!tdkKontrolu.available || tdkKontrolu.valid) {
      baslangicKelimesi = candidate;
      break;
    }
  }

  kelimeStore.update(data => {
    data[guildId] = {
      ...data[guildId],
      sonKelime: baslangicKelimesi,
      kullanilanlar: [baslangicKelimesi],
    };
  });
  return baslangicKelimesi;
}

function nextGameNumber(gameStore, guildId) {
  const currentNumber = Number(gameStore.get(guildId)?.sayi);
  return Number.isInteger(currentNumber) && currentNumber >= 0 ? currentNumber + 1 : 1;
}

function gameSetupOptions(gameKey, guildId, initialWord = null) {
  if (gameKey === "sayi") {
    return { nextNumber: nextGameNumber(sayiStore, guildId) };
  }
  if (gameKey === "bom") {
    return { nextNumber: nextGameNumber(bomStore, guildId) };
  }
  if (gameKey === "kelime") {
    return { initialWord };
  }
  return {};
}

function getConfiguredGames(guild, guildId) {
  const settings = getGuildSettings(guildId);
  return GAMES
    .filter(game => settings[game.key])
    .map(game => ({
      ...game,
      channelId: settings[game.key],
      channel: guild.channels.cache.get(settings[game.key]) || null,
    }));
}

function channelLabel(guild, channelId) {
  if (!channelId) return "`Ayarlanmadı`";
  return guild.channels.cache.has(channelId)
    ? `<#${channelId}>`
    : `\`Silinmiş veya erişilemeyen kanal (${channelId})\``;
}

function channelState(record) {
  if (!record.channel) return "🔴 Kanal bulunamadı, bu kaydı listeden silebilirsin.";
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(record.channel.type)) {
    return "🟠 Kanal türü artık bu oyun için uygun değil.";
  }
  return "🟢 Oyun bu kanalda aktif.";
}

function requiredPermissionsForGame(gameKey) {
  if (["sayi", "bom", "kelime", "tuttu"].includes(gameKey)) {
    return [...BASE_CHANNEL_PERMISSIONS, ...LEGACY_GAME_PERMISSIONS];
  }
  if (["hizliYaz", "adamAsmaca"].includes(gameKey)) {
    return [...BASE_CHANNEL_PERMISSIONS, REACTION_PERMISSION, ATTACHMENT_PERMISSION];
  }
  return [...BASE_CHANNEL_PERMISSIONS, REACTION_PERMISSION];
}

function missingPermissions(channel, gameKey) {
  const requiredPermissions = requiredPermissionsForGame(gameKey);
  const permissions = channel.permissionsFor(channel.guild.members.me);
  if (!permissions) return requiredPermissions;
  return requiredPermissions.filter(permission => !permissions.has(permission.bit));
}

function chooseInitialGame(guildId) {
  const settings = getGuildSettings(guildId);
  return GAMES.find(game => !settings[game.key])?.key || GAMES[0].key;
}

function buildPanelPayload({
  guild,
  guildId,
  sessionId,
  selectedGameKey,
  notice = null,
  disabled = false,
  expired = false,
  initial = false,
}) {
  const settings = getGuildSettings(guildId);
  const configuredCount = Object.keys(settings).length;
  const unavailableCount = Object.values(settings)
    .filter(channelId => !guild.channels.cache.has(channelId)).length;
  const selectedGame = GAME_BY_KEY.get(selectedGameKey) || GAMES[0];
  const selectedChannelId = settings[selectedGame.key];
  const selectedChannelExists = Boolean(
    selectedChannelId && guild.channels.cache.has(selectedChannelId)
  );

  const gameSelect = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "select-game"))
    .setPlaceholder("Ayarlamak istediğin oyunu seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled)
    .addOptions(GAMES.map(game => ({
      label: game.label,
      value: game.key,
      description: game.description,
      emoji: game.emoji,
      default: game.key === selectedGame.key,
    })));

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, `assign:${selectedGame.key}`))
    .setPlaceholder(`${selectedGame.label} için kanal seç`)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (selectedChannelExists) channelSelect.setDefaultChannels(selectedChannelId);

  const summaryLines = GAMES.map(game => {
    const channelId = settings[game.key];
    const status = channelId && guild.channels.cache.has(channelId) ? "🟢" : channelId ? "🔴" : "🟠";
    return `${status} ${game.emoji} **${game.label}:** ${channelLabel(guild, channelId)}`;
  });

  const setupLines = [
    `### ${selectedGame.emoji} ${selectedGame.label}`,
    selectedGame.description,
    `**Mevcut kanal:** ${channelLabel(guild, selectedChannelId)}`,
    "-# Önce oyun türünü, ardından oyunun çalışacağı kanalı seç. Yeni seçim mevcut kanalın yerini alır.",
  ];
  if (selectedGame.key === "kelime") {
    setupLines.push("-# Kanal kaydedildiğinde kelime oyunu yeni bir başlangıç kelimesiyle hemen başlatılır.");
  }
  if (NEW_GAME_KEYS.has(selectedGame.key)) {
    setupLines.push("-# Kanal kaydedildiğinde ilk oyun turu ve ilgili görsel/panel kanala hemen gönderilir.");
  }
  if (notice) setupLines.push(`> ${notice}`);

  const container = new ContainerBuilder()
    .setAccentColor(configuredCount > 0 ? ACTIVE_ACCENT_COLOR : PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 🎮 Oyun Sistemleri",
        "Yedi oyun kanalını tek panelden kurabilir, değiştirebilir veya kaldırabilirsin.",
        "-# Değişiklikler kaydedildiği anda uygulanır, botu yeniden başlatman gerekmez.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Sistem Özeti",
        `**Kurulu oyun:** \`${configuredCount}/${GAMES.length}\``,
        unavailableCount > 0 ? `⚠️ **Erişilemeyen kayıt:** ${unavailableCount}` : null,
        "",
        ...summaryLines,
      ].filter(line => line !== null).join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(setupLines.join("\n")))
    .addActionRowComponents(new ActionRowBuilder().addComponents(gameSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "list"))
          .setLabel("Ayarları Listele")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(`${emojiler.yukleniyor || "🔄"}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "clear"))
          .setLabel("Tümünü Sıfırla")
          .setEmoji(`${emojiler.cop || "🗑️"}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || configuredCount === 0)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        expired
          ? "-# 🔒 Bu panelin kullanım süresi doldu. Yeni bir panel için `/oyunları-kur` komutunu kullan."
          : "-# Panel 10 dakika boyunca yalnızca komutu kullanan yönetici tarafından kullanılabilir."
      )
    );

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildListPayload(guild, guildId, sessionId, requestedPage = 0, options = {}) {
  const { disabled = false, notice = null } = options;
  const records = getConfiguredGames(guild, guildId);
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);
  const headerLines = [
    "## 📋 Kurulu Oyunlar",
    records.length > 0
      ? `Toplam **${records.length} oyun** ayarlanmış. Kaldırmak istediğin ayarın yanındaki butonu kullan.`
      : "Bu sunucuda ayarlanmış bir oyun kanalı bulunmuyor.",
  ];
  if (notice) headerLines.push(`> ${notice}`);

  const container = new ContainerBuilder()
    .setAccentColor(LIST_ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join("\n")));

  if (pageRecords.length > 0) {
    container.addSeparatorComponents(separator());

    pageRecords.forEach((record, index) => {
      const itemNumber = page * LIST_PAGE_SIZE + index + 1;
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
              `### ${itemNumber}. ${record.emoji} ${record.label}`,
              `📍 **Kanal:** ${channelLabel(guild, record.channelId)}`,
              `**Durum:** ${channelState(record)}`,
            ].join("\n"))
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, `delete:${record.key}:${page}`))
              .setLabel("Ayarı Sil")
              .setEmoji(`${emojiler.cop || "🗑️"}`)
              .setStyle(ButtonStyle.Danger)
              .setDisabled(disabled)
          )
      );

      if (index < pageRecords.length - 1) container.addSeparatorComponents(separator());
    });
  }

  container
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, `page:${page - 1}`))
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page === 0),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, `page-indicator:${page}`))
          .setLabel(`${page + 1}/${pageCount}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, `page:${page + 1}`))
          .setEmoji("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page === pageCount - 1),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "dashboard"))
          .setLabel("Panele Dön")
          .setEmoji("↩️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Bu oyun listesi artık kullanılamaz."
          : "-# Silme butonu yalnızca seçtiğin oyun-kanal eşleşmesini kaldırır, oyun geçmişini silmez."
      )
    );

  return {
    components: [container],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildClearConfirmationPayload(sessionId, configuredCount) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(DANGER_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ⚠️ Tüm Oyun Ayarlarını Sıfırla",
            `- Kayıtlı **${configuredCount} oyun-kanal eşleşmesinin** tamamı kaldırılacak.`,
            "-# Oyunların mevcut ilerleme kayıtları ve eski kanal mesajları etkilenmez.",
          ].join("\n"))
        )
        .addSeparatorComponents(separator())
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "clear-confirm"))
              .setLabel("Evet, tümünü sıfırla")
              .setEmoji(`${emojiler.cop || "🗑️"}`)
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "clear-cancel"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildNoticePayload(title, description) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(DANGER_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PANEL_REPLY_FLAGS,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  GAMES,
  missingPermissions,
  initializeKelimeGame,
  gameSetupOptions,
  data: new SlashCommandBuilder()
    .setName("oyunları-kur")
    .setDescription("Oyun sistemlerini kurar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, guildId, user } = interaction;
    const sessionId = interaction.id;
    let selectedGameKey = chooseInitialGame(guildId);
    let currentView = { name: "dashboard", page: 0 };
    let closed = false;
    let closeTimer;

    const renderPanel = (options = {}) => buildPanelPayload({
      guild,
      guildId,
      sessionId,
      selectedGameKey,
      ...options,
    });

    await interaction.reply(renderPanel({ initial: true }));

    const cleanup = () => {
      if (closed) return false;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      return true;
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            `${emojiler.uyari || "⚠️"} Bu yönetim panelini yalnızca komutu kullanan yönetici kontrol edebilir.`
          )
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isStringSelectMenu() && action === "select-game") {
          const nextGameKey = componentInteraction.values[0];
          if (!GAME_BY_KEY.has(nextGameKey)) return;

          selectedGameKey = nextGameKey;
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(renderPanel());
        }

        if (componentInteraction.isChannelSelectMenu() && action.startsWith("assign:")) {
          const gameKey = action.slice("assign:".length);
          const game = GAME_BY_KEY.get(gameKey);
          const channelId = componentInteraction.values[0];
          const channel = componentInteraction.channels?.get(channelId)
            || guild.channels.cache.get(channelId)
            || await guild.channels.fetch(channelId).catch(() => null);

          if (
            !game
            || !channel
            || channel.guildId !== guildId
            || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
          ) {
            return componentInteraction.update(renderPanel({
              notice: `${emojiler.uyari || "⚠️"} Seçilen kanal bu oyun için kullanılamıyor.`,
            }));
          }

          selectedGameKey = gameKey;
          const settings = getGuildSettings(guildId);
          const conflict = GAMES.find(otherGame => (
            otherGame.key !== gameKey && settings[otherGame.key] === channelId
          ));

          if (conflict) {
            return componentInteraction.update(renderPanel({
              notice: `${emojiler.uyari || "⚠️"} <#${channelId}> zaten **${conflict.label}** için kullanılıyor. Her oyun için farklı bir kanal seç.`,
            }));
          }

          const missing = missingPermissions(channel, gameKey);
          if (missing.length > 0) {
            return componentInteraction.update(renderPanel({
              notice: `${emojiler.uyari || "⚠️"} <#${channelId}> kanalında şu bot izinleri eksik: ${missing.map(permission => `**${permission.label}**`).join(", ")}.`,
            }));
          }

          await componentInteraction.deferUpdate();
          updateGuildSettings(guildId, nextSettings => {
            nextSettings[gameKey] = channelId;
          });
          currentView = { name: "dashboard", page: 0 };

          let setupNotice = `${emojiler.tik || "✅"} **${game.label}** <#${channelId}> kanalında etkinleştirildi.`;
          let baslangicKelimesi = null;

          try {
            if (NEW_GAME_KEYS.has(gameKey)) {
              const detail = await setupNewGame(gameKey, guildId, channel);
              setupNotice += ` ${detail}`;
            } else if (gameKey === "kelime") {
              baslangicKelimesi = await initializeKelimeGame(guildId);
              await channel.send(
                buildGameSetupPayload(
                  gameKey,
                  gameSetupOptions(gameKey, guildId, baslangicKelimesi)
                )
              );
              setupNotice += ` İlk kelime **${baslangicKelimesi}** olarak kurulum panelinde gösterildi.`;
            } else {
              await channel.send(
                buildGameSetupPayload(gameKey, gameSetupOptions(gameKey, guildId))
              );
              setupNotice += " Oyun kurulum paneli kanala gönderildi.";
            }
          } catch (error) {
            console.error(`🔴 [${game.label.toLocaleUpperCase("tr-TR")} KURULUM MESAJI]`, error);
            setupNotice += ` ${emojiler.uyari || "⚠️"} Kurulum paneli kanala gönderilemedi.`;
          }

          return interaction.editReply(renderPanel({
            notice: setupNotice,
          }));
        }

        if (!componentInteraction.isButton()) return;

        if (action === "list") {
          currentView = { name: "list", page: 0 };
          return componentInteraction.update(buildListPayload(guild, guildId, sessionId, 0));
        }

        if (action === "dashboard") {
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(renderPanel());
        }

        if (action === "refresh") {
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(renderPanel({ notice: "🔄 Panel güncel oyun ayarlarıyla yenilendi." }));
        }

        if (action === "clear") {
          const configuredCount = Object.keys(getGuildSettings(guildId)).length;
          if (configuredCount === 0) {
            return componentInteraction.update(renderPanel({
              notice: `${emojiler.uyari || "⚠️"} Sıfırlanacak bir oyun ayarı bulunmuyor.`,
            }));
          }

          currentView = { name: "confirm", page: 0 };
          return componentInteraction.update(buildClearConfirmationPayload(sessionId, configuredCount));
        }

        if (action === "clear-cancel") {
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(renderPanel({ notice: "Sıfırlama iptal edildi; oyun ayarları değiştirilmedi." }));
        }

        if (action === "clear-confirm") {
          const deletedCount = Object.keys(getGuildSettings(guildId)).length;
          updateGuildSettings(guildId, settings => {
            for (const game of GAMES) delete settings[game.key];
          });
          selectedGameKey = GAMES[0].key;
          currentView = { name: "dashboard", page: 0 };

          return componentInteraction.update(renderPanel({
            notice: `${emojiler.tik || "✅"} **${deletedCount} oyun ayarı** kaldırıldı.`,
          }));
        }

        if (action.startsWith("delete:")) {
          const [, gameKey, requestedPage] = action.split(":");
          const game = GAME_BY_KEY.get(gameKey);
          if (!game) return;

          let deletedChannelId = null;
          updateGuildSettings(guildId, settings => {
            deletedChannelId = settings[gameKey] || null;
            delete settings[gameKey];
          });

          const recordsAfterDelete = getConfiguredGames(guild, guildId);
          const lastPage = Math.max(0, Math.ceil(recordsAfterDelete.length / LIST_PAGE_SIZE) - 1);
          const nextPage = Math.min(Math.max(Number(requestedPage) || 0, 0), lastPage);
          currentView = { name: "list", page: nextPage };

          return componentInteraction.update(buildListPayload(guild, guildId, sessionId, nextPage, {
            notice: deletedChannelId
              ? `${emojiler.tik || "✅"} **${game.label}** ayarı kaldırıldı.`
              : `${emojiler.uyari || "⚠️"} Bu oyun ayarı zaten kaldırılmış; liste yenilendi.`,
          }));
        }

        if (action.startsWith("page:")) {
          const page = Number(action.slice("page:".length));
          if (!Number.isInteger(page)) return;

          currentView = { name: "list", page };
          return componentInteraction.update(buildListPayload(guild, guildId, sessionId, page));
        }
      } catch (error) {
        console.error("🔴 [OYUN SİSTEMLERİ YÖNETİM PANELİ]", error);
        const payload = buildNoticePayload(
          "İşlem başarısız",
          `${emojiler.uyari || "⚠️"} Oyun ayarları güncellenirken beklenmeyen bir hata oluştu.`
        );

        if (componentInteraction.replied || componentInteraction.deferred) {
          return componentInteraction.followUp(payload).catch(() => null);
        }
        return componentInteraction.reply(payload).catch(() => null);
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(async () => {
      if (!cleanup()) return;

      const payload = currentView.name === "list"
        ? buildListPayload(guild, guildId, sessionId, currentView.page, { disabled: true })
        : renderPanel({ disabled: true, expired: true });
      await interaction.editReply(payload).catch(() => null);
    }, PANEL_TTL);
    closeTimer.unref?.();
  },
};
