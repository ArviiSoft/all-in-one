const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require('discord.js');

const COMMENTS_PER_PAGE = 5;
const X_BLUE = 0x1d9bf0;

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function safeText(value, fallback, maxLength) {
  const normalized = String(value ?? '')
    .replaceAll('@', '@\u200b')
    .trim();
  const text = normalized || fallback;
  const truncated = text.length > maxLength
    ? `${text.slice(0, maxLength - 1)}…`
    : text;

  return escapeMarkdown(truncated, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
}

function safeAvatarURL(value, index) {
  try {
    const url = new URL(String(value ?? ''));
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
  }

  return `https://cdn.discordapp.com/embed/avatars/${index % 6}.png`;
}

function commentTime(createdAt, fallbackIndex) {
  const date = new Date(createdAt || '');
  if (Number.isNaN(date.getTime())) return `-# ${fallbackIndex + 1}. yorum`;
  return `-# <t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function pageCustomId(tweetId, ownerId, page, role) {
  return `showcomments_${tweetId}:${ownerId}:${page}:${role}`;
}

function commentSection(comment, absoluteIndex) {
  const name = safeText(comment?.name, 'Bilinmeyen kullanıcı', 80);
  const content = safeText(comment?.comment, 'Yorum metni bulunamadı.', 1000);

  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `### ${name}`,
        content,
        commentTime(comment?.createdAt, absoluteIndex),
      ].join('\n'))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(safeAvatarURL(comment?.avatarURL, absoluteIndex))
    );
}

function navigationRow(tweetId, ownerId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(pageCustomId(tweetId, ownerId, Math.max(0, page - 1), 'prev'))
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(pageCustomId(tweetId, ownerId, page, 'current'))
      .setLabel(`${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(pageCustomId(tweetId, ownerId, Math.min(totalPages - 1, page + 1), 'next'))
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

function buildTwitterCommentsView({ tweet, tweetId, ownerId, page = 0 }) {
  const comments = Array.isArray(tweet?.yorumlar) ? tweet.yorumlar : [];
  const totalPages = Math.max(1, Math.ceil(comments.length / COMMENTS_PER_PAGE));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const start = safePage * COMMENTS_PER_PAGE;
  const pageComments = comments.slice(start, start + COMMENTS_PER_PAGE);
  const handle = safeText(tweet?.username, 'kullanici', 80);

  const container = new ContainerBuilder()
    .setAccentColor(X_BLUE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## 💬 Tweet Yorumları`,
        `-# @${handle} gönderisine gelen yanıtlar • ${comments.length} yorum`,
      ].join('\n'))
    )
    .addSeparatorComponents(separator());

  if (!pageComments.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Henüz yorum yok \nBu tweet'e ilk yorumu sen yapabilirsin.`
      )
    );
  } else {
    pageComments.forEach((comment, index) => {
      if (index > 0) container.addSeparatorComponents(separator());
      container.addSectionComponents(commentSection(comment, start + index));
    });
  }

  container
    .addSeparatorComponents(separator())
    .addActionRowComponents(navigationRow(tweetId, ownerId, safePage, totalPages));

  return {
    components: [container],
    page: safePage,
    totalPages,
  };
}

module.exports = {
  COMMENTS_PER_PAGE,
  buildTwitterCommentsView,
};
