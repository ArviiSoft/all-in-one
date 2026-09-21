const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");
const { readJson, writeJson } = require("../Core/fileDB");
const emojiler = require("../Emojis/emojiler.js");

const DB_PATH = path.join(process.cwd(), "Database", "Güvenlik ve Moderasyon", "honeypot.json");

function readHoneypotDB() {
  return readJson(DB_PATH, {});
}

function writeHoneypotDB(data) {
  writeJson(DB_PATH, data);
}

function getPanelThumbnail(guild, client) {
  return (
    guild?.iconURL?.({ dynamic: true, size: 256 }) ||
    client?.user?.displayAvatarURL?.({ dynamic: true, size: 256 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png"
  );
}

function buildHoneypotPanel(guild, kickCount = 0, client) {
  const thumbnail = new ThumbnailBuilder()
    .setURL(getPanelThumbnail(guild, client))
    .setDescription(guild?.name || "Honeypot Koruma");

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
      `## ${emojiler.uyari} BU KANALA MESAJ GÖNDERMEYİN \n` +
          "Bu kanal, spam botlarını yakalamak için kullanılır. Buraya gönderilen her türlü mesaj **sunucudan atılma** ile sonuçlanacaktır."
      )
    )
    .setThumbnailAccessory(thumbnail);

  const countRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("honeypot_kick_count")
      .setEmoji(`${emojiler.suspected_spam_activ}`)
      .setLabel(`Atılanlar: ${Number(kickCount) || 0}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  return new ContainerBuilder()
    .addSectionComponents(section)
    .addActionRowComponents(countRow);
}

function truncate(text, max = 900) {
  const value = String(text ?? "");
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 30))} \n...ve (${value.length - max} karakter) daha`;
}

function safeCodeBlock(text, max = 1200) {
  const value = truncate(text || "Metin içeriği yok.", max).replace(/```/g, "`\u200b``");
  return `\`\`\`txt\n${value}\n\`\`\``;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "*Yok*";
  const unix = Math.floor(timestamp / 1000);
  return `<t:${unix}:F> (**<t:${unix}:R>**)`;
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(2)} MB`;
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
}

function formatBool(value) {
  return value ? "Evet" : "Hayır";
}

function formatRoleList(member) {
  if (!member?.roles?.cache) return "*Üye bilgisi alınamadı.*";

  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`);

  if (!roles.length) return "*Rol yok.*";

  const shown = roles.slice(0, 20).join(", ");
  return roles.length > 20 ? `${shown}\n-# +***(${roles.length - 20} rol)** daha*` : shown;
}

function formatCriticalPermissions(member) {
  if (!member?.permissions) return "Üye bilgisi alınamadı.";

  const critical = [
    "Administrator",
    "ManageGuild",
    "ManageRoles",
    "ManageChannels",
    "ManageWebhooks",
    "BanMembers",
    "KickMembers",
    "ModerateMembers",
    "ManageMessages",
  ].filter((permission) => member.permissions.has(permission));

  return critical.length ? critical.join(", ") : "*Kritik izin yok.*";
}

function getSnapshotAttachments(mediaSnapshot) {
  return Array.isArray(mediaSnapshot?.attachments) ? mediaSnapshot.attachments : [];
}

function getMessageAttachments(message) {
  return [...(message.attachments?.values?.() ?? [])].map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
    width: attachment.width,
    height: attachment.height,
    spoiler: attachment.spoiler,
    url: attachment.url,
    proxyURL: attachment.proxyURL,
    displayURL: attachment.proxyURL || attachment.url,
  }));
}

function getStoredAttachments(message, mediaSnapshot) {
  const snapshotAttachments = getSnapshotAttachments(mediaSnapshot);
  return snapshotAttachments.length ? snapshotAttachments : getMessageAttachments(message);
}

function getAttachmentLines(message, mediaSnapshot) {
  const attachments = getStoredAttachments(message, mediaSnapshot);
  if (!attachments.length) return "*Ek yok.*";

  return attachments
    .map((attachment, index) => {
      const dimensions = attachment.width && attachment.height ? ` **|** ${attachment.width}x${attachment.height}` : "";
      const spoiler = attachment.spoiler ? " **|** Spoiler" : "";
      const openUrl = attachment.url || attachment.displayURL || attachment.proxyURL;
      return [
        `**${index + 1}. ${attachment.name || "dosya"}**`,
        `**ID:** \`${attachment.id}\``,
        `**Tür:** \`${attachment.contentType || "*Bilinmiyor*"}\``,
        `**Boyut:** \`${formatBytes(attachment.size)}\`${dimensions}${spoiler}`,
        openUrl ? `[**__Dosyayı Aç__**](${openUrl})` : "**Dosya linki yok**",
      ].join(" **|** ");
    })
    .join("\n");
}

function getMediaAttachments(message, mediaSnapshot) {
  return getStoredAttachments(message, mediaSnapshot)
    .filter((attachment) => {
      const type = attachment.contentType || "";
      return (type.startsWith("image/") || type.startsWith("video/")) && Boolean(attachment.displayURL || attachment.proxyURL || attachment.url);
    })
    .slice(0, 10);
}

function getStickerLines(message) {
  const stickers = [...(message.stickers?.values?.() ?? [])];
  if (!stickers.length) return "*Sticker yok.*";

  return stickers
    .map((sticker) => `\`${sticker.name}\` (${sticker.id}) **|** **Format:** ${sticker.format || "*Bilinmiyor*"}`)
    .join("\n");
}

function getEmbedLines(message) {
  const embeds = message.embeds || [];
  if (!embeds.length) return "*Embed yok.*";

  return embeds
    .slice(0, 5)
    .map((embed, index) => {
      const parts = [
        `**${index + 1}. Embed**`,
        `**Tip:** \`${embed.type || "Bilinmiyor"}\``,
        embed.title ? `**Başlık:** ${truncate(embed.title, 120)}` : null,
        embed.description ? `**Açıklama:** ${truncate(embed.description, 180)}` : null,
        embed.url ? `[**__URL__**](${embed.url})` : null,
      ].filter(Boolean);

      return parts.join(" **|** ");
    })
    .join("\n");
}

function getMentionLines(message) {
  const users = message.mentions?.users?.map((user) => `<@${user.id}> (\`${user.id}\`)`) ?? [];
  const roles = message.mentions?.roles?.map((role) => `<@&${role.id}> (\`${role.id}\`)`) ?? [];
  const channels = message.mentions?.channels?.map((channel) => `<#${channel.id}> (\`${channel.id}\`)`) ?? [];

  return [
    `**Kişiler:** ${users.length ? truncate(users.join(", "), 350) : "*Yok*"}`,
    `**Roller:** ${roles.length ? truncate(roles.join(", "), 350) : "*Yok*"}`,
    `**Kanallar:** ${channels.length ? truncate(channels.join(", "), 350) : "*Yok*"}`,
    `**@everyone/@here:** *${formatBool(message.mentions?.everyone)}*`,
  ].join("\n");
}

function getInteractionMetadataUser(message) {
  let metadata = message.interactionMetadata;
  while (metadata) {
    if (metadata.user) return metadata.user;
    metadata = metadata.triggeringInteractionMetadata;
  }

  return message.interaction?.user || null;
}

function formatExtraContext(contextTitle, contextLines) {
  const lines = Array.isArray(contextLines) ? contextLines.filter(Boolean) : [];
  if (!contextTitle && !lines.length) return "";

  return [
    `## ${contextTitle || "Honeypot Bağlamı"}`,
    ...lines,
  ].join("\n");
}

function buildHoneypotLogPanel({ message, offenderUser, member, kickStatus, deleteStatus, deleteReason, mediaSnapshot, kickCount, contextTitle, contextLines, client }) {
  const user = offenderUser || message.author;
  const avatar = user.displayAvatarURL?.({ dynamic: true, size: 256 }) || client?.user?.displayAvatarURL?.({ dynamic: true, size: 256 }) || "https://cdn.discordapp.com/embed/avatars/0.png";
  const guild = message.guild;
  const memberJoined = member?.joinedTimestamp ? formatTimestamp(member.joinedTimestamp) : "Üye bilgisi alınamadı.";
  const userCreated = formatTimestamp(user.createdTimestamp);
  const highestRole = member?.roles?.highest ? `<@&${member.roles.highest.id}> (\`${member.roles.highest.id}\`)` : "Yok";
  const permissions = formatCriticalPermissions(member);
  const messageFlags = message.flags?.toArray?.().join(", ") || "Yok";
  const storedAttachments = getStoredAttachments(message, mediaSnapshot);
  const mediaAttachments = getMediaAttachments(message, mediaSnapshot);
  const attachmentSource = mediaSnapshot?.attachments?.length ? "DB snapshot" : "Mesaj objesi";
  const interactionUser = getInteractionMetadataUser(message);
  const messageAuthor = message.author;
  const extraContext = formatExtraContext(contextTitle, contextLines);

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
          `${emojiler.tasi} **Sonuç:** ${kickStatus} \n` +
          `${emojiler.hashtag} **Kanal:** <#${message.channelId}> \n` +
          `${emojiler.arti} **Toplam Atılma:** ${Number(kickCount) || 0}`
      )
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatar)
        .setDescription(user.tag || user.username)
    );

  const userInfo = [
    `## Kişi Bilgileri`,
    `${emojiler.kullanici} **Kişi:** <@${user.id}>`,
    `🆔 **ID:** \`${user.id}\``,
    `📛 **Tag:** \`${user.tag || "Yok"}\``,
    `${emojiler.info} **Kişi adı:** \`${user.username}\``,
    `🌍 **Global ad:** \`${user.globalName || "Yok"}\``,
    `${emojiler.uye} **Sunucuda görünen ad:** \`${member?.displayName || "*Yok*"}\``,
    `${emojiler.bot} **Bot mu?:** *${formatBool(user.bot)}* **|** 💻 **Sistem kullanıcısı mı?:** *${formatBool(user.system)}  *`,
    `${emojiler.Takvim} **Hesap oluşturma:** ${userCreated}`,
    `${emojiler.Takvim} **Sunucuya katılma:** ${memberJoined}`,
    `${emojiler.motto} **Avatar:** [**__Aç__**](${avatar})`,
  ].join("\n");

  const memberInfo = [
    `## Üyelik / Rol Bilgileri`,
    `${emojiler.home} **Sunucu:** ${guild.name} (\`${guild.id}\`)`,
    `${emojiler.ara} **Takma ad:** \`${member?.nickname || "Yok"}\``,
    `🔝 **En yüksek rol:** ${highestRole}`,
    `🔢 **Rol sayısı:** *${member?.roles?.cache ? Math.max(member.roles.cache.size - 1, 0) : 0}*`,
    `${emojiler.modernsagok} **Roller:** ${truncate(formatRoleList(member), 900)}`,
    `${emojiler.dikkat} **Kritik izinler:** ${permissions}`,
    `${emojiler.kullanici} **Atılabilir mi?:** *${formatBool(member?.kickable)}*`,
  ].join("\n");

  const messageInfo = [
    `## Mesaj Bilgileri`,
    `${emojiler.kullanici} **Cezalandırılan hesap:** <@${user.id}> (\`${user.id}\`)`,
    `${emojiler.bot} **Mesajı atan hesap/bot:** ${messageAuthor?.id ? `<@${messageAuthor.id}> (\`${messageAuthor.id}\`)` : "*Yok*"}`,
    `${emojiler.sadesagok} **Interaction tetikleyen:** ${interactionUser?.id ? `<@${interactionUser.id}> (\`${interactionUser.id}\`)` : "*Yok*"}`,
    `🆔 **Mesaj ID:** \`${message.id}\``,
    `${emojiler.donensaat} **Gönderilme zamanı:** ${formatTimestamp(message.createdTimestamp)}`,
    `${emojiler.ara} **Mesaj tipi:** \`${message.type}\` **|** 🔉 **TTS:** *${formatBool(message.tts)}* **|** 📍 **Sabitlenmiş:** *${formatBool(message.pinned)}*`,
    `🔗 **Webhook ID:** \`${message.webhookId || "Yok"}\``,
    `🏷️ **Mesaj Flags:** \`${messageFlags}\``,
    `🔗 **Ek sayısı:** *${storedAttachments.length}* **|** 🎨 **Sticker:** *${message.stickers?.size || 0}* **|** 📊 **Embed:** *${message.embeds?.length || 0}* **|** 🧩 **Component:** *${message.components?.length || 0}* \n`,
    `${emojiler.sadesagok} **Mentionlar** \n${getMentionLines(message)} \n`,
    `${emojiler.kategori} **İçerik:** \n${safeCodeBlock(message.content)}`,
  ].join("\n");

  const payloadInfo = [
    `## Gönderilen Ek İçerikler`,
    `**Kaynak:** \`${attachmentSource}\``,
    `📂 **Dosyalar:** \n${truncate(getAttachmentLines(message, mediaSnapshot), 1400)} \n`,
    `🎨 **Stickerlar:** \n${truncate(getStickerLines(message), 500)} \n`,
    `📊 **Embedler:** \n${truncate(getEmbedLines(message), 800)}`,
  ].join("\n");

  const actionInfo = [
    `## Ceza / İşlem Bilgisi`,
    `${emojiler.networkerror} **Temizlik sonucu:** *${deleteStatus || "Bilinmiyor"}*`,
    `**${emojiler.delete_guild} Temizlik sebebi:** *${deleteReason || "Belirtilmedi."}*`,
    `${emojiler.ban} **Uygulanan işlem:** *Sunucudan atma*`,
    `${emojiler.sadesagok} **İşlem sonucu:** *${kickStatus}*`,
    `${emojiler.donensaat} **İşlem zamanı:** ${formatTimestamp(Date.now())}`,
  ].join("\n");

  const container = new ContainerBuilder()
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

    .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(userInfo, 1900)))

    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

    .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(memberInfo, 1900)));

  if (extraContext) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(extraContext, 1900)));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

    .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(messageInfo, 2900)))

    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

    .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(payloadInfo, 2500)));

  if (mediaAttachments.length) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        mediaAttachments.map((attachment) =>
          new MediaGalleryItemBuilder()
            .setURL(attachment.displayURL || attachment.proxyURL || attachment.url)
            .setDescription(attachment.name || attachment.contentType || "Honeypot medya")
        )
      )
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(actionInfo));

  return container;
}

function strictTruncate(text, max = 900) {
  const value = String(text ?? "");
  if (value.length <= max) return value;

  const suffix = `\n...ve (${Math.max(0, value.length - max)} karakter) daha`;
  if (suffix.length >= max) return value.slice(0, max);

  return `${value.slice(0, max - suffix.length)}${suffix}`;
}

function buildPagedHeader({ title, message, user, avatar, kickStatus, kickCount }) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(strictTruncate(
        `## ${title}\n` +
        `${emojiler.tasi} **Sonuc:** ${kickStatus}\n` +
        `${emojiler.hashtag} **Kanal:** <#${message.channelId}>\n` +
        `${emojiler.arti} **Toplam Atılma:** ${Number(kickCount) || 0}`,
        450
      ))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatar)
        .setDescription(strictTruncate(user.tag || user.username || user.id, 80))
    );
}

function addPagedText(container, text, max) {
  const value = strictTruncate(text, max);
  if (!value.trim()) return container;

  return container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(value));
}

function buildPagedContainer({ title, message, user, avatar, kickStatus, kickCount, blocks, mediaAttachments }) {
  const container = new ContainerBuilder()
    .addSectionComponents(buildPagedHeader({ title, message, user, avatar, kickStatus, kickCount }));

  for (const block of blocks) {
    addPagedText(container, block.text, block.max);
  }

  if (mediaAttachments?.length) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        mediaAttachments.map((attachment) =>
          new MediaGalleryItemBuilder()
            .setURL(attachment.displayURL || attachment.proxyURL || attachment.url)
            .setDescription(strictTruncate(attachment.name || attachment.contentType || "Honeypot medya", 80))
        )
      )
    );
  }

  return container;
}

function buildHoneypotLogPanels({ message, offenderUser, member, kickStatus, kickReason, deleteStatus, deleteReason, mediaSnapshot, kickCount, contextTitle, contextLines, client }) {
  const user = offenderUser || message.author;
  const avatar = user.displayAvatarURL?.({ dynamic: true, size: 256 }) || client?.user?.displayAvatarURL?.({ dynamic: true, size: 256 }) || "https://cdn.discordapp.com/embed/avatars/0.png";
  const guild = message.guild;
  const memberJoined = member?.joinedTimestamp ? formatTimestamp(member.joinedTimestamp) : "Uye bilgisi alinamadi.";
  const userCreated = formatTimestamp(user.createdTimestamp);
  const highestRole = member?.roles?.highest ? `<@&${member.roles.highest.id}> (\`${member.roles.highest.id}\`)` : "Yok";
  const permissions = formatCriticalPermissions(member);
  const messageFlags = message.flags?.toArray?.().join(", ") || "Yok";
  const storedAttachments = getStoredAttachments(message, mediaSnapshot);
  const mediaAttachments = getMediaAttachments(message, mediaSnapshot);
  const attachmentSource = mediaSnapshot?.attachments?.length ? "DB snapshot" : "Mesaj objesi";
  const interactionUser = getInteractionMetadataUser(message);
  const messageAuthor = message.author;
  const extraContext = formatExtraContext(contextTitle, contextLines);

  const userInfo = [
    "## Kişi Bilgileri",
    `${emojiler.kullanici} **Kişi:** <@${user.id}>`,
    `🆔 **ID:** \`${user.id}\``,
    `📛 **Tag:** \`${user.tag || "Yok"}\``,
    `${emojiler.info} **Kullanıcı adı:** \`${user.username}\``,
    `🌍 **Global ad:** \`${user.globalName || "Yok"}\``,
    `${emojiler.uye} **Sunucuda görünen ad:** \`${member?.displayName || "*Yok*"}\``,
    `${emojiler.bot} **Bot mu?:** *${formatBool(user.bot)}* **|** 💻 **Sistem kullanıcısı mı?:** *${formatBool(user.system)}*`,
    `${emojiler.Takvim} **Hesap oluşturma:** ${userCreated}`,
    `${emojiler.Takvim} **Sunucuya katılma:** ${memberJoined}`,
    `${emojiler.motto} **Avatar:** [**__Ac__**](${avatar})`,
  ].join("\n");

  const memberInfo = [
    "## Üyelik / Rol Bilgileri",
    `${emojiler.home} **Sunucu:** ${guild.name} (\`${guild.id}\`)`,
    `${emojiler.ara} **Takma ad:** \`${member?.nickname || "Yok"}\``,
    `🔝 **En yüksek rol:** ${highestRole}`,
    `🔢 **Rol sayısı:** *${member?.roles?.cache ? Math.max(member.roles.cache.size - 1, 0) : 0}*`,
    `${emojiler.modernsagok} **Roller:** ${strictTruncate(formatRoleList(member), 700)}`,
    `${emojiler.dikkat} **Kritik izinler:** ${permissions}`,
    `${emojiler.kullanici} **Atilabilir mi?:** *${formatBool(member?.kickable)}*`,
  ].join("\n");

  const messageInfo = [
    "## Mesaj / Interaction Bilgileri",
    `${emojiler.kullanici} **Cezalandırılan hesap:** <@${user.id}> (\`${user.id}\`)`,
    `${emojiler.bot} **Mesajı atan hesap/bot:** ${messageAuthor?.id ? `<@${messageAuthor.id}> (\`${messageAuthor.id}\`)` : "*Yok*"}`,
    `${emojiler.sadesagok} **Interaction tetikleyen:** ${interactionUser?.id ? `<@${interactionUser.id}> (\`${interactionUser.id}\`)` : "*Yok*"}`,
    `🆔 **Mesaj/İşlem ID:** \`${message.id}\``,
    `${emojiler.donensaat} **Zaman:** ${formatTimestamp(message.createdTimestamp)}`,
    `${emojiler.ara} **Tip:** \`${message.type}\` **|** 🔉 **TTS:** *${formatBool(message.tts)}* **|** 📍 **Sabitlenmiş:** *${formatBool(message.pinned)}*`,
    `🔗 **Webhook ID:** \`${message.webhookId || "Yok"}\``,
    `🏷️ **Flags:** \`${messageFlags}\``,
    `🔗 **Ek:** *${storedAttachments.length}* **|** 🎨 **Sticker:** *${message.stickers?.size || 0}* **|** 📊 **Embed:** *${message.embeds?.length || 0}* **|** 🧩 **Component:** *${message.components?.length || 0}* \n`,
    `${emojiler.sadesagok} **Mentionlar**\n${getMentionLines(message)} \n`,
    `${emojiler.kategori} **İçerik:**\n${safeCodeBlock(message.content, 1000)}`,
  ].join("\n");

  const payloadInfo = [
    "## Gönderilen Ek İçerikler",
    `**Kaynak:** \`${attachmentSource}\``,
    `📂 **Dosyalar:** \n${strictTruncate(getAttachmentLines(message, mediaSnapshot), 1100)}`,
    `🎨 **Stickerlar:** \n${strictTruncate(getStickerLines(message), 350)}`,
    `📊 **Embedler:** \n${strictTruncate(getEmbedLines(message), 500)}`,
  ].join("\n\n");

  const actionInfo = [
    "## Ceza / İşlem Bilgisi",
    `${emojiler.networkerror} **Temizlik sonucu:** *${deleteStatus || "Bilinmiyor"}*`,
    `**${emojiler.delete_guild} Temizlik sebebi:** *${deleteReason || "Belirtilmedi."}*`,
    `${emojiler.ban} **Uygulanan işlem:** *Sunucudan atma*`,
    `${emojiler.sadesagok} **İşlem sonucu:** *${kickStatus}*`,
    `${emojiler.glowingquestion} **Kick sebebi:** *${strictTruncate(kickReason || "Belirtilmedi.", 550)}*`,
    `${emojiler.donensaat} **İşlem zamanı:** ${formatTimestamp(Date.now())}`,
  ].join("\n");

  const shared = { message, user, avatar, kickStatus, kickCount };
  return [
    buildPagedContainer({
      ...shared,
      title: "1/4 - Kişi",
      blocks: [
        { text: userInfo, max: 1350 },
        { text: memberInfo, max: 1350 },
      ],
    }),
    buildPagedContainer({
      ...shared,
      title: "2/4 - Mesaj",
      blocks: [
        { text: extraContext, max: 800 },
        { text: messageInfo, max: 2200 },
      ],
    }),
    buildPagedContainer({
      ...shared,
      title: "3/4 - Ekler",
      blocks: [
        { text: payloadInfo, max: 2200 },
      ],
      mediaAttachments,
    }),
    buildPagedContainer({
      ...shared,
      title: "4/4 - İşlem",
      blocks: [
        { text: actionInfo, max: 1200 },
      ],
    }),
  ];
}

module.exports = {
  DB_PATH,
  buildHoneypotLogPanel,
  buildHoneypotLogPanels,
  buildHoneypotPanel,
  readHoneypotDB,
  writeHoneypotDB,
};
