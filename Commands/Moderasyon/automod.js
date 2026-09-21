const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ComponentType, EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { DEFAULT_ENABLE_KEYS, PROFANITY_KEYWORDS, RULE_KEYS, deleteRule, extractProtectedRoleIds, fetchRules, formatAutoModError, getRule, parseKeywordInput, upsertRule } = require("../../Utils/Moderation/autoModManager.js");
const { DEFAULT_RAID_CONFIG, RAID_ACTIONS, RAID_ACTION_LABELS, RaidProtectionConfigError, formatRaidProtectionError, getRaidConfig, setRaidEnabled, updateRaidConfig } = require("../../Utils/Moderation/raidProtectionManager.js");

const MANAGED_RULE_KEYS = Object.freeze(Object.values(RULE_KEYS));

function isEnabled(rules, key) {
  return getRule(rules, key)?.enabled === true;
}

function statusText(enabled) {
  return enabled ? "🟢 **Açık**" : "🔴 **Kapalı**";
}

function buildEmbed(guild, rules, raidConfig) {
  const customWordRule = getRule(rules, RULE_KEYS.CUSTOM_WORDS);
  const protectedRoleRule = getRule(rules, RULE_KEYS.PROTECTED_ROLES);
  const mentionSpamRule = getRule(rules, RULE_KEYS.MENTION_SPAM);
  const customWordCount = customWordRule?.triggerMetadata.keywordFilter.length || 0;
  const protectedRoleIds = extractProtectedRoleIds(protectedRoleRule);
  const mentionLimit = mentionSpamRule?.triggerMetadata.mentionTotalLimit || 5;
  const activeCount = MANAGED_RULE_KEYS.filter(key => isEnabled(rules, key)).length
    + (raidConfig?.enabled ? 1 : 0);
  const raidSettings = raidConfig || DEFAULT_RAID_CONFIG;
  const raidLogChannel = raidSettings.logChannelId
    ? `<#${raidSettings.logChannelId}>`
    : "Seçilmedi";

  const protectedRoleSummary = protectedRoleIds.length === 0
    ? "Rol seçilmedi"
    : protectedRoleIds.slice(0, 4).map(roleId => `<@&${roleId}>`).join(", ")
      + (protectedRoleIds.length > 4 ? ` +${protectedRoleIds.length - 4}` : "");

  return new EmbedBuilder()
    .setAuthor({
      name: "AutoMod Yönetimi",
      iconURL: guild.iconURL({ extension: "png", size: 128 }) || undefined,
    })
    .setColor(activeCount > 0 ? 0x57f287 : 0x2b2d31)
    .setDescription([
      "- Mesaj kuralları Discord'da oluşturulur ve **Sunucu Ayarları → AutoMod** bölümünde görünür.",
      "- Açık mesaj kuralları içeriği gönderilmeden önce Discord tarafından engeller.",
      "- Raid Koruması üye girişlerini bot üzerinden izler ve bu panelden yönetilir.",
    ].join("\n"))
    .addFields(
      {
        name: "Reklam Engeli",
        value: `${statusText(isEnabled(rules, RULE_KEYS.ADVERTISING))}\nDavet, bağlantı ve alan adı filtresi`,
        inline: true,
      },
      {
        name: "Türkçe Küfür Engeli",
        value: `${statusText(isEnabled(rules, RULE_KEYS.PROFANITY))}\n${PROFANITY_KEYWORDS.length} kelime/ifade`,
        inline: true,
      },
      {
        name: "Özel Kelimeler",
        value: `${statusText(isEnabled(rules, RULE_KEYS.CUSTOM_WORDS))}\n${customWordCount} kelime/ifade`,
        inline: true,
      },
      {
        name: "Sakıncalı İçerik",
        value: `${statusText(isEnabled(rules, RULE_KEYS.UNSAFE_CONTENT))}\nDiscord hazır filtreleri`,
        inline: true,
      },
      {
        name: "Genel Spam",
        value: `${statusText(isEnabled(rules, RULE_KEYS.SPAM))}\nDiscord spam algılama`,
        inline: true,
      },
      {
        name: "Etiket Spam",
        value: `${statusText(isEnabled(rules, RULE_KEYS.MENTION_SPAM))}\nMesaj başına en fazla ${mentionLimit} etiket`,
        inline: true,
      },
      {
        name: `Korunan Roller (${protectedRoleIds.length})`,
        value: `${statusText(isEnabled(rules, RULE_KEYS.PROTECTED_ROLES))}\n${protectedRoleSummary}`,
        inline: true,
      },
      {
        name: "Raid Koruması",
        value: [
          statusText(raidConfig?.enabled === true),
          `${raidSettings.threshold} giriş / ${raidSettings.windowSeconds} sn • ${RAID_ACTION_LABELS[raidSettings.action]}`,
          `Log: ${raidLogChannel} • Hesap yaşı: ${raidSettings.minimumAccountAgeDays} gün`,
        ].join("\n"),
        inline: true,
      },
    )
    .setFooter({
      text: `${activeCount}/${MANAGED_RULE_KEYS.length + 1} koruma açık • Raid koruması özel bot kuralıdır`,
    });
}

function buildToggleButton(customId, label, enabled, disabled) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);
}

function buildComponents(guild, rules, raidConfig, sessionPrefix, disabled = false) {
  const protectedRoleIds = extractProtectedRoleIds(getRule(rules, RULE_KEYS.PROTECTED_ROLES))
    .filter(roleId => roleId !== guild.id && guild.roles.cache.has(roleId));

  const firstRow = new ActionRowBuilder().addComponents(
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.ADVERTISING}`,
      "Reklam",
      isEnabled(rules, RULE_KEYS.ADVERTISING),
      disabled,
    ),
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.PROFANITY}`,
      "Küfür (TR)",
      isEnabled(rules, RULE_KEYS.PROFANITY),
      disabled,
    ),
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.CUSTOM_WORDS}`,
      "Özel Kelime",
      isEnabled(rules, RULE_KEYS.CUSTOM_WORDS),
      disabled,
    ),
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.PROTECTED_ROLES}`,
      "Korunan Rol",
      isEnabled(rules, RULE_KEYS.PROTECTED_ROLES),
      disabled,
    ),
  );

  const secondRow = new ActionRowBuilder().addComponents(
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.UNSAFE_CONTENT}`,
      "Sakıncalı İçerik",
      isEnabled(rules, RULE_KEYS.UNSAFE_CONTENT),
      disabled,
    ),
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.SPAM}`,
      "Genel Spam",
      isEnabled(rules, RULE_KEYS.SPAM),
      disabled,
    ),
    buildToggleButton(
      `${sessionPrefix}:toggle:${RULE_KEYS.MENTION_SPAM}`,
      "Etiket Spam",
      isEnabled(rules, RULE_KEYS.MENTION_SPAM),
      disabled,
    ),
    buildToggleButton(
      `${sessionPrefix}:raid_toggle`,
      "Raid Koruma",
      raidConfig?.enabled === true,
      disabled,
    ),
  );

  const thirdRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:edit_words`)
      .setLabel("Kelimeleri Düzenle")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:mention_limit`)
      .setLabel("Etiket Limitini Ayarla")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:raid_settings`)
      .setLabel("Raid Ayarları")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:refresh`)
      .setLabel("Yenile")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  const fourthRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:enable_all`)
      .setLabel("Hazır Korumaları Aç")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${sessionPrefix}:disable_all`)
      .setLabel("Tümünü Kapat")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`${sessionPrefix}:protected_roles`)
    .setPlaceholder("Etiketlenmesini engellemek istediğin rolleri seç")
    .setMinValues(0)
    .setMaxValues(20)
    .setDisabled(disabled);

  if (protectedRoleIds.length > 0) roleSelect.setDefaultRoles(...protectedRoleIds);
  const fifthRow = new ActionRowBuilder().addComponents(roleSelect);

  return [firstRow, secondRow, thirdRow, fourthRow, fifthRow];
}

function buildPanel(guild, rules, raidConfig, sessionPrefix, disabled = false) {
  return {
    embeds: [buildEmbed(guild, rules, raidConfig)],
    components: buildComponents(guild, rules, raidConfig, sessionPrefix, disabled),
  };
}

function assertRaidActionPermission(guild, action) {
  if (action === RAID_ACTIONS.KICK && !guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
    throw new RaidProtectionConfigError(
      "Raid cezasını **Sunucudan at** yapmak için botun **Üyeleri At** izni olmalı.",
    );
  }
  if (action === RAID_ACTIONS.BAN && !guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
    throw new RaidProtectionConfigError(
      "Raid cezasını **Banla** yapmak için botun **Üyeleri Yasakla** izni olmalı.",
    );
  }
}

function assertRaidLogChannelPermissions(guild, channel) {
  const isSupportedChannel = channel?.type === ChannelType.GuildText
    || channel?.type === ChannelType.GuildAnnouncement;
  if (!isSupportedChannel) {
    throw new RaidProtectionConfigError("Raid logu için bir metin veya duyuru kanalı seçmelisin.");
  }

  const permissions = channel.permissionsFor(guild.members.me);
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  if (!permissions?.has(requiredPermissions)) {
    throw new RaidProtectionConfigError(
      "Raid log kanalında botun **Kanalı Görüntüle**, **Mesaj Gönder** ve **Bağlantı Yerleştir** izinleri olmalı.",
    );
  }
}

function buildRaidSettingsPanel(guild, raidConfig, editorPrefix, disabled = false) {
  const config = raidConfig || DEFAULT_RAID_CONFIG;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`${editorPrefix}:channel`)
    .setPlaceholder("Raid log kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (config.logChannelId && guild.channels.cache.has(config.logChannelId)) {
    channelSelect.setDefaultChannels(config.logChannelId);
  }

  const actionSelect = new StringSelectMenuBuilder()
    .setCustomId(`${editorPrefix}:action`)
    .setPlaceholder("Raid algılanınca uygulanacak cezayı seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled)
    .addOptions(
      {
        label: RAID_ACTION_LABELS[RAID_ACTIONS.LOG],
        value: RAID_ACTIONS.LOG,
        description: "Üyeye işlem uygulamadan yalnızca kayıt gönderir.",
        default: config.action === RAID_ACTIONS.LOG,
      },
      {
        label: RAID_ACTION_LABELS[RAID_ACTIONS.KICK],
        value: RAID_ACTIONS.KICK,
        description: "Raid eşiği aşıldığında yeni üyeyi sunucudan atar.",
        default: config.action === RAID_ACTIONS.KICK,
      },
      {
        label: RAID_ACTION_LABELS[RAID_ACTIONS.BAN],
        value: RAID_ACTIONS.BAN,
        description: "Raid eşiği aşıldığında yeni üyeyi yasaklar.",
        default: config.action === RAID_ACTIONS.BAN,
      },
    );

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${editorPrefix}:limits`)
      .setLabel("Eşik, Süre ve Hesap Yaşı")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${editorPrefix}:toggle`)
      .setLabel(config.enabled ? "Raid Korumasını Kapat" : "Raid Korumasını Aç")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${editorPrefix}:close`)
      .setLabel("Kapat")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(config.enabled ? 0x57f287 : 0x2b2d31)
        .setTitle("AutoMod • Raid Koruması")
        .setDescription([
          `${statusText(config.enabled)}`,
          `**Log kanalı:** ${config.logChannelId ? `<#${config.logChannelId}>` : "Seçilmedi"}`,
          `**Eşik:** ${config.threshold} giriş / ${config.windowSeconds} saniye`,
          `**Ceza:** ${RAID_ACTION_LABELS[config.action]}`,
          `**Minimum hesap yaşı:** ${config.minimumAccountAgeDays} gün`,
          "-# Discord AutoMod üye girişlerini tetiklemediği için bu koruma bot tarafından uygulanır.",
        ].join("\n")),
    ],
    components: [
      new ActionRowBuilder().addComponents(channelSelect),
      new ActionRowBuilder().addComponents(actionSelect),
      controls,
    ],
  };
}

async function sendInteractionError(interaction, error) {
  console.error("🔴 [AUTOMOD PANEL HATASI]:", error);
  const isRaidOperation = error instanceof RaidProtectionConfigError
    || interaction.customId?.includes(":raid_");
  const errorMessage = isRaidOperation
    ? formatRaidProtectionError(error)
    : formatAutoModError(error);
  const payload = {
    content: `${emojiler.uyari} **${errorMessage}**`,
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Discord AutoMod ve raid koruma kurallarını yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const { guild, user } = interaction;

    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: `${emojiler.uyari} Botun Discord AutoMod kurallarını yönetebilmesi için **Sunucuyu Yönet** iznine ihtiyacı var.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let rules;
    try {
      rules = await fetchRules(guild);
    } catch (error) {
      console.error("🔴 [AUTOMOD KURALLARI OKUNAMADI]:", error);
      return interaction.editReply({
        content: `${emojiler.uyari} **${formatAutoModError(error)}**`,
      });
    }

    let raidConfig = getRaidConfig(guild.id);
    const sessionPrefix = `automod:${interaction.id}`;
    const message = await interaction.editReply(
      buildPanel(guild, rules, raidConfig, sessionPrefix),
    );
    let busy = false;

    const refreshPanel = async () => {
      rules = await fetchRules(guild);
      raidConfig = getRaidConfig(guild.id);
      await interaction.editReply(buildPanel(guild, rules, raidConfig, sessionPrefix));
    };

    const openKeywordModal = async (buttonInteraction) => {
      const currentRule = getRule(rules, RULE_KEYS.CUSTOM_WORDS);
      const currentValue = currentRule?.triggerMetadata.keywordFilter.join(", ") || "";

      if (currentValue.length > 4000) {
        return buttonInteraction.reply({
          content: `${emojiler.uyari} Kelime listesi modal sınırını aşıyor. Bu kuralı Discord'un **Sunucu Ayarları → AutoMod** bölümünden düzenleyebilirsin.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const modalId = `${sessionPrefix}:words_modal`;
      const input = new TextInputBuilder()
        .setCustomId("keywords")
        .setLabel("Yasaklı kelimeler veya ifadeler")
        .setPlaceholder("Virgülle veya yeni satırla ayır. Boş bırakırsan kural silinir.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000);

      if (currentValue) input.setValue(currentValue);

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Yasaklı Kelimeleri Düzenle")
        .addComponents(new ActionRowBuilder().addComponents(input));

      await buttonInteraction.showModal(modal);

      let modalInteraction;
      try {
        modalInteraction = await buttonInteraction.awaitModalSubmit({
          filter: submitted => submitted.user.id === user.id && submitted.customId === modalId,
          time: 180000,
        });
      } catch {
        return;
      }

      await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const keywords = parseKeywordInput(modalInteraction.fields.getTextInputValue("keywords"));
        if (keywords.length === 0) {
          await deleteRule(guild, rules, RULE_KEYS.CUSTOM_WORDS);
          await modalInteraction.editReply(`${emojiler.tik} Yasaklı kelime kuralı **temizlendi ve kaldırıldı.**`);
        } else {
          await upsertRule(guild, rules, RULE_KEYS.CUSTOM_WORDS, { keywords, enabled: true });
          await modalInteraction.editReply(`${emojiler.tik} **${keywords.length}** yasaklı kelime kaydedildi ve kural **açıldı.**`);
        }
        await refreshPanel();
      } catch (error) {
        console.error("🔴 [AUTOMOD KELİME DÜZENLEME HATASI]:", error);
        await modalInteraction.editReply(`${emojiler.uyari} **${formatAutoModError(error)}**`);
      }
    };

    const openMentionLimitModal = async (buttonInteraction) => {
      const currentRule = getRule(rules, RULE_KEYS.MENTION_SPAM);
      const currentLimit = currentRule?.triggerMetadata.mentionTotalLimit || 5;
      const modalId = `${sessionPrefix}:mention_modal`;
      const input = new TextInputBuilder()
        .setCustomId("mention_limit")
        .setLabel("Bir mesajdaki en fazla etiket sayısı")
        .setPlaceholder("1 - 50")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2)
        .setValue(String(currentLimit));

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Etiket Spam Limitini Ayarla")
        .addComponents(new ActionRowBuilder().addComponents(input));

      await buttonInteraction.showModal(modal);

      let modalInteraction;
      try {
        modalInteraction = await buttonInteraction.awaitModalSubmit({
          filter: submitted => submitted.user.id === user.id && submitted.customId === modalId,
          time: 180000,
        });
      } catch {
        return;
      }

      await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const rawLimit = modalInteraction.fields.getTextInputValue("mention_limit").trim();
        const mentionLimit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
        await upsertRule(guild, rules, RULE_KEYS.MENTION_SPAM, { mentionLimit, enabled: true });
        await modalInteraction.editReply(`${emojiler.tik} Etiket spam limiti **${mentionLimit}** olarak ayarlandı ve kural **açıldı.**`);
        await refreshPanel();
      } catch (error) {
        console.error("🔴 [AUTOMOD ETİKET LİMİTİ HATASI]:", error);
        await modalInteraction.editReply(`${emojiler.uyari} **${formatAutoModError(error)}**`);
      }
    };

    const openRaidSettings = async (buttonInteraction) => {
      const editorPrefix = `${sessionPrefix}:raid_editor:${buttonInteraction.id}`;
      let editorConfig = getRaidConfig(guild.id);
      let editorBusy = false;
      let closed = false;

      await buttonInteraction.reply({
        ...buildRaidSettingsPanel(guild, editorConfig, editorPrefix),
        flags: MessageFlags.Ephemeral,
      });
      const settingsMessage = await buttonInteraction.fetchReply();

      const refreshEditor = async () => {
        editorConfig = getRaidConfig(guild.id);
        await buttonInteraction.editReply(
          buildRaidSettingsPanel(guild, editorConfig, editorPrefix),
        );
        await refreshPanel();
      };

      const settingsCollector = settingsMessage.createMessageComponentCollector({
        filter: settingsInteraction => (
          settingsInteraction.user.id === user.id
          && settingsInteraction.customId.startsWith(`${editorPrefix}:`)
        ),
        time: 300000,
      });

      settingsCollector.on("collect", async settingsInteraction => {
        if (editorBusy) {
          return settingsInteraction.reply({
            content: `${emojiler.uyari} **Önce devam eden raid ayarı işleminin tamamlanmasını bekle.**`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }

        editorBusy = true;
        try {
          const editorAction = settingsInteraction.customId.slice(editorPrefix.length + 1);

          if (editorAction === "channel") {
            await settingsInteraction.deferUpdate();
            const channel = await guild.channels.fetch(settingsInteraction.values[0]);
            assertRaidLogChannelPermissions(guild, channel);
            updateRaidConfig(guild.id, { logChannelId: channel.id });
            await refreshEditor();
            return;
          }

          if (editorAction === "action") {
            await settingsInteraction.deferUpdate();
            const raidAction = settingsInteraction.values[0];
            assertRaidActionPermission(guild, raidAction);
            updateRaidConfig(guild.id, { action: raidAction });
            await refreshEditor();
            return;
          }

          if (editorAction === "limits") {
            const currentConfig = getRaidConfig(guild.id) || DEFAULT_RAID_CONFIG;
            const modalId = `${editorPrefix}:limits_modal`;
            const modal = new ModalBuilder()
              .setCustomId(modalId)
              .setTitle("Raid Algılama Ayarları")
              .addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId("threshold")
                    .setLabel("Giriş eşiği (3 - 50)")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(1)
                    .setMaxLength(2)
                    .setRequired(true)
                    .setValue(String(currentConfig.threshold)),
                ),
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId("window_seconds")
                    .setLabel("Kontrol süresi, saniye (10 - 600)")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(2)
                    .setMaxLength(3)
                    .setRequired(true)
                    .setValue(String(currentConfig.windowSeconds)),
                ),
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId("account_age")
                    .setLabel("Minimum hesap yaşı, gün (0 - 365)")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(1)
                    .setMaxLength(3)
                    .setRequired(true)
                    .setValue(String(currentConfig.minimumAccountAgeDays)),
                ),
              );

            await settingsInteraction.showModal(modal);

            let modalInteraction;
            try {
              modalInteraction = await settingsInteraction.awaitModalSubmit({
                filter: submitted => submitted.user.id === user.id && submitted.customId === modalId,
                time: 180000,
              });
            } catch {
              return;
            }

            await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
              const parseInput = customId => {
                const input = modalInteraction.fields.getTextInputValue(customId).trim();
                return /^\d+$/.test(input) ? Number(input) : Number.NaN;
              };
              const updatedConfig = updateRaidConfig(guild.id, {
                threshold: parseInput("threshold"),
                windowSeconds: parseInput("window_seconds"),
                minimumAccountAgeDays: parseInput("account_age"),
              });
              await modalInteraction.editReply(
                `${emojiler.tik} Raid eşiği **${updatedConfig.threshold} giriş / ${updatedConfig.windowSeconds} saniye**, minimum hesap yaşı **${updatedConfig.minimumAccountAgeDays} gün** olarak kaydedildi.`,
              );
              await refreshEditor();
            } catch (error) {
              await modalInteraction.editReply(
                `${emojiler.uyari} **${formatRaidProtectionError(error)}**`,
              );
            }
            return;
          }

          if (editorAction === "toggle") {
            await settingsInteraction.deferUpdate();
            const currentConfig = getRaidConfig(guild.id) || DEFAULT_RAID_CONFIG;
            if (!currentConfig.enabled) {
              if (!currentConfig.logChannelId) {
                throw new RaidProtectionConfigError(
                  "Raid korumasını açmadan önce yukarıdan bir log kanalı seçmelisin.",
                );
              }
              const channel = await guild.channels.fetch(currentConfig.logChannelId);
              assertRaidLogChannelPermissions(guild, channel);
              assertRaidActionPermission(guild, currentConfig.action);
            }
            setRaidEnabled(guild.id, !currentConfig.enabled);
            await refreshEditor();
            return;
          }

          if (editorAction === "close") {
            await settingsInteraction.deferUpdate();
            closed = true;
            settingsCollector.stop("closed");
            await buttonInteraction.editReply({
              content: `${emojiler.tik} Raid ayarları paneli kapatıldı.`,
              embeds: [],
              components: [],
            });
            return;
          }

          await settingsInteraction.deferUpdate();
        } catch (error) {
          await sendInteractionError(settingsInteraction, error);
          await refreshEditor().catch(() => null);
        } finally {
          editorBusy = false;
        }
      });

      settingsCollector.on("end", () => {
        if (closed) return;
        buttonInteraction.editReply(
          buildRaidSettingsPanel(guild, editorConfig, editorPrefix, true),
        ).catch(() => null);
      });
    };

    const collector = message.createMessageComponentCollector({
      filter: componentInteraction => (
        componentInteraction.user.id === user.id
        && componentInteraction.customId.startsWith(`${sessionPrefix}:`)
      ),
      time: 600000,
    });

    collector.on("collect", async componentInteraction => {
      if (busy) {
        return componentInteraction.reply({
          content: `${emojiler.uyari} **Önce devam eden AutoMod işleminin tamamlanmasını bekle.**`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }

      busy = true;
      try {
        const action = componentInteraction.customId.slice(sessionPrefix.length + 1);

        if (componentInteraction.componentType === ComponentType.RoleSelect) {
          await componentInteraction.deferUpdate();
          const selectedRoleIds = componentInteraction.values.filter(roleId => roleId !== guild.id);
          if (selectedRoleIds.length === 0) {
            await deleteRule(guild, rules, RULE_KEYS.PROTECTED_ROLES);
          } else {
            await upsertRule(guild, rules, RULE_KEYS.PROTECTED_ROLES, {
              roleIds: selectedRoleIds,
              enabled: true,
            });
          }
          await refreshPanel();
          return;
        }

        if (action.startsWith("toggle:")) {
          const key = action.slice("toggle:".length);
          if (!MANAGED_RULE_KEYS.includes(key)) return componentInteraction.deferUpdate();

          const currentRule = getRule(rules, key);
          if (key === RULE_KEYS.CUSTOM_WORDS && !currentRule) {
            await openKeywordModal(componentInteraction);
            return;
          }
          if (key === RULE_KEYS.PROTECTED_ROLES && extractProtectedRoleIds(currentRule).length === 0) {
            await componentInteraction.reply({
              content: `${emojiler.info} Önce panelin altındaki menüden korunacak rolleri seç.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await componentInteraction.deferUpdate();
          await upsertRule(guild, rules, key, { enabled: !currentRule?.enabled });
          await refreshPanel();
          return;
        }

        if (action === "raid_toggle") {
          await componentInteraction.deferUpdate();
          const currentConfig = getRaidConfig(guild.id);
          if (!currentConfig?.logChannelId) {
            throw new RaidProtectionConfigError(
              "Önce **Raid Ayarları** bölümünden bir log kanalı seçmelisin.",
            );
          }
          if (!currentConfig.enabled) {
            const channel = await guild.channels.fetch(currentConfig.logChannelId);
            assertRaidLogChannelPermissions(guild, channel);
            assertRaidActionPermission(guild, currentConfig.action);
          }
          setRaidEnabled(guild.id, !currentConfig.enabled);
          await refreshPanel();
          return;
        }

        if (action === "edit_words") {
          await openKeywordModal(componentInteraction);
          return;
        }

        if (action === "mention_limit") {
          await openMentionLimitModal(componentInteraction);
          return;
        }

        if (action === "raid_settings") {
          await openRaidSettings(componentInteraction);
          return;
        }

        if (action === "refresh") {
          await componentInteraction.deferUpdate();
          await refreshPanel();
          return;
        }

        if (action === "enable_all") {
          await componentInteraction.deferUpdate();
          const keysToEnable = [...DEFAULT_ENABLE_KEYS];
          if (getRule(rules, RULE_KEYS.CUSTOM_WORDS)) keysToEnable.push(RULE_KEYS.CUSTOM_WORDS);
          if (getRule(rules, RULE_KEYS.PROTECTED_ROLES)) keysToEnable.push(RULE_KEYS.PROTECTED_ROLES);

          for (const key of keysToEnable) {
            await upsertRule(guild, rules, key, { enabled: true });
          }
          const currentConfig = getRaidConfig(guild.id);
          if (currentConfig?.logChannelId) {
            const channel = await guild.channels.fetch(currentConfig.logChannelId);
            assertRaidLogChannelPermissions(guild, channel);
            assertRaidActionPermission(guild, currentConfig.action);
            setRaidEnabled(guild.id, true);
          }
          await refreshPanel();
          return;
        }

        if (action === "disable_all") {
          await componentInteraction.deferUpdate();
          if (getRaidConfig(guild.id)) setRaidEnabled(guild.id, false);
          for (const key of MANAGED_RULE_KEYS) {
            if (getRule(rules, key)) await upsertRule(guild, rules, key, { enabled: false });
          }
          await refreshPanel();
          return;
        }

        await componentInteraction.deferUpdate();
      } catch (error) {
        await sendInteractionError(componentInteraction, error);
        await refreshPanel().catch(() => null);
      } finally {
        busy = false;
      }
    });

    collector.on("end", () => {
      interaction.editReply(
        buildPanel(guild, rules, raidConfig, sessionPrefix, true),
      ).catch(() => null);
    });
  },
};
