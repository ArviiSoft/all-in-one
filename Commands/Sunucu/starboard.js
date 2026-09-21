const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, Events, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { DEFAULT_CONFIG, getGuildConfig, listEntries, removeGuild, updateGuildConfig } = require("../../Utils/Engagement/starboardStore");
const { deleteEntryMessages, isValidUnicodeEmoji, reconcileGuild } = require("../../Utils/Engagement/starboardService");

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 10 * 60_000;
const ACCENT_COLOR = 0xf1c40f;
const ACTIVE_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;
const ALLOWED_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const emojiler = require("../../Utils/Emojis/emojiler.js");

const REQUIRED_CHANNEL_PERMISSIONS = [
  [PermissionFlagsBits.ViewChannel, "Kanalı Görüntüle"],
  [PermissionFlagsBits.SendMessages, "Mesaj Gönder"],
  [PermissionFlagsBits.EmbedLinks, "Bağlantı Yerleştir"],
  [PermissionFlagsBits.AttachFiles, "Dosya Ekle"],
  [PermissionFlagsBits.AddReactions, "Tepki Ekle"],
  [PermissionFlagsBits.ReadMessageHistory, "Mesaj Geçmişini Oku"],
];

function makeId(sessionId, action) {
  return `sb:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `sb:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(true);
}

function getTargetChannel(guild, channelId) {
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  return channel && ALLOWED_CHANNEL_TYPES.includes(channel.type) ? channel : null;
}

function missingChannelPermissions(guild, channel) {
  if (!channel) return [];
  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions) return REQUIRED_CHANNEL_PERMISSIONS.map(([, name]) => name);
  return REQUIRED_CHANNEL_PERMISSIONS
    .filter(([permission]) => !permissions.has(permission))
    .map(([, name]) => name);
}

function buildPanelPayload(guild, sessionId, options = {}) {
  const { disabled = false, initial = false, notice = null } = options;
  const config = getGuildConfig(guild.id);
  const targetChannel = getTargetChannel(guild, config.channelId);
  const missingPermissions = missingChannelPermissions(guild, targetChannel);
  const configured = Boolean(targetChannel);
  const operational = config.enabled && configured && missingPermissions.length === 0;
  const trackedCount = listEntries(guild.id).length;
  const hasConfiguration = Boolean(
    config.channelId
    || config.enabled
    || trackedCount
    || config.threshold !== DEFAULT_CONFIG.threshold
    || config.emoji !== DEFAULT_CONFIG.emoji
  );
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel"))
    .setPlaceholder("Starboard kanalını seç")
    .setChannelTypes(...ALLOWED_CHANNEL_TYPES)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (targetChannel) channelSelect.setDefaultChannels(targetChannel.id);

  let statusText = "🟡 Kurulum bekliyor";
  if (config.enabled && !configured) statusText = "🔴 Kanal bulunamadı";
  else if (config.enabled && missingPermissions.length) statusText = "🟠 Yetki eksik";
  else if (operational) statusText = "🟢 Aktif";
  else if (configured) statusText = "⚫ Kapalı";

  const overviewLines = [
    "## ⭐ Starboard Yönetim Paneli",
    "Yüksek tepki alan mesajları tek kanalda topla.",
    "-# Ayarlar kaydedildiği anda uygulanır. Mesaj düzenlemeleri ve reaksiyon değişiklikleri otomatik izlenir.",
    "",
    "### Sistem Özeti",
    `**Durum:** ${statusText}`,
    `**Starboard kanalı:** ${targetChannel ? `<#${targetChannel.id}>` : "`Ayarlanmadı`"}`,
    `**Takip emojisi:** ${config.emoji}`,
    `**Gerekli tepki:** **${config.threshold}**`,
    `**Takip edilen mesaj:** **${trackedCount}**`,
  ];

  if (config.channelId && !targetChannel) {
    overviewLines.push(
      `> ⚠️ Kayıtlı kanal (\`${config.channelId}\`) silinmiş veya artık desteklenen bir metin kanalı değil.`
    );
  }

  if (missingPermissions.length) {
    overviewLines.push(
      `> ⚠️ Botun hedef kanalda eksik yetkileri: **${missingPermissions.join(", ")}**`
    );
  }

  if (notice) {
    overviewLines.push(`> ${notice}`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(operational ? ACTIVE_COLOR : ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(overviewLines.join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Starboard Kanalı",
        "Mesaj kopyalarının gönderileceği metin veya duyuru kanalını seç.",
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### Tepki Eşiği",
            `Bir mesaj **${config.threshold}** adet ${config.emoji} tepkisine ulaşınca Starboard'a gider.`,
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "threshold"))
            .setLabel("Değiştir")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### Takip Emojisi",
            `Geçerli emoji: ${config.emoji} - yalnızca **Unicode emoji** kabul edilir.`,
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "emoji"))
            .setLabel("Değiştir")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "toggle"))
          .setLabel(config.enabled ? "Sistemi Kapat" : "Sistemi Aç")
          .setEmoji(config.enabled ? "⏸️" : "▶️")
          .setStyle(config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(disabled || (!config.enabled && !configured)),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(emojiler.yukleniyor || "🔄")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "reset"))
          .setLabel("Sıfırla")
          .setEmoji(emojiler.cop || "🗑️")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || !hasConfiguration)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Bu panelin kullanım süresi doldu. Yeni panel için `/starboard` komutunu kullan."
          : "-# Panel 10 dakika boyunca aktif."
      )
    );

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildResetConfirmationPayload(sessionId, trackedCount) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ERROR_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ⚠️ Starboard Sistemini Sıfırla",
            "- Kanal, emoji ve eşik ayarları varsayılan değerlere dönecek, sistem kapatılacak.",
            trackedCount > 0
              ? `Starboard kanalındaki **${trackedCount} takipli mesaj** da silinecek.`
              : "Silinecek takipli bir Starboard mesajı yok.",
            "-# Bu işlem geri alınamaz.",
          ].join("\n"))
        )
        .addSeparatorComponents(separator())
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-confirm"))
              .setLabel("Evet, sıfırla")
              .setEmoji(emojiler.cop || "🗑️")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-cancel"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildPrivateNotice(title, description, isError = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(isError ? ERROR_COLOR : ACTIVE_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PANEL_REPLY_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildThresholdModal(sessionId, currentThreshold) {
  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "threshold-modal"))
    .setTitle("Starboard Tepki Eşiği")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("threshold")
          .setLabel("Gerekli tepki sayısı (1-9999)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true)
          .setValue(String(currentThreshold))
      )
    );
}

function buildEmojiModal(sessionId, currentEmoji) {
  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "emoji-modal"))
    .setTitle("Starboard Takip Emojisi")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji")
          .setLabel("Tek bir Unicode emoji")
          .setPlaceholder("⭐")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(32)
          .setRequired(true)
          .setValue(currentEmoji)
      )
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Starboard sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, guildId, user } = interaction;
    const sessionId = interaction.id;
    let closed = false;
    let closeTimer;

    await interaction.reply(buildPanelPayload(guild, sessionId, { initial: true }));

    const runReconciliation = () => {
      void reconcileGuild(botClient, guildId).catch(error => {
        console.error("🔴 [STARBOARD PANEL] Eski mesajlar senkronize edilemedi:", error);
      });
    };

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off(Events.InteractionCreate, listener);
      await interaction.editReply(buildPanelPayload(guild, sessionId, { disabled: true })).catch(() => null);
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id || componentInteraction.guildId !== guildId) {
        return componentInteraction.reply(buildPrivateNotice(
          "Bu panel sana ait değil",
          "Bu Starboard panelini yalnızca komutu kullanan yönetici kontrol edebilir.",
          true
        )).catch(() => null);
      }

      try {
        if (componentInteraction.isChannelSelectMenu() && action === "channel") {
          const selectedChannelId = componentInteraction.values[0];
          const channel = componentInteraction.channels?.get(selectedChannelId)
            || guild.channels.cache.get(selectedChannelId);

          if (!channel || !ALLOWED_CHANNEL_TYPES.includes(channel.type)) {
            return componentInteraction.reply(buildPrivateNotice(
              "Geçersiz kanal",
              "Starboard için bir metin veya duyuru kanalı seçmelisin.",
              true
            ));
          }

          updateGuildConfig(guildId, { channelId: channel.id, enabled: true });
          await componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: `${emojiler.tik || "✅"} Starboard kanalı <#${channel.id}> olarak ayarlandı ve sistem açıldı. Eski kayıtlar yeni kanalla senkronize ediliyor.`,
          }));
          runReconciliation();
          return;
        }

        if (componentInteraction.isButton() && action === "threshold") {
          return componentInteraction.showModal(
            buildThresholdModal(sessionId, getGuildConfig(guildId).threshold)
          );
        }

        if (componentInteraction.isButton() && action === "emoji") {
          return componentInteraction.showModal(
            buildEmojiModal(sessionId, getGuildConfig(guildId).emoji)
          );
        }

        if (componentInteraction.isModalSubmit() && action === "threshold-modal") {
          const rawValue = componentInteraction.fields.getTextInputValue("threshold").trim();
          const threshold = Number(rawValue);
          if (!/^\d{1,4}$/.test(rawValue) || !Number.isInteger(threshold) || threshold < 1 || threshold > 9999) {
            return componentInteraction.reply(buildPrivateNotice(
              "Geçersiz tepki eşiği",
              "Tepki eşiği 1 ile 9999 arasında bir tam sayı olmalı.",
              true
            ));
          }

          updateGuildConfig(guildId, { threshold });
          await componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: `${emojiler.tik || "✅"} Gerekli tepki sayısı **${threshold}** olarak güncellendi.`,
          }));
          runReconciliation();
          return;
        }

        if (componentInteraction.isModalSubmit() && action === "emoji-modal") {
          const emoji = componentInteraction.fields.getTextInputValue("emoji").trim();
          if (!isValidUnicodeEmoji(emoji)) {
            return componentInteraction.reply(buildPrivateNotice(
              "Geçersiz emoji",
              "Yalnızca tek bir Unicode emoji kullanabilirsin. Sunucuya ait `<:emoji:id>` biçimindeki özel emojiler desteklenmez.",
              true
            ));
          }

          updateGuildConfig(guildId, { emoji });
          await componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: `${emojiler.tik || "✅"} Takip emojisi ${emoji} olarak güncellendi. Eski kayıtlar yeni emojiyle senkronize ediliyor.`,
          }));
          runReconciliation();
          return;
        }

        if (!componentInteraction.isButton()) return;

        if (action === "toggle") {
          const config = getGuildConfig(guildId);
          if (!config.channelId) {
            return componentInteraction.reply(buildPrivateNotice(
              "Kanal ayarlanmadı",
              "Sistemi açmadan önce Starboard kanalını seç.",
              true
            ));
          }

          const enabled = !config.enabled;
          updateGuildConfig(guildId, { enabled });
          await componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: enabled ? `${emojiler.tik || "✅"} Starboard sistemi açıldı.` : `⏸️ Starboard sistemi kapatıldı, ayarlar ve mevcut mesajlar korundu.`,
          }));
          if (enabled) runReconciliation();
          return;
        }

        if (action === "refresh") {
          return componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: "🔄 Panel güncel ayarlar ve kanal yetkileriyle yenilendi.",
          }));
        }

        if (action === "reset") {
          return componentInteraction.update(
            buildResetConfirmationPayload(sessionId, listEntries(guildId).length)
          );
        }

        if (action === "reset-cancel") {
          return componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: "Sıfırlama iptal edildi, hiçbir ayar değiştirilmedi.",
          }));
        }

        if (action === "reset-confirm") {
          const entries = removeGuild(guildId);
          await componentInteraction.update(buildPanelPayload(guild, sessionId, {
            notice: `${emojiler.cop || "🗑️"} Starboard sistemi sıfırlandı. ${entries.length ? `**${entries.length} mesaj** siliniyor.` : ""}`.trim(),
          }));
          void deleteEntryMessages(botClient, entries).catch(error => {
            console.error("🔴 [STARBOARD PANEL] Eski Starboard mesajları silinemedi:", error);
          });
        }
      } catch (error) {
        console.error("🔴 [STARBOARD PANEL] İşlem hatası:", error);
        const payload = buildPrivateNotice(
          "İşlem başarısız",
          "Starboard ayarları güncellenirken bir hata oluştu. Konsolu kontrol et.",
          true
        );

        if (componentInteraction.replied || componentInteraction.deferred) {
          await componentInteraction.followUp(payload).catch(() => null);
        } else {
          await componentInteraction.reply(payload).catch(() => null);
        }
      }
    };

    botClient.on(Events.InteractionCreate, listener);
    closeTimer = setTimeout(closeSession, SESSION_TTL);
    closeTimer.unref?.();
  },
};
