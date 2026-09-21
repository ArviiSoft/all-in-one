const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize,SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const path = require("path");
const { readJson, writeJson } = require("../../Utils/Core/fileDB");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const DB_PATH = path.join(__dirname, "../../Database/Üye Verileri/eskiYeniUye.json");
const PANEL_TTL = 10 * 60_000;
const PANEL_FLAGS = MessageFlags.IsComponentsV2;
const PRIVATE_PANEL_FLAGS = PANEL_FLAGS | MessageFlags.Ephemeral;
const ACTIVE_COLOR = 0x57f287;
const WAITING_COLOR = 0xfee75c;
const ERROR_COLOR = 0xed4245;

function loadData() {
  const data = readJson(DB_PATH, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function getGuildConfig(guildId) {
  const config = loadData()[guildId];
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return { ...config };
}

function saveGuildConfig(guildId, config) {
  const data = loadData();
  data[guildId] = config;
  writeJson(DB_PATH, data);
}

function resetGuildConfig(guildId) {
  const data = loadData();
  if (!Object.prototype.hasOwnProperty.call(data, guildId)) return false;
  delete data[guildId];
  writeJson(DB_PATH, data);
  return true;
}

function makeId(sessionId, action) {
  return `eyu:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `eyu:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function channelLabel(channelId, guild) {
  if (!channelId) return "`Seçilmedi`";
  return guild.channels.cache.has(channelId)
    ? `<#${channelId}>`
    : `Silinmiş kanal (\`${channelId}\`)`;
}

function roleLabel(roleId, guild) {
  if (!roleId) return "`Seçilmedi`";
  return guild.roles.cache.has(roleId)
    ? `<@&${roleId}>`
    : `Silinmiş rol (\`${roleId}\`)`;
}

function hasCompleteInstallation(config) {
  return Boolean(
    config.eskiUyeKanal
    && config.eskiUyeMesaj
    && config.yeniUyeKanal
    && config.yeniUyeMesaj
    && config.rol
  );
}

function hasAnyConfig(config) {
  return Boolean(
    config.eskiUyeKanal
    || config.eskiUyeMesaj
    || config.yeniUyeKanal
    || config.yeniUyeMesaj
    || config.rol
  );
}

function messageLink(guildId, channelId, messageId) {
  if (!channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function buildPanelPayload({
  guild,
  sessionId,
  selection,
  disabled = false,
  notice = null,
  noticeError = false,
  ephemeral = true,
}) {
  const config = getGuildConfig(guild.id);
  const installed = hasCompleteInstallation(config);
  const configured = hasAnyConfig(config);
  const oldChanged = selection.oldChannelId !== (config.eskiUyeKanal || null);
  const newChanged = selection.newChannelId !== (config.yeniUyeKanal || null);
  const roleChanged = selection.roleId !== (config.rol || null);
  const hasPendingChanges = oldChanged || newChanged || roleChanged;
  const canApply = Boolean(
    selection.oldChannelId && selection.newChannelId && selection.roleId
  );

  const oldChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "old-channel"))
    .setPlaceholder("En eski üyeler kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  const newChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "new-channel"))
    .setPlaceholder("En yeni üyeler kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "role"))
    .setPlaceholder("Sıralamada ayrıca gösterilecek rolü seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  if (selection.oldChannelId && guild.channels.cache.has(selection.oldChannelId)) {
    oldChannelSelect.setDefaultChannels(selection.oldChannelId);
  }
  if (selection.newChannelId && guild.channels.cache.has(selection.newChannelId)) {
    newChannelSelect.setDefaultChannels(selection.newChannelId);
  }
  if (selection.roleId && guild.roles.cache.has(selection.roleId)) {
    roleSelect.setDefaultRoles(selection.roleId);
  }

  const status = installed
    ? "🟢 **Kurulu ve çalışıyor**"
    : configured
      ? "🟠 **Kurulum tamamlanmamış**"
      : "🔴 **Henüz kurulmadı**";
  const guildName = escapeMarkdown(guild.name, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
  const thumbnailUrl = guild.iconURL({ extension: "png", size: 256 })
    || guild.client.user.displayAvatarURL({ extension: "png", size: 256 });
  const container = new ContainerBuilder()
    .setAccentColor(installed ? ACTIVE_COLOR : WAITING_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## 🕰️ Eski · Yeni Üye",
              `**${guildName}** sunucusunun üye sıralamalarını tek ekrandan yönetir.`,
            ].join("\n")
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Sistem Durumu",
          status,
          `**Eski üyeler yayını:** ${channelLabel(config.eskiUyeKanal, guild)}`,
          `**Yeni üyeler yayını:** ${channelLabel(config.yeniUyeKanal, guild)}`,
          `**Filtre rolü:** ${roleLabel(config.rol, guild)}`,
          "-# Sıralamalar 10 dakikada bir otomatik güncellenir.",
        ].join("\n")
      )
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> ${noticeError ? `${emojiler.carpi}` : `${emojiler.tik}`} ${notice}`
      )
    );
  }

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 1 · En Eski Üyeler",
          `Seçili kanal: ${channelLabel(selection.oldChannelId, guild)}${oldChanged ? "  **(kaydedilmedi)**" : ""}`,
          "-# Sunucuya en önce katılan 10 üye bu kanalda yayınlanır.",
        ].join("\n")
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(oldChannelSelect))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 2 · En Yeni Üyeler",
          `Seçili kanal: ${channelLabel(selection.newChannelId, guild)}${newChanged ? "  **(kaydedilmedi)**" : ""}`,
          "-# Sunucuya en son katılan 10 üye bu kanalda yayınlanır.",
        ].join("\n")
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(newChannelSelect))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 3 · Rol Filtresi",
          `Seçili rol: ${roleLabel(selection.roleId, guild)}${roleChanged ? "  **(kaydedilmedi)**" : ""}`,
          "-# Genel sıralamanın altında, yalnızca bu role sahip üyelerin sıralaması da gösterilir.",
        ].join("\n")
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "apply"))
          .setLabel(installed ? "Değişiklikleri Uygula" : "Sistemi Kur")
          .setEmoji(installed ? "💾" : `${emojiler.system2}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled || !canApply),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "refresh"))
          .setLabel("Yenile")
          .setEmoji(`${emojiler.yukleniyor}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "reset"))
          .setLabel("Sistemi Sıfırla")
          .setEmoji(`${emojiler.cop}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || !configured)
      )
    );

  const links = new ActionRowBuilder();
  const oldLink = messageLink(guild.id, config.eskiUyeKanal, config.eskiUyeMesaj);
  const newLink = messageLink(guild.id, config.yeniUyeKanal, config.yeniUyeMesaj);
  if (oldLink) {
    links.addComponents(
      new ButtonBuilder()
        .setLabel("Eski Üye Listesine Git")
        .setEmoji("⏪")
        .setStyle(ButtonStyle.Link)
        .setURL(oldLink)
        .setDisabled(disabled)
    );
  }
  if (newLink) {
    links.addComponents(
      new ButtonBuilder()
        .setLabel("Yeni Üye Listesine Git")
        .setEmoji("⏩")
        .setStyle(ButtonStyle.Link)
        .setURL(newLink)
        .setDisabled(disabled)
    );
  }
  if (links.components.length) container.addActionRowComponents(links);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      disabled
        ? "-# 🔒 Yönetim oturumunun süresi doldu. Yeni panel için /eski-yeni-üye komutunu kullan."
        : hasPendingChanges
          ? "-# Seçimlerin hazır, kaydetmek ve yayınları oluşturmak için 'Değişiklikleri Uygula' butonuna bas."
          : "-# Bu panel 10 dakika boyunca kullanılabilir."
    )
  );

  return {
    components: [container],
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
          new TextDisplayBuilder().setContent(
            [
              "## ⚠️ Eski · Yeni Üye Sistemini Sıfırla",
              "- Kanal, mesaj ve rol bağlantıları veritabanından temizlenecek.",
              "- Mevcut sıralama mesajları silinmez ancak artık güncellenmez.",
              "",
              "Devam etmek istediğine emin misin?",
            ].join("\n")
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-confirm"))
              .setLabel("Evet, sistemi sıfırla")
              .setEmoji(`${emojiler.cop}`)
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "reset-cancel"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function validateChannel(channel, guild) {
  if (!channel || channel.guildId !== guild.id || !channel.isTextBased?.() || channel.isThread?.()) {
    return "Yalnızca bu sunucudaki bir yazı veya duyuru kanalını seçebilirsin.";
  }

  const permissions = channel.permissionsFor(guild.members.me);
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  if (!permissions?.has(requiredPermissions)) {
    return `Botun ${channel} kanalında **Kanalı Görüntüle**, **Mesaj Gönder** ve **Mesaj Geçmişini Oku** izinleri olmalı.`;
  }

  return null;
}

function validateRole(role, guild) {
  if (!role || role.guild.id !== guild.id) {
    return "Seçilen filtre rolü bu sunucuda bulunamadı.";
  }
  return null;
}

async function fetchConfiguredMessage(guild, channelId, messageId) {
  if (!channelId || !messageId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function prepareRankingMessage({ guild, channel, currentChannelId, currentMessageId, title }) {
  const existingMessage = channel.id === currentChannelId
    ? await fetchConfiguredMessage(guild, currentChannelId, currentMessageId)
    : null;

  if (existingMessage) return { message: existingMessage, created: false };

  const message = await channel.send({
    content: `# ${title} \n⏳ Güncelleniyor...`,
    allowedMentions: { parse: [] },
  });
  return { message, created: true };
}

async function installSystem(guild, selection) {
  const [oldChannel, newChannel, role] = await Promise.all([
    guild.channels.fetch(selection.oldChannelId).catch(() => null),
    guild.channels.fetch(selection.newChannelId).catch(() => null),
    guild.roles.fetch(selection.roleId).catch(() => null),
  ]);
  const oldChannelError = validateChannel(oldChannel, guild);
  const newChannelError = validateChannel(newChannel, guild);
  const roleError = validateRole(role, guild);
  if (oldChannelError) throw new Error(`**Eski üyeler kanalı:** ${oldChannelError}`);
  if (newChannelError) throw new Error(`**Yeni üyeler kanalı:** ${newChannelError}`);
  if (roleError) throw new Error(roleError);

  const current = getGuildConfig(guild.id);
  const createdMessages = [];

  try {
    const oldRanking = await prepareRankingMessage({
      guild,
      channel: oldChannel,
      currentChannelId: current.eskiUyeKanal,
      currentMessageId: current.eskiUyeMesaj,
      title: "En eski üyeler",
    });
    if (oldRanking.created) createdMessages.push(oldRanking.message);

    const newRanking = await prepareRankingMessage({
      guild,
      channel: newChannel,
      currentChannelId: current.yeniUyeKanal,
      currentMessageId: current.yeniUyeMesaj,
      title: "En yeni üyeler",
    });
    if (newRanking.created) createdMessages.push(newRanking.message);

    saveGuildConfig(guild.id, {
      ...current,
      eskiUyeKanal: oldChannel.id,
      eskiUyeMesaj: oldRanking.message.id,
      yeniUyeKanal: newChannel.id,
      yeniUyeMesaj: newRanking.message.id,
      rol: role.id,
    });
  } catch (error) {
    await Promise.allSettled(createdMessages.map(message => message.delete()));
    throw error;
  }
}

module.exports = {
  installSystem,
  data: new SlashCommandBuilder()
    .setName("eski-yeni-üye")
    .setDescription("Eski ve yeni üye sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const sessionId = interaction.id;
    const initialConfig = getGuildConfig(guild.id);
    const selection = {
      oldChannelId: initialConfig.eskiUyeKanal || null,
      newChannelId: initialConfig.yeniUyeKanal || null,
      roleId: initialConfig.rol || null,
    };

    await interaction.editReply(
      buildPanelPayload({ guild, sessionId, selection, ephemeral: false })
    );

    let closed = false;
    let closeTimer;

    const showPanel = (options = {}) => interaction.editReply(
      buildPanelPayload({
        guild,
        sessionId,
        selection,
        disabled: closed,
        ephemeral: false,
        ...options,
      })
    ).catch(() => null);

    const syncSelectionWithConfig = () => {
      const config = getGuildConfig(guild.id);
      selection.oldChannelId = config.eskiUyeKanal || null;
      selection.newChannelId = config.yeniUyeKanal || null;
      selection.roleId = config.rol || null;
    };

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await showPanel({ disabled: true });
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) return;

      try {
        if (componentInteraction.isChannelSelectMenu() && action === "old-channel") {
          selection.oldChannelId = componentInteraction.values[0];
          return componentInteraction.update(
            buildPanelPayload({ guild, sessionId, selection, ephemeral: false })
          );
        }

        if (componentInteraction.isChannelSelectMenu() && action === "new-channel") {
          selection.newChannelId = componentInteraction.values[0];
          return componentInteraction.update(
            buildPanelPayload({ guild, sessionId, selection, ephemeral: false })
          );
        }

        if (componentInteraction.isRoleSelectMenu() && action === "role") {
          selection.roleId = componentInteraction.values[0];
          return componentInteraction.update(
            buildPanelPayload({ guild, sessionId, selection, ephemeral: false })
          );
        }

        if (!componentInteraction.isButton()) return;

        if (action === "refresh") {
          syncSelectionWithConfig();
          return componentInteraction.update(
            buildPanelPayload({
              guild,
              sessionId,
              selection,
              notice: "Panel, kayıtlı ayarlarla yenilendi.",
              ephemeral: false,
            })
          );
        }

        if (action === "reset") {
          return componentInteraction.update(buildResetConfirmationPayload(sessionId));
        }

        if (action === "reset-cancel") {
          return componentInteraction.update(
            buildPanelPayload({ guild, sessionId, selection, ephemeral: false })
          );
        }

        if (action === "reset-confirm") {
          resetGuildConfig(guild.id);
          syncSelectionWithConfig();
          return componentInteraction.update(
            buildPanelPayload({
              guild,
              sessionId,
              selection,
              notice: "Sistem ayarları sıfırlandı. Mevcut sıralama mesajları artık güncellenmeyecek.",
              ephemeral: false,
            })
          );
        }

        if (action === "apply") {
          await componentInteraction.deferUpdate();
          try {
            await installSystem(guild, selection);
            syncSelectionWithConfig();
            return showPanel({
              notice: "Kanal ve rol ayarları kaydedildi; sıralama yayınları hazırlandı.",
            });
          } catch (error) {
            return showPanel({
              notice: error.message || "Sistem kurulurken beklenmeyen bir hata oluştu.",
              noticeError: true,
            });
          }
        }
      } catch (error) {
        console.error("🔴 [ESKİ YENİ ÜYE PANEL HATASI]", error);
        const payload = buildPanelPayload({
          guild,
          sessionId,
          selection,
          notice: "İşlem sırasında beklenmeyen bir hata oluştu.",
          noticeError: true,
          ephemeral: false,
        });
        if (componentInteraction.deferred || componentInteraction.replied) {
          return showPanel({
            notice: "İşlem sırasında beklenmeyen bir hata oluştu.",
            noticeError: true,
          });
        }
        return componentInteraction.update(payload).catch(() => null);
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(closeSession, PANEL_TTL);
  },
};
