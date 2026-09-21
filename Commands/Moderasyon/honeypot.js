const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const {
  buildHoneypotPanel,
  readHoneypotDB,
  writeHoneypotDB,
} = require("../../Utils/Moderation/honeypot");

const PANEL_ACCENT_COLOR = 0xf0b232;
const LIST_ACCENT_COLOR = 0xc9a76a;
const ERROR_ACCENT_COLOR = 0xe5484d;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 5;
const CHANNEL_ID_PATTERN = /^\d{17,20}$/;

const PROTECTED_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
];

const LOG_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

function makeId(sessionId, action) {
  return `hp:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `hp:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function readDB() {
  const data = readHoneypotDB();
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function ensureGuildData(db, guildId) {
  const current = db[guildId];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    db[guildId] = { channels: {} };
  }

  if (
    !db[guildId].channels
    || typeof db[guildId].channels !== "object"
    || Array.isArray(db[guildId].channels)
  ) {
    db[guildId].channels = {};
  }

  return db[guildId];
}

function getGuildData(db, guildId) {
  const guildData = db[guildId];
  if (!guildData || typeof guildData !== "object" || Array.isArray(guildData)) {
    return { channels: {} };
  }

  const channels = guildData.channels;
  return {
    ...guildData,
    channels: channels && typeof channels === "object" && !Array.isArray(channels)
      ? channels
      : {},
  };
}

function getGuildRecords(guild, db = readDB()) {
  const guildData = getGuildData(db, guild.id);

  return Object.entries(guildData.channels)
    .filter(([channelId]) => CHANNEL_ID_PATTERN.test(channelId))
    .map(([channelId, rawEntry]) => ({
      channel: guild.channels.cache.get(channelId),
      channelId,
      entry: rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry)
        ? rawEntry
        : {},
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

function formatPanelLink(guildId, record) {
  if (!record.entry.messageId || !record.channel) return "`Bulunamadı`";
  return `[**__Mesaja git__**](https://discord.com/channels/${guildId}/${record.channelId}/${record.entry.messageId})`;
}

function formatListedRecord(guild, record) {
  const channelLabel = record.channel
    ? `<#${record.channelId}>`
    : `Silinmiş kanal (\`${record.channelId}\`)`;
  const kickCount = Number(record.entry.kickCount) || 0;

  return [
    `### ${emojiler.hashtag} ${channelLabel}`,
    `**Panel:** ${formatPanelLink(guild.id, record)}`,
    `**Atılan kullanıcı:** ${kickCount}`,
    `**Durum:** ${record.channel ? "🟢 Aktif" : "🔴 Kanal bulunamadı"}`,
  ].join("\n");
}

function buildPanelPayload(guild, sessionId, disabled = false, ephemeral = true) {
  const guildData = getGuildData(readDB(), guild.id);
  const records = getGuildRecords(guild, { [guild.id]: guildData });
  const logChannel = guildData.logChannelId
    ? guild.channels.cache.get(guildData.logChannelId)
    : null;
  const totalKickCount = records.reduce(
    (total, record) => total + (Number(record.entry.kickCount) || 0),
    0
  );
  const hasChannels = records.length > 0;
  const logLabel = guildData.logChannelId
    ? (logChannel ? `<#${guildData.logChannelId}>` : `Silinmiş kanal (\`${guildData.logChannelId}\`)`)
    : "`Ayarlanmadı`";

  const protectedChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "add"))
    .setPlaceholder("Honeypot kurulacak kanalları seç...")
    .setMinValues(1)
    .setMaxValues(10)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setDisabled(disabled);

  const logChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "log"))
    .setPlaceholder("Honeypot log kanalını seç...")
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setDisabled(disabled);

  const logSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Log Kanalı\nİhlal kayıtlarının gönderileceği kanal: ${logLabel}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, "log-clear"))
        .setLabel("Sıfırla")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || !guildData.logChannelId)
    );

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${emojiler.kalkan} Honeypot Yönetim Paneli`,
          "Spam botlarını yakalayacak koruma kanallarını ve ihlal kayıtlarını buradan yönetebilirsin.",
          "- Bir seçimde en fazla **10 koruma kanalı** kurabilirsin.",
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
          `${emojiler.hashtag} **Korunan kanal:** ${records.length}`,
          `${emojiler.suspected_spam_activ} **Toplam atılan:** ${totalKickCount}`,
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
        "### Koruma Kanalı Ekle\nMesaj gönderildiğinde kullanıcıyı sunucudan atacak metin veya duyuru kanallarını seç."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(protectedChannelSelect)
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addSectionComponents(logSection)
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(logChannelSelect)
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
          .setLabel("Listele")
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
          ? "-# Bu yönetim panelinin kullanım süresi doldu. Yeni bir panel için `/honeypot` komutunu tekrar kullan."
          : "-# Bu panel 5 dakika boyunca kullanılabilir."
      )
    );

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildListPayload(guild, sessionId, requestedPage = 0, disabled = false, ephemeral = true) {
  const records = getGuildRecords(guild);
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const parsedPage = Number(requestedPage);
  const page = Math.min(
    Math.max(Number.isFinite(parsedPage) ? Math.trunc(parsedPage) : 0, 0),
    pageCount - 1
  );
  const pageRecords = records.slice(
    page * LIST_PAGE_SIZE,
    (page + 1) * LIST_PAGE_SIZE
  );

  const container = new ContainerBuilder()
    .setAccentColor(LIST_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Honeypot Kanal Listesi",
          records.length > 0
            ? `Sunucuda honeypot koruması bulunan **${records.length} kanal** listeleniyor.`
            : "Bu sunucuda kayıtlı bir honeypot koruma kanalı bulunmuyor.",
        ].join("\n")
      )
    );

  pageRecords.forEach((record, index) => {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(formatListedRecord(guild, record))
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

function buildClearConfirmationPayload(sessionId, channelCount, ephemeral = true) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ERROR_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "## ⚠️ Tüm Honeypot Kanallarını Sil",
              `Kayıtlı **${channelCount} kanalın** koruma paneli ve ayarı silinecek. Log kanalı ayarı korunacak.`,
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
        ),
    ],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

async function fetchGuildChannel(guild, channelId) {
  return guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
}

async function deletePanelMessage(guild, channelId, entry) {
  if (!entry?.messageId) return false;

  const channel = await fetchGuildChannel(guild, channelId);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) return false;

  const message = await channel.messages.fetch(entry.messageId).catch(() => null);
  if (!message) return false;

  return message.delete().then(() => true).catch(error => {
    console.error(`🔴 [HONEYPOT] Panel silinemedi ( ${channelId}/${entry.messageId} ):`, error);
    return false;
  });
}

async function addProtectedChannels(interaction, client, guild, user, channelIds) {
  const botMember = guild.members.me
    || await guild.members.fetchMe().catch(() => null);

  if (!botMember) {
    return {
      title: "Bot bilgisi alınamadı",
      description: `${emojiler.uyari} Sunucudaki bot üye bilgisi alınamadı.`,
      isError: true,
    };
  }

  if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
    return {
      title: "Yetki eksik",
      description: `${emojiler.uyari} Honeypot koruması için botta **Üyeleri At** yetkisi olmalı.`,
      isError: true,
    };
  }

  const db = readDB();
  const guildData = ensureGuildData(db, guild.id);
  const added = [];
  const skipped = [];
  const failed = [];

  for (const channelId of [...new Set(channelIds)]) {
    if (guildData.channels[channelId]) {
      skipped.push(`<#${channelId}>`);
      continue;
    }

    const channel = interaction.channels.get(channelId)
      || await fetchGuildChannel(guild, channelId);
    const permissions = channel?.permissionsFor?.(botMember);

    if (!channel?.isTextBased?.() || !permissions?.has(PROTECTED_CHANNEL_PERMISSIONS)) {
      failed.push(
        `<#${channelId}> (Görüntüle / Mesaj Gönder / Mesaj Geçmişi / Mesajları Yönet / Threadleri Yönet izni eksik)`
      );
      continue;
    }

    try {
      const panelMessage = await channel.send({
        components: [buildHoneypotPanel(guild, 0, client)],
        flags: MessageFlags.IsComponentsV2,
      });

      guildData.channels[channelId] = {
        messageId: panelMessage.id,
        kickCount: 0,
        createdBy: user.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      added.push(`<#${channelId}>`);
    } catch (error) {
      console.error(`🔴 [HONEYPOT] Panel gönderilemedi ( ${channelId} ):`, error);
      failed.push(`<#${channelId}> (Panel gönderilemedi)`);
    }
  }

  writeHoneypotDB(db);

  const lines = [];
  if (added.length) lines.push(`${emojiler.tik} ${added.join(", ")} kanalına koruma paneli **kuruldu.**`);
  if (skipped.length) lines.push(`${emojiler.uyari} Zaten korunan ${skipped.join(", ")} **atlandı.**`);
  if (failed.length) lines.push(`${emojiler.glitchwarning} **Kurulamayan:** ${failed.join(", ")}`);

  return {
    title: added.length ? "Honeypot kanalları kuruldu" : "Yeni kanal kurulamadı",
    description: lines.join("\n") || `${emojiler.uyari} Seçilen kanallarda değişiklik yapılmadı.`,
    isError: added.length === 0,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("Honeypot Koruma sistemini yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
          const result = await addProtectedChannels(
            componentInteraction,
            botClient,
            guild,
            user,
            componentInteraction.values
          );

          await componentInteraction.reply(
            buildNoticePayload(result.title, result.description, result.isError)
          );
          return refreshPanel();
        }

        if (componentInteraction.isChannelSelectMenu() && action === "log") {
          const channelId = componentInteraction.values[0];
          const channel = componentInteraction.channels.get(channelId)
            || await fetchGuildChannel(guild, channelId);
          const botMember = guild.members.me
            || await guild.members.fetchMe().catch(() => null);
          const permissions = channel?.permissionsFor?.(botMember);

          if (!botMember || !channel?.isTextBased?.() || !permissions?.has(LOG_CHANNEL_PERMISSIONS)) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Log kanalı ayarlanamadı",
                `${emojiler.uyari} Seçilen log kanalında botun **Görüntüle, Mesaj Gönder ve Mesaj Geçmişini Oku** yetkileri olmalı.`,
                true
              )
            );
          }

          const db = readDB();
          const guildData = ensureGuildData(db, guild.id);
          guildData.logChannelId = channel.id;
          guildData.logUpdatedBy = user.id;
          guildData.logUpdatedAt = Date.now();
          writeHoneypotDB(db);

          await componentInteraction.reply(
            buildNoticePayload(
              "Log kanalı güncellendi",
              `${emojiler.tik} Honeypot log kanalı ${channel} olarak **ayarlandı.**`
            )
          );
          return refreshPanel();
        }

        if (!componentInteraction.isButton()) return;

        if (action === "list") {
          return componentInteraction.reply(buildListPayload(guild, sessionId));
        }

        if (action === "log-clear") {
          const db = readDB();
          const guildData = ensureGuildData(db, guild.id);
          delete guildData.logChannelId;
          delete guildData.logUpdatedBy;
          delete guildData.logUpdatedAt;
          writeHoneypotDB(db);

          await componentInteraction.reply(
            buildNoticePayload(
              "Log kanalı sıfırlandı",
              `${emojiler.tik} Honeypot log kanalı ayarı **kaldırıldı.**`
            )
          );
          return refreshPanel();
        }

        if (action === "clear") {
          const channelCount = getGuildRecords(guild).length;
          if (channelCount === 0) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Silinecek kanal yok",
                `${emojiler.uyari} Bu sunucuda kayıtlı bir honeypot koruma kanalı bulunmuyor.`,
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
              "Honeypot kanal kayıtlarında herhangi bir değişiklik yapılmadı.",
              false,
              false
            )
          );
        }

        if (action === "clear-confirm") {
          const db = readDB();
          const guildData = ensureGuildData(db, guild.id);
          const records = Object.entries(guildData.channels);
          let deletedPanelCount = 0;

          for (const [channelId, entry] of records) {
            if (await deletePanelMessage(guild, channelId, entry)) {
              deletedPanelCount++;
            }
          }

          guildData.channels = {};
          writeHoneypotDB(db);

          await componentInteraction.update(
            buildNoticePayload(
              "Tüm honeypot kanalları silindi",
              [
                `${emojiler.tik} **${records.length} kanal ayarı** başarıyla silindi.`,
                `**Silinen panel mesajı:** ${deletedPanelCount}`,
              ].join("\n"),
              false,
              false
            )
          );
          return refreshPanel();
        }

        if (action.startsWith("delete:")) {
          const [, targetChannelId, requestedPage] = action.split(":");
          if (!CHANNEL_ID_PATTERN.test(targetChannelId || "")) return;

          const db = readDB();
          const guildData = ensureGuildData(db, guild.id);
          const entry = guildData.channels[targetChannelId];

          if (entry) {
            await deletePanelMessage(guild, targetChannelId, entry);
            delete guildData.channels[targetChannelId];
            writeHoneypotDB(db);
          }

          await componentInteraction.update(
            buildListPayload(
              guild,
              sessionId,
              Number(requestedPage),
              false,
              false
            )
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
        console.error("🔴 [HONEYPOT YÖNETİM PANELİ HATASI]", error);
        const payload = buildNoticePayload(
          "İşlem başarısız",
          `${emojiler.uyari} Honeypot ayarları güncellenirken bir hata oluştu. Konsolu kontrol et.`,
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
