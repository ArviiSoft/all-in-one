const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const PANEL_ACCENT_COLOR = 0xc9a76a;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 5;
const ARCHIVE_DURATIONS = Object.freeze([
  { label: "1 Saat", value: 60 },
  { label: "1 Gün", value: 1440 },
  { label: "3 Gün", value: 4320 },
  { label: "1 Hafta", value: 10080 },
]);
const DEFAULT_SETTING = Object.freeze({
  isim: "Yeni Thread",
  süre: 1440,
  sebep: "Belirtilmedi",
  botlar: false,
});

const { readData, writeData, hasSetting, normalizeSetting, getSetting, updateSetting, deleteSetting } = require("../../Dashboard/stores/otoThread");

function makeId(sessionId, action) {
  return `ot:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `ot:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function codeValue(value, maxLength = 90) {
  const text = String(value || "Ayarlanmadı").replace(/`/g, "'");
  const shortened = text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  return `\`${shortened}\``;
}

function archiveDurationLabel(value) {
  return ARCHIVE_DURATIONS.find(duration => duration.value === value)?.label || `${value} dakika`;
}

function buildSettingSection(sessionId, action, content, disabled = false, style = ButtonStyle.Secondary) {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, action))
        .setLabel("Değiştir")
        .setStyle(style)
        .setDisabled(disabled)
    );
}

function buildPanelButtonRow(sessionId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "list"))
      .setLabel("Listele")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

function buildPanelPayload(guild, channel, sessionId, disabled = false, ephemeral = true) {
  const data = readData();
  const configured = hasSetting(data, guild.id, channel.id);
  const setting = getSetting(data, guild.id, channel.id);
  const description = configured
    ? `<#${channel.id}> kanalındaki otomatik thread ayarlarını aşağıdan yönetebilirsin.`
    : `<#${channel.id}> kanalında henüz bir ayar yok. Bir seçeneği değiştirdiğinde sistem etkinleşir.`;

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Otomatik Thread Ayarları",
          description,
        ].join("\n")
      )
    )
    .addSectionComponents(
      buildSettingSection(
        sessionId,
        "edit:name",
        `🧵 **Thread adı:** ${codeValue(setting.isim)}`,
        disabled
      )
    )
    .addSectionComponents(
      buildSettingSection(
        sessionId,
        "edit:archive",
        `${emojiler.donensaat} **Arşiv süresi:** ${codeValue(archiveDurationLabel(setting.süre))}`,
        disabled
      )
    )
    .addSectionComponents(
      buildSettingSection(
        sessionId,
        "edit:reason",
        `📄 **Oluşturma sebebi:** ${codeValue(setting.sebep)}`,
        disabled
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addSectionComponents(
      buildSettingSection(
        sessionId,
        "toggle:bots",
        `${setting.botlar ? emojiler.active : emojiler.deactive} **Bot mesajları:** ${setting.botlar ? "Dahil" : "Hariç"}`,
        disabled,
        setting.botlar ? ButtonStyle.Success : ButtonStyle.Secondary
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addActionRowComponents(buildPanelButtonRow(sessionId, disabled));

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

function buildArchivePrompt(sessionId, currentDuration) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "select:archive"))
    .setPlaceholder("Thread arşiv süresini seç.")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      ARCHIVE_DURATIONS.map(duration => ({
        label: duration.label,
        value: String(duration.value),
        description: `Thread ${duration.label.toLocaleLowerCase("tr-TR")} sonra arşivlenir.`,
        default: duration.value === currentDuration,
      }))
    );

  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## Arşiv Süresi\nOtomatik oluşturulan thread'in ne zaman arşivleneceğini seç."
          )
        )
        .addActionRowComponents(new ActionRowBuilder().addComponents(select)),
    ],
    flags: PANEL_REPLY_FLAGS,
  };
}

function buildTextModal(sessionId, field, currentValue) {
  const isName = field === "name";
  const modal = new ModalBuilder()
    .setCustomId(makeId(sessionId, `modal:${field}`))
    .setTitle(isName ? "Thread Adı" : "Thread Oluşturma Sebebi");

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(isName ? "Thread adı" : "Oluşturma sebebi")
    .setStyle(isName ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(isName)
    .setMaxLength(isName ? 100 : 512)
    .setPlaceholder(
      isName
        ? "Otomatik açılacak thread'in adını yaz."
        : "Boş bırakırsan 'Belirtilmedi' kullanılır."
    );

  if (isName) input.setMinLength(1);
  if (currentValue) input.setValue(String(currentValue).slice(0, isName ? 100 : 512));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function getGuildThreadRecords(guild, data) {
  const guildSettings = data[guild.id] || {};

  return Object.entries(guildSettings)
    .map(([channelId, rawSetting]) => ({
      channel: guild.channels.cache.get(channelId),
      channelId,
      setting: normalizeSetting(rawSetting),
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

  return [
    `### 🧵 ${channelLabel}`,
    `**Thread adı:** ${codeValue(record.setting.isim, 70)}`,
    `**Arşiv süresi:** ${archiveDurationLabel(record.setting.süre)}`,
    `**Bot mesajları:** ${record.setting.botlar ? "🟢 Dahil" : "⚪ Hariç"}`,
    `**Sebep:** ${codeValue(record.setting.sebep, 80)}`,
  ].join("\n");
}

function buildListPayload(guild, sessionId, requestedPage = 0, disabled = false, ephemeral = true) {
  const records = getGuildThreadRecords(guild, readData());
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Otomatik Thread Listesi",
          records.length > 0
            ? `Sunucuda otomatik thread ayarı bulunan **${records.length} kanal** listeleniyor.`
            : "Bu sunucuda kayıtlı bir otomatik thread ayarı bulunmuyor.",
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

  const paginationRow = new ActionRowBuilder().addComponents(
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
  );

  container.addActionRowComponents(paginationRow);

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("otomatik-thread")
    .setDescription("Otomatik thread sistemini panelden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName("kanal")
        .setDescription("Otomatik thread ayarlarını yöneteceğin kanalı seç.")
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

    const saveAndRefresh = async (componentInteraction, title, description) => {
      await componentInteraction.update(
        buildNoticePayload(title, description, false, false)
      ).catch(async () => {
        await componentInteraction.reply(
          buildNoticePayload(title, description)
        ).catch(() => null);
      });
      await refreshPanel();
    };

    const listener = async componentInteraction => {
      const action = parseAction(componentInteraction.customId, sessionId);
      if (!action || closed) return;

      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply(
          buildNoticePayload(
            "Bu panel sana ait değil",
            `${emojiler.uyari} **Bu paneli sadece komutu kullanan kişi düzenleyebilir.**`,
            true
          )
        ).catch(() => null);
      }

      try {
        if (componentInteraction.isButton()) {
          if (action === "edit:name" || action === "edit:reason") {
            const field = action.slice("edit:".length);
            const setting = getSetting(readData(), guild.id, channel.id);
            const currentValue = field === "name" ? setting.isim : setting.sebep;
            return componentInteraction.showModal(
              buildTextModal(sessionId, field, currentValue)
            );
          }

          if (action === "edit:archive") {
            const setting = getSetting(readData(), guild.id, channel.id);
            return componentInteraction.reply(
              buildArchivePrompt(sessionId, setting.süre)
            );
          }

          if (action === "toggle:bots") {
            updateSetting(guild.id, channel.id, setting => {
              setting.botlar = !setting.botlar;
            });

            return componentInteraction.update(
              buildPanelPayload(guild, channel, sessionId, false, false)
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

        if (componentInteraction.isStringSelectMenu() && action === "select:archive") {
          const duration = Number(componentInteraction.values[0]);
          if (!ARCHIVE_DURATIONS.some(option => option.value === duration)) {
            return componentInteraction.reply(
              buildNoticePayload(
                "Geçersiz arşiv süresi",
                `${emojiler.uyari} Lütfen listeden geçerli bir arşiv süresi seç.`,
                true
              )
            );
          }

          updateSetting(guild.id, channel.id, setting => {
            setting.süre = duration;
          });

          return saveAndRefresh(
            componentInteraction,
            "Arşiv süresi güncellendi",
            `${emojiler.tik} Arşiv süresi **${archiveDurationLabel(duration)}** olarak güncellendi.`
          );
        }

        if (componentInteraction.isModalSubmit() && action.startsWith("modal:")) {
          const field = action.slice("modal:".length);
          const value = componentInteraction.fields.getTextInputValue("value").trim();

          if (field === "name") {
            if (!value) {
              return componentInteraction.reply(
                buildNoticePayload(
                  "Geçersiz thread adı",
                  `${emojiler.uyari} Thread adı boş bırakılamaz.`,
                  true
                )
              );
            }

            updateSetting(guild.id, channel.id, setting => {
              setting.isim = value;
            });

            await componentInteraction.reply(
              buildNoticePayload(
                "Thread adı güncellendi",
                `${emojiler.tik} Thread adı ${codeValue(value)} olarak güncellendi.`
              )
            );
            return refreshPanel();
          }

          if (field === "reason") {
            updateSetting(guild.id, channel.id, setting => {
              setting.sebep = value || DEFAULT_SETTING.sebep;
            });

            await componentInteraction.reply(
              buildNoticePayload(
                "Oluşturma sebebi güncellendi",
                value
                  ? `${emojiler.tik} Thread oluşturma sebebi güncellendi.`
                  : `${emojiler.tik} Thread oluşturma sebebi varsayılana döndürüldü.`
              )
            );
            return refreshPanel();
          }
        }
      } catch (error) {
        console.error("🔴 [OTOMATİK THREAD PANEL HATASI]", error);
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