const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder } = require("discord.js");
const { BURCLAR, deleteGuildBurcSetting, getBurc, getGuildBurcSetting, updateGuildBurcSetting } = require("../../Utils/Engagement/burcSistemi");
const { sendLatestHoroscopesToGuild } = require("../../Utils/Engagement/burcGönderici");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const PANEL_ACCENT_ACTIVE = 0x7567ed;
const PANEL_ACCENT_IDLE = 0x3d405b;
const PANEL_ACCENT_WARNING = 0xed8936;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_TTL = 10 * 60_000;
const ELEMENTLER = Object.freeze([
  { name: "Ateş", icon: "🔥" },
  { name: "Toprak", icon: "🌿" },
  { name: "Hava", icon: "🌬️" },
  { name: "Su", icon: "🌊" },
]);

function makeId(sessionId, action) {
  return `burc:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `burc:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function channelState(guild, channelId) {
  if (!channelId) {
    return {
      accentColor: PANEL_ACCENT_IDLE,
      label: "🔴 **Sistem kapalı**",
      target: "`Henüz bir kanal seçilmedi`",
      exists: false,
    };
  }

  if (!guild.channels.cache.has(channelId)) {
    return {
      accentColor: PANEL_ACCENT_WARNING,
      label: "🟠 **Kayıtlı kanal bulunamadı**",
      target: "`Kayıtlı kanal artık bulunamıyor`",
      exists: false,
    };
  }

  return {
    accentColor: PANEL_ACCENT_ACTIVE,
    label: "🟢 **Sistem aktif**",
    target: `<#${channelId}>`,
    exists: true,
  };
}

function roleState(guild, roleId) {
  if (!roleId) return "`—`";
  return guild.roles.cache.has(roleId) ? `<@&${roleId}>` : "`Silinmiş rol`";
}

function buildOrbitMap(guild, setting, selectedKey) {
  return ELEMENTLER.map(element => {
    const members = BURCLAR
      .filter(burc => burc.element === element.name)
      .map(burc => {
        const name = burc.key === selectedKey ? `**${burc.symbol} ${burc.name}**` : `${burc.symbol} ${burc.name}`;
        return `${name} ${roleState(guild, setting.roller[burc.key])}`;
      });

    return `${element.icon} **${element.name}:** ${members.join("  ·  ")}`;
  }).join("\n");
}

function selectedSignsText(setting) {
  const selected = BURCLAR.filter(burc => setting.gonderilecekBurclar.includes(burc.key));
  if (selected.length === 0) return "`Hiçbiri seçilmedi`";
  if (selected.length === BURCLAR.length) return "**Tüm burçlar**";
  return selected.map(burc => `${burc.symbol} ${burc.name}`).join(" · ");
}

function buildPanelPayload({
  guild,
  setting,
  selectedKey,
  sessionId,
  notice = null,
  disabled = false,
  expired = false,
  initial = false,
}) {
  const selected = getBurc(selectedKey) || BURCLAR[0];
  const state = channelState(guild, setting.kanal);
  const linkedRoleCount = Object.keys(setting.roller).length;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "channel"))
    .setPlaceholder("Günlük yorumların gönderileceği kanalı seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (state.exists) channelSelect.setDefaultChannels(setting.kanal);

  const sendSignsSelect = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "send-signs"))
    .setPlaceholder("Yorumları gönderilecek burçları seç")
    .setMinValues(0)
    .setMaxValues(BURCLAR.length)
    .setDisabled(disabled)
    .addOptions(BURCLAR.map(burc => ({
      label: burc.name,
      value: burc.key,
      emoji: burc.symbol,
      description: `${burc.element} elementi`,
      default: setting.gonderilecekBurclar.includes(burc.key),
    })));

  const signSelect = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "sign"))
    .setPlaceholder("Rol ayarlamak istediğin burcu seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled)
    .addOptions(BURCLAR.map(burc => ({
      label: burc.name,
      value: burc.key,
      emoji: burc.symbol,
      description: `${burc.element} elementi · ${setting.roller[burc.key] ? "rol bağlı" : "rol bekliyor"}`,
      default: burc.key === selected.key,
    })));

  const selectedRoleId = setting.roller[selected.key];
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "role"))
    .setPlaceholder(`${selected.name} için rol seç (isteğe bağlı)`)
    .setMinValues(0)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (selectedRoleId && guild.roles.cache.has(selectedRoleId)) {
    roleSelect.setDefaultRoles(selectedRoleId);
  }

  const container = new ContainerBuilder()
    .setAccentColor(state.accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## Burç Sistemi Ayarları",
        "Günlük burç yorumları her gün saat **12:00'de** seçilen kanala gönderilir.",
        "-# Kanal ve rol değişiklikleri seçildiği anda kaydedilir.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Yayın Kanalı",
        state.label,
        `**Seçili kanal:** ${state.target}`,
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Gönderilecek Burçlar",
        `**Seçili:** ${selectedSignsText(setting)}`,
        "-# Yalnızca burada seçilen burçların günlük yorumları gönderilir.",
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(sendSignsSelect))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Burç Rolleri (İsteğe Bağlı)",
        `**Ayarlanan rol sayısı:** \`${linkedRoleCount}/12\``,
        "-# Rol atanmayan burçların yorumları etiket kullanılmadan gönderilir.",
        buildOrbitMap(guild, setting, selected.key),
        "-# Kalın görünen burcun rol ayarı aşağıda düzenlenir.",
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(signSelect))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `### ${selected.symbol} ${selected.name} Rol Ayarı`,
        `**Seçili rol:** ${roleState(guild, selectedRoleId)}`,
        "-# Rol seçmek zorunlu değildir. İstersen aşağıdan seçebilir veya mevcut rolü kaldırabilirsin.",
      ].join("\n"))
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));

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
          .setCustomId(makeId(sessionId, "send-now"))
          .setLabel("Son Yorumları Gönder")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled || !state.exists || setting.gonderilecekBurclar.length === 0),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "remove-role"))
          .setLabel("Rolü Kaldır")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || !selectedRoleId),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "reset"))
          .setLabel("Tüm Ayarları Sıfırla")
          .setEmoji(emojiler.cop)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || (!setting.kanal && linkedRoleCount === 0))
      )
    );

  if (expired) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# Bu panelin kullanım süresi doldu. Yeniden açmak için `/burç-ayarla` komutunu kullan.")
    );
  }

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildResetConfirmationPayload({ setting, sessionId }) {
  const roleCount = Object.keys(setting.roller).length;
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## Tüm Burç Ayarlarını Sıfırla",
        "- Bu işlem yayın kanalını ve burç–rol bağlantılarının tamamını kaldıracak.",
        `**Silinecekler:** ${setting.kanal ? "1 yayın kanalı" : "kanal ayarı yok"} · ${roleCount} rol bağlantısı`,
        "-# Bu işlem gönderilmiş eski burç mesajlarını silmez.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "confirm-reset"))
          .setLabel("Evet, sıfırla")
          .setEmoji(emojiler.cop)
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

async function executePanel(interaction, client) {
  const botClient = client || interaction.client;
  const sessionId = interaction.id;
  const guildId = interaction.guild.id;
  let setting = getGuildBurcSetting(guildId);
  let selectedKey = BURCLAR[0].key;
  let closed = false;
  let closeTimer;
  let listener;

  const render = (options = {}) => buildPanelPayload({
    guild: interaction.guild,
    setting,
    selectedKey,
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

  const expireSession = async () => {
    if (!cleanup()) return;
    await interaction.editReply(render({ disabled: true, expired: true })).catch(() => null);
  };

  listener = async componentInteraction => {
    const action = parseAction(componentInteraction.customId, sessionId);
    if (!action || closed) return;

    if (componentInteraction.user.id !== interaction.user.id) {
      return componentInteraction.reply({
        content: "Bu ayar paneli başka bir yöneticiye ait.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    try {
      if (componentInteraction.isChannelSelectMenu() && action === "channel") {
        const channelId = componentInteraction.values[0];
        setting = updateGuildBurcSetting(guildId, draft => {
          draft.kanal = channelId;
        });
        return componentInteraction.update(
          render({ notice: `${emojiler.tik} Yayın kanalı <#${channelId}> olarak kaydedildi.` })
        );
      }

      if (componentInteraction.isStringSelectMenu() && action === "sign") {
        selectedKey = getBurc(componentInteraction.values[0])?.key || selectedKey;
        const selected = getBurc(selectedKey);
        return componentInteraction.update(
          render({ notice: `${selected.symbol} ${selected.name} burcunun rol ayarı açıldı.` })
        );
      }

      if (componentInteraction.isStringSelectMenu() && action === "send-signs") {
        const selectedKeys = componentInteraction.values
          .filter(key => Boolean(getBurc(key)));
        setting = updateGuildBurcSetting(guildId, draft => {
          draft.gonderilecekBurclar = selectedKeys;
        });
        return componentInteraction.update(
          render({
            notice: selectedKeys.length > 0
              ? `${emojiler.tik} Gönderilecek burçlar güncellendi (${selectedKeys.length}/12).`
              : `${emojiler.tik} Tüm burç seçimleri kaldırıldı, seçim yapılana kadar yorum gönderilmeyecek.`,
          })
        );
      }

      if (componentInteraction.isRoleSelectMenu() && action === "role") {
        const roleId = componentInteraction.values[0] || null;
        const selected = getBurc(selectedKey);
        setting = updateGuildBurcSetting(guildId, draft => {
          if (roleId) draft.roller[selected.key] = roleId;
          else delete draft.roller[selected.key];
        });
        return componentInteraction.update(
          render({
            notice: roleId
              ? `${emojiler.tik} ${selected.name} burcunun rolü <@&${roleId}> olarak kaydedildi.`
              : `${emojiler.tik} ${selected.name} burcunun rolü kaldırıldı.`,
          })
        );
      }

      if (!componentInteraction.isButton()) return;

      if (action === "send-now") {
        await componentInteraction.deferUpdate();
        setting = getGuildBurcSetting(guildId);
        const result = await sendLatestHoroscopesToGuild(interaction.guild, setting);
        setting = getGuildBurcSetting(guildId);
        return interaction.editReply(render({
          notice: result.messages === result.requested
            ? `${emojiler.tik} ${result.messages} burcun son yorumu <#${result.channelId}> kanalına gönderildi.`
            : `${emojiler.glitch_warning_arviis} Seçili ${result.requested} burçtan ${result.messages} tanesi <#${result.channelId}> kanalına gönderilebildi.`,
        }));
      }

      if (action === "remove-role") {
        const selected = getBurc(selectedKey);
        setting = updateGuildBurcSetting(guildId, draft => {
          delete draft.roller[selected.key];
        });
        return componentInteraction.update(
          render({ notice: `${emojiler.tik} ${selected.name} burcunun rolü kaldırıldı.` })
        );
      }

      if (action === "reset") {
        return componentInteraction.update(buildResetConfirmationPayload({ setting, sessionId }));
      }

      if (action === "cancel-reset") {
        return componentInteraction.update(render({ notice: `${emojiler.tik} Sıfırlama işlemi iptal edildi.` }));
      }

      if (action === "confirm-reset") {
        deleteGuildBurcSetting(guildId);
        setting = getGuildBurcSetting(guildId);
        selectedKey = BURCLAR[0].key;
        return componentInteraction.update(render({ notice: `${emojiler.tik} Yayın kanalı ve tüm burç rolleri sıfırlandı.` }));
      }
    } catch (error) {
      console.error("🔴 [BURÇ YÖNETİM PANELİ]", error);
      const message = error.message || "İşlem sırasında beklenmeyen bir hata oluştu.";

      if (componentInteraction.replied || componentInteraction.deferred) {
        return interaction.editReply(render({ notice: `⚠️ ${message}` })).catch(() => null);
      }

      return componentInteraction.reply({
        content: `⚠️ ${message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  };

  botClient.on("interactionCreate", listener);
  closeTimer = setTimeout(expireSession, PANEL_TTL);
  closeTimer.unref?.();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("burç-ayarla")
    .setDescription("Günlük burç yorumu gönderim sistemini ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    return executePanel(interaction, client);
  },

  buildPanelPayload,
  buildResetConfirmationPayload,
};
