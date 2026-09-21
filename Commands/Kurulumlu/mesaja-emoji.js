const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { MAX_EMOJIS, deleteSetting, getDefaultEmojis, getSetting, hasSetting, loadData, saveData, setSetting, uniqueEmojis } = require("../../Utils/Media/messageEmojiStore.js");

const PANEL_ACCENT_COLOR = 0xc9a76a;
const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const SESSION_TTL = 5 * 60_000;
const LIST_PAGE_SIZE = 5;
const LIST_EMBED_COLOR = 0x3498db;
const CUSTOM_EMOJI_PATTERN = /^<(a?):([A-Za-z0-9_]+):(\d+)>$/;
const COMMON_EMOJIS = ["👍", "👎", "❤️", "🔥", "😂", "🎉", "✅", "❌", "⭐", "💯"];
const MESSAGE_LISTENER = Symbol.for("all-in-one.message-emoji-listener");

function makeId(sessionId, action) {
  return `mje:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `mje:${sessionId}:`;
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
    .setLabel("Unicode emoji")
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

function buildMessageSettingSection(sessionId, setting, disabled) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${setting.enabled ? emojiler.active : emojiler.deactive} **Mesajlara emoji:** ${setting.enabled ? "Açık" : "Kapalı"}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, "toggle:enabled"))
        .setLabel("Değiştir")
        .setStyle(setting.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
}

function buildBotSettingSection(sessionId, setting, disabled) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${setting.includeBots ? emojiler.active : emojiler.deactive} **Bot mesajları:** ${setting.includeBots ? "Dahil" : "Hariç"}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(makeId(sessionId, "toggle:bots"))
        .setLabel("Değiştir")
        .setStyle(setting.includeBots ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
}

function buildEmojiSelectRow(client, guild, sessionId, setting, disabled) {
  const options = buildEmojiOptions(client, guild, setting.emojis);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, "emojis"))
    .setPlaceholder("Mesajlara eklenecek emojileri seç (en fazla 10).")
    .setMinValues(1)
    .setMaxValues(Math.min(MAX_EMOJIS, options.length))
    .setDisabled(disabled)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function buildPanelButtonRow(sessionId, data, channelId, disabled) {
  const configured = hasSetting(data, channelId);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "reset"))
      .setLabel("Sıfırla")
      .setEmoji(`${emojiler.cop}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !configured),
    new ButtonBuilder()
      .setCustomId(makeId(sessionId, "list"))
      .setLabel("Listele")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

function getGuildMessageRecords(guild, data) {
  return guild.channels.cache
    .filter(channel =>
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      && hasSetting(data, channel.id)
    )
    .sort((first, second) =>
      (first.rawPosition ?? first.position ?? 0) - (second.rawPosition ?? second.position ?? 0)
      || first.name.localeCompare(second.name, "tr")
    )
    .map(channel => ({
      channel,
      setting: getSetting(data, channel.id),
    }));
}

function formatListedSetting(setting) {
  return [
    `Durum: ${setting.enabled ? "🟢 **Açık**" : "🔴 **Kapalı**"}`,
    `Bot mesajları: ${setting.includeBots ? "🟢 **Dahil**" : "⚪ **Hariç**"}`,
    `Emojiler: ${setting.emojis.length > 0 ? setting.emojis.join(" ") : "—"}`,
  ].join("\n");
}

function buildListPayload(guild, sessionId, requestedPage = 0, disabled = false, ephemeral = true) {
  const data = loadData();
  const records = getGuildMessageRecords(guild, data);
  const pageCount = Math.max(1, Math.ceil(records.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  const pageRecords = records.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(LIST_EMBED_COLOR)
    .setTitle("Mesaja Emoji Listesi")
    .setDescription(
      records.length > 0
        ? `Sunucuda mesaj emoji ayarı bulunan **${records.length} kanal** listeleniyor.`
        : "Bu sunucuda kayıtlı bir mesaj emoji ayarı bulunmuyor."
    );

  for (const record of pageRecords) {
    embed.addFields({
      name: `💬 <#${record.channel.id}> • Mesajlar`,
      value: formatListedSetting(record.setting),
    });
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
  const setting = getSetting(data, channel.id);

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Mesaja Emoji Ayarları",
          `<#${channel.id}> kanalındaki mesaj tepkilerini aşağıdan yönetebilirsin.`,
        ].join("\n")
      )
    )
    .addSectionComponents(buildMessageSettingSection(sessionId, setting, disabled))
    .addActionRowComponents(buildEmojiSelectRow(client, guild, sessionId, setting, disabled))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addSectionComponents(buildBotSettingSection(sessionId, setting, disabled))
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

function setupMessageReactionListener(botClient) {
  if (!botClient || botClient[MESSAGE_LISTENER]) return;
  botClient[MESSAGE_LISTENER] = true;

  botClient.on("messageCreate", async message => {
    if (!message.guild) return;

    const data = loadData();
    if (!hasSetting(data, message.channel.id)) return;

    const setting = getSetting(data, message.channel.id);
    if (!setting.enabled || (message.author.bot && !setting.includeBots)) return;

    for (const emoji of setting.emojis) {
      await message.react(emoji).catch(() => null);
    }
  });
}

setupMessageReactionListener(global.client);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mesaja-emoji")
    .setDescription("Mesajlara eklenecek emojileri panelden yönetir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName("kanal")
        .setDescription("Mesaj emoji ayarlarının uygulanacağı kanalı seç.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const botClient = client || interaction.client;
    const { guild, user } = interaction;
    const channel = interaction.options.getChannel("kanal", true);
    const sessionId = interaction.id;

    setupMessageReactionListener(botClient);
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
          const toggleType = action.slice("toggle:".length);
          const data = loadData();
          const current = getSetting(data, channel.id);

          if (toggleType === "enabled") current.enabled = !current.enabled;
          else if (toggleType === "bots") current.includeBots = !current.includeBots;
          else return;

          setSetting(data, channel.id, current);
          saveData(data);

          return componentInteraction.update(
            buildPanelPayload(botClient, guild, channel, sessionId, false, false)
          );
        }

        if (componentInteraction.isButton() && action === "reset") {
          const data = loadData();
          deleteSetting(data, channel.id);
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

        if (componentInteraction.isStringSelectMenu() && action === "emojis") {
          const selectedEmojis = uniqueEmojis(componentInteraction.values);
          const data = loadData();
          const current = getSetting(data, channel.id);
          current.emojis = selectedEmojis;
          setSetting(data, channel.id, current);
          saveData(data);

          return componentInteraction.update(
            buildPanelPayload(botClient, guild, channel, sessionId, false, false)
          );
        }
      } catch (error) {
        console.error("🔴 [MESAJA EMOJİ PANEL HATASI]", error);
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
