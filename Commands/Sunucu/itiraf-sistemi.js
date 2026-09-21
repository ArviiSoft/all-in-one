const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { MINIMUM_CHARACTERS_LIMIT, deleteGuildItirafSetting, getGuildItirafSetting, updateGuildItirafSetting } = require("../../Utils/Engagement/itirafStore");

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_TTL = 10 * 60_000;
const ACCENT_ACTIVE = 0x57f287;
const ACCENT_PAUSED = 0xfee75c;
const ACCENT_IDLE = 0x5865f2;
const ACCENT_DANGER = 0xed4245;

function makeId(sessionId, action) {
  return `itiraf:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `itiraf:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function channelValue(guild, channelId) {
  if (!channelId) return "`Ayarlanmadı`";
  return guild.channels.cache.has(channelId) ? `<#${channelId}>` : "`Kayıtlı kanal bulunamadı`";
}

function systemState(guild, setting) {
  if (!setting?.itirafKanal || !guild.channels.cache.has(setting.itirafKanal)) {
    return {
      accent: ACCENT_IDLE,
      icon: "🟡",
      label: "Kurulum bekliyor",
      detail: "İtiraf kanalı seçildiğinde sistem otomatik olarak açılır.",
      enabled: false,
    };
  }

  if (!setting.aktif) {
    return {
      accent: ACCENT_PAUSED,
      icon: "🟠",
      label: "Duraklatıldı",
      detail: "Kanallar korunuyor, yeni itiraflar işlenmiyor.",
      enabled: false,
    };
  }

  return {
    accent: ACCENT_ACTIVE,
    icon: "🟢",
    label: "Aktif",
    detail: "Seçili kanaldaki yeni mesajlar anonim olarak yayınlanıyor.",
    enabled: true,
  };
}

function buildPanelPayload({
  guild,
  guildId,
  sessionId,
  notice = null,
  disabled = false,
  expired = false,
  initial = false,
}) {
  const setting = getGuildItirafSetting(guildId);
  const state = systemState(guild, setting);
  const confessionChannelExists = Boolean(
    setting?.itirafKanal && guild.channels.cache.has(setting.itirafKanal)
  );
  const logChannelExists = Boolean(setting?.logKanal && guild.channels.cache.has(setting.logKanal));
  const unsafeLogChannel = Boolean(
    setting?.itirafKanal && setting.logKanal === setting.itirafKanal
  );

  const confessionChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel:confession"))
    .setPlaceholder("İtiraf kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (confessionChannelExists) {
    confessionChannelSelect.setDefaultChannels(setting.itirafKanal);
  }

  const logChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel:log"))
    .setPlaceholder("Log kanalını seç (isteğe bağlı)")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (logChannelExists) {
    logChannelSelect.setDefaultChannels(setting.logKanal);
  }

  const container = new ContainerBuilder()
    .setAccentColor(state.accent)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## İtiraf Sistemi",
        "Anonim itiraf kanalını, loglarını ve gönderim kurallarını buradan yönetebilirsin.",
        "-# Değişiklikler kaydedildiği anda uygulanır, botu yeniden başlatman gerekmez.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            `${state.icon} **Sistem durumu: ${state.label}**`,
            state.detail,
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "toggle"))
            .setLabel(state.enabled ? "Duraklat" : "Etkinleştir")
            .setStyle(state.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(disabled || !confessionChannelExists)
        )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### İtiraf Kanalı",
        `**Seçili kanal:** ${channelValue(guild, setting?.itirafKanal)}`,
        "-# Üyelerin bu kanala yazdığı mesajlar silinir ve anonim webhook mesajı olarak yeniden yayınlanır.",
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(confessionChannelSelect))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Güvenlik Logu · İsteğe Bağlı",
        `**Seçili kanal:** ${channelValue(guild, setting?.logKanal)}`,
        unsafeLogChannel
          ? "⚠️ **Bu kanal itiraf kanalıyla aynı olduğu için kimlik logları güvenlik amacıyla gönderilmiyor.**"
          : "-# İtiraf sahibinin kimliği ve orijinal içeriği yalnızca bu kanala gönderilir.",
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(logChannelSelect))
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### Gönderim Kuralları",
            `🔤 **Minimum uzunluk:** \`${setting?.minimumKarakter ?? 10} karakter\``,
            "-# Boşluklar minimum karakter hesabına dahil edilmez.",
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "minimum"))
            .setLabel("Değiştir")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `😀 **Tepkiler:** ${setting?.tepkiler !== false ? "Açık" : "Kapalı"}\n-# Anonim itiraf mesajına hızlı tepki emojileri eklenir.`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "reactions"))
            .setLabel(setting?.tepkiler !== false ? "Kapat" : "Aç")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> ${notice}`)
    );
  }

  container
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "clear-log"))
          .setLabel("Log Kanalını Kaldır")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || !setting?.logKanal),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(`${emojiler.yukleniyor || "🔄"}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "reset"))
          .setLabel("Tümünü Sıfırla")
          .setEmoji(`${emojiler.cop || "🗑️"}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || !setting)
      )
    );

  if (expired) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# Bu panelin kullanım süresi doldu. Yeniden açmak için `/itiraf-sistemi` komutunu kullan."
      )
    );
  }

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildResetConfirmationPayload(sessionId) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_DANGER)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## İtiraf Sistemini Sıfırla",
        "- İtiraf kanalı, log kanalı ve gönderim kurallarının tamamı kaldırılacak.",
        "-# Gönderilmiş eski itiraf ve log mesajları silinmez.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "confirm-reset"))
          .setLabel("Evet, sistemi sıfırla")
          .setEmoji(`${emojiler.cop || "🗑️"}`)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "cancel-reset"))
          .setLabel("Vazgeç")
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return {
    components: [container],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildMinimumModal(sessionId, currentMinimum) {
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Minimum karakter sayısı")
    .setPlaceholder(`1-${MINIMUM_CHARACTERS_LIMIT} arasında bir sayı gir`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(3)
    .setValue(String(currentMinimum));

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "minimum-submit"))
    .setTitle("İtiraf Uzunluk Sınırı")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function missingPermissions(channel, requiredPermissions) {
  const botPermissions = channel.permissionsFor(channel.guild.members.me);
  if (!botPermissions) return requiredPermissions;
  return requiredPermissions.filter(permission => !botPermissions.has(permission.bit));
}

function permissionError(channel, requiredPermissions) {
  const missing = missingPermissions(channel, requiredPermissions);
  if (missing.length === 0) return null;
  return `<#${channel.id}> kanalında şu bot izinleri eksik: ${missing.map(item => `**${item.label}**`).join(", ")}.`;
}

const BASE_CONFESSION_CHANNEL_PERMISSIONS = [
  { bit: PermissionFlagsBits.ViewChannel, label: "Kanalı Görüntüle" },
  { bit: PermissionFlagsBits.SendMessages, label: "Mesaj Gönder" },
  { bit: PermissionFlagsBits.ManageMessages, label: "Mesajları Yönet" },
  { bit: PermissionFlagsBits.ManageWebhooks, label: "Webhook'ları Yönet" },
];

const REACTION_CHANNEL_PERMISSIONS = [
  { bit: PermissionFlagsBits.AddReactions, label: "Tepki Ekle" },
  { bit: PermissionFlagsBits.ReadMessageHistory, label: "Mesaj Geçmişini Oku" },
];

function confessionChannelPermissions(setting) {
  return setting?.tepkiler === false
    ? BASE_CONFESSION_CHANNEL_PERMISSIONS
    : [...BASE_CONFESSION_CHANNEL_PERMISSIONS, ...REACTION_CHANNEL_PERMISSIONS];
}

const LOG_CHANNEL_PERMISSIONS = [
  { bit: PermissionFlagsBits.ViewChannel, label: "Kanalı Görüntüle" },
  { bit: PermissionFlagsBits.SendMessages, label: "Mesaj Gönder" },
  { bit: PermissionFlagsBits.EmbedLinks, label: "Bağlantı Yerleştir" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("itiraf-sistemi")
    .setDescription("İtiraf sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, guildId, user } = interaction;
    const sessionId = interaction.id;
    let closed = false;
    let closeTimer;

    const render = (options = {}) => buildPanelPayload({
      guild,
      guildId,
      sessionId,
      ...options,
    });

    await interaction.reply(render({ initial: true }));

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
        return componentInteraction.reply({
          content: `${emojiler.uyari || "⚠️"} Bu yönetim paneli başka bir yöneticiye ait.`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }

      try {
        if (componentInteraction.isChannelSelectMenu() && action.startsWith("channel:")) {
          const field = action.slice("channel:".length);
          const channelId = componentInteraction.values[0];
          const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
          const current = getGuildItirafSetting(guildId);

          if (
            (field === "confession" && current?.logKanal === channelId)
            || (field === "log" && current?.itirafKanal === channelId)
          ) {
            return componentInteraction.update(render({
              notice: "⚠️ Kimlik bilgilerinin açığa çıkmaması için itiraf kanalı ile güvenlik logu aynı kanal olamaz.",
            }));
          }

          const error = permissionError(
            channel,
            field === "confession" ? confessionChannelPermissions(current) : LOG_CHANNEL_PERMISSIONS
          );

          if (error) {
            return componentInteraction.update(render({ notice: `⚠️ ${error}` }));
          }

          updateGuildItirafSetting(guildId, setting => {
            if (field === "confession") {
              setting.itirafKanal = channelId;
              setting.aktif = true;
            } else {
              setting.logKanal = channelId;
            }
          });

          return componentInteraction.update(render({
            notice: field === "confession"
              ? `${emojiler.tik || "✅"} İtiraf kanalı <#${channelId}> olarak kaydedildi ve sistem etkinleştirildi.`
              : `${emojiler.tik || "✅"} Güvenlik logu <#${channelId}> olarak kaydedildi.`,
          }));
        }

        if (componentInteraction.isModalSubmit() && action === "minimum-submit") {
          const rawValue = componentInteraction.fields.getTextInputValue("value").trim();
          const value = Number(rawValue);

          if (!/^\d+$/.test(rawValue) || !Number.isInteger(value) || value < 1 || value > MINIMUM_CHARACTERS_LIMIT) {
            return componentInteraction.reply({
              content: `${emojiler.uyari || "⚠️"} Minimum uzunluk 1-${MINIMUM_CHARACTERS_LIMIT} arasında tam sayı olmalı.`,
              flags: MessageFlags.Ephemeral,
            });
          }

          updateGuildItirafSetting(guildId, setting => {
            setting.minimumKarakter = value;
          });
          await componentInteraction.deferUpdate();
          return interaction.editReply(render({
            notice: `${emojiler.tik || "✅"} Minimum itiraf uzunluğu **${value} karakter** olarak güncellendi.`,
          }));
        }

        if (!componentInteraction.isButton()) return;

        if (action === "toggle") {
          const current = getGuildItirafSetting(guildId);
          if (!current?.itirafKanal || !guild.channels.cache.has(current.itirafKanal)) {
            return componentInteraction.update(render({ notice: "⚠️ Sistemi etkinleştirmek için önce geçerli bir itiraf kanalı seç." }));
          }

          if (!current.aktif) {
            const channel = guild.channels.cache.get(current.itirafKanal);
            const error = permissionError(channel, confessionChannelPermissions(current));
            if (error) return componentInteraction.update(render({ notice: `⚠️ ${error}` }));
          }

          const next = updateGuildItirafSetting(guildId, setting => {
            setting.aktif = !setting.aktif;
          });
          return componentInteraction.update(render({
            notice: `${emojiler.tik || "✅"} İtiraf sistemi **${next.aktif ? "etkinleştirildi" : "duraklatıldı"}**.`,
          }));
        }

        if (action === "minimum") {
          const current = getGuildItirafSetting(guildId);
          return componentInteraction.showModal(
            buildMinimumModal(sessionId, current?.minimumKarakter ?? 10)
          );
        }

        if (action === "reactions") {
          const current = getGuildItirafSetting(guildId);
          if (current?.tepkiler === false && current.itirafKanal) {
            const channel = guild.channels.cache.get(current.itirafKanal);
            if (channel) {
              const error = permissionError(channel, [
                ...BASE_CONFESSION_CHANNEL_PERMISSIONS,
                ...REACTION_CHANNEL_PERMISSIONS,
              ]);
              if (error) return componentInteraction.update(render({ notice: `⚠️ ${error}` }));
            }
          }

          const next = updateGuildItirafSetting(guildId, setting => {
            setting.tepkiler = !setting.tepkiler;
          });
          return componentInteraction.update(render({
            notice: `${emojiler.tik || "✅"} Hızlı tepkiler **${next.tepkiler ? "açıldı" : "kapatıldı"}**.`,
          }));
        }

        if (action === "clear-log") {
          updateGuildItirafSetting(guildId, setting => {
            setting.logKanal = null;
          });
          return componentInteraction.update(render({
            notice: `${emojiler.tik || "✅"} Güvenlik logu kaldırıldı; itiraflar kimlik kaydı gönderilmeden yayınlanacak.`,
          }));
        }

        if (action === "refresh") {
          return componentInteraction.update(render({ notice: "🔄 Panel güncel ayarlarla yenilendi." }));
        }

        if (action === "reset") {
          return componentInteraction.update(buildResetConfirmationPayload(sessionId));
        }

        if (action === "cancel-reset") {
          return componentInteraction.update(render({ notice: `${emojiler.tik || "✅"} Sıfırlama işlemi iptal edildi.` }));
        }

        if (action === "confirm-reset") {
          deleteGuildItirafSetting(guildId);
          return componentInteraction.update(render({
            notice: `${emojiler.tik || "✅"} İtiraf sistemi ve tüm ayarları sıfırlandı.`,
          }));
        }
      } catch (error) {
        console.error("🔴 [İTİRAF YÖNETİM PANELİ]", error);
        const payload = {
          content: `${emojiler.uyari || "⚠️"} Ayar güncellenirken beklenmeyen bir hata oluştu.`,
          flags: MessageFlags.Ephemeral,
        };

        if (componentInteraction.replied || componentInteraction.deferred) {
          return componentInteraction.followUp(payload).catch(() => null);
        }
        return componentInteraction.reply(payload).catch(() => null);
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(async () => {
      if (!cleanup()) return;
      await interaction.editReply(render({ disabled: true, expired: true })).catch(() => null);
    }, PANEL_TTL);
    closeTimer.unref?.();
  },
};