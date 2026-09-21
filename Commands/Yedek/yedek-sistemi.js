const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown } = require("discord.js");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const ayarlar = require('../../Utils/Core/generalSettings').settings;
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { YEDEK_KLASORU, formatYedekSaati, yedekKlasorunuHazirla, yedekPlaniniKaydet, yedekPlaniniOku } = require("../../Utils/Backup/yedekManager");
const { getBotBackupConfig, getLatestBotZip, saveBotBackupConfig, validateBotBackupRoot } = require("../../Utils/Backup/autoBackup");
const { isSafeGuildBackupId, resolveInside } = require("../../Utils/Core/security");

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_ACCENT_ACTIVE = 0x57f287;
const PANEL_ACCENT_INACTIVE = 0x747f8d;
const PANEL_ACCENT_WARNING = 0xfee75c;
const PANEL_ACCENT_ERROR = 0xed4245;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 4;

function activePath(guildId) {
  return path.join(YEDEK_KLASORU, `${guildId}_aktif.yaml`);
}

function logPath(guildId) {
  return path.join(YEDEK_KLASORU, `${guildId}_log.yaml`);
}

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] ${path.basename(filePath)} okunamadı: ${error.message}`);
    return null;
  }
}

function writeYaml(filePath, data) {
  yedekKlasorunuHazirla();
  fs.writeFileSync(filePath, yaml.dump(data), "utf8");
}

function getGuildBackups(guildId) {
  yedekKlasorunuHazirla();

  return fs.readdirSync(YEDEK_KLASORU, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(file => file.startsWith(`yedek_${guildId}_`) && file.endsWith(".yaml"))
    .map(file => {
      const filePath = path.join(YEDEK_KLASORU, file);

      try {
        const stats = fs.statSync(filePath);
        return {
          id: file.slice(0, -".yaml".length),
          file,
          filePath,
          modifiedAt: stats.mtimeMs,
          size: stats.size,
        };
      } catch (error) {
        console.warn(`⚠️ [YEDEK SİSTEMİ] ${file} bilgileri okunamadı: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean)
    .sort((first, second) => second.modifiedAt - first.modifiedAt);
}

function getDashboardState(guildId) {
  const backups = getGuildBackups(guildId);
  const logConfig = readYaml(logPath(guildId));
  const botBackupConfig = getBotBackupConfig();

  return {
    active: fs.existsSync(activePath(guildId)),
    backups,
    latestBackup: backups[0] || null,
    logChannelId: typeof logConfig?.kanalId === "string" ? logConfig.kanalId : null,
    botBackupConfig,
    latestBotZip: getLatestBotZip(botBackupConfig),
    schedule: yedekPlaniniOku(guildId),
  };
}

function makeId(sessionId, action) {
  return `backup:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `backup:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function inlineCode(value, maxLength = 100) {
  const normalized = String(value ?? "Bulunamadı").replace(/`/g, "'");
  const shortened = normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
  return `\`${shortened}\``;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Bilinmiyor";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function discordTime(milliseconds, style = "R") {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "Bulunamadı";
  return `<t:${Math.floor(milliseconds / 1000)}:${style}>`;
}

function buildScheduleModal(sessionId, schedule) {
  const currentTime = formatYedekSaati(schedule.hour, schedule.minute);
  const input = new TextInputBuilder()
    .setCustomId("time")
    .setLabel("Günlük yedek saati (SS:DD)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Örnek: 09:30")
    .setValue(currentTime)
    .setMinLength(5)
    .setMaxLength(5)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "schedule-modal"))
    .setTitle("Yedek Çalışma Planı")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildBotScheduleModal(sessionId, config) {
  const currentTime = formatYedekSaati(config.hour, config.minute);
  const input = new TextInputBuilder()
    .setCustomId("time")
    .setLabel("Günlük bot ZIP saati (SS:DD)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Örnek: 03:30")
    .setValue(currentTime)
    .setMinLength(5)
    .setMaxLength(5)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "bot-schedule-modal"))
    .setTitle("Bot ZIP Çalışma Planı")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildBotPathModal(sessionId, config) {
  const input = new TextInputBuilder()
    .setCustomId("path")
    .setLabel("Bot kaynak klasörünün tam yolu")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("C:\\Botlar\\ALL In One veya /srv/all-in-one")
    .setMaxLength(1000)
    .setRequired(true);

  if (config.backupRoot) input.setValue(config.backupRoot.slice(0, 1000));

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "bot-path-modal"))
    .setTitle("Bot Yedek Dosya Yolu")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildControlRow(state, sessionId, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "toggle"))
      .setLabel(state.active ? "Sistemi Durdur" : "Sistemi Başlat")
      .setEmoji(state.active ? "⏸️" : "▶️")
      .setStyle(state.active ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "backups"))
      .setLabel(`Yedekler (${state.backups.length})`)
      .setEmoji("🗃️")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "clear-log"))
      .setLabel("Logu Kaldır")
      .setEmoji("🔕")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !state.logChannelId),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "refresh"))
      .setLabel("Yenile")
      .setEmoji(`${emojiler.yukleniyor}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

function buildBotControlRow(config, sessionId, disabled, canManageBotBackups) {
  const controlsDisabled = disabled || !canManageBotBackups;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "bot-toggle"))
      .setLabel(config.enabled ? "ZIP Yedeğini Durdur" : "ZIP Yedeğini Başlat")
      .setEmoji(config.enabled ? "⏸️" : "▶️")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(controlsDisabled),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "bot-schedule"))
      .setLabel("ZIP Saatini Ayarla")
      .setEmoji(`${emojiler.donensaat}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(controlsDisabled),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "bot-path"))
      .setLabel("Dosya Yolunu Ayarla")
      .setEmoji("📁")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(controlsDisabled)
  );
}

function buildPanelPayload(
  guild,
  sessionId,
  disabled = false,
  ephemeral = true,
  canManageBotBackups = false
) {
  const state = getDashboardState(guild.id);
  const latestStructure = state.latestBackup
    ? `${inlineCode(state.latestBackup.id, 80)} · ${discordTime(state.latestBackup.modifiedAt)}`
    : "`Henüz yedek alınmadı`";
  const latestZip = state.latestBotZip
    ? `${inlineCode(state.latestBotZip.file, 65)} · ${discordTime(state.latestBotZip.modifiedAt)}`
    : "`ZIP yedeği bulunamadı`";
  const logChannel = state.logChannelId
    ? `<#${state.logChannelId}> · ${inlineCode(state.logChannelId)}`
    : "`Henüz bir kanal seçilmedi`";
  const status = state.active
    ? "🟢 **Çalışıyor** · Günlük yapı yedekleri alınacak."
    : "🔴 **Kapalı** · Otomatik yapı yedeği alınmıyor.";
  const botPathError = validateBotBackupRoot(state.botBackupConfig.backupRoot);
  const botBackupStatus = !state.botBackupConfig.enabled
    ? "🔴 **Kapalı** · Otomatik bot ZIP yedeği alınmıyor."
    : botPathError
      ? `🟠 **Ayar gerekli** · ${botPathError}`
      : "🟢 **Çalışıyor** · Bot dosyaları günlük ZIP olarak arşivlenecek.";
  const botOwnerNote = canManageBotBackups
    ? "-# ZIP ayarları globaldir ve yaptığın değişiklikler anında uygulanır."
    : "-# 🔒 Global ZIP ayarlarını yalnızca bot sahibi değiştirebilir.";
  const botBackupRoot = canManageBotBackups
    ? inlineCode(state.botBackupConfig.backupRoot, 90)
    : "`Yalnızca bot sahibi görebilir`";
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "log-channel"))
    .setPlaceholder(state.logChannelId ? "Yedek log kanalını değiştir" : "Yedek log kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  const footer = disabled
    ? "-# 🔒 Yönetim oturumunun süresi doldu. Yeni bir panel için /yedek-sistemi komutunu kullan."
    : "-# Ayarlar anında kaydedilir · Panel 5 dakika boyunca kullanılabilir.";

  const container = new ContainerBuilder()
    .setAccentColor(state.active ? PANEL_ACCENT_ACTIVE : PANEL_ACCENT_INACTIVE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ☁️ Yedek Yönetim Merkezi\n**${escapeMarkdown(guild.name)}** sunucusunun yedek akışını tek ekrandan yönet.`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Sunucu Yedek Yönetimi",
          status,
          "",
          `**Log kanalı:** ${logChannel}`,
          `**Yapı yedekleri:** **${state.backups.length}** dosya`,
          `**Son yapı yedeği:** ${latestStructure}`,
          "-# Yeni yedek başarıyla alındığında bu sunucunun önceki yapı yedekleri otomatik silinir.",
        ].join("\n")
      )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "### ⏰ Çalışma Planı",
              `Her gün **${inlineCode(formatYedekSaati(state.schedule.hour, state.schedule.minute))}** · ${inlineCode(state.schedule.timeZone)}`,
              "-# Saat değişikliği bir sonraki plan kontrolünde otomatik uygulanır.",
            ].join("\n")
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "schedule"))
            .setLabel("Saati Ayarla")
            .setEmoji(`${emojiler.donensaat}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Bot Yedek Yönetimi",
          botBackupStatus,
          "",
          `**Çalışma planı:** Her gün ${inlineCode(formatYedekSaati(state.botBackupConfig.hour, state.botBackupConfig.minute))} · ${inlineCode(state.botBackupConfig.timeZone)}`,
          `**Kaynak klasör:** ${botBackupRoot}`,
          `**Son ZIP yedeği:** ${latestZip}`,
          "-# Yeni ZIP yedeği başarıyla alındığında önceki bot yedekleri otomatik silinir.",
          botOwnerNote,
        ].join("\n")
      )
    )
    .addActionRowComponents(
      buildBotControlRow(
        state.botBackupConfig,
        sessionId,
        disabled,
        canManageBotBackups
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Bildirim Hattı \nGünlük yedek raporlarının gönderileceği kanalı aşağıdan seç."
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addActionRowComponents(buildControlRow(state, sessionId, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildBackupSection(backup, sessionId, page, disabled) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### 📦 ${inlineCode(backup.id, 85)}`,
          `**Oluşturulma:** ${discordTime(backup.modifiedAt, "F")} · ${discordTime(backup.modifiedAt)}`,
          `**Boyut:** ${inlineCode(formatBytes(backup.size))}`,
        ].join("\n")
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, `delete:${backup.id}:${page}`))
        .setLabel("Sil")
        .setEmoji(`${emojiler.cop}`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    );
}

function buildBackupListPayload(guildId, sessionId, requestedPage = 0, options = {}) {
  const { disabled = false, ephemeral = false, notice = null } = options;
  const backups = getGuildBackups(guildId);
  const pageCount = Math.max(1, Math.ceil(backups.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageBackups = backups.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);
  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_ACTIVE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## 🗃️ Sunucu Yapı Yedekleri",
          backups.length > 0
            ? `Bu sunucuya ait **${backups.length} yedek** yeniden eskiye doğru sıralandı.`
            : "Bu sunucuya ait kayıtlı bir yapı yedeği bulunmuyor.",
        ].join("\n")
      )
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> ${notice}`)
    );
  }

  if (pageBackups.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    pageBackups.forEach((backup, index) => {
      container.addSectionComponents(buildBackupSection(backup, sessionId, page, disabled));
      if (index < pageBackups.length - 1) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
      }
    });
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addActionRowComponents(
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
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      disabled
        ? "-# 🔒 Bu yedek listesi artık kullanılamaz."
        : "-# Bir yedeği silmeden önce ayrıca onay vermen istenir."
    )
  );

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildDeleteConfirmationPayload(guildId, backupId, sessionId, page) {
  const backup = getGuildBackups(guildId).find(entry => entry.id === backupId);

  if (!backup) {
    return buildBackupListPayload(guildId, sessionId, page, {
      notice: `${emojiler.uyari} Yedek artık mevcut değil; liste yenilendi.`,
    });
  }

  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(PANEL_ACCENT_WARNING)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## ⚠️ Yedeği Sil",
              `${inlineCode(backup.id, 85)} yedeğini kalıcı olarak silmek üzeresin.`,
              "",
              `**Oluşturulma:** ${discordTime(backup.modifiedAt, "F")}`,
              `**Boyut:** ${inlineCode(formatBytes(backup.size))}`,
              "",
              "Bu işlem geri alınamaz. Devam etmek istediğinden emin misin?",
            ].join("\n")
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, `confirm-delete:${backup.id}:${page}`))
              .setLabel("Yedeği Sil")
              .setEmoji(`${emojiler.cop}`)
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, `cancel-delete:${page}`))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_UPDATE_FLAGS,
  };
}

function buildNoticePayload(title, description, isError = false, ephemeral = true) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(isError ? PANEL_ACCENT_ERROR : PANEL_ACCENT_ACTIVE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function validateLogChannel(channel, guild) {
  if (!channel || channel.guildId !== guild.id || !channel.isTextBased?.()) {
    return "Yalnızca bu sunucudaki bir yazı veya duyuru kanalını seçebilirsin.";
  }

  const permissions = channel.permissionsFor?.(guild.members.me);
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel)
    || !permissions?.has(PermissionFlagsBits.SendMessages)
  ) {
    return "Botun seçilen kanalda **Kanalı Görüntüle** ve **Mesaj Gönder** izinleri olmalı.";
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yedek-sistemi")
    .setDescription("Yedekleme sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const sessionId = interaction.id;
    const canManageBotBackups = String(user.id) === String(ayarlar.sahipID);

    await interaction.reply(
      buildPanelPayload(guild, sessionId, false, true, canManageBotBackups)
    );

    let closed = false;
    let closeTimer;

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await interaction.editReply(
        buildPanelPayload(guild, sessionId, true, false, canManageBotBackups)
      ).catch(() => null);
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            "Yedek yönetim panelini yalnızca komutu kullanan yönetici kontrol edebilir.",
            true
          )
        ).catch(() => null);
      }

      try {
        if (action.startsWith("bot-") && !canManageBotBackups) {
          return componentInteraction.reply(
            buildNoticePayload(
              "Bot sahibi yetkisi gerekli",
              "Global bot ZIP ayarlarını yalnızca bot sahibi değiştirebilir.",
              true
            )
          );
        }

        if (componentInteraction.isChannelSelectMenu() && action === "log-channel") {
          const channelId = componentInteraction.values[0];
          const channel = await guild.channels.fetch(channelId).catch(() => null);
          const validationError = validateLogChannel(channel, guild);

          if (validationError) {
            return componentInteraction.reply(
              buildNoticePayload("Kanal kullanılamıyor", validationError, true)
            );
          }

          writeYaml(logPath(guild.id), {
            kanalId: channel.id,
            updatedAt: Date.now(),
          });

          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (componentInteraction.isModalSubmit() && action === "schedule-modal") {
          const time = componentInteraction.fields.getTextInputValue("time").trim();
          const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

          if (!match) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Geçersiz çalışma saati",
                "Saati 24 saat biçiminde **SS:DD** olarak gir. Örnek: `09:30` veya `23:45`.",
                true
              )
            );
          }

          const schedule = yedekPlaniniKaydet(guild.id, {
            hour: Number(match[1]),
            minute: Number(match[2]),
          });
          const formattedTime = formatYedekSaati(schedule.hour, schedule.minute);

          await componentInteraction.reply(
            buildNoticePayload(
              "Çalışma planı güncellendi",
              `${emojiler.tik} Günlük yapı yedeği saati **${inlineCode(formattedTime)}** olarak ayarlandı.`
            )
          );

          return interaction.editReply(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (componentInteraction.isModalSubmit() && action === "bot-schedule-modal") {
          const time = componentInteraction.fields.getTextInputValue("time").trim();
          const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

          if (!match) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Geçersiz ZIP çalışma saati",
                "Saati 24 saat biçiminde **SS:DD** olarak gir. Örnek: `03:30` veya `22:15`.",
                true
              )
            );
          }

          const config = saveBotBackupConfig({
            hour: Number(match[1]),
            minute: Number(match[2]),
          });
          const formattedTime = formatYedekSaati(config.hour, config.minute);

          await componentInteraction.reply(
            buildNoticePayload(
              "Bot ZIP planı güncellendi",
              `${emojiler.tik} Günlük bot ZIP yedeği saati **${inlineCode(formattedTime)}** olarak ayarlandı.`
            )
          );

          return interaction.editReply(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (componentInteraction.isModalSubmit() && action === "bot-path-modal") {
          const backupRoot = componentInteraction.fields.getTextInputValue("path").trim();
          const validationError = validateBotBackupRoot(backupRoot);

          if (validationError) {
            return componentInteraction.reply(
              buildNoticePayload("Dosya yolu kullanılamıyor", validationError, true)
            );
          }

          const config = saveBotBackupConfig({ backupRoot });
          await componentInteraction.reply(
            buildNoticePayload(
              "Bot yedek yolu güncellendi",
              `${emojiler.tik} Bot kaynak klasörü ${inlineCode(config.backupRoot, 90)} olarak ayarlandı.`
            )
          );

          return interaction.editReply(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (!componentInteraction.isButton()) return;

        if (action === "schedule") {
          return componentInteraction.showModal(
            buildScheduleModal(sessionId, yedekPlaniniOku(guild.id))
          );
        }

        if (action === "bot-schedule") {
          return componentInteraction.showModal(
            buildBotScheduleModal(sessionId, getBotBackupConfig())
          );
        }

        if (action === "bot-path") {
          return componentInteraction.showModal(
            buildBotPathModal(sessionId, getBotBackupConfig())
          );
        }

        if (action === "bot-toggle") {
          const current = getBotBackupConfig();
          saveBotBackupConfig({ enabled: !current.enabled });

          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (action === "refresh" || action === "dashboard") {
          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (action === "toggle") {
          const filePath = activePath(guild.id);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          } else {
            writeYaml(filePath, { aktif: true, updatedAt: Date.now() });
          }

          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (action === "clear-log") {
          const filePath = logPath(guild.id);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, false, false, canManageBotBackups)
          );
        }

        if (action === "backups") {
          return componentInteraction.update(
            buildBackupListPayload(guild.id, sessionId)
          );
        }

        if (action.startsWith("page:")) {
          const page = Number(action.slice("page:".length));
          return componentInteraction.update(
            buildBackupListPayload(guild.id, sessionId, page)
          );
        }

        if (action.startsWith("delete:")) {
          const [, backupId, page] = action.split(":");
          if (!isSafeGuildBackupId(backupId, guild.id)) return;

          return componentInteraction.update(
            buildDeleteConfirmationPayload(guild.id, backupId, sessionId, Number(page))
          );
        }

        if (action.startsWith("cancel-delete:")) {
          const page = Number(action.slice("cancel-delete:".length));
          return componentInteraction.update(
            buildBackupListPayload(guild.id, sessionId, page)
          );
        }

        if (action.startsWith("confirm-delete:")) {
          const [, backupId, page] = action.split(":");
          if (!isSafeGuildBackupId(backupId, guild.id)) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Geçersiz yedek",
                "Yalnızca bu sunucuya ait geçerli bir yapı yedeği silinebilir.",
                true
              )
            );
          }

          const filePath = resolveInside(YEDEK_KLASORU, `${backupId}.yaml`);
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

          return componentInteraction.update(
            buildBackupListPayload(guild.id, sessionId, Number(page), {
              notice: `${emojiler.tik} ${inlineCode(backupId, 80)} yedeği silindi.`,
            })
          );
        }
      } catch (error) {
        console.error("🔴 [YEDEK SİSTEMİ PANEL HATASI]", error);
        const payload = buildNoticePayload(
          "İşlem tamamlanamadı",
          `${emojiler.uyari} Yedek ayarı güncellenirken beklenmeyen bir hata oluştu.`,
          true
        );

        if (componentInteraction.replied || componentInteraction.deferred) {
          return componentInteraction.followUp(payload).catch(() => null);
        }
        return componentInteraction.reply(payload).catch(() => null);
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(closeSession, SESSION_TTL);
    closeTimer.unref?.();
  },

  buildPanelPayload,
  buildBackupListPayload,
  getDashboardState,
};
