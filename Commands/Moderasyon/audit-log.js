const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, escapeMarkdown } = require("discord.js");
const path = require("path");
const { readJson, writeJson } = require("../../Utils/Core/fileDB");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const DB_PATH = path.join(process.cwd(), "Database", "Güvenlik ve Moderasyon", "auditLog.json");
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_ACCENT_ACTIVE = 0x3ba55d;
const PANEL_ACCENT_INACTIVE = 0x747f8d;
const ERROR_ACCENT = 0xed4245;
const SESSION_TTL = 5 * 60_000;

function getGuildConfig(guildId) {
  const data = readJson(DB_PATH, {});
  const config = data && typeof data === "object" && !Array.isArray(data)
    ? data[guildId]
    : null;

  return {
    channelId: config?.channelId || null,
    enabled: config?.enabled === true && Boolean(config?.channelId),
    updatedAt: Number(config?.updatedAt) || null,
  };
}

function updateGuildConfig(guildId, updater) {
  const savedData = readJson(DB_PATH, {});
  const data = savedData && typeof savedData === "object" && !Array.isArray(savedData)
    ? savedData
    : {};
  const current = data[guildId] && typeof data[guildId] === "object"
    ? data[guildId]
    : {};

  updater(current);
  current.updatedAt = Date.now();
  data[guildId] = current;
  writeJson(DB_PATH, data);
  return current;
}

function resetGuildConfig(guildId) {
  const savedData = readJson(DB_PATH, {});
  const data = savedData && typeof savedData === "object" && !Array.isArray(savedData)
    ? savedData
    : {};

  if (!Object.prototype.hasOwnProperty.call(data, guildId)) return false;
  delete data[guildId];
  writeJson(DB_PATH, data);
  return true;
}

function makeId(sessionId, action) {
  return `audit:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `audit:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function channelPermissions(channel, guild) {
  const permissions = channel?.permissionsFor?.(guild.members.me);

  return {
    canView: permissions?.has(PermissionFlagsBits.ViewChannel) === true,
    canSend: permissions?.has(PermissionFlagsBits.SendMessages) === true,
  };
}

function validateChannel(channel, guild) {
  if (!channel || channel.guildId !== guild.id || typeof channel.send !== "function") {
    return "Yalnızca bu sunucudaki yazı veya duyuru kanallarını kullanabilirsin.";
  }

  const permissions = channelPermissions(channel, guild);
  if (!permissions.canView || !permissions.canSend) {
    return "Botun seçilen kanalda **Kanalı Görüntüle** ve **Mesaj Gönder** izinleri olmalı.";
  }

  return null;
}

function buildControlRow(config, sessionId, disabled) {
  const toggleButton = new ButtonBuilder()
    .setCustomId(makeId(sessionId, "toggle"))
    .setLabel(config.enabled ? "Kaydı Durdur" : "Kaydı Başlat")
    .setEmoji(config.enabled ? "⏸️" : "▶️")
    .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    .setDisabled(disabled || !config.channelId);

  const testButton = new ButtonBuilder()
    .setCustomId(makeId(sessionId, "test"))
    .setLabel("Hattı Test Et")
    .setEmoji("🧪")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || !config.channelId);

  const refreshButton = new ButtonBuilder()
    .setCustomId(makeId(sessionId, "refresh"))
    .setLabel("Yenile")
    .setEmoji(`${emojiler.yukleniyor}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  const resetButton = new ButtonBuilder()
    .setCustomId(makeId(sessionId, "reset"))
    .setLabel("Sıfırla")
    .setEmoji(`${emojiler.cop}`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled || !config.channelId);

  return new ActionRowBuilder().addComponents(
    toggleButton,
    testButton,
    refreshButton,
    resetButton
  );
}

function buildPanelPayload(guildId, sessionId, disabled = false, ephemeral = true) {
  const config = getGuildConfig(guildId);
  const status = config.enabled
    ? "🟢 **Yayında** · Yeni denetim hareketleri kaydediliyor."
    : "🟠 **Beklemede** · Denetim hareketleri şu anda kaydedilmiyor.";
  const destination = config.channelId
    ? `<#${config.channelId}> · \`${config.channelId}\``
    : "`Henüz bir kanal seçilmedi`";
  const updated = config.updatedAt
    ? `<t:${Math.floor(config.updatedAt / 1000)}:R>`
    : "Henüz yapılandırılmadı";

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel"))
    .setPlaceholder(config.channelId ? "Kayıt kanalını değiştir" : "Kayıt kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  const footer = disabled
    ? "-# 🔒 Bu yönetim oturumunun süresi doldu. Yeni bir panel için /audit-log komutunu kullan."
    : "-# Kanal seçimi sistemi otomatik başlatır · Bu panel 5 dakika boyunca kullanılabilir.";

  const container = new ContainerBuilder()
    .setAccentColor(config.enabled ? PANEL_ACCENT_ACTIVE : PANEL_ACCENT_INACTIVE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🛰️ Audit Log \nSunucudaki hareketleri tek ekrandan izle ve yönet."
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Kayıt hattı",
          status,
          "",
          `**Hedef kanal:** ${destination}`,
          `**Son değişiklik:** ${updated}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Hedefi yönlendir\nAşağıdan yeni bir kanal seçtiğinde kayıt hattı o kanala taşınır ve otomatik olarak başlatılır."
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addActionRowComponents(buildControlRow(config, sessionId, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildNoticePayload(title, description, isError = false, ephemeral = true) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(isError ? ERROR_ACCENT : PANEL_ACCENT_ACTIVE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildTestPayload(interaction) {
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(PANEL_ACCENT_ACTIVE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 🧪 Denetim hattı doğrulandı\n`SİSTEM TESTİ` · Test başarıyla tamamlandı."
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "### Test özeti",
              `**İşlemi başlatan:** <@${interaction.user.id}> · \`${interaction.user.id}\``,
              `**Sunucu:** ${escapeMarkdown(interaction.guild.name)} · \`${interaction.guild.id}\``,
              "**Sonuç:** 🟢 Kanal mesaj almaya hazır.",
            ].join("\n")
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# <t:${timestamp}:F> · Bu mesaj gerçek bir denetim kaydı değildir.`)
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("audit-log")
    .setDescription("Denetim kaydı sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, guildId, user } = interaction;
    const sessionId = interaction.id;

    await interaction.reply(buildPanelPayload(guildId, sessionId));

    let closed = false;
    let closeTimer;

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await interaction.editReply(
        buildPanelPayload(guildId, sessionId, true, false)
      ).catch(() => null);
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            "Bu yönetim panelini yalnızca komutu kullanan yönetici kontrol edebilir.",
            true
          )
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isChannelSelectMenu() && action === "channel") {
          const channelId = componentInteraction.values[0];
          const channel = await guild.channels.fetch(channelId).catch(() => null);
          const validationError = validateChannel(channel, guild);

          if (validationError) {
            return componentInteraction.reply(
              buildNoticePayload("Kanal kullanılamıyor", validationError, true)
            );
          }

          updateGuildConfig(guildId, config => {
            config.channelId = channelId;
            config.enabled = true;
          });

          return componentInteraction.update(
            buildPanelPayload(guildId, sessionId, false, false)
          );
        }

        if (!componentInteraction.isButton()) return;

        if (action === "refresh") {
          return componentInteraction.update(
            buildPanelPayload(guildId, sessionId, false, false)
          );
        }

        if (action === "reset") {
          resetGuildConfig(guildId);
          return componentInteraction.update(
            buildPanelPayload(guildId, sessionId, false, false)
          );
        }

        if (action === "toggle") {
          const config = getGuildConfig(guildId);
          if (!config.channelId) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Önce bir kanal seç",
                "Kayıt hattını başlatabilmek için panelde bir hedef kanal belirlemelisin.",
                true
              )
            );
          }

          if (!config.enabled) {
            const channel = await guild.channels.fetch(config.channelId).catch(() => null);
            const validationError = validateChannel(channel, guild);
            if (validationError) {
              return componentInteraction.reply(
                buildNoticePayload("Kayıt hattı başlatılamadı", validationError, true)
              );
            }
          }

          updateGuildConfig(guildId, current => {
            current.enabled = !config.enabled;
          });

          return componentInteraction.update(
            buildPanelPayload(guildId, sessionId, false, false)
          );
        }

        if (action === "test") {
          const config = getGuildConfig(guildId);
          const channel = config.channelId
            ? await guild.channels.fetch(config.channelId).catch(() => null)
            : null;
          const validationError = validateChannel(channel, guild);

          if (validationError) {
            return componentInteraction.reply(
              buildNoticePayload("Test gönderilemedi", validationError, true)
            );
          }

          await componentInteraction.deferReply({ flags: MessageFlags.Ephemeral });
          await channel.send(buildTestPayload(componentInteraction));
          return componentInteraction.editReply(
            buildNoticePayload(
              "Kayıt hattı hazır",
              `Test kaydı <#${channel.id}> kanalına başarıyla gönderildi.`,
              false,
              false
            )
          );
        }
      } catch (error) {
        console.error("🔴 [AUDIT LOG PANEL HATASI]", error);
        const payload = buildNoticePayload(
          "İşlem tamamlanamadı",
          "Ayar güncellenirken beklenmeyen bir hata oluştu.",
          true
        );

        if (componentInteraction.deferred) {
          return componentInteraction.editReply({
            ...payload,
            flags: PANEL_UPDATE_FLAGS,
          }).catch(() => null);
        }
        if (componentInteraction.replied) {
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
};
