const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, EmbedBuilder, Events, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { buildListPayload, LIST_PAGE_SIZE } = require("../../Utils/Engagement/sticky-listele.js");
const { getGuildStickyEntries, loadStickyData, recordBelongsToGuild, updateStickyData } = require("../../Utils/Engagement/stickyStore.js");

const PANEL_REPLY_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PANEL_UPDATE_FLAGS = MessageFlags.IsComponentsV2;
const PANEL_ACCENT_COLOR = 0xf1c40f;
const ACTIVE_ACCENT_COLOR = 0x57f287;
const DANGER_ACCENT_COLOR = 0xed4245;
const SESSION_TTL = 10 * 60_000;
const MAX_MULTI_CHANNELS = 25;
const EMBED_COLOR = 0xf1c40f;

const channelQueues = new Map();
const listenerClients = new WeakSet();

function makeId(sessionId, action) {
  return `sm:${sessionId}:${action}`;
}

function parseAction(customId, sessionId) {
  const prefix = `sm:${sessionId}:`;
  return customId?.startsWith(prefix) ? customId.slice(prefix.length) : null;
}

function separator() {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(true);
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function blankEmbed() {
  return {
    title: "",
    description: "",
    footer: "",
    image: "",
    thumbnail: "",
  };
}

function createDraft(mode) {
  return {
    mode,
    channelIds: [],
    messageType: "text",
    content: "",
    embed: blankEmbed(),
  };
}

function embedHasContent(embed) {
  return Boolean(
    embed?.title
    || embed?.description
    || embed?.footer
    || embed?.image
    || embed?.thumbnail
  );
}

function templateIsReady(draft) {
  if (draft.messageType === "embed") return embedHasContent(draft.embed);
  return Boolean(draft.content?.trim());
}

function modeLabel(mode) {
  return mode === "multi" ? "Çoklu Kanal" : "Tekli Kanal";
}

function typeLabel(messageType) {
  return messageType === "embed" ? "Embed" : "Normal metin";
}

function channelSelectionLabel(channelIds) {
  if (!channelIds.length) return "`Henüz kanal seçilmedi`";
  return channelIds.map(channelId => `<#${channelId}>`).join(", ");
}

function draftPreview(draft) {
  if (draft.messageType === "text") {
    return draft.content
      ? escapeMarkdown(truncate(draft.content.replace(/\s+/g, " "), 240))
      : "`Mesaj içeriği henüz ayarlanmadı`";
  }

  const parts = [];
  if (draft.embed.title) parts.push(`Başlık: ${draft.embed.title}`);
  if (draft.embed.description) parts.push(`Açıklama: ${draft.embed.description}`);
  if (draft.embed.footer) parts.push(`Alt bilgi: ${draft.embed.footer}`);
  if (draft.embed.image) parts.push("Büyük görsel ayarlı");
  if (draft.embed.thumbnail) parts.push("Küçük görsel ayarlı");

  return parts.length
    ? escapeMarkdown(truncate(parts.join(" · "), 240))
    : "`Embed içeriği henüz ayarlanmadı`";
}

function buildDashboardPayload(guild, sessionId, options = {}) {
  const { disabled = false, initial = false, notice = null } = options;
  const entries = getGuildStickyEntries(guild);
  const textCount = entries.filter(entry => !entry.record?.embed).length;
  const embedCount = entries.length - textCount;

  const container = new ContainerBuilder()
    .setAccentColor(entries.length > 0 ? ACTIVE_ACCENT_COLOR : PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 📌 Yapışkan Mesajlar",
        "Tekli ve çoklu kanal kurulumlarını, mesaj biçimini ve kayıtlı kanalları tek panelden yönet.",
        "-# Tekli ve çoklu kurulum taslakları birbirinden bağımsızdır, modlar arasında geçiş yaptığında içeriklerin korunur.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Sistem Özeti",
        `${entries.length > 0 ? "🟢" : "🟡"} **Durum:** ${entries.length > 0 ? "Aktif" : "Kurulum bekliyor"}`,
        `📁 **Kayıtlı kanal:** ${entries.length}`,
        `💬 **Normal metin:** ${textCount} · 🖼️ **Embed:** ${embedCount}`,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### 1️⃣ Tekli Kanal Kurulumu",
            "Bir kanal seç ve yalnızca o kanal için kullanılacak mesaj yapısını hazırla.",
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "mode:single"))
            .setLabel("Tekli Kurulum")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
        )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "### 🔢 Çoklu Kanal Kurulumu",
            `En fazla ${MAX_MULTI_CHANNELS} kanalı birlikte seç ve hepsine ortak bir mesaj yapısı uygula.`,
          ].join("\n"))
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(makeId(sessionId, "mode:multi"))
            .setLabel("Çoklu Kurulum")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
        )
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
          .setEmoji(emojiler.yukleniyor || "🔄")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "clear"))
          .setLabel("Tümünü Sıfırla")
          .setEmoji(emojiler.cop || "🗑️")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || entries.length === 0)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Panelin kullanım süresi doldu. Yeni panel için `/sticky-message` komutunu kullan."
          : "-# Panel 10 dakika boyunca kullanılabilir · Kaydetme işlemleri anında uygulanır."
      )
    );

  return {
    components: [container],
    flags: initial ? PANEL_REPLY_FLAGS : PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildConfigPayload(draft, sessionId, options = {}) {
  const { disabled = false, notice = null } = options;
  const isMulti = draft.mode === "multi";
  const ready = templateIsReady(draft);
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(sessionId, `channels:${draft.mode}`))
    .setPlaceholder(isMulti ? "Yapışkan mesaj kanallarını seç" : "Yapışkan mesaj kanalını seç")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(isMulti ? MAX_MULTI_CHANNELS : 1)
    .setDisabled(disabled);

  if (draft.channelIds.length > 0) {
    channelSelect.setDefaultChannels(...draft.channelIds);
  }

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(makeId(sessionId, `type:${draft.mode}`))
    .setPlaceholder("Mesaj biçimini seç")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled)
    .addOptions(
      {
        label: "Normal metin",
        description: "Klasik Discord mesajı gönderir.",
        value: "text",
        emoji: "💬",
        default: draft.messageType === "text",
      },
      {
        label: "Embed",
        description: "Başlık, açıklama, görsel ve alt bilgi destekler.",
        value: "embed",
        emoji: "🖼️",
        default: draft.messageType === "embed",
      }
    );

  const container = new ContainerBuilder()
    .setAccentColor(ready && draft.channelIds.length > 0 ? ACTIVE_ACCENT_COLOR : PANEL_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${isMulti ? "🔢" : "1️⃣"} ${modeLabel(draft.mode)} Kurulumu`,
        isMulti
          ? "Bu taslak yalnızca çoklu kanal seçimlerinde kullanılır, tekli kanal mesajını değiştirmez."
          : "Bu taslak yalnızca tekli kanal seçiminde kullanılır, çoklu kanal mesajını değiştirmez.",
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Taslak Özeti",
        `**Seçili kanal:** ${channelSelectionLabel(draft.channelIds)}`,
        `**Mesaj biçimi:** ${typeLabel(draft.messageType)}`,
        `**İçerik:** ${draftPreview(draft)}`,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isMulti
          ? "### Kanalları Seç \nAynı mesaj yapısının uygulanacağı kanalları birlikte seç."
          : "### Kanalı Seç \nYapışkan mesajın çalışacağı tek kanalı seç."
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Mesaj Biçimi \nNormal metin veya embed biçimlerinden birini seç.")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(typeSelect));

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
          .setCustomId(makeId(sessionId, `edit:${draft.mode}`))
          .setLabel(draft.messageType === "embed" ? "Embed'i Düzenle" : "Metni Düzenle")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, `preview:${draft.mode}`))
          .setLabel("Önizle")
          .setEmoji("👁️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || !ready),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, `save:${draft.mode}`))
          .setLabel("Kanallara Uygula")
          .setEmoji("💾")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled || !ready || draft.channelIds.length === 0),
        new ButtonBuilder()
          .setCustomId(makeId(sessionId, "dashboard"))
          .setLabel("Panele Dön")
          .setEmoji("↩️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? "-# 🔒 Bu kurulum taslağının kullanım süresi doldu."
          : ready
            ? "-# Kanal seçimini ve içeriği istediğin sırada değiştirebilirsin, yalnızca 'Kanallara Uygula' kalıcı işlem yapar."
            : `-# Önce ${draft.messageType === "embed" ? "embed içeriğini" : "mesaj metnini"} düzenle.`
      )
    );

  return {
    components: [container],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildClearConfirmationPayload(sessionId, channelCount) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(DANGER_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            "## ⚠️ Tüm Yapışkan Mesajları Sıfırla",
            `- Bu sunucudaki **${channelCount} kanal kaydı** silinecek. Bot, kanallardaki son yapışkan mesajları da kaldırmayı deneyecek.`,
            "",
            "**Bu işlem geri alınamaz. Devam edilsin mi?**",
          ].join("\n"))
        )
        .addSeparatorComponents(separator())
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "clear-confirm"))
              .setLabel("Evet, tümünü sıfırla")
              .setEmoji(emojiler.cop || "🗑️")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, "clear-cancel"))
              .setLabel("Vazgeç")
              .setStyle(ButtonStyle.Secondary)
          )
        ),
    ],
    flags: PANEL_UPDATE_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildNoticePayload(title, description, error = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(error ? DANGER_ACCENT_COLOR : ACTIVE_ACCENT_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
        ),
    ],
    flags: PANEL_REPLY_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function addCurrentValue(input, value, maxLength) {
  if (value) input.setValue(String(value).slice(0, maxLength));
  return input;
}

function buildTextModal(sessionId, draft) {
  const input = addCurrentValue(
    new TextInputBuilder()
      .setCustomId("content")
      .setLabel("Yapışkan mesaj içeriği")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Kanaldaki son mesaj olarak tutulacak metni yaz.")
      .setRequired(true)
      .setMaxLength(2000),
    draft.content,
    2000
  );

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, `text-modal:${draft.mode}`))
    .setTitle(`${modeLabel(draft.mode)} Mesajı`)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildEmbedModal(sessionId, draft) {
  const title = addCurrentValue(
    new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Başlık")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("İsteğe bağlı embed başlığı")
      .setRequired(false)
      .setMaxLength(256),
    draft.embed.title,
    256
  );
  const description = addCurrentValue(
    new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Açıklama")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Embed'in ana mesajını yaz.")
      .setRequired(false)
      .setMaxLength(4000),
    draft.embed.description,
    4000
  );
  const footer = addCurrentValue(
    new TextInputBuilder()
      .setCustomId("footer")
      .setLabel("Alt bilgi")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("İsteğe bağlı alt bilgi")
      .setRequired(false)
      .setMaxLength(2048),
    draft.embed.footer,
    2048
  );
  const image = addCurrentValue(
    new TextInputBuilder()
      .setCustomId("image")
      .setLabel("Büyük görsel URL'si")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://site.com/gorsel.png")
      .setRequired(false)
      .setMaxLength(1000),
    draft.embed.image,
    1000
  );
  const thumbnail = addCurrentValue(
    new TextInputBuilder()
      .setCustomId("thumbnail")
      .setLabel("Küçük görsel URL'si")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://site.com/kucuk-gorsel.png")
      .setRequired(false)
      .setMaxLength(1000),
    draft.embed.thumbnail,
    1000
  );

  return new ModalBuilder()
    .setCustomId(makeId(sessionId, `embed-modal:${draft.mode}`))
    .setTitle(`${modeLabel(draft.mode)} Embed'i`)
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(footer),
      new ActionRowBuilder().addComponents(image),
      new ActionRowBuilder().addComponents(thumbnail)
    );
}

function normalizeOptionalUrl(value, fieldLabel) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${fieldLabel} geçerli bir HTTP veya HTTPS bağlantısı olmalı.`);
  }
}

function buildEmbed(embedData) {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR);
  if (embedData.title) embed.setTitle(embedData.title);
  if (embedData.description) embed.setDescription(embedData.description);
  if (embedData.footer) embed.setFooter({ text: embedData.footer });
  if (embedData.image) embed.setImage(embedData.image);
  if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
  return embed;
}

function payloadFromDraft(draft) {
  if (draft.messageType === "embed") {
    return {
      embeds: [buildEmbed(draft.embed)],
      allowedMentions: { parse: [] },
    };
  }

  return {
    content: draft.content,
    allowedMentions: { parse: [] },
  };
}

function payloadFromRecord(record) {
  if (record?.embed) {
    return {
      embeds: [buildEmbed(record.embed)],
      allowedMentions: { parse: [] },
    };
  }

  if (!record?.content) throw new Error("Kayıtlı yapışkan mesaj içeriği boş.");
  return {
    content: record.content,
    allowedMentions: { parse: [] },
  };
}

function enqueueChannelOperation(channelId, operation) {
  const key = String(channelId);
  const previous = channelQueues.get(key) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(operation);
  channelQueues.set(key, queued);

  queued.finally(() => {
    if (channelQueues.get(key) === queued) channelQueues.delete(key);
  }).catch(() => undefined);

  return queued;
}

function validateTargetChannel(channel, guild, messageType) {
  if (
    !channel
    || channel.guildId !== guild.id
    || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
  ) {
    throw new Error("Yalnızca bu sunucudaki yazı veya duyuru kanalları kullanılabilir.");
  }

  const permissions = channel.permissionsFor?.(guild.members.me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
    throw new Error("Bot kanalı görüntüleyemiyor.");
  }
  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    throw new Error("Bot kanala mesaj gönderemiyor.");
  }
  if (messageType === "embed" && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error("Botun Bağlantıları Gömme izni yok.");
  }
}

async function replaceStickyMessage(channel, guild, draft, userId) {
  return enqueueChannelOperation(channel.id, async () => {
    validateTargetChannel(channel, guild, draft.messageType);

    const existing = loadStickyData()[channel.id];
    const sentMessage = await channel.send(payloadFromDraft(draft));
    const record = {
      guildId: guild.id,
      messageId: sentMessage.id,
      messageType: draft.messageType,
      sourceMode: draft.mode,
      updatedAt: Date.now(),
      updatedBy: userId,
    };

    if (draft.messageType === "embed") {
      record.embed = { ...draft.embed };
    } else {
      record.content = draft.content;
    }

    try {
      updateStickyData(data => {
        data[channel.id] = record;
      });
    } catch (error) {
      await sentMessage.delete().catch(() => null);
      throw error;
    }

    if (existing?.messageId && existing.messageId !== sentMessage.id) {
      const oldMessage = await channel.messages.fetch(existing.messageId).catch(() => null);
      if (oldMessage) await oldMessage.delete().catch(() => null);
    }

    return record;
  });
}

async function removeStickyChannel(guild, channelId, { strict = false } = {}) {
  return enqueueChannelOperation(channelId, async () => {
    const record = loadStickyData()[channelId];
    if (!record || !recordBelongsToGuild(channelId, record, guild)) {
      return { removed: false, messageRemoved: false };
    }

    if (strict) {
      let messageRemoved = false;
      try {
        const channel = await guild.channels.fetch(channelId);
        const message = channel && record.messageId ? await channel.messages.fetch(record.messageId) : null;
        if (message) { await message.delete(); messageRemoved = true; }
      } catch (error) {
        if (![10003, 10008].includes(error.code)) throw error;
      }
      updateStickyData(data => {
        if (recordBelongsToGuild(channelId, data[channelId], guild)) delete data[channelId];
      });
      return { removed: true, messageRemoved };
    }

    updateStickyData(data => {
      const latest = data[channelId];
      if (recordBelongsToGuild(channelId, latest, guild)) delete data[channelId];
    });

    let messageRemoved = false;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased?.() && record.messageId) {
      const message = await channel.messages.fetch(record.messageId).catch(() => null);
      if (message) {
        messageRemoved = await message.delete().then(() => true).catch(() => false);
      }
    }

    return { removed: true, messageRemoved };
  });
}

async function refreshStickyMessage(channel) {
  return enqueueChannelOperation(channel.id, async () => {
    const record = loadStickyData()[channel.id];
    if (!record) return;
    const oldMessageId = record.messageId;

    const newMessage = await channel.send(payloadFromRecord(record));
    let updated;

    try {
      updated = updateStickyData(data => {
        if (!data[channel.id]) return false;
        data[channel.id].guildId ||= channel.guildId;
        data[channel.id].messageId = newMessage.id;
        data[channel.id].lastRefreshAt = Date.now();
        return true;
      });
    } catch (error) {
      await newMessage.delete().catch(() => null);
      throw error;
    }

    if (!updated) {
      await newMessage.delete().catch(() => null);
      return;
    }

    if (oldMessageId && oldMessageId !== newMessage.id) {
      const oldMessage = await channel.messages.fetch(oldMessageId).catch(() => null);
      if (oldMessage) await oldMessage.delete().catch(() => null);
    }
  });
}

function migrateLegacyGuildRecords(guild) {
  const legacyChannelIds = Object.entries(loadStickyData())
    .filter(([channelId, record]) => !record?.guildId && guild.channels.cache.has(channelId))
    .map(([channelId]) => channelId);

  if (legacyChannelIds.length === 0) return;

  updateStickyData(data => {
    for (const channelId of legacyChannelIds) {
      if (data[channelId] && !data[channelId].guildId) {
        data[channelId].guildId = guild.id;
      }
    }
  });
}

async function sendPrivateError(interaction, message) {
  const payload = buildNoticePayload(
    "İşlem tamamlanamadı",
    `${emojiler.uyari || "⚠️"} ${message}`,
    true
  );

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(() => null);
  }
  return interaction.reply(payload).catch(() => null);
}

async function execute(interaction, client) {
  const botClient = client || interaction.client;
  const { guild, user } = interaction;
  const sessionId = interaction.id;
  migrateLegacyGuildRecords(guild);
  const drafts = {
    single: createDraft("single"),
    multi: createDraft("multi"),
  };
  let currentView = { name: "dashboard", mode: null, page: 0 };
  let closed = false;
  let closeTimer;

  await interaction.reply(
    buildDashboardPayload(guild, sessionId, { initial: true })
  );

  const closeSession = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer);
    botClient.off(Events.InteractionCreate, listener);

    let payload;
    if (currentView.name === "config" && currentView.mode) {
      payload = buildConfigPayload(drafts[currentView.mode], sessionId, { disabled: true });
    } else if (currentView.name === "list") {
      payload = buildListPayload(guild, sessionId, currentView.page, { disabled: true });
    } else {
      payload = buildDashboardPayload(guild, sessionId, { disabled: true });
    }

    await interaction.editReply(payload).catch(() => null);
  };

  const listener = async componentInteraction => {
    const action = parseAction(componentInteraction.customId, sessionId);
    if (!action || closed) return;

    if (componentInteraction.user.id !== user.id) {
      return componentInteraction.reply(
        buildNoticePayload(
          "Bu panel sana ait değil",
          `${emojiler.uyari || "⚠️"} Bu paneli yalnızca komutu kullanan yönetici kontrol edebilir.`,
          true
        )
      ).catch(() => null);
    }

    try {
      if (componentInteraction.isModalSubmit()) {
        if (action.startsWith("text-modal:")) {
          const mode = action.slice("text-modal:".length);
          const draft = drafts[mode];
          if (!draft) return;

          const content = componentInteraction.fields.getTextInputValue("content").trim();
          if (!content) {
            return sendPrivateError(componentInteraction, "Normal mesaj içeriği boş bırakılamaz.");
          }

          draft.content = content;
          currentView = { name: "config", mode, page: 0 };
          await componentInteraction.reply(
            buildNoticePayload("Metin taslağı güncellendi", `${emojiler.tik || "✅"} ${modeLabel(mode)} mesaj metni kaydedilmeye hazır.`)
          );
          return interaction.editReply(
            buildConfigPayload(draft, sessionId, { notice: "Mesaj metni taslakta güncellendi." })
          );
        }

        if (action.startsWith("embed-modal:")) {
          const mode = action.slice("embed-modal:".length);
          const draft = drafts[mode];
          if (!draft) return;

          const embed = {
            title: componentInteraction.fields.getTextInputValue("title").trim(),
            description: componentInteraction.fields.getTextInputValue("description").trim(),
            footer: componentInteraction.fields.getTextInputValue("footer").trim(),
            image: normalizeOptionalUrl(
              componentInteraction.fields.getTextInputValue("image"),
              "Büyük görsel URL'si"
            ),
            thumbnail: normalizeOptionalUrl(
              componentInteraction.fields.getTextInputValue("thumbnail"),
              "Küçük görsel URL'si"
            ),
          };

          if (!embedHasContent(embed)) {
            return sendPrivateError(componentInteraction, "Embed için en az bir alan doldurmalısın.");
          }
          buildEmbed(embed).toJSON();
          draft.embed = embed;
          currentView = { name: "config", mode, page: 0 };
          await componentInteraction.reply(
            buildNoticePayload("Embed taslağı güncellendi", `${emojiler.tik || "✅"} ${modeLabel(mode)} embed içeriği kaydedilmeye hazır.`)
          );
          return interaction.editReply(
            buildConfigPayload(draft, sessionId, { notice: "Embed içeriği taslakta güncellendi." })
          );
        }

        return;
      }

      if (componentInteraction.isChannelSelectMenu() && action.startsWith("channels:")) {
        const mode = action.slice("channels:".length);
        const draft = drafts[mode];
        if (!draft) return;

        draft.channelIds = componentInteraction.values.filter(channelId => {
          const channel = componentInteraction.channels?.get(channelId)
            || guild.channels.cache.get(channelId);
          return channel?.guildId === guild.id
            && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
        });

        currentView = { name: "config", mode, page: 0 };
        return componentInteraction.update(
          buildConfigPayload(draft, sessionId, {
            notice: `${draft.channelIds.length} kanal taslağa seçildi.`,
          })
        );
      }

      if (componentInteraction.isStringSelectMenu()) {
        if (action.startsWith("type:")) {
          const mode = action.slice("type:".length);
          const draft = drafts[mode];
          const messageType = componentInteraction.values[0];
          if (!draft || !["text", "embed"].includes(messageType)) return;

          draft.messageType = messageType;
          currentView = { name: "config", mode, page: 0 };
          return componentInteraction.update(
            buildConfigPayload(draft, sessionId, {
              notice: `Mesaj biçimi **${typeLabel(messageType)}** olarak seçildi.`,
            })
          );
        }

        if (action.startsWith("resend:")) {
          const page = Math.max(Number(action.slice("resend:".length)) || 0, 0);
          const channelId = componentInteraction.values[0];
          if (!/^\d{17,20}$/.test(channelId || "")) return;

          const record = loadStickyData()[channelId];
          if (!record || !recordBelongsToGuild(channelId, record, guild)) {
            return componentInteraction.update(
              buildListPayload(guild, sessionId, page, {
                notice: `${emojiler.uyari || "⚠️"} Kanal kaydı artık mevcut değil; liste yenilendi.`,
              })
            );
          }

          await componentInteraction.deferUpdate();
          const channel = await guild.channels.fetch(channelId);
          validateTargetChannel(channel, guild, record.embed ? "embed" : "text");
          await refreshStickyMessage(channel);
          currentView = { name: "list", mode: null, page };
          return interaction.editReply(
            buildListPayload(guild, sessionId, page, {
              notice: `${emojiler.tik || "✅"} <#${channelId}> kanalındaki yapışkan mesaj yeniden gönderildi.`,
            })
          );
        }
      }

      if (!componentInteraction.isButton()) return;

      if (action.startsWith("mode:")) {
        const mode = action.slice("mode:".length);
        if (!drafts[mode]) return;
        currentView = { name: "config", mode, page: 0 };
        return componentInteraction.update(buildConfigPayload(drafts[mode], sessionId));
      }

      if (action.startsWith("edit:")) {
        const mode = action.slice("edit:".length);
        const draft = drafts[mode];
        if (!draft) return;
        return componentInteraction.showModal(
          draft.messageType === "embed"
            ? buildEmbedModal(sessionId, draft)
            : buildTextModal(sessionId, draft)
        );
      }

      if (action.startsWith("preview:")) {
        const mode = action.slice("preview:".length);
        const draft = drafts[mode];
        if (!draft || !templateIsReady(draft)) {
          return sendPrivateError(componentInteraction, "Önizleme için önce mesaj içeriğini düzenle.");
        }

        return componentInteraction.reply({
          ...payloadFromDraft(draft),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action.startsWith("save:")) {
        const mode = action.slice("save:".length);
        const draft = drafts[mode];
        if (!draft || !templateIsReady(draft) || draft.channelIds.length === 0) {
          return sendPrivateError(componentInteraction, "Kaydetmeden önce kanal seçimini ve mesaj içeriğini tamamla.");
        }

        await componentInteraction.deferUpdate();
        const results = await Promise.all(
          draft.channelIds.map(async channelId => {
            try {
              const channel = await guild.channels.fetch(channelId);
              await replaceStickyMessage(channel, guild, draft, user.id);
              return { channelId, success: true };
            } catch (error) {
              console.error(`🔴 [STICKY MESSAGE] ${channelId} kanalına uygulanamadı:`, error);
              return { channelId, success: false, error };
            }
          })
        );
        const successful = results.filter(result => result.success);
        const failed = results.filter(result => !result.success);
        const noticeLines = [];

        if (successful.length > 0) {
          noticeLines.push(
            `${emojiler.tik || "✅"} Yapışkan mesaj **${successful.length} kanala** uygulandı.`
          );
        }
        if (failed.length > 0) {
          noticeLines.push(
            `${emojiler.uyari || "⚠️"} **${failed.length} kanal** için işlem başarısız oldu; bot izinlerini kontrol et.`
          );
        }

        currentView = { name: "config", mode, page: 0 };
        return interaction.editReply(
          buildConfigPayload(draft, sessionId, { notice: noticeLines.join("\n") })
        );
      }

      if (action === "list") {
        currentView = { name: "list", mode: null, page: 0 };
        return componentInteraction.update(buildListPayload(guild, sessionId, 0));
      }

      if (action.startsWith("page:")) {
        const requestedPage = Number(action.slice("page:".length));
        if (!Number.isInteger(requestedPage)) return;

        currentView = { name: "list", mode: null, page: requestedPage };
        return componentInteraction.update(
          buildListPayload(guild, sessionId, requestedPage)
        );
      }

      if (action.startsWith("delete:")) {
        const [, channelId, rawPage] = action.split(":");
        if (!/^\d{17,20}$/.test(channelId || "")) return;

        await componentInteraction.deferUpdate();
        const result = await removeStickyChannel(guild, channelId);
        const remainingCount = getGuildStickyEntries(guild).length;
        const lastPage = Math.max(0, Math.ceil(remainingCount / LIST_PAGE_SIZE) - 1);
        const page = Math.min(Math.max(Number(rawPage) || 0, 0), lastPage);
        currentView = { name: "list", mode: null, page };

        return interaction.editReply(
          buildListPayload(guild, sessionId, page, {
            notice: result.removed
              ? `${emojiler.tik || "✅"} <#${channelId}> yapışkan mesaj listesinden kaldırıldı.`
              : `${emojiler.uyari || "⚠️"} Kanal kaydı zaten kaldırılmış; liste yenilendi.`,
          })
        );
      }

      if (action === "clear") {
        const channelCount = getGuildStickyEntries(guild).length;
        if (channelCount === 0) {
          return componentInteraction.update(
            buildDashboardPayload(guild, sessionId, {
              notice: `${emojiler.uyari || "⚠️"} Sıfırlanacak bir yapışkan mesaj bulunmuyor.`,
            })
          );
        }

        currentView = { name: "confirm", mode: null, page: 0 };
        return componentInteraction.update(
          buildClearConfirmationPayload(sessionId, channelCount)
        );
      }

      if (action === "clear-cancel") {
        currentView = { name: "dashboard", mode: null, page: 0 };
        return componentInteraction.update(
          buildDashboardPayload(guild, sessionId, {
            notice: "Sıfırlama iptal edildi; kanal kayıtları değiştirilmedi.",
          })
        );
      }

      if (action === "clear-confirm") {
        await componentInteraction.deferUpdate();
        const entries = getGuildStickyEntries(guild);
        const results = await Promise.all(
          entries.map(entry => removeStickyChannel(guild, entry.channelId))
        );
        const removedCount = results.filter(result => result.removed).length;

        currentView = { name: "dashboard", mode: null, page: 0 };
        return interaction.editReply(
          buildDashboardPayload(guild, sessionId, {
            notice: `${emojiler.tik || "✅"} Bu sunucuya ait **${removedCount} yapışkan mesaj kaydı** sıfırlandı.`,
          })
        );
      }

      if (action === "dashboard" || action === "refresh") {
        currentView = { name: "dashboard", mode: null, page: 0 };
        return componentInteraction.update(
          buildDashboardPayload(guild, sessionId, {
            notice: action === "refresh" ? "🔄 Panel güncel kayıtlarla yenilendi." : null,
          })
        );
      }
    } catch (error) {
      console.error("🔴 [STICKY MESSAGE PANEL HATASI]", error);
      return sendPrivateError(
        componentInteraction,
        error?.message || "Yapışkan mesaj ayarı güncellenirken beklenmeyen bir hata oluştu."
      );
    }
  };

  botClient.on(Events.InteractionCreate, listener);
  closeTimer = setTimeout(closeSession, SESSION_TTL);
  closeTimer.unref?.();
}

function setupStickyListeners(client) {
  if (listenerClients.has(client)) return;
  listenerClients.add(client);

  client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    const record = loadStickyData()[message.channel.id];
    if (!record || !recordBelongsToGuild(message.channel.id, record, message.guild)) return;

    try {
      await refreshStickyMessage(message.channel);
    } catch (error) {
      console.error(`🔴 [STICKY MESSAGE] ${message.channel.id} yenilenemedi:`, error);
    }
  });
}

async function saveStickyFromDashboard(channel, guild, draft, userId) {
  return enqueueChannelOperation(channel.id, async () => {
    validateTargetChannel(channel, guild, draft.messageType);
    const existing = loadStickyData()[channel.id];
    let message = null;
    if (existing?.messageId) {
      try { message = await channel.messages.fetch(existing.messageId); }
      catch (error) { if (error.code !== 10008) throw error; }
    }
    const unchanged = draft.messageType === 'embed'
      ? existing?.embed && JSON.stringify(existing.embed) === JSON.stringify(draft.embed)
      : !existing?.embed && existing?.content === draft.content;
    if (message && unchanged) return existing;
    const payload = { content: null, embeds: [], ...payloadFromDraft(draft) };
    const sent = message ? await message.edit(payload) : await channel.send(payload);
    const record = {
      ...existing, guildId: guild.id, messageId: sent.id, messageType: draft.messageType,
      sourceMode: 'dashboard', updatedAt: Date.now(), updatedBy: userId,
    };
    delete record.embed;
    delete record.content;
    if (draft.messageType === 'embed') record.embed = { ...draft.embed };
    else record.content = draft.content;
    try {
      updateStickyData(data => { data[channel.id] = record; });
    } catch (error) {
      if (!message) await sent.delete().catch(() => null);
      else if (existing) await message.edit({ content: null, embeds: [], ...payloadFromRecord(existing) }).catch(() => null);
      throw error;
    }
    return record;
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sticky-message")
    .setDescription("Yapışkan mesajları tek yönetim panelinden ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  execute,
  setupStickyListeners,
  buildConfigPayload,
  buildDashboardPayload,
  saveStickyFromDashboard,
  removeStickyChannel,
  refreshStickyMessage,
  validateTargetChannel,
};
