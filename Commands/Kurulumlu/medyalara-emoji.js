const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { MAX_EMOJIS, deleteSetting, getDefaultEmojis, getSetting, loadData, saveData, setSetting, uniqueEmojis } = require("../../Utils/Media/mediaEmojiStore.js");

const PANEL_ACCENT_COLOR = 0xc9a76a;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 4;
const LIST_EMBED_COLOR = 0x3498db;
const CUSTOM_EMOJI_PATTERN = /^<(a?):([A-Za-z0-9_]+):(\d+)>$/;
const COMMON_EMOJIS = ["👍", "👎", "❤️", "🔥", "😂", "🎉", "✅", "❌", "⭐", "💯"];

const MEDIA_TYPES = Object.freeze({
  image: {
    dataKey: "görsel",
    label: "Görsellere emoji",
    placeholder: "Görsellere eklenecek emojileri seç (en fazla 10).",
  },
  video: {
    dataKey: "video",
    label: "Videolara emoji",
    placeholder: "Videolara eklenecek emojileri seç (en fazla 10).",
  },
});

function makeId(sessionId, action) {
  return `me:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `me:${sessionId}:`;
  if (!customId?.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

function resolveCustomEmoji(client, guild, id) {
  return guild.emojis.cache.get(id)
    || emojiler.getEmojiById(id)
    || client.application?.emojis?.cache?.get(id)
    || client.guilds.cache.find(otherGuild => otherGuild.emojis.cache.has(id))?.emojis.cache.get(id)
    || null;
}

function optionFromValue(value, selectedValues, client, guild) {
  const customMatch = value.match(CUSTOM_EMOJI_PATTERN);
  const option = new StringSelectMenuOptionBuilder()
    .setValue(value)
    .setDefault(selectedValues.has(value));

  if (customMatch) {
    const resolved = resolveCustomEmoji(client, guild, customMatch[3]);
    const name = resolved?.name || customMatch[2];
    option.setLabel(`:${name}:`.slice(0, 100));

    if (resolved) {
      option.setEmoji({
        id: resolved.id,
        name: resolved.name,
        animated: Boolean(resolved.animated),
      });
    }

    return option;
  }

  return option
    .setLabel(`Unicode emoji`.slice(0, 100))
    .setEmoji(value);
}

function customEmojiValues(client, guild) {
  const values = [];
  const addCollection = collection => {
    if (!collection) return;
    for (const emoji of collection.values()) values.push(emoji.toString());
  };

  addCollection(guild.emojis.cache);
  addCollection(client.application?.emojis?.cache);
  for (const otherGuild of client.guilds.cache.values()) {
    if (otherGuild.id !== guild.id) addCollection(otherGuild.emojis.cache);
  }

  return values;
}

function buildEmojiOptions(client, guild, selectedEmojis) {
  const selected = uniqueEmojis(selectedEmojis, getDefaultEmojis());
  const selectedValues = new Set(selected);
  const values = [];

  for (const value of [
    ...selected,
    ...COMMON_EMOJIS,
    ...customEmojiValues(client, guild),
  ]) {
    if (!value || values.includes(value)) continue;
    values.push(value);
    if (values.length === 25) break;
  }

  return values.map(value => optionFromValue(value, selectedValues, client, guild));
}

function buildSettingSection(sessionId, type, setting, disabled) {
  const media = MEDIA_TYPES[type];
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${setting.enabled ? emojiler.active : emojiler.deactive} **${media.label}:** ${setting.enabled ? "Açık" : "Kapalı"}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, `toggle:${type}`))
        .setLabel("Değiştir")
        .setStyle(setting.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
}

function buildEmojiSelectRow(client, guild, sessionId, type, setting, disabled) {
  const options = buildEmojiOptions(client, guild, setting.emojis);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, `emojis:${type}`))
    .setPlaceholder(MEDIA_TYPES[type].placeholder)
    .setMinValues(1)
    .setMaxValues(Math.min(MAX_EMOJIS, options.length))
    .setDisabled(disabled)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function hasSetting(data, type, channelId) {
  return Object.prototype.hasOwnProperty.call(data, `${type}_${channelId}`);
}

function buildPanelButtonRow(sessionId, data, channelId, disabled) {
  const hasImageSetting = hasSetting(data, MEDIA_TYPES.image.dataKey, channelId);
  const hasVideoSetting = hasSetting(data, MEDIA_TYPES.video.dataKey, channelId);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "reset:image"))
      .setLabel("Görsel Sıfırla")
      .setEmoji("🖼️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !hasImageSetting),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "reset:video"))
      .setLabel("Video Sıfırla")
      .setEmoji("🎬")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !hasVideoSetting),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "reset:all"))
      .setLabel("Tümünü Sıfırla")
      .setEmoji(`${emojiler.cop}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || (!hasImageSetting && !hasVideoSetting)),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "list"))
      .setLabel("Listele")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

function getGuildMediaRecords(guild, data) {
  return guild.channels.cache
    .filter(channel =>
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      && (
        hasSetting(data, MEDIA_TYPES.image.dataKey, channel.id)
        || hasSetting(data, MEDIA_TYPES.video.dataKey, channel.id)
      )
    )
    .sort((first, second) =>
      (first.rawPosition ?? first.position ?? 0) - (second.rawPosition ?? second.position ?? 0)
      || first.name.localeCompare(second.name, "tr")
    )
    .map(channel => ({
      channel,
      hasImageSetting: hasSetting(data, MEDIA_TYPES.image.dataKey, channel.id),
      hasVideoSetting: hasSetting(data, MEDIA_TYPES.video.dataKey, channel.id),
      imageSetting: getSetting(data, MEDIA_TYPES.image.dataKey, channel.id),
      videoSetting: getSetting(data, MEDIA_TYPES.video.dataKey, channel.id),
    }));
}

function formatListedSetting(setting, configured) {
  if (!configured) return "Durum: ⚪ **Ayarlanmadı**\nEmojiler: —";

  return [
    `Durum: ${setting.enabled ? "🟢 **Açık**" : "🔴 **Kapalı**"}`,
    `Emojiler: ${setting.emojis.length > 0 ? setting.emojis.join(" ") : "—"}`,
  ].join("\n");
}

function buildListPayload(guild, sessionId, requestedPage = 0, disabled = false, ephemeral = true) {
  const data = loadData();
  const records = getGuildMediaRecords(guild, data);
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(LIST_EMBED_COLOR)
    .setTitle("Medyalara Emoji Listesi")
    .setDescription(
      records.length > 0
        ? `Sunucuda medya emoji ayarı bulunan **${records.length} kanal** listeleniyor.`
        : "Bu sunucuda kayıtlı bir medya emoji ayarı bulunmuyor."
    )

  for (const record of pageRecords) {
    embed.addFields(
      {
        name: `🖼️ <#${record.channel.id}> • Görseller`,
        value: formatListedSetting(record.imageSetting, record.hasImageSetting),
      },
      {
        name: `🎬 <#${record.channel.id}> • Videolar`,
        value: formatListedSetting(record.videoSetting, record.hasVideoSetting),
      }
    );
  }

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

  const payload = {
    embeds: [embed],
    components: [paginationRow],
  };

  if (ephemeral) payload.flags = MessageFlags.Ephemeral;
  return payload;
}

function buildPanelPayload(client, guild, channel, sessionId, disabled = false, ephemeral = true) {
  const data = loadData();
  const imageSetting = getSetting(data, MEDIA_TYPES.image.dataKey, channel.id);
  const videoSetting = getSetting(data, MEDIA_TYPES.video.dataKey, channel.id);

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Medyalara Emoji Ayarları",
          `<#${channel.id}> kanalındaki medya tepkilerini aşağıdan yönetebilirsin.`,
        ].join("\n")
      )
    )
    .addSectionComponents(buildSettingSection(sessionId, "image", imageSetting, disabled))
    .addActionRowComponents(buildEmojiSelectRow(client, guild, sessionId, "image", imageSetting, disabled))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addSectionComponents(buildSettingSection(sessionId, "video", videoSetting, disabled))
    .addActionRowComponents(buildEmojiSelectRow(client, guild, sessionId, "video", videoSetting, disabled))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addActionRowComponents(buildPanelButtonRow(sessionId, data, channel.id, disabled));

  return {
    components: [container],
    flags: ephemeral ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
  };
}

function buildNoticePayload(title, description, isError = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(isError ? 0xe5484d : PANEL_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PANEL_REPLY_FLAGS,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("medyalara-emoji")
    .setDescription("Görsel ve videolara eklenecek emojileri panelden yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName("kanal")
        .setDescription("Medya emoji ayarlarının uygulanacağı kanalı seç.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const channel = interaction.options.getChannel("kanal", true);
    const sessionId = interaction.id;

    await interaction.reply(buildPanelPayload(botClient, guild, channel, sessionId));

    let closed = false;
    let closeTimer;

    const closeSession = async () => {
      if (closed) return;
      closed = true;
      clearTimeout(closeTimer);
      botClient.off("interactionCreate", listener);
      await interaction.editReply(
        buildPanelPayload(botClient, guild, channel, sessionId, true, false)
      ).catch(() => null);
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
        if (componentInteraction.isButton() && action.startsWith("toggle:")) {
          const type = action.slice("toggle:".length);
          const media = MEDIA_TYPES[type];
          if (!media) return;

          const data = loadData();
          const current = getSetting(data, media.dataKey, channel.id);
          setSetting(data, media.dataKey, channel.id, {
            enabled: !current.enabled,
            emojis: current.emojis,
          });
          saveData(data);

          return componentInteraction.update(
            buildPanelPayload(botClient, guild, channel, sessionId, false, false)
          );
        }

        if (componentInteraction.isButton() && action.startsWith("reset:")) {
          const resetType = action.slice("reset:".length);
          const data = loadData();

          if (resetType === "image" || resetType === "all") {
            deleteSetting(data, MEDIA_TYPES.image.dataKey, channel.id);
          }
          if (resetType === "video" || resetType === "all") {
            deleteSetting(data, MEDIA_TYPES.video.dataKey, channel.id);
          }

          saveData(data);
          return componentInteraction.update(
            buildPanelPayload(botClient, guild, channel, sessionId, false, false)
          );
        }

        if (componentInteraction.isButton() && action === "list") {
          return componentInteraction.reply(buildListPayload(guild, sessionId));
        }

        if (componentInteraction.isButton() && action.startsWith("list-page:")) {
          const page = Number(action.slice("list-page:".length));
          return componentInteraction.update(
            buildListPayload(guild, sessionId, page, false, false)
          );
        }

        if (componentInteraction.isStringSelectMenu() && action.startsWith("emojis:")) {
          const type = action.slice("emojis:".length);
          const media = MEDIA_TYPES[type];
          if (!media) return;

          const selectedEmojis = uniqueEmojis(componentInteraction.values);
          const data = loadData();
          const current = getSetting(data, media.dataKey, channel.id);
          setSetting(data, media.dataKey, channel.id, {
            enabled: current.enabled,
            emojis: selectedEmojis,
          });
          saveData(data);

          return componentInteraction.update(
            buildPanelPayload(botClient, guild, channel, sessionId, false, false)
          );
        }
      } catch (error) {
        console.error("🔴 [MEDYALARA EMOJİ PANEL HATASI]", error);
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
