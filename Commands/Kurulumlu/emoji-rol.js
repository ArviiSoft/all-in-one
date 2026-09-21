const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, Events, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const dbPath = path.join(__dirname, "../../Database/Sunucu Yönetimi/emojiRol.json");
const MAX_PAIRS_PER_MESSAGE = 10;
const PANEL_TTL = 10 * 60 * 1000;
const MESSAGE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];
const LOG_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const controlIds = {
  messageSelect: "emoji_rol:mesaj_sec",
  logSelect: "emoji_rol:log_sec",
  addMessage: "emoji_rol:mesaj_ekle",
  addPair: "emoji_rol:eslesme_ekle",
  removePair: "emoji_rol:eslesme_sil",
  refresh: "emoji_rol:yenile",
  clearLog: "emoji_rol:log_temizle",
  deleteMessage: "emoji_rol:mesaj_sil",
};

function loadDB() {
  if (!fs.existsSync(dbPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch (error) {
    console.error("🔴 [EMOJİ ROL] Veritabanı okunamadı:", error);
    throw error;
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
}

function ensureGuildData(data, guildId) {
  if (!data[guildId] || typeof data[guildId] !== "object") {
    data[guildId] = { logChannel: null, activeMessage: null, messages: {} };
  }

  const guildData = data[guildId];
  if (!guildData.messages || typeof guildData.messages !== "object") guildData.messages = {};
  if (!("logChannel" in guildData)) guildData.logChannel = null;

  for (const [messageId, messageData] of Object.entries(guildData.messages)) {
    if (!messageData || typeof messageData !== "object" || !messageData.channelId) {
      delete guildData.messages[messageId];
      continue;
    }
    if (!messageData.pairs || typeof messageData.pairs !== "object") messageData.pairs = {};
  }

  const activeId = guildData.activeMessage?.messageId;
  if (!activeId || !guildData.messages[activeId]) {
    const firstEntry = Object.entries(guildData.messages)[0];
    guildData.activeMessage = firstEntry
      ? { messageId: firstEntry[0], channelId: firstEntry[1].channelId }
      : null;
  } else {
    guildData.activeMessage.channelId = guildData.messages[activeId].channelId;
  }

  return guildData;
}

function normalizeEmoji(emojiInput) {
  const value = emojiInput.trim();
  const customMatch = value.match(/^<a?:[^:>]+:(\d+)>$/u);
  return customMatch ? customMatch[1] : value;
}

function reactionEmoji(emojiKey, guild) {
  if (!/^\d+$/.test(emojiKey)) return emojiKey;
  return guild.emojis.cache.get(emojiKey) || emojiler.getEmojiById(emojiKey) || null;
}

function displayEmoji(emojiKey, guild) {
  if (!/^\d+$/.test(emojiKey)) return emojiKey;

  const found = guild.emojis.cache.get(emojiKey) || emojiler.getEmojiById(emojiKey);
  if (!found) return `\`Emoji bulunamadı: ${emojiKey}\``;
  return `<${found.animated ? "a" : ""}:${found.name}:${found.id}>`;
}

function messageLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function getActiveEntry(guildData) {
  const messageId = guildData.activeMessage?.messageId;
  const messageData = messageId ? guildData.messages?.[messageId] : null;
  return messageData ? { messageId, messageData } : null;
}

function getMessageEntries(guildData) {
  const activeId = guildData.activeMessage?.messageId;
  return Object.entries(guildData.messages || {}).sort(([firstId], [secondId]) => {
    if (firstId === activeId) return -1;
    if (secondId === activeId) return 1;
    return 0;
  });
}

function buildControlRows(guild, guildData, disabled = false) {
  const activeEntry = getActiveEntry(guildData);
  const messageEntries = getMessageEntries(guildData).slice(0, 25);
  const messageSelect = new StringSelectMenuBuilder()
    .setCustomId(controlIds.messageSelect)
    .setPlaceholder(messageEntries.length ? "Yönetilecek mesajı seçin..." : "Önce bir mesaj ekleyin...")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || messageEntries.length === 0);

  if (messageEntries.length) {
    messageSelect.addOptions(messageEntries.map(([messageId, messageData]) => {
      const channel = guild.channels.cache.get(messageData.channelId);
      const pairCount = Object.keys(messageData.pairs || {}).length;
      return {
        label: `${channel ? `#${channel.name}` : "Bilinmeyen kanal"} • ${messageId.slice(-6)}`.slice(0, 100),
        value: messageId,
        description: `${pairCount}/${MAX_PAIRS_PER_MESSAGE} emoji-rol eşleşmesi • ${messageId}`.slice(0, 100),
        emoji: "📝",
        default: messageId === guildData.activeMessage?.messageId,
      };
    }));
  } else {
    messageSelect.addOptions({ label: "Kayıtlı mesaj yok", value: "bos", emoji: "📝" });
  }

  const logSelect = new ChannelSelectMenuBuilder()
    .setCustomId(controlIds.logSelect)
    .setPlaceholder("Log kanalını seçin...")
    .setChannelTypes(...LOG_CHANNEL_TYPES)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  const logChannel = guild.channels.cache.get(guildData.logChannel);
  if (logChannel && LOG_CHANNEL_TYPES.includes(logChannel.type)) logSelect.setDefaultChannels(logChannel.id);

  const pairCount = Object.keys(activeEntry?.messageData.pairs || {}).length;
  const actionButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(controlIds.addMessage)
      .setLabel("Mesaj Ekle")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(controlIds.addPair)
      .setLabel("Emoji-Rol Ekle")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !activeEntry || pairCount >= MAX_PAIRS_PER_MESSAGE),
    new ButtonBuilder()
      .setCustomId(controlIds.removePair)
      .setLabel("Eşleşme Sil")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pairCount === 0),
  );

  const utilityButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(controlIds.refresh)
      .setLabel("Yenile")
      .setEmoji(`${emojiler.yukleniyor}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(controlIds.clearLog)
      .setLabel("Logu Temizle")
      .setEmoji("🧹")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !guildData.logChannel),
    new ButtonBuilder()
      .setCustomId(controlIds.deleteMessage)
      .setLabel("Mesaj Ayarını Sil")
      .setEmoji(`${emojiler.cop}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !activeEntry),
  );

  return [
    new ActionRowBuilder().addComponents(messageSelect),
    new ActionRowBuilder().addComponents(logSelect),
    actionButtons,
    utilityButtons,
  ];
}

function buildControlPayload(guild, guildData, disabled = false) {
  const activeEntry = getActiveEntry(guildData);
  const logChannel = guild.channels.cache.get(guildData.logChannel);
  const lines = [
    "- Yönetmek istediğiniz kayıtlı mesajı seçin, menü seçimleri doğrudan uygulanır.",
    `-# ${emojiler.info} Mesaj başına en fazla **${MAX_PAIRS_PER_MESSAGE} emoji-rol eşleşmesi** eklenebilir.`,
    "",
  ];

  if (!activeEntry) {
    lines.push("**Seçili mesaj:** Ayarlı değil", "**Emoji-rol eşleşmeleri:** Yok");
  } else {
    const { messageId, messageData } = activeEntry;
    const pairs = Object.entries(messageData.pairs || {});
    lines.push(
      `**Seçili mesaj:** [Mesaja Git](${messageLink(guild.id, messageData.channelId, messageId)}) • <#${messageData.channelId}>`,
      `**Emoji-rol eşleşmeleri (${pairs.length}/${MAX_PAIRS_PER_MESSAGE}):**`,
    );

    if (!pairs.length) {
      lines.push("- Yok");
    } else {
      for (const [emojiKey, roleId] of pairs.slice(0, MAX_PAIRS_PER_MESSAGE)) {
        lines.push(`- ${displayEmoji(emojiKey, guild)} ➜ <@&${roleId}>`);
      }
      if (pairs.length > MAX_PAIRS_PER_MESSAGE) {
        lines.push(`- …ve ${pairs.length - MAX_PAIRS_PER_MESSAGE} eski eşleşme daha`);
      }
    }
  }

  lines.push(
    "",
    `**Log kanalı:** ${logChannel || "Ayarlı değil"}`,
    `**Kayıtlı mesaj:** ${Object.keys(guildData.messages || {}).length}`,
  );

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Blurple")
        .setTitle("Emoji-Rol Paneli")
        .setDescription(lines.join("\n")),
    ],
    components: buildControlRows(guild, guildData, disabled),
  };
}

function buildMessageModal(component) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("kanal")
    .setPlaceholder("Mesaj ID'si kullanıyorsanız kanalı seçin...")
    .setChannelTypes(...MESSAGE_CHANNEL_TYPES)
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);
  if (MESSAGE_CHANNEL_TYPES.includes(component.channel?.type)) channelSelect.setDefaultChannels(component.channelId);

  return new ModalBuilder()
    .setCustomId(`emoji_rol_mesaj:${component.id}`)
    .setTitle("Emoji-Rol Mesajı Ekle")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Mesaj bağlantısı veya ID'si")
        .setDescription("Tam Discord mesaj bağlantısını veya yalnızca mesaj ID'sini girin.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("mesaj")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://discord.com/channels/... veya 123456789...")
            .setRequired(true)
            .setMaxLength(150),
        ),
      new LabelBuilder()
        .setLabel("Mesaj kanalı (isteğe bağlı)")
        .setDescription("Yalnızca mesaj ID'si girdiyseniz mesajın bulunduğu kanalı seçin.")
        .setChannelSelectMenuComponent(channelSelect),
    );
}

function buildPairModal(component) {
  return new ModalBuilder()
    .setCustomId(`emoji_rol_eslesme:${component.id}`)
    .setTitle("Emoji-Rol Eşleşmesi Ekle")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Emoji")
        .setDescription("Bir Unicode emoji veya bu sunucuya/bota ait özel emoji girin.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("emoji")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Örnek: ✅ veya bir sunucu emojisi")
            .setRequired(true)
            .setMaxLength(100),
        ),
      new LabelBuilder()
        .setLabel("Verilecek rol")
        .setDescription("Emojiye basıldığında verilecek rolü seçin.")
        .setRoleSelectMenuComponent(
          new RoleSelectMenuBuilder()
            .setCustomId("rol")
            .setPlaceholder("Rol seçin...")
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true),
        ),
    );
}

function buildPairRemovalModal(component, guild, messageData) {
  const pairs = Object.entries(messageData.pairs || {}).slice(0, 25);
  return new ModalBuilder()
    .setCustomId(`emoji_rol_eslesme_sil:${component.id}`)
    .setTitle("Emoji-Rol Eşleşmelerini Sil")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Silinecek eşleşmeler")
        .setDescription("Bir veya birden fazla eşleşme seçebilirsiniz.")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("eslesmeler")
            .setPlaceholder("Silinecek eşleşmeleri seçin...")
            .setMinValues(1)
            .setMaxValues(pairs.length)
            .setRequired(true)
            .addOptions(pairs.map(([emojiKey, roleId]) => ({
              label: `${displayEmoji(emojiKey, guild)} → ${guild.roles.cache.get(roleId)?.name || roleId}`.slice(0, 100),
              description: `Rol: ${guild.roles.cache.get(roleId)?.name || roleId}`.slice(0, 100),
              value: emojiKey,
            }))),
        ),
    );
}

function buildMessageRemovalModal(component, guild, messageId, messageData) {
  const channel = guild.channels.cache.get(messageData.channelId);
  return new ModalBuilder()
    .setCustomId(`emoji_rol_mesaj_sil:${component.id}`)
    .setTitle("Mesaj Ayarını Sil")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Silme onayı")
        .setDescription("Mesaj silinmez, bu mesaja ait emoji-rol ayarları kaldırılır.")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("mesaj")
            .setPlaceholder("Silinecek mesaj ayarını seçin...")
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
            .addOptions({
              label: `${channel ? `#${channel.name}` : "Bilinmeyen kanal"} • ${messageId.slice(-6)}`.slice(0, 100),
              description: `${Object.keys(messageData.pairs || {}).length} emoji-rol eşleşmesi kaldırılacak.`.slice(0, 100),
              value: messageId,
              emoji: "🗑️",
            }),
        ),
    );
}

function parseMessageReference(value, selectedChannelId, guildId) {
  const input = value.trim();
  const linkMatch = input.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/iu);
  if (linkMatch) {
    if (linkMatch[1] !== guildId) return { error: "Bu mesaj bağlantısı farklı bir sunucuya ait." };
    return { channelId: linkMatch[2], messageId: linkMatch[3] };
  }

  if (!/^\d{17,20}$/.test(input)) {
    return { error: "Geçerli bir Discord mesaj bağlantısı veya mesaj ID'si girin." };
  }
  if (!selectedChannelId) return { error: "Yalnızca mesaj ID'si kullanırken mesaj kanalını da seçin." };
  return { channelId: selectedChannelId, messageId: input };
}

async function fetchConfiguredMessage(guild, messageData, messageId) {
  const channel = await guild.channels.fetch(messageData.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.messages) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function removeMessageReaction(message, emojiKey) {
  if (!message) return;
  const reaction = message.reactions.cache.find(item => (
    item.emoji.id ? item.emoji.id === emojiKey : item.emoji.name === emojiKey
  ));
  if (reaction) await reaction.remove().catch(() => null);
}

async function updatePanelMessage(message, guild, disabled = false) {
  const data = loadDB();
  const guildData = ensureGuildData(data, guild.id);
  await message.edit(buildControlPayload(guild, guildData, disabled)).catch(() => null);
}

async function replyWithComponentError(component, error) {
  console.error("🔴 [EMOJİ ROL] Panel etkileşimi işlenemedi:", error);
  const payload = { content: `${emojiler.uyari} **İşlem sırasında hata oluştu.**` };
  if (component.deferred) return component.editReply(payload).catch(() => null);
  if (component.replied) return component.followUp({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
  return component.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emoji-rol")
    .setDescription("Emoji-rol sistemini ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const initialData = loadDB();
    const guildData = ensureGuildData(initialData, guild.id);
    const response = await interaction.reply({
      ...buildControlPayload(guild, guildData),
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });
    const panelMessage = response.resource?.message;
    if (!panelMessage) return;

    const collector = panelMessage.createMessageComponentCollector({ time: PANEL_TTL });
    collector.on("collect", async component => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({
          content: `${emojiler.uyari} **Bu paneli yalnızca komutu kullanan kişi yönetebilir.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        if (component.customId === controlIds.messageSelect && component.isStringSelectMenu()) {
          await component.deferReply({ flags: MessageFlags.Ephemeral });
          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          const messageId = component.values[0];
          const messageData = currentGuildData.messages[messageId];
          if (!messageData) {
            return component.editReply({ content: `${emojiler.uyari} **Seçilen mesaj ayarı artık bulunmuyor. Paneli yenileyin.**` });
          }

          currentGuildData.activeMessage = { messageId, channelId: messageData.channelId };
          saveDB(data);
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return component.editReply({ content: `${emojiler.tik} Yönetilecek mesaj **seçildi.**` });
        }

        if (component.customId === controlIds.logSelect && component.isChannelSelectMenu()) {
          await component.deferReply({ flags: MessageFlags.Ephemeral });
          const channel = component.channels.first();
          if (!channel || !LOG_CHANNEL_TYPES.includes(channel.type)) {
            return component.editReply({ content: `${emojiler.uyari} **Geçerli bir metin kanalı seçin.**` });
          }

          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          currentGuildData.logChannel = channel.id;
          saveDB(data);
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return component.editReply({ content: `${emojiler.tik} Log kanalı ${channel} olarak **ayarlandı.**` });
        }

        if (component.customId === controlIds.addMessage && component.isButton()) {
          const modal = buildMessageModal(component);
          await component.showModal(modal);
          const submitted = await component.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.customId === modal.data.custom_id && modalInteraction.user.id === interaction.user.id,
            time: 60_000,
          }).catch(() => null);
          if (!submitted) return component.followUp({ content: `${emojiler.saat} **Menünün süresi doldu.**`, flags: MessageFlags.Ephemeral });

          await submitted.deferReply({ flags: MessageFlags.Ephemeral });
          const selectedChannel = submitted.fields.getSelectedChannels("kanal")?.first();
          const reference = parseMessageReference(submitted.fields.getTextInputValue("mesaj"), selectedChannel?.id, guild.id);
          if (reference.error) return submitted.editReply({ content: `${emojiler.uyari} **${reference.error}**` });

          const channel = await guild.channels.fetch(reference.channelId).catch(() => null);
          if (!channel?.isTextBased() || !channel.messages) {
            return submitted.editReply({ content: `${emojiler.uyari} **Mesaj kanalı bulunamadı veya erişilemiyor.**` });
          }
          const targetMessage = await channel.messages.fetch(reference.messageId).catch(() => null);
          if (!targetMessage) {
            return submitted.editReply({ content: `${emojiler.uyari} **Mesaj bulunamadı. Kanalı ve mesaj ID'sini kontrol edin.**` });
          }

          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          const alreadyRegistered = Boolean(currentGuildData.messages[targetMessage.id]);
          if (!alreadyRegistered) currentGuildData.messages[targetMessage.id] = { channelId: channel.id, pairs: {} };
          else currentGuildData.messages[targetMessage.id].channelId = channel.id;
          currentGuildData.activeMessage = { messageId: targetMessage.id, channelId: channel.id };
          saveDB(data);
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return submitted.editReply({
            content: alreadyRegistered
              ? `${emojiler.tik} Kayıtlı mesaj yeniden **seçildi.**`
              : `${emojiler.tik} Mesaj emoji-rol paneline **eklendi.**`,
          });
        }

        if (component.customId === controlIds.addPair && component.isButton()) {
          const beforeData = loadDB();
          const beforeGuildData = ensureGuildData(beforeData, guild.id);
          const beforeActive = getActiveEntry(beforeGuildData);
          if (!beforeActive) {
            return component.reply({ content: `${emojiler.uyari} **Önce bir mesaj ekleyin.**`, flags: MessageFlags.Ephemeral });
          }
          if (Object.keys(beforeActive.messageData.pairs || {}).length >= MAX_PAIRS_PER_MESSAGE) {
            return component.reply({ content: `${emojiler.uyari} **Bu mesaj için ${MAX_PAIRS_PER_MESSAGE} emoji sınırına ulaşıldı.**`, flags: MessageFlags.Ephemeral });
          }
          const selectedMessageId = beforeActive.messageId;

          const modal = buildPairModal(component);
          await component.showModal(modal);
          const submitted = await component.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.customId === modal.data.custom_id && modalInteraction.user.id === interaction.user.id,
            time: 60_000,
          }).catch(() => null);
          if (!submitted) return component.followUp({ content: `${emojiler.saat} **Menünün süresi doldu.**`, flags: MessageFlags.Ephemeral });

          await submitted.deferReply({ flags: MessageFlags.Ephemeral });
          const role = submitted.fields.getSelectedRoles("rol", true).first();
          if (!role || role.id === guild.id || role.managed || !role.editable) {
            return submitted.editReply({ content: `${emojiler.uyari} **Botun yönetebildiği normal bir rol seçin.**` });
          }

          const emojiKey = normalizeEmoji(submitted.fields.getTextInputValue("emoji"));
          if (!emojiKey) return submitted.editReply({ content: `${emojiler.uyari} **Geçerli bir emoji girin.**` });

          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          const messageData = currentGuildData.messages[selectedMessageId];
          if (!messageData) return submitted.editReply({ content: `${emojiler.uyari} **Seçili mesaj ayarı artık bulunmuyor.**` });
          const pairs = messageData.pairs || {};
          if (pairs[emojiKey]) {
            return submitted.editReply({ content: `${emojiler.uyari} **Bu emoji için zaten bir rol ayarlı.**` });
          }
          if (Object.keys(pairs).length >= MAX_PAIRS_PER_MESSAGE) {
            return submitted.editReply({ content: `${emojiler.uyari} **Bu mesaj için ${MAX_PAIRS_PER_MESSAGE} emoji sınırına ulaşıldı.**` });
          }

          const targetMessage = await fetchConfiguredMessage(guild, messageData, selectedMessageId);
          if (!targetMessage) {
            return submitted.editReply({ content: `${emojiler.uyari} **Seçili mesaj bulunamadı veya bota kapalı.**` });
          }
          const reaction = reactionEmoji(emojiKey, guild);
          if (!reaction) {
            return submitted.editReply({ content: `${emojiler.uyari} **Bu sunucuya veya bota ait olmayan özel emojiler kullanılamaz.**` });
          }
          const reacted = await targetMessage.react(reaction).then(() => true).catch(() => false);
          if (!reacted) {
            return submitted.editReply({ content: `${emojiler.uyari} **Emoji mesaja eklenemedi. Emojiyi ve bot izinlerini kontrol edin.**` });
          }

          pairs[emojiKey] = role.id;
          messageData.pairs = pairs;
          saveDB(data);
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return submitted.editReply({
            content: `${emojiler.tik} ${displayEmoji(emojiKey, guild)} emojisi <@&${role.id}> rolüyle **eşleştirildi.**`,
          });
        }

        if (component.customId === controlIds.removePair && component.isButton()) {
          const beforeData = loadDB();
          const beforeGuildData = ensureGuildData(beforeData, guild.id);
          const beforeActive = getActiveEntry(beforeGuildData);
          if (!beforeActive || !Object.keys(beforeActive.messageData.pairs || {}).length) {
            return component.reply({ content: `${emojiler.uyari} **Silinebilecek eşleşme bulunamadı.**`, flags: MessageFlags.Ephemeral });
          }
          const selectedMessageId = beforeActive.messageId;

          const modal = buildPairRemovalModal(component, guild, beforeActive.messageData);
          await component.showModal(modal);
          const submitted = await component.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.customId === modal.data.custom_id && modalInteraction.user.id === interaction.user.id,
            time: 60_000,
          }).catch(() => null);
          if (!submitted) return component.followUp({ content: `${emojiler.saat} **Menünün süresi doldu.**`, flags: MessageFlags.Ephemeral });

          await submitted.deferReply({ flags: MessageFlags.Ephemeral });
          const selectedKeys = submitted.fields.getStringSelectValues("eslesmeler");
          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          const messageData = currentGuildData.messages[selectedMessageId];
          if (!messageData) return submitted.editReply({ content: `${emojiler.uyari} **Seçili mesaj ayarı artık bulunmuyor.**` });

          const removed = selectedKeys.filter(emojiKey => messageData.pairs?.[emojiKey]);
          for (const emojiKey of removed) delete messageData.pairs[emojiKey];
          saveDB(data);

          const targetMessage = await fetchConfiguredMessage(guild, messageData, selectedMessageId);
          await Promise.all(removed.map(emojiKey => removeMessageReaction(targetMessage, emojiKey)));
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return submitted.editReply({
            content: removed.length
              ? `${emojiler.tik} ${removed.length} emoji-rol eşleşmesi **kaldırıldı.**`
              : `${emojiler.uyari} **Seçilen eşleşmeler artık bulunmuyor.**`,
          });
        }

        if (component.customId === controlIds.refresh && component.isButton()) {
          await component.deferUpdate();
          return updatePanelMessage(panelMessage, guild, collector.ended);
        }

        if (component.customId === controlIds.clearLog && component.isButton()) {
          await component.deferReply({ flags: MessageFlags.Ephemeral });
          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          currentGuildData.logChannel = null;
          saveDB(data);
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return component.editReply({ content: `${emojiler.tik} Log kanalı ayarı **temizlendi.**` });
        }

        if (component.customId === controlIds.deleteMessage && component.isButton()) {
          const beforeData = loadDB();
          const beforeGuildData = ensureGuildData(beforeData, guild.id);
          const beforeActive = getActiveEntry(beforeGuildData);
          if (!beforeActive) {
            return component.reply({ content: `${emojiler.uyari} **Silinebilecek mesaj ayarı bulunamadı.**`, flags: MessageFlags.Ephemeral });
          }

          const modal = buildMessageRemovalModal(component, guild, beforeActive.messageId, beforeActive.messageData);
          await component.showModal(modal);
          const submitted = await component.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.customId === modal.data.custom_id && modalInteraction.user.id === interaction.user.id,
            time: 60_000,
          }).catch(() => null);
          if (!submitted) return component.followUp({ content: `${emojiler.saat} **Menünün süresi doldu.**`, flags: MessageFlags.Ephemeral });

          await submitted.deferReply({ flags: MessageFlags.Ephemeral });
          const messageId = submitted.fields.getStringSelectValues("mesaj")[0];
          const data = loadDB();
          const currentGuildData = ensureGuildData(data, guild.id);
          const messageData = currentGuildData.messages[messageId];
          if (!messageData) return submitted.editReply({ content: `${emojiler.uyari} **Mesaj ayarı artık bulunmuyor.**` });

          const emojiKeys = Object.keys(messageData.pairs || {});
          const targetMessage = await fetchConfiguredMessage(guild, messageData, messageId);
          delete currentGuildData.messages[messageId];
          if (currentGuildData.activeMessage?.messageId === messageId) currentGuildData.activeMessage = null;
          ensureGuildData(data, guild.id);
          saveDB(data);

          await Promise.all(emojiKeys.map(emojiKey => removeMessageReaction(targetMessage, emojiKey)));
          await updatePanelMessage(panelMessage, guild, collector.ended);
          return submitted.editReply({ content: `${emojiler.tik} Mesajın emoji-rol ayarları **silindi.**` });
        }
      } catch (error) {
        return replyWithComponentError(component, error);
      }
    });

    collector.on("end", async () => {
      const data = loadDB();
      const latestGuildData = ensureGuildData(data, guild.id);
      await panelMessage.edit(buildControlPayload(guild, latestGuildData, true)).catch(() => null);
    });
  },
};

async function handleReaction(reaction, user, isAdd) {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const guild = reaction.message.guild;
  if (!guild) return;

  const db = loadDB();
  const guildData = db[guild.id];
  const messageId = reaction.message.id;
  const messageData = guildData?.messages?.[messageId];
  if (!messageData) return;

  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  const roleId = messageData.pairs?.[emojiKey];
  if (!roleId) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  const role = guild.roles.cache.get(roleId);
  if (!member || !role) return;

  try {
    if (isAdd) await member.roles.add(role);
    else await member.roles.remove(role);
  } catch (error) {
    console.error(`🔴 [EMOJİ ROL] Rol ${isAdd ? "verilemedi" : "alınamadı"}:`, error.message);
    return;
  }

  if (!guildData.logChannel) return;
  const logChannel = await guild.channels.fetch(guildData.logChannel).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const emojiDisplay = reaction.emoji.id
    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;
  const embed = new EmbedBuilder()
    .setColor(isAdd ? 0x23a55a : 0xf23f43)
    .setAuthor({ name: `${user.tag} [${user.displayName}]`, iconURL: user.displayAvatarURL() })
    .setDescription(
      isAdd
        ? `${member} adlı kişi ${emojiDisplay} emojisine basarak <@&${roleId}> rolünü **aldı.**`
        : `${member} adlı kişi ${emojiDisplay} emojisini kaldırarak <@&${roleId}> rolünü **bıraktı.**`,
    )
    .addFields(
      { name: "Kişi", value: `${member} (\`${user.id}\`)`, inline: true },
      { name: "Rol", value: `<@&${roleId}>`, inline: true },
      { name: "Emoji", value: emojiDisplay, inline: true },
      {
        name: "Mesaj",
        value: `[**Mesaja Gitmek İçin Tıkla ↗**](${messageLink(guild.id, reaction.message.channelId, messageId)})`,
        inline: true,
      },
    );

  await logChannel.send({ embeds: [embed] }).catch(() => null);
}

const listenerKey = Symbol.for("all-in-one.emoji-role-reaction-listeners");
if (global.client?.on && !global.client[listenerKey]) {
  global.client[listenerKey] = true;
  global.client.on(Events.MessageReactionAdd, (reaction, user) => {
    handleReaction(reaction, user, true).catch(error => console.error("🔴 [EMOJİ ROL] Tepki ekleme olayı işlenemedi:", error));
  });
  global.client.on(Events.MessageReactionRemove, (reaction, user) => {
    handleReaction(reaction, user, false).catch(error => console.error("🔴 [EMOJİ ROL] Tepki kaldırma olayı işlenemedi:", error));
  });
}