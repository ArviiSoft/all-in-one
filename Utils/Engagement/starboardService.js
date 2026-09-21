const { EmbedBuilder, Events } = require("discord.js");
const { deleteEntry, getEntry, getEntryByStarboardMessage, getGuildConfig, listEntries, setEntry, updateGuildConfig } = require("./starboardStore");

const STARBOARD_COLOR = 0xffd700;
const MAX_EMBEDS = 10;
const MAX_EMBED_CHARACTERS = 6000;
const synchronizationQueues = new Map();

function truncate(value, maximum, suffix = "…") {
  const text = String(value || "");
  if (text.length <= maximum) return text;
  return `${text.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`;
}

function comparableEmoji(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\uFE0E\uFE0F]/g, "");
}

function isValidUnicodeEmoji(value) {
  const emoji = String(value || "").trim();
  if (!emoji || emoji.length > 32 || /<a?:\w{2,32}:\d{17,20}>/.test(emoji)) return false;

  const segments = [...new Intl.Segmenter("tr", { granularity: "grapheme" }).segment(emoji)];
  if (segments.length !== 1 || segments[0].segment !== emoji) return false;

  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(emoji);
}

function isMatchingReaction(reaction, emoji) {
  return !reaction.emoji?.id
    && comparableEmoji(reaction.emoji?.name) === comparableEmoji(emoji);
}

function safeUrl(value) {
  const url = String(value || "");
  return /^(?:https?:\/\/|attachment:\/\/)/i.test(url) ? url : null;
}

function isImageLike(item) {
  if (String(item.contentType || "").toLowerCase().startsWith("image/")) return true;
  return /\.(?:apng|avif|gif|jpe?g|png|webp)(?:\?.*)?$/i.test(String(item.url || ""));
}

function isVideoLike(item) {
  if (String(item.contentType || "").toLowerCase().startsWith("video/")) return true;
  return /\.(?:m4v|mkv|mov|mp4|webm)(?:\?.*)?$/i.test(String(item.url || ""));
}

function isAudioLike(item) {
  if (String(item.contentType || "").toLowerCase().startsWith("audio/")) return true;
  return /\.(?:aac|flac|m4a|mp3|ogg|opus|wav)(?:\?.*)?$/i.test(String(item.url || ""));
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 1) return null;
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function attachmentName(attachment, index) {
  const original = String(attachment.name || `dosya-${index + 1}`)
    // eslint-disable-next-line no-control-regex -- Ek dosya adındaki yol ayraçları ve ASCII kontrol karakterleri temizlenir.
    .replace(/[\\/\u0000-\u001F\u007F]/g, "-")
    .slice(0, 82) || `dosya-${index + 1}`;
  const spoiler = original.startsWith("SPOILER_");
  const plainName = spoiler ? original.slice("SPOILER_".length) : original;
  return `${spoiler ? "SPOILER_" : ""}starboard-${index + 1}-${plainName}`.slice(0, 100);
}

function componentData(component) {
  try {
    return component?.toJSON ? component.toJSON() : component;
  } catch {
    return component;
  }
}

function collectComponentContent(components, textParts, externalMedia) {
  const visit = component => {
    const raw = componentData(component);
    if (!raw || typeof raw !== "object") return;

    if (raw.type === 10 && typeof raw.content === "string" && raw.content.trim()) {
      textParts.push(raw.content.trim());
    }

    if (raw.media?.url) {
      externalMedia.push({
        url: raw.media.url,
        description: raw.description || null,
        spoiler: raw.spoiler === true,
      });
    }

    if (raw.file?.url) {
      externalMedia.push({
        url: raw.file.url,
        description: raw.description || "Dosya",
        spoiler: raw.spoiler === true,
        forceFile: true,
      });
    }

    if (Array.isArray(raw.items)) {
      for (const item of raw.items) {
        const media = item?.media || item;
        if (!media?.url) continue;
        externalMedia.push({
          url: media.url,
          description: item.description || null,
          spoiler: item.spoiler === true,
        });
      }
    }

    if (Array.isArray(raw.components)) raw.components.forEach(visit);
    if (raw.accessory) visit(raw.accessory);
  };

  for (const component of components || []) visit(component);
}

function collectMessageData(message) {
  const sources = [message, ...(message.messageSnapshots?.values?.() || [])];
  const textParts = [];
  const attachments = [];
  const externalMedia = [];
  const sourceEmbeds = [];
  const seenAttachmentUrls = new Set();
  const seenExternalUrls = new Set();

  for (const source of sources) {
    if (typeof source.content === "string" && source.content.trim()) {
      textParts.push(source.content.trim());
    }

    collectComponentContent(source.components, textParts, externalMedia);

    for (const attachment of source.attachments?.values?.() || []) {
      const url = safeUrl(attachment.url || attachment.proxyURL);
      if (!url || seenAttachmentUrls.has(url)) continue;
      seenAttachmentUrls.add(url);
      attachments.push({
        url,
        proxyURL: safeUrl(attachment.proxyURL),
        name: attachment.name || null,
        description: attachment.description || null,
        contentType: attachment.contentType || null,
        size: attachment.size || null,
        spoiler: attachment.spoiler === true || String(attachment.name || "").startsWith("SPOILER_"),
      });
    }

    for (const sticker of source.stickers?.values?.() || []) {
      const url = safeUrl(sticker.url);
      if (!url) continue;
      externalMedia.push({
        url,
        description: `Sticker: ${sticker.name || "Adsız"}`,
        contentType: Number(sticker.format) === 3 ? "application/json" : "image/png",
        forceFile: Number(sticker.format) === 3,
      });
    }

    for (const embed of source.embeds || []) {
      try {
        sourceEmbeds.push(embed.toJSON ? embed.toJSON() : { ...embed });
      } catch {
      }
    }
  }

  const uniqueTextParts = [...new Set(textParts)];
  const uniqueExternalMedia = externalMedia.filter(item => {
    const url = safeUrl(item.url);
    if (!url || seenAttachmentUrls.has(url) || seenExternalUrls.has(url)) return false;
    seenExternalUrls.add(url);
    item.url = url;
    return true;
  });

  let systemContent = null;
  if (uniqueTextParts.length === 0) {
    try {
      systemContent = message.systemContent;
    } catch {
    }
  }

  const reference = message.reference;
  const replyUrl = reference?.messageId && reference?.channelId
    ? `https://discord.com/channels/${reference.guildId || message.guildId || "@me"}/${reference.channelId}/${reference.messageId}`
    : null;

  return {
    attachments,
    externalMedia: uniqueExternalMedia,
    poll: message.poll || null,
    replyUrl,
    sourceEmbeds,
    text: uniqueTextParts.join("\n\n") || systemContent || "",
  };
}

function buildPollField(poll) {
  if (!poll) return null;
  const question = truncate(poll.question?.text || "Anket", 180);
  const answerLines = [...(poll.answers?.values?.() || [])].map(answer => {
    const emoji = answer.emoji?.toString?.() || "🔹";
    const text = truncate(answer.text || "Seçenek", 100);
    const votes = Number.isFinite(answer.voteCount) ? ` - **${answer.voteCount} oy**` : "";
    return `${emoji} ${text}${votes}`;
  });
  const mode = poll.allowMultiselect ? "Birden fazla seçenek seçilebilir." : "Tek seçenekli anket.";
  return {
    name: `📊 ${question}`,
    value: truncate(`${answerLines.join("\n") || "Henüz seçenek bilgisi yok."}\n-# ${mode}`, 1024),
    inline: false,
  };
}

function embedCharacterCount(embed) {
  const raw = embed?.toJSON ? embed.toJSON() : embed || {};
  return (raw.title?.length || 0)
    + (raw.description?.length || 0)
    + (raw.author?.name?.length || 0)
    + (raw.footer?.text?.length || 0)
    + (raw.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

function sanitizeSourceEmbed(source, characterBudget) {
  if (!source || typeof source !== "object" || characterBudget < 2) return null;
  const result = {};
  let remaining = characterBudget;

  const take = (value, maximum) => {
    if (!value || remaining < 1) return null;
    const text = truncate(value, Math.min(maximum, remaining));
    remaining -= text.length;
    return text;
  };

  const authorName = take(source.author?.name, 256);
  if (authorName) {
    result.author = { name: authorName };
    const authorUrl = safeUrl(source.author?.url);
    const authorIcon = safeUrl(source.author?.icon_url || source.author?.iconURL);
    if (authorUrl) result.author.url = authorUrl;
    if (authorIcon) result.author.icon_url = authorIcon;
  }

  const title = take(source.title, 256);
  if (title) result.title = title;
  const description = take(source.description, 4096);
  if (description) result.description = description;

  const sourceUrl = safeUrl(source.url);
  if (sourceUrl) result.url = sourceUrl;
  if (Number.isInteger(source.color)) result.color = source.color;
  if (source.timestamp && !Number.isNaN(Date.parse(source.timestamp))) result.timestamp = source.timestamp;

  const fields = [];
  for (const field of source.fields || []) {
    if (fields.length >= 25 || remaining < 2) break;
    const name = take(field.name || "\u200b", 256);
    const value = take(field.value || "\u200b", 1024);
    if (name && value) fields.push({ name, value, inline: field.inline === true });
  }
  if (fields.length) result.fields = fields;

  const thumbnailUrl = safeUrl(source.thumbnail?.url);
  const imageUrl = safeUrl(source.image?.url);
  if (thumbnailUrl) result.thumbnail = { url: thumbnailUrl };
  if (imageUrl) result.image = { url: imageUrl };

  const footerText = take(source.footer?.text, 2048);
  if (footerText) {
    result.footer = { text: footerText };
    const footerIcon = safeUrl(source.footer?.icon_url || source.footer?.iconURL);
    if (footerIcon) result.footer.icon_url = footerIcon;
  }

  if (!result.title && !result.description && !result.fields && !result.image && !result.thumbnail) return null;

  try {
    return EmbedBuilder.from(result);
  } catch {
    return null;
  }
}

function messageUrl(message) {
  if (message.url) return message.url;
  return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
}

function buildStarboardPayload(message, count, emoji, options = {}) {
  const {
    includeFiles = false,
    replaceAttachments = false,
    useAttachmentReferences = false,
  } = options;
  const data = collectMessageData(message);
  const files = data.attachments.slice(0, 10).map((attachment, index) => ({
    attachment: attachment.url,
    name: attachmentName(attachment, index),
    description: attachment.description || undefined,
  }));
  const copiedFileNames = new Map(
    data.attachments.slice(0, 10).map((attachment, index) => [attachment.url, attachmentName(attachment, index)])
  );
  const visualItems = [];
  const linkedItems = [];

  for (const attachment of data.attachments) {
    const copiedName = copiedFileNames.get(attachment.url);
    const displayUrl = useAttachmentReferences && copiedName
      ? `attachment://${copiedName}`
      : attachment.url;

    if (isImageLike(attachment) && !attachment.spoiler) {
      visualItems.push({ url: displayUrl, description: attachment.description });
      continue;
    }

    linkedItems.push({
      ...attachment,
      kind: isVideoLike(attachment) ? "🎬" : isAudioLike(attachment) ? "🎧" : "📎",
    });
  }

  for (const media of data.externalMedia) {
    if (isImageLike(media) && !media.forceFile && !media.spoiler) {
      visualItems.push(media);
    } else {
      linkedItems.push({ ...media, kind: isVideoLike(media) ? "🎬" : "📎" });
    }
  }

  for (const sourceEmbed of data.sourceEmbeds) {
    if (sourceEmbed.video?.url) {
      linkedItems.push({ url: sourceEmbed.video.url, name: sourceEmbed.title || "Video", kind: "🎬" });
    }
  }

  const descriptionParts = [];
  if (data.replyUrl) descriptionParts.push(`↪️ [Yanıtlanan mesaja git](${data.replyUrl})`);
  if (data.text) descriptionParts.push(data.text);
  if (descriptionParts.length === 0) {
    if (data.poll) descriptionParts.push("*Anket mesajı*");
    else if (visualItems.length || linkedItems.length) descriptionParts.push("*Medya mesajı*");
    else if (data.sourceEmbeds.length) descriptionParts.push("*Embed mesajı*");
    else descriptionParts.push("*Boş mesaj*");
  }

  const author = message.author;
  const memberName = message.member?.displayName;
  let authorName = memberName || author?.globalName || author?.username || "Bilinmeyen Kullanıcı";
  if (author?.bot && !authorName.includes("🤖")) authorName += " 🤖";

  const authorData = {
    name: truncate(authorName, 256),
    url: messageUrl(message),
  };
  const avatarUrl = author?.displayAvatarURL?.({ size: 128 });
  if (safeUrl(avatarUrl)) authorData.iconURL = avatarUrl;

  const mainEmbed = new EmbedBuilder()
    .setColor(STARBOARD_COLOR)
    .setAuthor(authorData)
    .setDescription(truncate(descriptionParts.join("\n\n"), 4096))

  if (visualItems[0]?.url) mainEmbed.setImage(visualItems[0].url);

  if (linkedItems.length) {
    const linkLines = linkedItems.map((item, index) => {
      const label = truncate(item.name || item.description || `Dosya ${index + 1}`, 80).replace(/[[\]]/g, "");
      const size = formatBytes(item.size);
      const link = `${item.kind || "📎"} [${label}](${item.url})${size ? ` • ${size}` : ""}`;
      return item.spoiler ? `||${link}||` : link;
    });
    const maximumLinkCharacters = data.poll ? 3500 : 4600;
    const linkChunks = [];
    let currentChunk = "";
    let usedCharacters = 0;
    let includedLineCount = 0;

    for (const originalLine of linkLines) {
      const line = originalLine.length <= 1024
        ? originalLine
        : `📎 [Uzun bağlantılı dosyayı kaynak mesajda aç](${messageUrl(message)})`;
      const separatorLength = currentChunk ? 1 : 0;
      if (usedCharacters + separatorLength + line.length > maximumLinkCharacters) break;

      if (currentChunk && currentChunk.length + 1 + line.length > 1024) {
        linkChunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += `${currentChunk ? "\n" : ""}${line}`;
      }
      usedCharacters += separatorLength + line.length;
      includedLineCount++;
    }

    if (currentChunk) linkChunks.push(currentChunk);
    if (includedLineCount < linkLines.length) {
      const remainingLine = `📎 [Kalan ${linkLines.length - includedLineCount} dosyayı kaynak mesajda aç](${messageUrl(message)})`;
      const lastChunk = linkChunks.at(-1);
      if (lastChunk && lastChunk.length + 1 + remainingLine.length <= 1024) {
        linkChunks[linkChunks.length - 1] += `\n${remainingLine}`;
      } else if (linkChunks.length < 24) {
        linkChunks.push(remainingLine);
      }
    }

    mainEmbed.addFields(
      ...linkChunks.map((value, index) => ({
        name: index === 0 ? "Ekler ve Medyalar" : "\u200b",
        value,
        inline: false,
      }))
    );
  }

  const pollField = buildPollField(data.poll);
  if (pollField) mainEmbed.addFields(pollField);

  const mainEmbedJson = mainEmbed.toJSON();
  const mainEmbedOverflow = embedCharacterCount(mainEmbedJson) - MAX_EMBED_CHARACTERS;
  if (mainEmbedOverflow > 0 && mainEmbedJson.description) {
    mainEmbed.setDescription(
      truncate(mainEmbedJson.description, Math.max(1, mainEmbedJson.description.length - mainEmbedOverflow), "")
    );
  }

  const embeds = [mainEmbed];
  for (const visual of visualItems.slice(1)) {
    if (embeds.length >= MAX_EMBEDS) break;
    try {
      embeds.push(new EmbedBuilder().setColor(STARBOARD_COLOR).setImage(visual.url));
    } catch {
    }
  }

  let characterBudget = MAX_EMBED_CHARACTERS - embeds.reduce(
    (sum, embed) => sum + embedCharacterCount(embed),
    0
  );

  for (const sourceEmbed of data.sourceEmbeds) {
    if (embeds.length >= MAX_EMBEDS || characterBudget < 2) break;
    const clonedEmbed = sanitizeSourceEmbed(sourceEmbed, characterBudget);
    if (!clonedEmbed) continue;
    embeds.push(clonedEmbed);
    characterBudget -= embedCharacterCount(clonedEmbed);
  }

  const payload = {
    content: `${emoji} **${Math.max(0, Number(count) || 0)}** | <#${message.channelId}>`,
    embeds,
    allowedMentions: { parse: [] },
  };

  if (includeFiles && files.length) payload.files = files;
  if (replaceAttachments) payload.attachments = [];
  return payload;
}

function enqueueSynchronization(key, operation) {
  const previous = synchronizationQueues.get(key) || Promise.resolve();
  const current = previous
    .catch(() => null)
    .then(operation)
    .finally(() => {
      if (synchronizationQueues.get(key) === current) synchronizationQueues.delete(key);
    });
  synchronizationQueues.set(key, current);
  return current;
}

async function fetchTextChannel(client, channelId) {
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() && typeof channel.send === "function" ? channel : null;
}

async function fetchMessage(client, channelId, messageId) {
  const channel = await fetchTextChannel(client, channelId);
  if (!channel?.messages) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function selectedReactionCount(message, emoji) {
  const reaction = message.reactions?.cache?.find(item => isMatchingReaction(item, emoji));
  if (!reaction) return 0;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  return Math.max(0, Number(reaction.count) || 0);
}

async function deleteBoardCopy(client, entry) {
  if (!entry) return;
  const boardMessage = await fetchMessage(client, entry.starboardChannelId, entry.starboardMessageId);
  if (boardMessage) await boardMessage.delete().catch(() => null);
}

async function syncBoardReaction(boardMessage, emoji, clientUserId) {
  for (const reaction of boardMessage.reactions?.cache?.values?.() || []) {
    if (reaction.emoji?.id || isMatchingReaction(reaction, emoji)) continue;
    await reaction.users.remove(clientUserId).catch(() => null);
  }
  await boardMessage.react(emoji).catch(error => {
    console.warn(`⚠️ [STARBOARD] Mesaja ${emoji} tepkisi eklenemedi:`, error?.message || error);
  });
}

async function sendBoardCopy(client, message, count, config) {
  const targetChannel = await fetchTextChannel(client, config.channelId);
  if (!targetChannel) throw new Error("Starboard kanalı bulunamadı veya mesaj gönderilebilir değil.");

  const data = collectMessageData(message);
  let copiedFiles = data.attachments.length > 0;
  let boardMessage;

  try {
    boardMessage = await targetChannel.send(buildStarboardPayload(message, count, config.emoji, {
      includeFiles: copiedFiles,
      useAttachmentReferences: copiedFiles,
    }));
  } catch (fileError) {
    if (!copiedFiles) throw fileError;
    copiedFiles = false;
    console.warn("⚠️ [STARBOARD] Dosyalar yeniden yüklenemedi; CDN bağlantılarıyla tekrar deneniyor:", fileError?.message || fileError);
    boardMessage = await targetChannel.send(
      buildStarboardPayload(message, count, config.emoji)
    );
  }

  const entry = setEntry(message.guildId, message.id, {
    sourceMessageId: message.id,
    sourceChannelId: message.channelId,
    starboardMessageId: boardMessage.id,
    starboardChannelId: targetChannel.id,
    lastCount: count,
    copiedFiles,
    createdAt: Date.now(),
  });

  await syncBoardReaction(boardMessage, config.emoji, client.user.id);
  return entry;
}

async function editBoardCopy(client, message, count, config, entry, refreshFiles) {
  const boardMessage = await fetchMessage(client, entry.starboardChannelId, entry.starboardMessageId);
  if (!boardMessage) {
    deleteEntry(message.guildId, message.id);
    return sendBoardCopy(client, message, count, config);
  }

  let copiedFiles = entry.copiedFiles;
  if (refreshFiles) {
    const hasFiles = collectMessageData(message).attachments.length > 0;
    copiedFiles = hasFiles;
    try {
      await boardMessage.edit(buildStarboardPayload(message, count, config.emoji, {
        includeFiles: hasFiles,
        replaceAttachments: true,
        useAttachmentReferences: hasFiles,
      }));
    } catch (fileError) {
      copiedFiles = false;
      console.warn("⚠️ [STARBOARD] Düzenlenen dosyalar kopyalanamadı; CDN bağlantıları kullanılıyor:", fileError?.message || fileError);
      await boardMessage.edit(buildStarboardPayload(message, count, config.emoji, {
        replaceAttachments: true,
      }));
    }
  } else {
    await boardMessage.edit(buildStarboardPayload(message, count, config.emoji, {
      useAttachmentReferences: copiedFiles,
    }));
  }

  const updatedEntry = setEntry(message.guildId, message.id, {
    ...entry,
    lastCount: count,
    copiedFiles,
  });
  await syncBoardReaction(boardMessage, config.emoji, client.user.id);
  return updatedEntry;
}

async function synchronizeMessage(client, inputMessage, options = {}) {
  let message = inputMessage;
  if (message.partial) message = await message.fetch().catch(() => null);
  if (!message?.guildId || !message.id) return;

  const config = getGuildConfig(message.guildId);
  if (!config.enabled || !config.channelId) return;
  if (message.channelId === config.channelId) return;
  if (getEntryByStarboardMessage(message.guildId, message.id)) return;

  const count = await selectedReactionCount(message, config.emoji);
  const entry = getEntry(message.guildId, message.id);

  if (count < config.threshold) {
    if (entry) {
      deleteEntry(message.guildId, message.id);
      await deleteBoardCopy(client, entry);
    }
    return;
  }

  if (entry && entry.starboardChannelId !== config.channelId) {
    const movedEntry = await sendBoardCopy(client, message, count, config);
    if (movedEntry) await deleteBoardCopy(client, entry);
    return;
  }

  if (entry) {
    await editBoardCopy(client, message, count, config, entry, options.refreshFiles === true);
  } else {
    await sendBoardCopy(client, message, count, config);
  }
}

async function handleReactionChange(client, reaction, user) {
  if (user?.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    let message = reaction.message;
    if (message.partial) message = await message.fetch();
    if (!message.guildId) return;
    if (getEntryByStarboardMessage(message.guildId, message.id)) return;

    const config = getGuildConfig(message.guildId);
    if (!config.enabled || !config.channelId || !isMatchingReaction(reaction, config.emoji)) return;

    await enqueueSynchronization(`${message.guildId}:${message.id}`, () =>
      synchronizeMessage(client, message)
    );
  } catch (error) {
    console.error("🔴 [STARBOARD] Reaksiyon senkronizasyon hatası:", error);
  }
}

async function handleAllReactionsRemoved(client, inputMessage) {
  try {
    let message = inputMessage;
    if (message.partial) message = await message.fetch().catch(() => null);
    if (!message?.guildId || !getEntry(message.guildId, message.id)) return;
    await enqueueSynchronization(`${message.guildId}:${message.id}`, () =>
      synchronizeMessage(client, message)
    );
  } catch (error) {
    console.error("🔴 [STARBOARD] Reaksiyon temizleme senkronizasyon hatası:", error);
  }
}

async function handleReactionEmojiRemoved(client, reaction) {
  try {
    if (reaction.partial) await reaction.fetch();
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!message.guildId) return;
    const config = getGuildConfig(message.guildId);
    if (!isMatchingReaction(reaction, config.emoji)) return;
    await enqueueSynchronization(`${message.guildId}:${message.id}`, () =>
      synchronizeMessage(client, message)
    );
  } catch (error) {
    console.error("🔴 [STARBOARD] Emoji reaksiyonu temizleme hatası:", error);
  }
}

async function handleMessageUpdate(client, oldMessage, newMessage) {
  try {
    const guildId = newMessage.guildId || oldMessage.guildId;
    const messageId = newMessage.id || oldMessage.id;
    if (!guildId || !getEntry(guildId, messageId)) return;

    let message = newMessage;
    if (message.partial) message = await message.fetch().catch(() => null);
    if (!message) return;
    await enqueueSynchronization(`${guildId}:${messageId}`, () =>
      synchronizeMessage(client, message, { refreshFiles: true })
    );
  } catch (error) {
    console.error("🔴 [STARBOARD] Mesaj düzenleme senkronizasyon hatası:", error);
  }
}

async function handleMessageDelete(client, message) {
  if (!message?.guildId || !message.id) return;

  const boardEntry = getEntryByStarboardMessage(message.guildId, message.id);
  if (boardEntry) {
    deleteEntry(message.guildId, boardEntry.sourceMessageId);
    return;
  }

  const entry = deleteEntry(message.guildId, message.id);
  if (entry) await deleteBoardCopy(client, entry);
}

async function handleChannelDelete(client, channel) {
  if (!channel?.guildId) return;
  const config = getGuildConfig(channel.guildId);
  const entries = listEntries(channel.guildId);

  if (config.channelId === channel.id) {
    updateGuildConfig(channel.guildId, { enabled: false, channelId: null });
  }

  for (const entry of entries) {
    if (entry.starboardChannelId === channel.id) {
      deleteEntry(channel.guildId, entry.sourceMessageId);
    } else if (entry.sourceChannelId === channel.id) {
      deleteEntry(channel.guildId, entry.sourceMessageId);
      await deleteBoardCopy(client, entry);
    }
  }
}

async function reconcileGuild(client, guildId) {
  const entries = listEntries(guildId);
  for (const entry of entries) {
    await enqueueSynchronization(`${guildId}:${entry.sourceMessageId}`, async () => {
      try {
        const sourceMessage = await fetchMessage(client, entry.sourceChannelId, entry.sourceMessageId);
        if (!sourceMessage) {
          deleteEntry(guildId, entry.sourceMessageId);
          await deleteBoardCopy(client, entry);
          return;
        }
        await synchronizeMessage(client, sourceMessage);
      } catch (error) {
        console.error(`🔴 [STARBOARD] ${entry.sourceMessageId} kaydı uzlaştırılamadı:`, error);
      }
    });
  }
}

async function deleteEntryMessages(client, entries) {
  for (const entry of entries || []) await deleteBoardCopy(client, entry);
}

async function reconcileTrackedGuilds(client) {
  for (const guildId of client.guilds.cache.keys()) {
    if (listEntries(guildId).length === 0) continue;
    await reconcileGuild(client, guildId);
  }
}

function setupStarboard(client) {
  const safely = (label, handler) => (...args) => {
    void Promise.resolve(handler(...args)).catch(error => {
      console.error(`🔴 [STARBOARD] ${label}:`, error);
    });
  };

  client.on(Events.MessageReactionAdd, safely("Reaksiyon ekleme event hatası", (reaction, user) =>
    handleReactionChange(client, reaction, user)
  ));
  client.on(Events.MessageReactionRemove, safely("Reaksiyon kaldırma event hatası", (reaction, user) =>
    handleReactionChange(client, reaction, user)
  ));
  client.on(Events.MessageReactionRemoveAll, safely("Toplu reaksiyon temizleme event hatası", message =>
    handleAllReactionsRemoved(client, message)
  ));
  client.on(Events.MessageReactionRemoveEmoji, safely("Emoji reaksiyonu temizleme event hatası", reaction =>
    handleReactionEmojiRemoved(client, reaction)
  ));
  client.on(Events.MessageUpdate, safely("Mesaj güncelleme event hatası", (oldMessage, newMessage) =>
    handleMessageUpdate(client, oldMessage, newMessage)
  ));
  client.on(Events.MessageDelete, safely("Mesaj silme event hatası", message =>
    handleMessageDelete(client, message)
  ));
  client.on(Events.ChannelDelete, safely("Kanal silme event hatası", channel =>
    handleChannelDelete(client, channel)
  ));
  client.once(Events.ClientReady, safely("Başlangıç uzlaştırma hatası", readyClient =>
    reconcileTrackedGuilds(readyClient)
  ));
}

module.exports = {
  STARBOARD_COLOR,
  buildStarboardPayload,
  deleteEntryMessages,
  isMatchingReaction,
  isValidUnicodeEmoji,
  reconcileGuild,
  setupStarboard,
};
