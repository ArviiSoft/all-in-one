const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder } = require("discord.js");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { createJsonStore } = require("../../Utils/Core/safeJsonStore.js");

const PANEL_ACCENT_COLOR = 0x23d18b;
const DELETED_ACCENT_COLOR = 0xed4245;
const COMPONENT_PREFIX = "emoji_ekle";
const PANEL_SESSION_DURATION_MS = 14 * 60 * 1000;
const CUSTOM_EMOJI_PATTERN = /<(a)?:([\w]+):(\d{17,20})>/g;
const EMOJI_NAME_PATTERN = /^[a-zA-Z0-9_]{2,32}$/;
const panelSessionStore = createJsonStore(
  path.join(__dirname, "../../Database/Sistem/emojiEklePanelleri.json")
);
const panelExpiryTimers = new Map();

function componentId(action, sessionId, value) {
  return `${COMPONENT_PREFIX}:${action}:${sessionId}:${value}`;
}

function parseComponentId(customId) {
  const [prefix, action, sessionId, value, ...extra] = String(customId).split(":");
  if (prefix !== COMPONENT_PREFIX || extra.length > 0) return null;
  if (!/^[a-z_]+$/.test(action) || !/^\d{17,20}$/.test(sessionId) || !value) return null;

  return { action, sessionId, value };
}

function emojiCapacity(guild) {
  const emojis = guild.emojis.cache;

  return {
    animated: emojis.filter(emoji => emoji.animated).size,
    static: emojis.filter(emoji => !emoji.animated).size,
  };
}

function emojiImageURL(emoji) {
  if (typeof emoji.imageURL === "function") {
    return emoji.imageURL({ extension: emoji.animated ? "gif" : "png", size: 256 });
  }

  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=256&quality=lossless`;
}

function normalizePage(session, requestedPage = session.page) {
  const lastPage = Math.max(0, session.entries.length - 1);
  const parsedPage = Number(requestedPage);
  session.page = Math.min(
    Math.max(Number.isFinite(parsedPage) ? Math.trunc(parsedPage) : 0, 0),
    lastPage
  );

  return session.page;
}

function buildPaginationRow(session, disabled = false) {
  const page = normalizePage(session);
  const pageCount = Math.max(1, session.entries.length);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId("page", session.id, "previous"))
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId(componentId("page", session.id, "current"))
      .setLabel(`${page + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(componentId("page", session.id, "next"))
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === pageCount - 1)
  );
}

function buildEmojiPanel({ guild, session, disabled = false }) {
  const page = normalizePage(session);
  const emoji = session.entries[page];
  const capacity = emojiCapacity(guild);
  const deleted = Boolean(emoji.deleted);
  const deleteIcon = emojiler.cop || "🗑️";
  const successIcon = emojiler.tik || "✅";
  const warningIcon = emojiler.uyari || "⚠️";
  const emojiMention = deleted ? deleteIcon : `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
  const title = deleted
    ? `${deleteIcon} Emoji Sunucudan Silindi`
    : session.entries.length > 1
      ? `${successIcon} ${session.entries.length} Emoji Başarıyla Eklendi`
      : `${successIcon} Emoji Başarıyla Eklendi`;
  const description = deleted
    ? `<@${session.ownerId}> tarafından eklenen emoji sunucudan kaldırıldı.`
    : session.entries.length > 1
      ? `<@${session.ownerId}> sunucuya **${session.entries.length}** yeni emoji ekledi.`
      : `<@${session.ownerId}> sunucuya yeni bir emoji ekledi.`;
  const failureNotice = session.failedCount > 0
    ? `\n-# ${warningIcon} ${session.failedCount} emoji eklenemedi.`
    : "";

  const headerContent = new TextDisplayBuilder().setContent([
    `## ${title}`,
    `${description}${failureNotice}`,
  ].join("\n"));

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId("delete", session.id, emoji.id))
      .setLabel("Emojiyi Sil")
      .setEmoji(deleteIcon)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || deleted),
    new ButtonBuilder()
      .setCustomId(componentId("rename", session.id, emoji.id))
      .setLabel("Emojinin İsmini Değiştir")
      .setEmoji("🏷️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || deleted)
  );

  const container = new ContainerBuilder()
    .setAccentColor(deleted ? DELETED_ACCENT_COLOR : PANEL_ACCENT_COLOR);

  if (deleted) {
    container.addTextDisplayComponents(headerContent);
  } else {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(headerContent)
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(emojiImageURL(emoji))
            .setDescription(`${emoji.name}`)
        )
    );
  }

  return container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Eklenen Emoji",
        `${emojiMention} **${emoji.name}**`,
        "",
        "**Eklenen Emojinin ID'si:**",
        emoji.id,
      ].join("\n"))
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### Sunucudaki Emojiler",
        `🎞️ **Hareketli:** ${capacity.animated}`,
        `🙂 **Hareketsiz:** ${capacity.static}`,
      ].join("\n"))
    )
    .addActionRowComponents(controls)
    .addActionRowComponents(buildPaginationRow(session, disabled));
}

function buildStatusPanel(title, description, accentColor = PANEL_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`)
    );
}

function componentsV2Payload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function panelEditPayload(guild, session, disabled = false) {
  return {
    components: [buildEmojiPanel({ guild, session, disabled })],
    allowedMentions: { parse: [] },
  };
}

function hasEmojiPermission(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageEmojisAndStickers)
  );
}

async function fetchPanelEmoji(interaction, emojiId) {
  return interaction.guild.emojis.fetch(emojiId).catch(() => null);
}

async function sendPrivateError(interaction, message) {
  const payload = {
    content: `${emojiler.uyari || "⚠️"} **${message}**`,
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

function serializePanelSession(session) {
  return {
    id: session.id,
    ownerId: session.ownerId,
    guildId: session.guildId,
    entries: session.entries.map(entry => ({
      id: entry.id,
      name: entry.name,
      animated: Boolean(entry.animated),
      deleted: Boolean(entry.deleted),
    })),
    failedCount: session.failedCount,
    page: session.page,
    expiresAt: session.expiresAt,
  };
}

function normalizeStoredSession(value, expectedId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.id !== expectedId || !/^\d{17,20}$/.test(String(value.id))) return null;
  if (!/^\d{17,20}$/.test(String(value.ownerId)) || !/^\d{17,20}$/.test(String(value.guildId))) return null;
  if (!Array.isArray(value.entries) || value.entries.length === 0) return null;

  const entries = value.entries.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    if (!/^\d{17,20}$/.test(String(entry.id))) return null;
    if (typeof entry.name !== "string" || entry.name.length === 0 || entry.name.length > 32) return null;

    return {
      id: String(entry.id),
      name: entry.name,
      animated: Boolean(entry.animated),
      deleted: Boolean(entry.deleted),
    };
  });
  if (entries.some(entry => entry === null)) return null;

  const expiresAt = Number(value.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;

  const session = {
    id: String(value.id),
    ownerId: String(value.ownerId),
    guildId: String(value.guildId),
    entries,
    failedCount: Math.max(0, Number.parseInt(value.failedCount, 10) || 0),
    page: Number.parseInt(value.page, 10) || 0,
    expiresAt,
  };
  normalizePage(session);
  return session;
}

function savePanelSession(session) {
  normalizePage(session);
  panelSessionStore.set(session.id, serializePanelSession(session));
}

function deletePanelSession(sessionId) {
  const timerRecord = panelExpiryTimers.get(sessionId);
  if (timerRecord) clearTimeout(timerRecord.timer);
  panelExpiryTimers.delete(sessionId);
  panelSessionStore.delete(sessionId);
}

function schedulePanelExpiry(session, interaction) {
  const currentTimer = panelExpiryTimers.get(session.id);
  if (currentTimer?.expiresAt === session.expiresAt) return;
  if (currentTimer) clearTimeout(currentTimer.timer);

  const delay = Math.max(0, session.expiresAt - Date.now());
  const timer = setTimeout(() => {
    panelExpiryTimers.delete(session.id);

    const latest = normalizeStoredSession(panelSessionStore.get(session.id), session.id);
    if (!latest || latest.expiresAt !== session.expiresAt) return;

    panelSessionStore.delete(session.id);
    interaction.editReply(
      panelEditPayload(interaction.guild, latest, true)
    ).catch(() => null);
  }, delay);
  timer.unref?.();

  panelExpiryTimers.set(session.id, { expiresAt: session.expiresAt, timer });
}

function getPanelSession(component, interaction) {
  const storedSession = panelSessionStore.get(component.sessionId);
  const session = normalizeStoredSession(storedSession, component.sessionId);

  if (!session) {
    if (storedSession !== undefined) deletePanelSession(component.sessionId);
    return null;
  }
  if (session.guildId !== interaction.guildId) return null;
  if (session.expiresAt <= Date.now()) {
    deletePanelSession(component.sessionId);
    return null;
  }

  schedulePanelExpiry(session, interaction);
  return session;
}

function createPanelSession(interaction, entries, failedCount) {
  const session = {
    id: interaction.id,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    entries,
    failedCount,
    page: 0,
    expiresAt: Date.now() + PANEL_SESSION_DURATION_MS,
  };

  savePanelSession(session);
  schedulePanelExpiry(session, interaction);
  return session;
}

function findSessionEntry(session, emojiId) {
  const index = session.entries.findIndex(entry => entry.id === emojiId);
  if (index === -1) return null;

  return { entry: session.entries[index], index };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emoji-ekle")
    .setDescription("Sunucuya emoji ekler.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers)
    .addStringOption(option =>
      option
        .setName("emoji")
        .setDescription("Sunucuya eklenecek emojileri gir. (Birden fazla emoji destekler)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const emojiInput = interaction.options.getString("emoji", true);
    const matches = [...emojiInput.matchAll(CUSTOM_EMOJI_PATTERN)];

    if (matches.length === 0) {
      return sendPrivateError(interaction, "Geçerli özel emoji veya emojiler gir.");
    }

    await interaction.reply(
      componentsV2Payload(
        buildStatusPanel(
          "⏳ Emojiler Ekleniyor",
          `**${matches.length}** emoji hazırlanıyor ve sunucuya yükleniyor…`
        )
      )
    );

    const added = [];
    let failedCount = 0;

    for (const match of matches) {
      const animated = Boolean(match[1]);
      const name = match[2];
      const sourceId = match[3];
      const attachment = `https://cdn.discordapp.com/emojis/${sourceId}.${animated ? "gif" : "png"}?size=512&quality=lossless`;

      try {
        const emoji = await interaction.guild.emojis.create({
          name,
          attachment,
          reason: `${interaction.user.username} (${interaction.user.id}) tarafından /emoji-ekle komutuyla eklendi.`,
        });

        added.push({
          id: emoji.id,
          name: emoji.name,
          animated: emoji.animated,
          deleted: false,
        });
      } catch (error) {
        failedCount += 1;
        console.error(`🔴 [EMOJİ EKLE] Emoji eklenemedi (${name}):`, error);
      }
    }

    if (added.length === 0) {
      return interaction.editReply({
        components: [
          buildStatusPanel(
            "⚠️ Emojiler Eklenemedi",
            "Emoji kapasitesini, dosyaların erişilebilirliğini ve botun yetkilerini kontrol et.",
            DELETED_ACCENT_COLOR
          ),
        ],
      });
    }

    const session = createPanelSession(interaction, added, failedCount);
    return interaction.editReply(panelEditPayload(interaction.guild, session));
  },

  async handleButton(interaction) {
    const component = parseComponentId(interaction.customId);
    if (!component || !["page", "delete", "rename"].includes(component.action)) return;

    if (!interaction.inGuild() || !hasEmojiPermission(interaction)) {
      return sendPrivateError(interaction, "Bu paneli kullanmak için emojileri yönetme yetkin olmalı.");
    }

    const session = getPanelSession(component, interaction);
    if (!session) {
      return sendPrivateError(interaction, "Bu emoji panelinin kullanım süresi dolmuş.");
    }

    if (component.action === "page") {
      if (component.value === "previous") session.page -= 1;
      else if (component.value === "next") session.page += 1;
      else return interaction.deferUpdate();

      normalizePage(session);
      savePanelSession(session);
      return interaction.update(panelEditPayload(interaction.guild, session));
    }

    const result = findSessionEntry(session, component.value);
    if (!result) {
      return sendPrivateError(interaction, "Bu emoji panel kaydında bulunamadı.");
    }

    const { entry, index } = result;
    session.page = index;

    if (entry.deleted) {
      return sendPrivateError(interaction, "Bu emoji zaten sunucudan silinmiş.");
    }

    if (component.action === "rename") {
      const nameInput = new TextInputBuilder()
        .setCustomId("emoji_name")
        .setLabel("Yeni emoji ismi")
        .setPlaceholder("ornek_emoji")
        .setValue(entry.name)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const modal = new ModalBuilder()
        .setCustomId(componentId("rename_modal", session.id, entry.id))
        .setTitle("Emojinin İsmini Değiştir")
        .addComponents(new ActionRowBuilder().addComponents(nameInput));

      return interaction.showModal(modal);
    }

    await interaction.deferUpdate();
    const emoji = await fetchPanelEmoji(interaction, entry.id);
    if (!emoji) {
      entry.deleted = true;
      savePanelSession(session);
      await interaction.editReply(panelEditPayload(interaction.guild, session));
      return sendPrivateError(interaction, "Bu emoji artık sunucuda bulunmuyor.");
    }

    try {
      await emoji.delete(
        `${interaction.user.username} (${interaction.user.id}) panel üzerinden sildi.`
      );
      interaction.guild.emojis.cache.delete(emoji.id);
      entry.deleted = true;
      savePanelSession(session);
    } catch (error) {
      console.error(`🔴 [EMOJİ EKLE] Emoji silinemedi (${emoji.id}):`, error);
      return sendPrivateError(interaction, "Emoji silinirken bir hata oluştu.");
    }

    return interaction.editReply(panelEditPayload(interaction.guild, session));
  },

  async handleModal(interaction) {
    const component = parseComponentId(interaction.customId);
    if (!component || component.action !== "rename_modal") return;

    if (!interaction.inGuild() || !hasEmojiPermission(interaction)) {
      return sendPrivateError(interaction, "Bu işlemi yapmak için emojileri yönetme yetkin olmalı.");
    }

    const session = getPanelSession(component, interaction);
    if (!session) {
      return sendPrivateError(interaction, "Bu emoji panelinin kullanım süresi dolmuş.");
    }

    const result = findSessionEntry(session, component.value);
    if (!result || result.entry.deleted) {
      return sendPrivateError(interaction, "Bu emoji artık panelden yönetilemiyor.");
    }

    const newName = interaction.fields.getTextInputValue("emoji_name").trim();
    if (!EMOJI_NAME_PATTERN.test(newName)) {
      return sendPrivateError(
        interaction,
        "Emoji ismi 2-32 karakter olmalı ve yalnızca harf, rakam veya alt çizgi içermeli."
      );
    }

    await interaction.deferUpdate();
    const emoji = await fetchPanelEmoji(interaction, result.entry.id);
    if (!emoji) {
      result.entry.deleted = true;
      session.page = result.index;
      savePanelSession(session);
      await interaction.editReply(panelEditPayload(interaction.guild, session));
      return sendPrivateError(interaction, "Bu emoji artık sunucuda bulunmuyor.");
    }

    let renamedEmoji;
    try {
      renamedEmoji = await emoji.edit({
        name: newName,
        reason: `${interaction.user.username} (${interaction.user.id}) panel üzerinden ismini değiştirdi.`,
      });
    } catch (error) {
      console.error(`🔴 [EMOJİ EKLE] Emoji ismi değiştirilemedi (${emoji.id}):`, error);
      return sendPrivateError(interaction, "Emojinin ismi değiştirilirken bir hata oluştu.");
    }

    result.entry.name = renamedEmoji.name;
    result.entry.animated = renamedEmoji.animated;
    session.page = result.index;
    savePanelSession(session);

    return interaction.editReply(panelEditPayload(interaction.guild, session));
  },
};
