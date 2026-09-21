"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, EmbedBuilder, Events, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const {
  clearGuildConfig, getGuildConfig,imageUrlOrNull, updateGuildConfig } = require("../../Utils/Moderation/yetkiliBasvuruStore.js");

const SESSION_TTL = 10 * 60_000;
const PANEL_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_PANEL_FLAGS = PANEL_FLAGS | MessageFlags.Ephemeral;
const PANEL_COLOR = 0x5865f2;
const ACTIVE_COLOR = 0x57f287;
const WARNING_COLOR = 0xfee75c;
const ERROR_COLOR = 0xed4245;
const APPLICATION_COLOR = 0xffffff;

function makeId(sessionId, action) {
  return `yba:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `yba:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function channelLabel(channelId, guild) {
  if (!channelId) return "`Ayarlanmadı`";
  return guild.channels.cache.has(channelId)
    ? `<#${channelId}>`
    : `Silinmiş kanal (\`${channelId}\`)`;
}

function roleLabel(roleIds, guild) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) return "`Ayarlanmadı`";
  return roleIds.map(roleId => guild.roles.cache.has(roleId)
    ? `<@&${roleId}>`
    : `Silinmiş rol (\`${roleId}\`)`).join(", ");
}

function urlLabel(value) {
  if (!value) return "`Ayarlanmadı`";
  const clean = escapeMarkdown(String(value).replace(/`/g, "'"));
  return `\`${clean.length > 90 ? `${clean.slice(0, 89)}…` : clean}\``;
}

function createChannelSelect(sessionId, action, placeholder, currentId, guild, disabled) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, action))
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (currentId && guild.channels.cache.has(currentId)) {
    select.setDefaultChannels(currentId);
  }
  return select;
}

function createRoleSelect(sessionId, currentIds, guild, disabled) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "select-role"))
    .setPlaceholder("Onaylanan üyeye verilecek rolleri seç (en fazla 10)")
    .setMinValues(1)
    .setMaxValues(10)
    .setDisabled(disabled);

  const defaultRoleIds = Array.isArray(currentIds)
    ? currentIds.filter(roleId => guild.roles.cache.has(roleId)).slice(0, 10)
    : [];
  if (defaultRoleIds.length > 0) {
    select.setDefaultRoles(...defaultRoleIds);
  }
  return select;
}

function resetButton(sessionId, action, disabled) {
  return new ButtonBuilder()
    .setCustomId(makeId(sessionId, action))
    .setLabel("Sıfırla")
    .setEmoji(emojiler.cop || "🗑️")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);
}

function settingSection({ title, description, value, sessionId, resetAction, disabled }) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `### ${title}`,
        description,
        `**Mevcut:** ${value}`,
      ].join("\n"))
    )
    .setButtonAccessory(resetButton(sessionId, resetAction, disabled));
}

function isSetupComplete(config) {
  return Boolean(
    config.basvuruKanal
    && config.logKanal
    && config.yetkiliRoller.length > 0
    && config.yetkiliKanal
  );
}

function buildPanelPayload({
  guild,
  config,
  sessionId,
  disabled = false,
  ephemeral = false,
  notice = null,
}) {
  const configuredCount = [
    config.basvuruKanal,
    config.logKanal,
    config.yetkiliRoller.length > 0,
    config.yetkiliKanal,
  ].filter(Boolean).length;
  const hasAnySettings = configuredCount > 0
    || config.ornekFormAktif
    || Boolean(config.ornekFormResim);
  const complete = isSetupComplete(config);
  const published = Boolean(
    config.basvuruMesaj
    && config.basvuruMesajKanal === config.basvuruKanal
  );
  const accentColor = notice?.error
    ? ERROR_COLOR
    : complete
      ? ACTIVE_COLOR
      : WARNING_COLOR;
  const guildName = escapeMarkdown(guild.name);

  const overviewLines = [
    "## 🛡️ Yetkili Başvuru Yönetim Paneli",
    `**${guildName}** sunucusunun yetkili başvuru akışını bu panelden yönet. Yapılan değişiklikler anında kaydedilir.`,
    "",
    complete
      ? "🟢 **Kurulum tamamlandı**"
      : `🟡 **Kurulum bekliyor** - ${configuredCount}/4 ana ayar tamamlandı.`,
    `📨 **Başvuru mesajı:** ${published ? "Yayımlandı" : config.basvuruKanal ? "Yayımlanmayı bekliyor" : "Kanal bekleniyor"}`,
    `🖼️ **Örnek başvuru formu:** ${config.ornekFormAktif ? "Açık" : "Kapalı"}`,
  ];

  if (notice) {
    overviewLines.push(
      "",
      `> ${notice.error ? (emojiler.carpi || "❌") : (emojiler.tik || "✅")} ${notice.text}`
    );
  }
  const overview = new TextDisplayBuilder().setContent(overviewLines.join("\n"));

  const settings = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## ⚙️ Ana Ayarlar")
    )
    .addSectionComponents(
      settingSection({
        title: "1 · Başvuru Kanalı",
        description: "Üyelerin başvuru metinlerini göndereceği kanal.",
        value: channelLabel(config.basvuruKanal, guild),
        sessionId,
        resetAction: "reset-application-channel",
        disabled: disabled || !config.basvuruKanal,
      })
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(
          sessionId,
          "select-application-channel",
          "Başvuru kanalını seç",
          config.basvuruKanal,
          guild,
          disabled
        )
      )
    )
    .addSectionComponents(
      settingSection({
        title: "2 · Log Kanalı",
        description: "Başvuruların onay ve ret butonlarıyla gönderileceği kanal.",
        value: channelLabel(config.logKanal, guild),
        sessionId,
        resetAction: "reset-log-channel",
        disabled: disabled || !config.logKanal,
      })
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(
          sessionId,
          "select-log-channel",
          "Başvuru log kanalını seç",
          config.logKanal,
          guild,
          disabled
        )
      )
    )
    .addSectionComponents(
      settingSection({
        title: "3 · Yetkili Kanalı",
        description: "DM kapalıysa onay sonucunun gönderileceği kanal.",
        value: channelLabel(config.yetkiliKanal, guild),
        sessionId,
        resetAction: "reset-staff-channel",
        disabled: disabled || !config.yetkiliKanal,
      })
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createChannelSelect(
          sessionId,
          "select-staff-channel",
          "Yetkili duyuru kanalını seç",
          config.yetkiliKanal,
          guild,
          disabled
        )
      )
    )
    .addSectionComponents(
      settingSection({
        title: "4 · Yetkili Rolleri",
        description: "Başvurusu onaylanan üyeye otomatik verilecek roller (en fazla 10).",
        value: roleLabel(config.yetkiliRoller, guild),
        sessionId,
        resetAction: "reset-role",
        disabled: disabled || config.yetkiliRoller.length === 0,
      })
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        createRoleSelect(sessionId, config.yetkiliRoller, guild, disabled)
      )
    );

  const example = new ContainerBuilder()
    .setAccentColor(PANEL_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🖼️ Form Görseli")
    )
    .addSectionComponents(
      settingSection({
        title: "Örnek Başvuru Formu",
        description: config.ornekFormAktif
          ? "Bilgilendirme embed'inde başlık ve örnek görsel gösterilir."
          : "Kapalıyken embed'de örnek form yazısı ve görseli yer almaz.",
        value: config.ornekFormAktif
          ? `Açık · ${urlLabel(config.ornekFormResim)}`
          : "`Kapalı`",
        sessionId,
        resetAction: "reset-example",
        disabled: disabled || (!config.ornekFormAktif && !config.ornekFormResim),
      })
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "toggle-example"))
          .setLabel(config.ornekFormAktif ? "Örnek Formu Kapat" : "Örnek Formu Aç")
          .setEmoji(config.ornekFormAktif ? "🔕" : "🖼️")
          .setStyle(config.ornekFormAktif ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "edit-example"))
          .setLabel("Görseli Değiştir")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled || !config.ornekFormAktif)
      )
    );

  const controls = new ContainerBuilder()
    .setAccentColor(PANEL_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 📨 Başvuru Mesajı",
        config.basvuruKanal
          ? "Başvuru bilgilendirmesini kontrol et veya seçili kanala yeniden gönder."
          : "Mesajı yayımlamak için önce başvuru kanalını seç.",
      ].join("\n"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "preview"))
          .setLabel("Önizle")
          .setEmoji("👁️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "publish"))
          .setLabel(published ? "Mesajı Güncelle" : "Mesajı Yayımla")
          .setEmoji("📨")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled || !config.basvuruKanal),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(emojiler.yukleniyor || "🔄")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "reset-all"))
          .setLabel("Tümünü Sıfırla")
          .setEmoji(emojiler.cop || "🗑️")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || !hasAnySettings)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Panelin kullanım süresi doldu. Yeni panel için `/yetkili-başvuru` komutunu kullan."
          : "-# Panel 10 dakika kullanılabilir · Kanal ve rol seçimleri anında kaydedilir."
      )
    );

  return {
    components: [overview, settings, example, controls],
    flags: ephemeral ? PRIVATE_PANEL_FLAGS : PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildResetConfirmationPayload(sessionId) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ERROR_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ⚠️ Yetkili Başvuru Sistemini Sıfırla",
            "- Tüm kanal, rol ve örnek form ayarları silinecek. Bot, takip ettiği başvuru bilgilendirme mesajını da kaldırmayı deneyecek.",
            "",
            "**Bu işlem geri alınamaz. Devam edilsin mi?**",
          ].join("\n"))
        )
        .addSeparatorComponents(separator())
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-all-confirm"))
              .setLabel("Evet, tümünü sıfırla")
              .setEmoji(emojiler.cop || "🗑️")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-all-cancel"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildPrivateNotice(title, description, error = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(error ? ERROR_COLOR : ACTIVE_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PRIVATE_PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildExampleModal(sessionId, currentUrl) {
  const input = new TextInputBuilder()
    .setCustomId("image-url")
    .setLabel("Örnek başvuru formu görsel bağlantısı")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://site.com/ornek-basvuru.png")
    .setRequired(true)
    .setMaxLength(1000);

  if (currentUrl) input.setValue(currentUrl.slice(0, 1000));

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "example-modal"))
    .setTitle("Örnek Başvuru Formu")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildApplicationEmbed(config) {
  const description = [
    "Başvuru formunda şu maddeleri belirtmek zorundasın:",
    "",
    "- Adın",
    "- Yaşın",
    "- Aktiflik Süren",
    "- Ne zamandır Discord kullanıyorsun?",
    "- Bot bilgin ne durumda?",
    "- Sorunları çözmek için ne yaparsın?",
    "- Kendini tanıt. Fazla detay verirsen daha iyi olur.",
    "",
    "Vereceğin bilgiler ASLA kimseyle paylaşılmaz.",
  ];

  if (config.ornekFormAktif && config.ornekFormResim) {
    description.push("", "Örnek başvuru formu:");
  }

  const embed = new EmbedBuilder()
    .setDescription(description.join("\n"))
    .setColor(APPLICATION_COLOR);

  if (config.ornekFormAktif && config.ornekFormResim) {
    embed.setImage(config.ornekFormResim);
  }

  return embed;
}

function validateWritableTextChannel(channel, guild, options = {}) {
  const {
    label = "Kanal",
    requireEmbedLinks = false,
    requireManageMessages = false,
  } = options;

  if (!channel || channel.guildId !== guild.id || channel.type !== ChannelType.GuildText) {
    throw new Error(`${label} bu sunucudaki geçerli bir metin kanalı olmalı.`);
  }

  const permissions = channel.permissionsFor?.(guild.members.me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
    throw new Error(`Bot ${label.toLocaleLowerCase("tr-TR")} görüntüleyemiyor.`);
  }
  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    throw new Error(`Bot ${label.toLocaleLowerCase("tr-TR")} mesaj gönderemiyor.`);
  }
  if (requireEmbedLinks && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error(`Botun ${label.toLocaleLowerCase("tr-TR")} Bağlantıları Gömme izni yok.`);
  }
  if (requireManageMessages && !permissions.has(PermissionFlagsBits.ManageMessages)) {
    throw new Error(`Botun ${label.toLocaleLowerCase("tr-TR")} Mesajları Yönet izni yok.`);
  }
}

function validateApplicationChannel(channel, guild) {
  validateWritableTextChannel(channel, guild, {
    label: "Başvuru kanalı",
    requireEmbedLinks: true,
    requireManageMessages: true,
  });
}

async function fetchTrackedApplicationMessage(guild, config) {
  if (!config.basvuruMesaj || !config.basvuruMesajKanal) return null;
  const channel = await guild.channels.fetch(config.basvuruMesajKanal).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(config.basvuruMesaj).catch(() => null);
}

async function publishApplicationMessage(guild, config) {
  if (!config.basvuruKanal) throw new Error("Önce başvuru kanalını seçmelisin.");
  const channel = await guild.channels.fetch(config.basvuruKanal);
  validateApplicationChannel(channel, guild);

  const embed = buildApplicationEmbed(config);
  const trackedMessage = await fetchTrackedApplicationMessage(guild, config);
  let message;
  let created = false;

  if (trackedMessage && trackedMessage.channelId === channel.id) {
    message = await trackedMessage.edit({ embeds: [embed] });
  } else {
    message = await channel.send({ embeds: [embed] });
    created = true;
    if (trackedMessage) await trackedMessage.delete().catch(() => null);
  }

  const updatedConfig = updateGuildConfig(guild.id, draft => {
    draft.basvuruMesaj = message.id;
    draft.basvuruMesajKanal = channel.id;
  });

  return { config: updatedConfig, created, message };
}

async function removeTrackedApplicationMessage(guild, config) {
  const message = await fetchTrackedApplicationMessage(guild, config);
  if (message) await message.delete().catch(() => null);
}

async function syncTrackedApplicationMessage(guild, config) {
  if (!config.basvuruMesaj || !config.basvuruMesajKanal || !config.basvuruKanal) {
    return config;
  }

  try {
    return (await publishApplicationMessage(guild, config)).config;
  } catch (error) {
    console.error("🔴 [YETKİLİ BAŞVURU] Başvuru mesajı eşitlenemedi:", error);
    return config;
  }
}

async function execute(interaction, client) {
  const botClient = client || interaction.client;
  const { guild, user } = interaction;
  const sessionId = interaction.id;
  let config = getGuildConfig(guild.id);
  let closed = false;
  let closeTimer;

  const panelPayload = (options = {}) => buildPanelPayload({
    guild,
    config,
    sessionId,
    ...options,
  });

  await interaction.reply(panelPayload({ ephemeral: true }));

  const closeSession = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer);
    botClient.off(Events.InteractionCreate, listener);
    config = getGuildConfig(guild.id);
    await interaction.editReply(panelPayload({ disabled: true })).catch(() => null);
  };

  const updateField = (field, value) => {
    config = updateGuildConfig(guild.id, draft => {
      draft[field] = value;
    });
    return config;
  };

  const resetField = async field => {
    if (field === "basvuruKanal") {
      await removeTrackedApplicationMessage(guild, config);
      config = updateGuildConfig(guild.id, draft => {
        draft.basvuruKanal = null;
        draft.basvuruMesaj = null;
        draft.basvuruMesajKanal = null;
      });
      return;
    }

    updateField(field, null);
  };

  const listener = async componentInteraction => {
    const action = parseAction(componentInteraction.customId, sessionId);
    if (!action || closed) return;

    if (componentInteraction.user.id !== user.id) {
      return componentInteraction.reply(
        buildPrivateNotice(
          "Bu panel sana ait değil",
          `${emojiler.uyari || "⚠️"} Paneli yalnızca komutu kullanan yönetici kontrol edebilir.`,
          true
        )
      ).catch(() => null);
    }

    try {
      if (componentInteraction.isChannelSelectMenu()) {
        const channelId = componentInteraction.values[0];
        const selectedChannel = componentInteraction.channels?.get(channelId)
          || guild.channels.cache.get(channelId);

        if (action === "select-application-channel") {
          await componentInteraction.deferUpdate();
          updateField("basvuruKanal", channelId);

          try {
            const result = await publishApplicationMessage(guild, config);
            config = result.config;
            return interaction.editReply(panelPayload({
              notice: {
                text: result.created
                  ? `Başvuru kanalı <#${channelId}> olarak ayarlandı ve bilgilendirme mesajı yayımlandı.`
                  : `Başvuru kanalı <#${channelId}> olarak ayarlandı ve bilgilendirme mesajı güncellendi.`,
              },
            }));
          } catch (error) {
            return interaction.editReply(panelPayload({
              notice: { text: `Kanal kaydedildi ancak mesaj yayımlanamadı: ${error.message}`, error: true },
            }));
          }
        }

        if (action === "select-log-channel") {
          validateWritableTextChannel(selectedChannel, guild, {
            label: "Log kanalı",
            requireEmbedLinks: true,
          });
          updateField("logKanal", channelId);
          return componentInteraction.update(panelPayload({
            notice: { text: `Log kanalı <#${channelId}> olarak ayarlandı.` },
          }));
        }

        if (action === "select-staff-channel") {
          validateWritableTextChannel(selectedChannel, guild, {
            label: "Yetkili kanalı",
          });
          updateField("yetkiliKanal", channelId);
          return componentInteraction.update(panelPayload({
            notice: { text: `Yetkili kanalı <#${channelId}> olarak ayarlandı.` },
          }));
        }

        return;
      }

      if (componentInteraction.isRoleSelectMenu() && action === "select-role") {
        const roleIds = [...new Set(componentInteraction.values)].slice(0, 10);
        const roles = roleIds.map(roleId => componentInteraction.roles?.get(roleId)
          || guild.roles.cache.get(roleId));

        if (roles.some(role => !role || role.guild.id !== guild.id)) {
          throw new Error("Seçilen yetkili rollerinin tamamı bu sunucudaki geçerli roller olmalı.");
        }
        if (roles.some(role => role.id === guild.id || role.managed || !role.editable)) {
          throw new Error("Bot yalnızca yönetebildiği normal rolleri yetkili rolü olarak ayarlayabilir.");
        }
        updateField("yetkiliRoller", roleIds);
        return componentInteraction.update(panelPayload({
          notice: { text: `${roleIds.length} yetkili rolü seçildi: ${roleIds.map(roleId => `<@&${roleId}>`).join(", ")}` },
        }));
      }

      if (componentInteraction.isModalSubmit() && action === "example-modal") {
        const rawUrl = componentInteraction.fields.getTextInputValue("image-url");
        const imageUrl = imageUrlOrNull(rawUrl);
        if (!imageUrl) {
          return componentInteraction.update(panelPayload({
            notice: { text: "Görsel bağlantısı geçerli bir HTTP veya HTTPS URL'si olmalı.", error: true },
          }));
        }

        await componentInteraction.deferUpdate();
        config = updateGuildConfig(guild.id, draft => {
          draft.ornekFormAktif = true;
          draft.ornekFormResim = imageUrl;
        });
        config = await syncTrackedApplicationMessage(guild, config);
        return interaction.editReply(panelPayload({
          notice: { text: "Örnek başvuru formu açıldı ve görsel bağlantısı kaydedildi." },
        }));
      }

      if (!componentInteraction.isButton()) return;

      if (action === "toggle-example") {
        if (!config.ornekFormAktif) {
          return componentInteraction.showModal(buildExampleModal(sessionId, config.ornekFormResim));
        }

        await componentInteraction.deferUpdate();
        config = updateGuildConfig(guild.id, draft => {
          draft.ornekFormAktif = false;
          draft.ornekFormResim = null;
        });
        config = await syncTrackedApplicationMessage(guild, config);
        return interaction.editReply(panelPayload({
          notice: { text: "Örnek başvuru formu kapatıldı; yazı ve görsel embed'den kaldırıldı." },
        }));
      }

      if (action === "edit-example") {
        return componentInteraction.showModal(buildExampleModal(sessionId, config.ornekFormResim));
      }

      if (action === "preview") {
        return componentInteraction.reply({
          embeds: [buildApplicationEmbed(config)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === "publish") {
        await componentInteraction.deferUpdate();
        const result = await publishApplicationMessage(guild, config);
        config = result.config;
        return interaction.editReply(panelPayload({
          notice: {
            text: result.created
              ? `Başvuru mesajı <#${config.basvuruKanal}> kanalına yayımlandı.`
              : "Başvuru mesajı güncel ayarlarla yenilendi.",
          },
        }));
      }

      if (action === "refresh") {
        config = getGuildConfig(guild.id);
        return componentInteraction.update(panelPayload({
          notice: { text: "Kayıtlı ayarlar yeniden yüklendi." },
        }));
      }

      const resetActions = {
        "reset-application-channel": ["basvuruKanal", "Başvuru kanalı sıfırlandı."],
        "reset-log-channel": ["logKanal", "Log kanalı sıfırlandı."],
        "reset-staff-channel": ["yetkiliKanal", "Yetkili kanalı sıfırlandı."],
        "reset-role": ["yetkiliRoller", "Yetkili rolleri sıfırlandı."],
      };

      if (resetActions[action]) {
        const [field, notice] = resetActions[action];
        if (field === "basvuruKanal") {
          await componentInteraction.deferUpdate();
          await resetField(field);
          return interaction.editReply(panelPayload({ notice: { text: notice } }));
        }

        await resetField(field);
        return componentInteraction.update(panelPayload({ notice: { text: notice } }));
      }

      if (action === "reset-example") {
        await componentInteraction.deferUpdate();
        config = updateGuildConfig(guild.id, draft => {
          draft.ornekFormAktif = false;
          draft.ornekFormResim = null;
        });
        config = await syncTrackedApplicationMessage(guild, config);
        return interaction.editReply(panelPayload({
          notice: { text: "Örnek başvuru formu ayarı sıfırlandı." },
        }));
      }

      if (action === "reset-all") {
        return componentInteraction.update(buildResetConfirmationPayload(sessionId));
      }

      if (action === "reset-all-cancel") {
        return componentInteraction.update(panelPayload({
          notice: { text: "Toplu sıfırlama iptal edildi." },
        }));
      }

      if (action === "reset-all-confirm") {
        await componentInteraction.deferUpdate();
        await removeTrackedApplicationMessage(guild, config);
        clearGuildConfig(guild.id);
        config = getGuildConfig(guild.id);
        return interaction.editReply(panelPayload({
          notice: { text: "Yetkili başvuru sisteminin tüm ayarları sıfırlandı." },
        }));
      }
    } catch (error) {
      console.error("🔴 [YETKİLİ BAŞVURU PANEL HATASI]", error);
      config = getGuildConfig(guild.id);
      const errorNotice = {
        notice: {
          text: error?.message || "Ayar güncellenirken beklenmeyen bir hata oluştu.",
          error: true,
        },
      };

      if (componentInteraction.deferred) {
        return interaction.editReply(panelPayload(errorNotice)).catch(() => null);
      }
      if (!componentInteraction.replied) {
        return componentInteraction.update(panelPayload(errorNotice)).catch(() => null);
      }
      return componentInteraction.followUp(
        buildPrivateNotice("İşlem tamamlanamadı", errorNotice.notice.text, true)
      ).catch(() => null);
    }
  };

  botClient.on(Events.InteractionCreate, listener);
  closeTimer = setTimeout(closeSession, SESSION_TTL);
  closeTimer.unref?.();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yetkili-başvuru")
    .setDescription("Yetkili başvuru sistemini tek yönetim panelinden ayarlar.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  buildApplicationEmbed,
  buildPanelPayload,
  publishApplicationMessage,
  removeTrackedApplicationMessage,
};