const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const PANEL_ACCENT_COLOR = 0x5865f2;
const LIST_ACCENT_COLOR = 0xc9a76a;
const ERROR_ACCENT_COLOR = 0xe5484d;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 5;
const MIN_TAG_DURATION = 500;
const MAX_TAG_DURATION = 60_000;

const { loadDB, saveDB, getGuildChannelIds, getTagDuration, setTagDuration } = require("../../Dashboard/stores/ghostPing");

function formatTagDuration(duration) {
  const seconds = duration / 1_000;
  return `${seconds.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} saniye`;
}

function parseTagDuration(value) {
  const normalized = String(value)
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(ms|milisaniye|s|sn|saniye)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const multiplier = match[2] === "ms" || match[2] === "milisaniye" ? 1 : 1_000;
  const duration = Math.round(amount * multiplier);
  if (!Number.isFinite(duration) || duration < MIN_TAG_DURATION || duration > MAX_TAG_DURATION) {
    return null;
  }
  return duration;
}

function makeId(sessionId, action) {
  return `gp:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `gp:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function buildPanelPayload(guild, sessionId, disabled = false, ephemeral = true) {
  const data = loadDB();
  const channelIds = getGuildChannelIds(data, guild.id);
  const tagDuration = getTagDuration(data, guild.id);
  const hasChannels = channelIds.length > 0;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "add"))
    .setPlaceholder("Ghost ping kanallarını seç...")
    .setMinValues(1)
    .setMaxValues(10)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setDisabled(disabled);

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## 👻 Ghost Ping Yönetim Paneli",
          "Yeni katılan üyelerin kısa süreli etiketleneceği kanalları buradan yönetebilirsin.",
          "- Aşağıdaki menüden tek seferde en fazla **10 kanal** seçebilirsin.",
        ].join("\n")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### Sistem Özeti",
          `${hasChannels ? "🟢" : "🔴"} **Durum:** ${hasChannels ? "Aktif" : "Kurulmadı"}`,
          `${emojiler.hashtag}  **Kayıtlı kanal:** ${channelIds.length}`,
        ].join("\n")
      )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojiler.donensaat} **Etiket süresi:** ${formatTagDuration(tagDuration)}`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "duration"))
            .setLabel("Değiştir")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Kanal Ekle\nGhost ping gönderilecek metin veya duyuru kanallarını seç."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(channelSelect)
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "list"))
          .setLabel("Kanalları Listele")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "clear"))
          .setLabel("Tümünü Sil")
          .setEmoji(`${emojiler.cop}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || !hasChannels)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# Bu yönetim panelinin kullanım süresi doldu. Yeni bir panel için `/ghost-ping` komutunu tekrar kullan."
          : "-# Bu panel 5 dakika boyunca kullanılabilir."
      )
    );

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildNoticePayload(title, description, isError = false, ephemeral = true) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(isError ? ERROR_ACCENT_COLOR : PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildDurationModal(sessionId, currentDuration) {
  const input = new TextInputBuilder()
    .setCustomId("duration")
    .setLabel("Etiket süresi (0,5 - 60 saniye)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(20)
    .setPlaceholder("Örnek: 3 saniye")
    .setValue(formatTagDuration(currentDuration));

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, "duration-modal"))
    .setTitle("Ghost Ping Etiket Süresi")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function getGuildRecords(guild) {
  return getGuildChannelIds(loadDB(), guild.id)
    .map(channelId => ({
      channel: guild.channels.cache.get(channelId),
      channelId,
    }))
    .sort((first, second) => {
      if (!first.channel && second.channel) return 1;
      if (first.channel && !second.channel) return -1;

      return (first.channel?.rawPosition ?? first.channel?.position ?? 0)
        - (second.channel?.rawPosition ?? second.channel?.position ?? 0)
        || (first.channel?.name || first.channelId).localeCompare(
          second.channel?.name || second.channelId,
          "tr"
        );
    });
}

function formatListedChannel(record) {
  const channelLabel = record.channel
    ? `<#${record.channelId}>`
    : `Silinmiş kanal (\`${record.channelId}\`)`;

  return [
    `### ${emojiler.hashtag} ${channelLabel}`,
    `**Durum:** ${record.channel ? "🟢 Aktif" : "🔴 Kanal bulunamadı"}`,
  ].join("\n");
}

function buildListPayload(guild, sessionId, requestedPage = 0, disabled = false, ephemeral = true) {
  const records = getGuildRecords(guild);
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);

  const container = new ContainerBuilder()
    .setAccentColor(LIST_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Ghost Ping Kanal Listesi",
          records.length > 0
            ? `Sunucuda ghost ping ayarı bulunan **${records.length} kanal** listeleniyor.`
            : "Bu sunucuda kayıtlı bir ghost ping kanalı bulunmuyor.",
        ].join("\n")
      )
    );

  pageRecords.forEach((record, index) => {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(formatListedChannel(record))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, `delete:${record.channelId}:${page}`))
            .setLabel("Sil")
            .setEmoji(`${emojiler.cop}`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
        )
    );

    if (index < pageRecords.length - 1) {
      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );
    }
  });

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
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
          .setDisabled(disabled || page === pageCount - 1)
      )
    );

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildClearConfirmationPayload(sessionId, channelCount, ephemeral = true) {
  const container = new ContainerBuilder()
    .setAccentColor(ERROR_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## ⚠️ Tüm Ghost Ping Kanallarını Sil",
          `Kayıtlı **${channelCount} kanalın** tamamı silinecek. Bu işlem geri alınamaz.`,
          "Devam etmek istediğine emin misin?",
        ].join("\n")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "clear-confirm"))
          .setLabel("Evet, tümünü sil")
          .setEmoji(`${emojiler.cop}`)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "clear-cancel"))
          .setLabel("Vazgeç")
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ghost-ping")
    .setDescription("Ghost ping sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const sessionId = interaction.id;

    await interaction.reply(buildPanelPayload(guild, sessionId));

    let closed = false;
    let closeTimer;

    const refreshPanel = async () => {
      await interaction.editReply(
        buildPanelPayload(guild, sessionId, false, false)
      ).catch(() => null);
    };

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await interaction.editReply(
        buildPanelPayload(guild, sessionId, true, false)
      ).catch(() => null);
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            `${emojiler.uyari} **Bu paneli sadece komutu kullanan kişi yönetebilir.**`,
            true
          )
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isChannelSelectMenu() && action === "add") {
          const data = loadDB();
          const currentChannelIds = getGuildChannelIds(data, guild.id);
          const selectedChannelIds = componentInteraction.values.filter(
            channelId => !currentChannelIds.includes(channelId)
          );
          const skippedCount = componentInteraction.values.length - selectedChannelIds.length;

          data[guild.id] = [...currentChannelIds, ...selectedChannelIds];
          saveDB(data);

          const resultLines = [];
          if (selectedChannelIds.length > 0) {
            resultLines.push(
              `${emojiler.tik} ${selectedChannelIds.map(id => `<#${id}>`).join(", ")} **eklendi.**`
            );
          }
          if (skippedCount > 0) {
            resultLines.push(`${emojiler.uyari} **${skippedCount} kanal** zaten kayıtlı olduğu için atlandı.`);
          }

          await componentInteraction.reply(
            buildNoticePayload(
              selectedChannelIds.length > 0 ? "Kanallar eklendi" : "Yeni kanal eklenmedi",
              resultLines.join("\n") || `${emojiler.uyari} Seçilen kanallar eklenemedi.`,
              selectedChannelIds.length === 0
            )
          );
          return refreshPanel();
        }

        if (componentInteraction.isModalSubmit() && action === "duration-modal") {
          const duration = parseTagDuration(
            componentInteraction.fields.getTextInputValue("duration")
          );

          if (duration === null) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Geçersiz etiket süresi",
                `${emojiler.uyari} Süreyi \`0,5 saniye\`, \`3 saniye\` veya \`500 ms\` biçiminde ve **0,5–60 saniye** aralığında yaz.`,
                true
              )
            );
          }

          const data = loadDB();
          setTagDuration(data, guild.id, duration);
          saveDB(data);

          await componentInteraction.reply(
            buildNoticePayload(
              "Etiket süresi güncellendi",
              `${emojiler.tik} Ghost ping etiketleri **${formatTagDuration(duration)}** sonra silinecek.`
            )
          );
          return refreshPanel();
        }

        if (!componentInteraction.isButton()) return;

        if (action === "duration") {
          const currentDuration = getTagDuration(loadDB(), guild.id);
          return componentInteraction.showModal(
            buildDurationModal(sessionId, currentDuration)
          );
        }

        if (action === "list") {
          return componentInteraction.reply(buildListPayload(guild, sessionId));
        }

        if (action === "clear") {
          const channelCount = getGuildChannelIds(loadDB(), guild.id).length;
          if (channelCount === 0) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Silinecek kanal yok",
                `${emojiler.uyari} Bu sunucuda kayıtlı bir ghost ping kanalı bulunmuyor.`,
                true
              )
            );
          }

          return componentInteraction.reply(
            buildClearConfirmationPayload(sessionId, channelCount)
          );
        }

        if (action === "clear-cancel") {
          return componentInteraction.update(
            buildNoticePayload(
              "İşlem iptal edildi",
              "Ghost ping kanal kayıtlarında herhangi bir değişiklik yapılmadı.",
              false,
              false
            )
          );
        }

        if (action === "clear-confirm") {
          const data = loadDB();
          const deletedCount = getGuildChannelIds(data, guild.id).length;
          delete data[guild.id];
          saveDB(data);

          await componentInteraction.update(
            buildNoticePayload(
              "Tüm kanallar silindi",
              `${emojiler.tik} **${deletedCount} ghost ping kanalı** başarıyla silindi.`,
              false,
              false
            )
          );
          return refreshPanel();
        }

        if (action.startsWith("delete:")) {
          const [, targetChannelId, requestedPage] = action.split(":");
          if (!/^\d{17,20}$/.test(targetChannelId || "")) return;

          const data = loadDB();
          const currentChannelIds = getGuildChannelIds(data, guild.id);
          data[guild.id] = currentChannelIds.filter(id => id !== targetChannelId);
          if (data[guild.id].length === 0) delete data[guild.id];
          saveDB(data);

          await componentInteraction.update(
            buildListPayload(guild, sessionId, Number(requestedPage), false, false)
          );
          return refreshPanel();
        }

        if (action.startsWith("page:")) {
          const page = Number(action.slice("page:".length));
          return componentInteraction.update(
            buildListPayload(guild, sessionId, page, false, false)
          );
        }
      } catch (error) {
        console.error("🔴 [GHOST PING PANEL HATASI]", error);
        const payload = buildNoticePayload(
          "İşlem başarısız",
          `${emojiler.uyari} Ghost ping ayarları güncellenirken bir hata oluştu. Konsolu kontrol et.`,
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
  },
};