const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { MAX_DURATION, MIN_DURATION, MONTH_DURATION, YEAR_DURATION, deleteSetting, formatDuration, getSetting, hasSetting, isCompleteSetting, parseDuration, readData, updateSetting, writeData } = require("../../Utils/Scheduling/sureliMesajStore");
const { stopTimedMessage, syncTimedMessage } = require("../../Utils/Scheduling/sureliMesajScheduler");

const PANEL_ACCENT_COLOR = 0x1f9d8a;
const LIST_ACCENT_COLOR = 0xc9a76a;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 5;

function makeId(sessionId, action) {
  return `sm:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `sm:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function codeValue(value, maxLength = 180) {
  if (!value) return "`Ayarlanmadı`";

  const text = String(value)
    .replace(/`/g, "'")
    .replace(/\r?\n/g, " ↵ ");
  const shortened = text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  return `\`${shortened}\``;
}

function editableDuration(value) {
  const duration = Number(value);
  const units = [
    [YEAR_DURATION, "yıl"],
    [MONTH_DURATION, "ay"],
    [604_800_000, "hafta"],
    [86_400_000, "gün"],
    [3_600_000, "saat"],
    [60_000, "dakika"],
    [1_000, "saniye"],
  ];

  for (const [unitDuration, label] of units) {
    if (duration >= unitDuration && duration % unitDuration === 0) {
      return `${duration / unitDuration} ${label}`;
    }
  }

  return `${duration} ms`;
}

function buildPanelPayload(guild, channel, sessionId, disabled = false, ephemeral = true) {
  const data = readData();
  const configured = hasSetting(data, guild.id, channel.id);
  const setting = getSetting(data, guild.id, channel.id);
  const active = configured && isCompleteSetting(setting);
  const status = active
    ? "🟢 **Aktif** - mesajlar belirlenen aralıkla gönderiliyor."
    : configured
      ? "🟠 **Hazırlanıyor** - eksik alanı tamamladığında yayın başlayacak."
      : "🔴 **Kurulmadı** - mesaj ve süre alanlarını doldurarak başlatabilirsin.";

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Süreli Mesaj Kontrol Merkezi",
          `- <#${channel.id}> kanalının yayın akışını buradan hazırlayabilir ve güncelleyebilirsin.`,
          "- İki alan da tamamlandığında sistem otomatik olarak çalışmaya başlar.",
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
          "### Yayın Özeti",
          `${emojiler.speechbubble} **Mesaj:** ${codeValue(setting.mesaj)}`,
          `${emojiler.saat} **Gönderim aralığı:** ${codeValue(formatDuration(setting.süre))}`,
          `${emojiler.system} **Akış durumu:** ${status}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "edit:message"))
          .setLabel(setting.mesaj ? "Mesajı Düzenle" : "Mesajı Yaz")
          .setEmoji("✍️")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "edit:duration"))
          .setLabel(setting.süre ? "Süreyi Değiştir" : "Süreyi Ayarla")
          .setEmoji(`${emojiler.donensaat}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "list"))
          .setLabel("Tüm Ayarları Listele")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
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
        .setAccentColor(isError ? 0xe5484d : PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildEditModal(sessionId, field, currentValue) {
  const isMessage = field === "message";
  const modal = new ModalBuilder()
    .setCustomId(makeId(sessionId, `modal:${field}`))
    .setTitle(isMessage ? "Süreli Mesaj İçeriği" : "Gönderim Aralığı");

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(isMessage ? "Gönderilecek mesaj" : "Mesajın gönderim sıklığı")
    .setStyle(isMessage ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(isMessage ? 2_000 : 50)
    .setPlaceholder(
      isMessage
        ? "Belirlenen aralıklarla gönderilecek mesajı yaz."
        : "Örnek: 2 saat, 3 ay, 1 yıl"
    );

  if (currentValue) {
    input.setValue(
      String(isMessage ? currentValue : editableDuration(currentValue)).slice(0, isMessage ? 2_000 : 50)
    );
  }

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function getGuildRecords(guild, data) {
  const guildSettings = data[guild.id] || {};

  return Object.entries(guildSettings)
    .map(([channelId]) => ({
      channel: guild.channels.cache.get(channelId),
      channelId,
      setting: getSetting(data, guild.id, channelId),
    }))
    .filter(record =>
      !record.channel
      || record.channel.type === ChannelType.GuildText
      || record.channel.type === ChannelType.GuildAnnouncement
    )
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

function formatListedSetting(record) {
  const channelLabel = record.channel
    ? `<#${record.channelId}>`
    : `Silinmiş kanal (${record.channelId})`;
  const active = isCompleteSetting(record.setting);

  return [
    `### 📣 ${channelLabel}`,
    `**Mesaj:** ${codeValue(record.setting.mesaj, 100)}`,
    `**Gönderim aralığı:** ${formatDuration(record.setting.süre)}`,
    `**Durum:** ${active ? "🟢 Aktif" : "🟠 Eksik ayar"}`,
  ].join("\n");
}

function buildListPayload(guild, sessionId, requestedPage = 0, disabled = false, ephemeral = true) {
  const records = getGuildRecords(guild, readData());
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);

  const container = new ContainerBuilder()
    .setAccentColor(LIST_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Süreli Mesaj Listesi",
          records.length > 0
            ? `Sunucuda süreli mesaj ayarı bulunan **${records.length} kanal** listeleniyor.`
            : "Bu sunucuda kayıtlı bir süreli mesaj ayarı bulunmuyor.",
        ].join("\n")
      )
    );

  pageRecords.forEach((record, index) => {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(formatListedSetting(record))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, `list-reset:${record.channelId}:${page}`))
            .setLabel("Sıfırla")
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

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, `list-page:${page - 1}`))
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, `list-page-indicator:${page}`))
        .setLabel(`${page + 1}/${pageCount}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, `list-page:${page + 1}`))
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("süreli-mesaj")
    .setDescription("Süreli mesaj sistemini ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName("kanal")
        .setDescription("Süreli mesaj ayarlarını yöneteceğin kanalı seç.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const channel = interaction.options.getChannel("kanal", true);
    const sessionId = interaction.id;

    await interaction.reply(buildPanelPayload(guild, channel, sessionId));

    let closed = false;
    let closeTimer;

    const refreshPanel = async () => {
      await interaction.editReply(
        buildPanelPayload(guild, channel, sessionId, false, false)
      ).catch(() => null);
    };

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await interaction.editReply(
        buildPanelPayload(guild, channel, sessionId, true, false)
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
        if (componentInteraction.isButton()) {
          if (action === "edit:message" || action === "edit:duration") {
            const field = action.slice("edit:".length);
            const setting = getSetting(readData(), guild.id, channel.id);
            const currentValue = field === "message" ? setting.mesaj : setting.süre;
            return componentInteraction.showModal(
              buildEditModal(sessionId, field, currentValue)
            );
          }

          if (action === "list") {
            return componentInteraction.reply(buildListPayload(guild, sessionId));
          }

          if (action.startsWith("list-reset:")) {
            const [, targetChannelId, requestedPage] = action.split(":");
            if (!/^\d{17,20}$/.test(targetChannelId || "")) return;

            const data = readData();
            deleteSetting(data, guild.id, targetChannelId);
            writeData(data);
            stopTimedMessage(guild.id, targetChannelId);

            await componentInteraction.update(
              buildListPayload(guild, sessionId, Number(requestedPage), false, false)
            );

            if (targetChannelId === channel.id) await refreshPanel();
            return;
          }

          if (action.startsWith("list-page:")) {
            const page = Number(action.slice("list-page:".length));
            return componentInteraction.update(
              buildListPayload(guild, sessionId, page, false, false)
            );
          }
        }

        if (componentInteraction.isModalSubmit() && action.startsWith("modal:")) {
          const field = action.slice("modal:".length);
          const value = componentInteraction.fields.getTextInputValue("value").trim();

          if (field === "message") {
            if (!value) {
              return componentInteraction.reply(
                buildNoticePayload(
                  "Geçersiz mesaj",
                  `${emojiler.uyari} Süreli mesaj içeriği boş bırakılamaz.`,
                  true
                )
              );
            }

            updateSetting(guild.id, channel.id, setting => {
              setting.mesaj = value;
            });
            syncTimedMessage(botClient, guild.id, channel.id);

            await componentInteraction.reply(
              buildNoticePayload(
                "Mesaj güncellendi",
                `${emojiler.tik} Süreli mesaj içeriği kaydedildi.`
              )
            );
            return refreshPanel();
          }

          if (field === "duration") {
            const duration = parseDuration(value);
            if (!Number.isFinite(duration)) {
              return componentInteraction.reply(
                buildNoticePayload(
                  "Geçersiz gönderim aralığı",
                  [
                    `${emojiler.uyari} Süreyi \`30 dakika\`, \`2 saat\`, \`3 ay\` veya \`1 yıl\` biçiminde yaz.`,
                    `İzin verilen aralık: **${formatDuration(MIN_DURATION)} – ${formatDuration(MAX_DURATION)}**.`,
                  ].join("\n"),
                  true
                )
              );
            }

            updateSetting(guild.id, channel.id, setting => {
              setting.süre = duration;
            });
            syncTimedMessage(botClient, guild.id, channel.id);

            await componentInteraction.reply(
              buildNoticePayload(
                "Gönderim aralığı güncellendi",
                `${emojiler.tik} Mesaj aralığı **${formatDuration(duration)}** olarak kaydedildi.`
              )
            );
            return refreshPanel();
          }
        }
      } catch (error) {
        console.error("🔴 [SÜRELİ MESAJ PANEL HATASI]", error);
        const payload = buildNoticePayload(
          "İşlem başarısız",
          `${emojiler.uyari} Ayar güncellenirken bir hata oluştu. Konsolu kontrol et.`,
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
