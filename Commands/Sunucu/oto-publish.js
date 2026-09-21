const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_ACCENT_COLOR = 0x5865f2;
const ACTIVE_ACCENT_COLOR = 0x57f287;
const LIST_ACCENT_COLOR = 0x2b9eb3;
const DANGER_ACCENT_COLOR = 0xed4245;
const SESSION_TTL = 10 * 60_000;
const LIST_PAGE_SIZE = 5;
const MAX_CHANNELS_PER_SELECTION = 25;

const { loadDB, saveDB, getGuildChannelIds, setGuildChannelIds } = require("../../Dashboard/stores/otoPublish");

function makeId(sessionId, action) {
  return `op:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `op:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(true);
}

function getGuildRecords(guild) {
  return getGuildChannelIds(loadDB(), guild.id)
    .map(channelId => ({
      channelId,
      channel: guild.channels.cache.get(channelId) || null,
    }))
    .sort((first, second) => {
      if (!first.channel && second.channel) return 1;
      if (first.channel && !second.channel) return -1;

      const positionDifference = (first.channel?.rawPosition ?? 0) - (second.channel?.rawPosition ?? 0);
      if (positionDifference !== 0) return positionDifference;

      return (first.channel?.name || first.channelId).localeCompare(
        second.channel?.name || second.channelId,
        "tr"
      );
    });
}

function channelState(record) {
  if (!record.channel) {
    return {
      label: `Silinmiş veya erişilemeyen kanal (\`${record.channelId}\`)`,
      status: "🔴 Kanal bulunamadı",
    };
  }

  if (record.channel.type !== ChannelType.GuildAnnouncement) {
    return {
      label: `<#${record.channelId}>`,
      status: "🟠 Artık duyuru kanalı değil",
    };
  }

  return {
    label: `<#${record.channelId}>`,
    status: "🟢 Otomatik publish etkin",
  };
}

function buildPanelPayload(guild, sessionId, options = {}) {
  const {
    disabled = false,
    initial = false,
    notice = null,
  } = options;
  const records = getGuildRecords(guild);
  const activeCount = records.filter(
    record => record.channel?.type === ChannelType.GuildAnnouncement
  ).length;
  const unavailableCount = records.length - activeCount;
  const isActive = activeCount > 0;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "add"))
    .setPlaceholder("Otomatik yayınlanacak duyuru kanallarını seç")
    .setChannelTypes(ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(MAX_CHANNELS_PER_SELECTION)
    .setDisabled(disabled);

  const summaryLines = [
    "### Sistem Özeti",
    `${isActive ? "🟢" : "🟡"} **Durum:** ${isActive ? "Aktif" : "Kanal seçimi bekliyor"}`,
    `📣 **Etkin duyuru kanalı:** ${activeCount}`,
  ];

  if (unavailableCount > 0) {
    summaryLines.push(`⚠️ **Temizlenmesi gereken kayıt:** ${unavailableCount}`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(isActive ? ACTIVE_ACCENT_COLOR : PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 📡 Otomatik Publish",
        "- Duyuru kanallarındaki yeni mesajların otomatik yayınlanacağı kanalları tek panelden yönet.",
        "-# Değişiklikler kaydedildiği anda uygulanır, botu yeniden başlatman gerekmez.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(summaryLines.join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Duyuru Kanalı Ekle",
        "Menüde yalnızca duyuru kanalları görünür. Bir işlemde 25 kanal seçebilir, menüyü tekrar kullanarak sınırsız sayıda kanal ekleyebilirsin.",
      ].join("\n"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(channelSelect)
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
          .setCustomId(makeId(sessionId, "list"))
          .setLabel("Kanalları Listele")
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
          .setDisabled(disabled || records.length === 0)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Bu yönetim panelinin kullanım süresi doldu. Yeni bir panel için `/oto-publish` komutunu kullan."
          : "-# Panel 10 dakika boyunca kullanılabilir."
      )
    );

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildListPayload(guild, sessionId, requestedPage = 0, options = {}) {
  const {
    disabled = false,
    notice = null,
  } = options;
  const records = getGuildRecords(guild);
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);
  const container = new ContainerBuilder()
    .setAccentColor(LIST_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 📋 Otomatik Publish Kanal Listesi",
        records.length > 0
          ? `Toplam **${records.length} kanal** kayıtlı. Kaldırmak istediğin kanalın yanındaki butonu kullan.`
          : "Bu sunucuda kayıtlı bir otomatik publish kanalı bulunmuyor.",
      ].join("\n"))
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> ${notice}`)
    );
  }

  if (pageRecords.length > 0) {
    container.addSeparatorComponents(separator());

    pageRecords.forEach((record, index) => {
      const state = channelState(record);

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
              `### ${state.label}`,
              `**Durum:** ${state.status}`,
              `-# Kanal ID: ${record.channelId}`,
            ].join("\n"))
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, `delete:${record.channelId}:${page}`))
              .setLabel("Kanalı Sil")
              .setEmoji(`${emojiler.cop || "🗑️"}`)
              .setStyle(ButtonStyle.Danger)
              .setDisabled(disabled)
          )
      );

      if (index < pageRecords.length - 1) {
        container.addSeparatorComponents(separator());
      }
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
          ? "-# 🔒 Bu kanal listesi artık kullanılamaz."
          : "-# Silme butonu yalnızca seçtiğin kanal kaydını kaldırır."
      )
    );

  return {
    components: [container],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildClearConfirmationPayload(sessionId, channelCount) {
  const container = new ContainerBuilder()
    .setAccentColor(DANGER_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## ⚠️ Otomatik Publish Sistemini Sıfırla",
        `- Kayıtlı **${channelCount} kanalın** tamamı otomatik publish listesinden kaldırılacak.`,
        "-# Kanallardaki eski mesajlar etkilenmez. Bu ayar değişikliği geri alınamaz.",
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
    );

  return {
    components: [container],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildNoticePayload(title, description, isError = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(isError ? DANGER_ACCENT_COLOR : ACTIVE_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PANEL_REPLY_FLAGS,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("oto-publish")
    .setDescription("Otomatik publish sistemini ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, guildId, user } = interaction;
    const sessionId = interaction.id;
    let closed = false;
    let closeTimer;
    let currentView = { name: "dashboard", page: 0 };

    await interaction.reply(
      buildPanelPayload(guild, sessionId, { initial: true })
    );

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);

      const payload = currentView.name === "list"
        ? buildListPayload(guild, sessionId, currentView.page, { disabled: true })
        : buildPanelPayload(guild, sessionId, { disabled: true });

      await interaction.editReply(payload).catch(() => null);
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            `${emojiler.uyari || "⚠️"} Bu yönetim panelini yalnızca komutu kullanan yönetici kontrol edebilir.`,
            true
          )
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isChannelSelectMenu() && action === "add") {
          const selectedChannelIds = componentInteraction.values.filter(channelId => {
            const channel = componentInteraction.channels?.get(channelId)
              || guild.channels.cache.get(channelId);

            return channel?.guildId === guildId
              && channel.type === ChannelType.GuildAnnouncement;
          });
          const invalidCount = componentInteraction.values.length - selectedChannelIds.length;
          const data = loadDB();
          const currentChannelIds = getGuildChannelIds(data, guildId);
          const newChannelIds = selectedChannelIds.filter(
            channelId => !currentChannelIds.includes(channelId)
          );
          const duplicateCount = selectedChannelIds.length - newChannelIds.length;

          if (newChannelIds.length > 0) {
            setGuildChannelIds(data, guildId, [...currentChannelIds, ...newChannelIds]);
            saveDB(data);
          }

          const resultLines = [];
          if (newChannelIds.length > 0) {
            resultLines.push(
              `${emojiler.tik || "✅"} ${newChannelIds.map(channelId => `<#${channelId}>`).join(", ")} **eklendi.**`
            );
          }
          if (duplicateCount > 0) {
            resultLines.push(
              `${emojiler.uyari || "⚠️"} **${duplicateCount} kanal** zaten kayıtlı olduğu için atlandı.`
            );
          }
          if (invalidCount > 0) {
            resultLines.push(
              `${emojiler.uyari || "⚠️"} **${invalidCount} geçersiz kanal** eklenmedi.`
            );
          }

          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, {
              notice: resultLines.join("\n") || `${emojiler.uyari || "⚠️"} Yeni bir kanal eklenmedi.`,
            })
          );
        }

        if (!componentInteraction.isButton()) return;

        if (action === "list") {
          currentView = { name: "list", page: 0 };
          return componentInteraction.update(
            buildListPayload(guild, sessionId, 0)
          );
        }

        if (action === "dashboard") {
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(
            buildPanelPayload(guild, sessionId)
          );
        }

        if (action === "refresh") {
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, { notice: "🔄 Panel güncel kanal kayıtlarıyla yenilendi." })
          );
        }

        if (action === "clear") {
          const channelCount = getGuildChannelIds(loadDB(), guildId).length;
          if (channelCount === 0) {
            return componentInteraction.update(
              buildPanelPayload(guild, sessionId, {
                notice: `${emojiler.uyari || "⚠️"} Sıfırlanacak bir kanal kaydı bulunmuyor.`,
              })
            );
          }

          currentView = { name: "confirm", page: 0 };
          return componentInteraction.update(
            buildClearConfirmationPayload(sessionId, channelCount)
          );
        }

        if (action === "clear-cancel") {
          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, {
              notice: "Sıfırlama iptal edildi; kanal kayıtlarında değişiklik yapılmadı.",
            })
          );
        }

        if (action === "clear-confirm") {
          const data = loadDB();
          const deletedCount = getGuildChannelIds(data, guildId).length;
          setGuildChannelIds(data, guildId, []);
          saveDB(data);

          currentView = { name: "dashboard", page: 0 };
          return componentInteraction.update(
            buildPanelPayload(guild, sessionId, {
              notice: `${emojiler.tik || "✅"} **${deletedCount} kanal kaydı** kaldırıldı ve otomatik yayın sistemi sıfırlandı.`,
            })
          );
        }

        if (action.startsWith("delete:")) {
          const [, targetChannelId, requestedPage] = action.split(":");
          if (!/^\d{17,20}$/.test(targetChannelId || "")) return;

          const data = loadDB();
          const currentChannelIds = getGuildChannelIds(data, guildId);
          const channelWasRegistered = currentChannelIds.includes(targetChannelId);
          setGuildChannelIds(
            data,
            guildId,
            currentChannelIds.filter(channelId => channelId !== targetChannelId)
          );
          if (channelWasRegistered) saveDB(data);

          const requestedListPage = Number(requestedPage) || 0;
          const recordsAfterDelete = getGuildRecords(guild);
          const lastPage = Math.max(0, Math.ceil(recordsAfterDelete.length / LIST_PAGE_SIZE) - 1);
          const nextPage = Math.min(requestedListPage, lastPage);
          currentView = { name: "list", page: nextPage };

          return componentInteraction.update(
            buildListPayload(guild, sessionId, nextPage, {
              notice: channelWasRegistered
                ? `${emojiler.tik || "✅"} <#${targetChannelId}> otomatik yayın listesinden kaldırıldı.`
                : `${emojiler.uyari || "⚠️"} Kanal kaydı zaten kaldırılmış; liste yenilendi.`,
            })
          );
        }

        if (action.startsWith("page:")) {
          const page = Number(action.slice("page:".length));
          if (!Number.isInteger(page)) return;

          currentView = { name: "list", page };
          return componentInteraction.update(
            buildListPayload(guild, sessionId, page)
          );
        }
      } catch (error) {
        console.error("🔴 [OTO PUBLISH PANEL HATASI]", error);
        const payload = buildNoticePayload(
          "İşlem başarısız",
          `${emojiler.uyari || "⚠️"} Otomatik yayın ayarları güncellenirken bir hata oluştu. Konsolu kontrol et.`,
          true
        );

        if (componentInteraction.replied || componentInteraction.deferred) {
          await componentInteraction.followUp(payload).catch(() => null);
        } else {
          await componentInteraction.reply(payload).catch(() => null);
        }
      }
    };

    botClient.on("interactionCreate", listener);
    closeTimer = setTimeout(closeSession, SESSION_TTL);
    closeTimer.unref?.();
  },
};