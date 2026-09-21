const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, escapeMarkdown } = require("discord.js");
const emojiler = require("../Emojis/emojiler.js");
const { getGuildStickyEntries } = require("./stickyStore.js");

const LIST_PAGE_SIZE = 5;
const LIST_ACCENT_COLOR = 0x3498db;

function makeId(sessionId, action) {
  return `sm:${sessionId}:${action}`;
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

function recordType(record) {
  return record?.embed ? "Embed" : "Normal metin";
}

function recordSource(record) {
  if (record?.sourceMode === "multi") return "Çoklu kanal kurulumu";
  if (record?.sourceMode === "single") return "Tekli kanal kurulumu";
  return "Eski kayıt";
}

function recordPreview(record) {
  if (record?.embed) {
    const parts = [];
    if (record.embed.title) parts.push(`Başlık: ${record.embed.title}`);
    if (record.embed.description) parts.push(`Açıklama: ${record.embed.description}`);
    if (record.embed.footer) parts.push(`Alt bilgi: ${record.embed.footer}`);
    if (record.embed.image) parts.push("Büyük görsel ayarlı");
    if (record.embed.thumbnail) parts.push("Küçük görsel ayarlı");
    return truncate(parts.join(" · ") || "İçeriksiz embed", 180);
  }

  return truncate(record?.content || "İçerik bulunamadı", 180);
}

function buildListPayload(guild, sessionId, requestedPage = 0, options = {}) {
  const { disabled = false, notice = null } = options;
  const entries = getGuildStickyEntries(guild);
  const pageCount = Math.max(1, Math.ceil(entries.length / LIST_PAGE_SIZE));
  const parsedPage = Number(requestedPage);
  const safePage = Number.isInteger(parsedPage) ? parsedPage : 0;
  const page = Math.min(Math.max(safePage, 0), pageCount - 1);
  const pageEntries = entries.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);

  const container = new ContainerBuilder()
    .setAccentColor(LIST_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## 📌 Yapışkan Mesaj Listesi",
        entries.length > 0
          ? `Bu sunucuda **${entries.length} kanalda** yapışkan mesaj etkin. İstediğin kanalı kendi satırındaki butonla kaldırabilirsin.`
          : "Bu sunucuda ayarlanmış bir yapışkan mesaj bulunmuyor.",
      ].join("\n"))
    );

  if (notice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> ${notice}`)
    );
  }

  if (pageEntries.length > 0) {
    container.addSeparatorComponents(separator());

    pageEntries.forEach(({ channelId, record }, index) => {
      const channel = guild.channels.cache.get(channelId);
      const channelLabel = channel ? `<#${channelId}>` : `Silinmiş kanal (\`${channelId}\`)`;
      const preview = escapeMarkdown(recordPreview(record));
      const messageId = record?.messageId ? `\`${record.messageId}\`` : "`Bilinmiyor`";

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
              `### ${channelLabel}`,
              `**Tür:** ${recordType(record)} · **Kaynak:** ${recordSource(record)}`,
              `**Önizleme:** ${preview}`,
              `-# Mesaj ID: ${messageId}`,
            ].join("\n"))
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(makeId(sessionId, `delete:${channelId}:${page}`))
              .setLabel("Kanalı Sil")
              .setEmoji(emojiler.cop || "🗑️")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(disabled)
          )
      );

      if (index < pageEntries.length - 1) {
        container.addSeparatorComponents(separator());
      }
    });

    const resendOptions = pageEntries
      .filter(({ channelId }) => guild.channels.cache.has(channelId))
      .map(({ channelId, record }) => {
        const channel = guild.channels.cache.get(channelId);
        return {
          label: truncate(`#${channel?.name || channelId}`, 100),
          description: truncate(`${recordType(record)} mesajı şimdi yeniden gönder`, 100),
          value: channelId,
          emoji: "🔁",
        };
      });

    if (resendOptions.length > 0) {
      container
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "### Mesajı Yeniden Gönder\nSon yapışkan mesajı silip seçtiğin kanalda hemen yeniden oluştur."
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(makeId(sessionId, `resend:${page}`))
              .setPlaceholder("Yeniden gönderilecek kanalı seç")
              .setMinValues(1)
              .setMaxValues(1)
              .setDisabled(disabled)
              .addOptions(resendOptions)
          )
        );
    }
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
          ? "-# 🔒 Bu liste oturum süresi dolduğu için artık kullanılamaz."
          : "-# Kanalı Sil, kaydı kaldırır ve son yapışkan mesajı kanaldan silmeyi dener."
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  LIST_PAGE_SIZE,
  buildListPayload,
};