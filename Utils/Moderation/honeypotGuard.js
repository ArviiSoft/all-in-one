const { Collection, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { buildHoneypotLogPanels, buildHoneypotPanel, readHoneypotDB, writeHoneypotDB } = require("./honeypot");

const HONEYPOT_BLOCK_FLAG = "__honeypotBlocked";
const activeKicks = new Set();

function emptyCollection() {
  return new Collection();
}

function createVirtualMessage({ id, guild, channel, channelId, author, content, type, createdTimestamp }) {
  return {
    id,
    guild,
    channel,
    channelId,
    author,
    content: content || "",
    createdTimestamp: createdTimestamp || Date.now(),
    type: type || "HoneypotVirtual",
    tts: false,
    pinned: false,
    webhookId: null,
    flags: { toArray: () => [] },
    attachments: emptyCollection(),
    stickers: emptyCollection(),
    embeds: [],
    components: [],
    mentions: {
      users: emptyCollection(),
      roles: emptyCollection(),
      channels: emptyCollection(),
      everyone: false,
    },
  };
}

async function fetchGuildChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

function resolveHoneypotContext(guildData, channel, fallbackChannelId) {
  if (!guildData?.channels) return null;

  const directId = channel?.id || fallbackChannelId;
  if (directId && guildData.channels[directId]) {
    return {
      protectedChannelId: directId,
      sourceChannelId: directId,
      entry: guildData.channels[directId],
      isThread: false,
      threadId: null,
    };
  }

  if (channel?.isThread?.() && channel.parentId && guildData.channels[channel.parentId]) {
    return {
      protectedChannelId: channel.parentId,
      sourceChannelId: channel.id,
      entry: guildData.channels[channel.parentId],
      isThread: true,
      threadId: channel.id,
    };
  }

  return null;
}

async function updatePanel(guild, protectedChannelId, entry, client) {
  if (!entry?.messageId) return;

  const channel = await fetchGuildChannel(guild, protectedChannelId);
  if (!channel?.isTextBased?.()) return;

  const panelMessage = await channel.messages.fetch(entry.messageId).catch(() => null);
  if (!panelMessage) return;

  await panelMessage.edit({
    components: [buildHoneypotPanel(guild, entry.kickCount, client)],
    flags: MessageFlags.IsComponentsV2,
  }).catch((error) => {
    console.error(`🔴 [HONEYPOT] Panel güncellenemedi ( ${protectedChannelId} ):`, error);
  });
}

async function sendLog({
  guild,
  logMessage,
  offenderUser,
  member,
  botMember,
  guildData,
  entry,
  kickStatus,
  kickReason,
  deleteStatus,
  deleteReason,
  mediaSnapshot,
  contextTitle,
  contextLines,
  client,
}) {
  if (!guildData?.logChannelId) return;

  const logChannel = await fetchGuildChannel(guild, guildData.logChannelId);
  if (!logChannel?.isTextBased?.()) return;
  if (!botMember) return;

  const permissions = logChannel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

  const panels = buildHoneypotLogPanels({
    message: logMessage,
    offenderUser,
    member,
    botMember,
    kickStatus,
    kickReason,
    deleteStatus,
    deleteReason,
    mediaSnapshot,
    kickCount: entry.kickCount,
    contextTitle,
    contextLines,
    client,
  });

  for (let index = 0; index < panels.length; index++) {
    try {
      await logChannel.send({
        components: [panels[index]],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(`🔴 [HONEYPOT] Log sayfası gönderilemedi ( ${guild.id}/${logMessage.id}/${index + 1} ):`, error);
    }
  }

  return;
}

function createMediaSnapshot(message, offenderUser) {
  const attachments = [...(message.attachments?.values?.() ?? [])].map((attachment) => {
    const contentType = attachment.contentType || "";

    return {
      id: attachment.id,
      name: attachment.name || "dosya",
      contentType,
      size: attachment.size || 0,
      width: attachment.width || null,
      height: attachment.height || null,
      spoiler: Boolean(attachment.spoiler),
      url: attachment.url,
      proxyURL: attachment.proxyURL,
      displayURL: attachment.proxyURL || attachment.url,
      isMedia: contentType.startsWith("image/") || contentType.startsWith("video/"),
    };
  });

  return {
    messageId: message.id,
    channelId: message.channelId,
    authorId: message.author?.id || null,
    offenderId: offenderUser?.id || message.author?.id || null,
    savedAt: Date.now(),
    attachments,
  };
}

function saveMediaSnapshot(guildData, snapshot, limit = 100) {
  if (!snapshot?.attachments?.length) return false;

  if (!guildData.mediaLogs) guildData.mediaLogs = {};
  guildData.mediaLogs[snapshot.messageId] = snapshot;

  const entries = Object.entries(guildData.mediaLogs)
    .sort(([, a], [, b]) => (b.savedAt || 0) - (a.savedAt || 0));

  guildData.mediaLogs = Object.fromEntries(entries.slice(0, limit));
  return true;
}

async function deleteHoneypotMessage(message, botMember) {
  if (!message) {
    return {
      status: "Yok",
      reason: "Temizlenecek mesaj bulunamadı.",
    };
  }

  if (!botMember) {
    return {
      status: "Başarısız",
      reason: "Botun sunucu üyesi bilgisi alınamadı.",
    };
  }

  const permissions = message.channel?.permissionsFor?.(botMember);
  if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
    return {
      status: "Başarısız",
      reason: 'Botun Honeypot kanalında "Mesajları Yönet" yetkisi yok.',
    };
  }

  if (!message.deletable) {
    return {
      status: "Başarısız",
      reason: "Mesaj, Discord tarafinda silinebilir durumda değil.",
    };
  }

  try {
    await message.delete();
    return {
      status: "Başarılı",
      reason: "Mesaj, kick işleminden önce silindi.",
    };
  } catch (error) {
    return {
      status: "Başarısız",
      reason: error?.message || "Mesaj silinirken hata oluştu.",
    };
  }
}

async function deleteInteractionSource(interaction, botMember) {
  if (!interaction.message?.delete) {
    return {
      status: "Yok",
      reason: "Interaction için kanalda temizlenecek görünen mesaj oluşmadı.",
    };
  }

  return deleteHoneypotMessage(interaction.message, botMember);
}

async function deleteHoneypotThread(thread, botMember) {
  if (!botMember) {
    return {
      status: "Başarısız",
      reason: "Botun sunucu üyesi bilgisi alınamadı.",
    };
  }

  const permissions = thread.permissionsFor?.(botMember);
  if (!permissions?.has(PermissionFlagsBits.ManageThreads)) {
    return {
      status: "Başarısız",
      reason: 'Botun Honeypot kanalında "Threadleri Yönet" yetkisi yok.',
    };
  }

  try {
    await thread.delete("Honeypot Koruma: Korumalı kanalda Thread oluşturuldu.");
    return {
      status: "Başarılı",
      reason: "Thread tamamen silindi.",
    };
  } catch (error) {
    return {
      status: "Başarısız",
      reason: error?.message || "Thread silinirken hata oluştu.",
    };
  }
}

function getMetadataUser(metadata) {
  let current = metadata;
  while (current) {
    if (current.user) return current.user;
    current = current.triggeringInteractionMetadata;
  }

  return null;
}

function getMessageOffenderUser(message) {
  return getMetadataUser(message.interactionMetadata) || message.interaction?.user || message.author;
}

function formatMessageContextLines(message, context, offenderUser) {
  const lines = [
    `**Kaynak:** ${context.isThread ? "*Thread mesajı*" : "*Kanal mesajı*"}`,
    `**Honeypot kanalı:** <#${context.protectedChannelId}> (\`${context.protectedChannelId}\`)`,
  ];

  if (context.isThread) {
    lines.push(`**Thread:** <#${context.threadId}> (\`${context.threadId}\`)`);
  }

  if (message.author?.id && message.author.id !== offenderUser?.id) {
    lines.push(`**Mesajı atan hesap/bot:** <@${message.author.id}> (\`${message.author.id}\`)`);
  }

  const interactionUser = getMetadataUser(message.interactionMetadata) || message.interaction?.user;
  if (interactionUser) {
    lines.push(`**Komutu/Interaction'ı tetikleyen:** <@${interactionUser.id}> (\`${interactionUser.id}\`)`);
  }

  if (message.interactionMetadata?.authorizingIntegrationOwners) {
    lines.push(`**Integration sahipleri:** \`${JSON.stringify(message.interactionMetadata.authorizingIntegrationOwners)}\``);
  }

  return lines;
}

function serializeInteractionOption(option) {
  return {
    name: option.name,
    type: option.type,
    value: option.value ?? null,
    userId: option.user?.id ?? null,
    memberId: option.member?.id ?? null,
    channelId: option.channel?.id ?? null,
    roleId: option.role?.id ?? null,
    options: option.options?.map(serializeInteractionOption) ?? [],
  };
}

function formatInteractionContent(interaction, context) {
  const options = interaction.options?.data?.map(serializeInteractionOption) ?? [];
  const lines = [
    "Honeypot Interaction ihlali.",
    `Interaction ID: ${interaction.id}`,
    `Interaction türü: ${interaction.type}`,
    `Kanal ID: ${interaction.channelId || "*Yok*"}`,
    `Honeypot kanal ID: ${context.protectedChannelId}`,
    `Thread ID: ${context.threadId || "*Yok*"}`,
    `Komut: ${interaction.commandName ? `/${interaction.commandName}` : "*Yok*"}`,
    `Komut ID: ${interaction.commandId || "*Yok*"}`,
    `Komut türü: ${interaction.commandType || "*Yok*)"}`,
    `Custom ID: ${interaction.customId || "*Yok*"}`,
    `Component türü: ${interaction.componentType || "*Yok*"}`,
    `Target ID: ${interaction.targetId || "*Yok*"}`,
    `Local: ${interaction.locale || "*Yok*"}`,
    `Guild local: ${interaction.guildLocale || "*Yok*"}`,
    `Application ID: ${interaction.applicationId || "*Yok*"}`,
    `User install / integration owners: ${interaction.authorizingIntegrationOwners ? JSON.stringify(interaction.authorizingIntegrationOwners) : "*Yok*"}`,
    `Member izinleri: ${interaction.memberPermissions?.toArray?.().join(", ") || "*Yok*"}`,
    `App izinleri: ${interaction.appPermissions?.toArray?.().join(", ") || "*Yok*"}`,
  ];

  if (options.length) {
    lines.push(`Opsiyonlar:\n${JSON.stringify(options, null, 2)}`);
  }

  return lines.join("\n");
}

function formatInteractionContextLines(interaction, context) {
  const lines = [
    "**Kaynak:** Discord interaction",
    `**Honeypot kanalı:** <#${context.protectedChannelId}> (\`${context.protectedChannelId}\`)`,
    `**Interaction ID:** \`${interaction.id}\``,
  ];

  if (context.isThread) {
    lines.push(`**Thread:** <#${context.threadId}> (\`${context.threadId}\`)`);
  }

  if (interaction.commandName) lines.push(`**Komut:** \`/${interaction.commandName}\``);
  if (interaction.customId) lines.push(`**Custom ID:** \`${interaction.customId}\``);
  if (interaction.authorizingIntegrationOwners) {
    lines.push(`**Integration sahipleri:** \`${JSON.stringify(interaction.authorizingIntegrationOwners)}\``);
  }

  return lines;
}

function formatThreadContextLines(thread, context, newlyCreated) {
  return [
    "**Kaynak:** *Thread oluşturma*",
    `**Honeypot kanalı:** <#${context.protectedChannelId}> (\`${context.protectedChannelId}\`)`,
    `**Thread:** <#${thread.id}> (\`${thread.id}\`)`,
    `**Thread adı:** \`${thread.name || "*Yok*"}\``,
    `**Owner ID:** \`${thread.ownerId || "*Yok*"}\``,
    `**Yeni oluşturuldu mu?:** \`${Boolean(newlyCreated)}\``,
  ];
}

function formatThreadContent(thread, context, newlyCreated) {
  return [
    "Honeypot Thread oluşturma ihlali.",
    `Thread ID: ${thread.id}`,
    `Thread adı: ${thread.name || "*Yok*"}`,
    `Parent kanal ID: ${context.protectedChannelId}`,
    `Owner ID: ${thread.ownerId || "*Yok*"}`,
    `Yeni oluşturuldu mu?: ${Boolean(newlyCreated)}`,
    `Arşivli mi?: ${Boolean(thread.archived)}`,
    `Kilitli mi?: ${Boolean(thread.locked)}`,
    `Mesaj sayısı: ${thread.messageCount ?? "*Bilinmiyor*"}`,
    `Üye sayısı: ${thread.memberCount ?? "*Bilinmiyor*"}`,
  ].join("\n");
}

async function kickMember({ guild, offenderUser, member, botMember, reason }) {
  if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
    return {
      status: "Başarısız",
      reason: 'Botta "Üyeleri At" yetkisi yok.',
      member,
    };
  }

  const targetMember = member?.kickable !== undefined
    ? member
    : await guild.members.fetch(offenderUser.id).catch(() => null);

  if (!targetMember) {
    return {
      status: "Başarısız",
      reason: "Üye sunucuda bulunamadı veya bilgisi alınamadı.",
      member: targetMember,
    };
  }

  if (!targetMember.kickable) {
    return {
      status: "Başarısız",
      reason: "Üye atılamadı, botun rol hiyerarşisi veya yetkisi yetersiz.",
      member: targetMember,
    };
  }

  await targetMember.kick(reason);
  return {
    status: "Başarılı",
    reason,
    member: targetMember,
  };
}

async function handleHoneypotViolation({
  client,
  guild,
  db,
  guildData,
  context,
  offenderUser,
  member,
  sourceMessage,
  mediaSnapshot,
  cleanup,
  kickReason,
  contextTitle,
  contextLines,
}) {
  if (!guild || !offenderUser || offenderUser.id === client.user.id) return false;

  const lockKey = `${guild.id}:${offenderUser.id}`;
  const alreadyActive = activeKicks.has(lockKey);
  if (!alreadyActive) activeKicks.add(lockKey);

  let botMember = guild.members.me || null;
  let kickStatus = "Başarısız";
  let finalKickReason;
  let deleteStatus = "Başarısız";
  let deleteReason = "Temizlik işlemi başlatılamadı.";
  let resolvedMember = member || null;

  try {
    botMember = botMember || await guild.members.fetchMe().catch(() => null);

    if (saveMediaSnapshot(guildData, mediaSnapshot)) writeHoneypotDB(db);

    const deleteResult = await cleanup(botMember);
    deleteStatus = deleteResult.status;
    deleteReason = deleteResult.reason;

    resolvedMember = resolvedMember || await guild.members.fetch(offenderUser.id).catch(() => null);

    if (alreadyActive) {
      kickStatus = "Beklemede";
      finalKickReason = "Bu kullanıcı için Honeypot işlemi zaten çalışıyor, yeni içerik temizlendi.";
    } else {
      const kickResult = await kickMember({
        guild,
        offenderUser,
        member: resolvedMember,
        botMember,
        reason: kickReason,
      });

      kickStatus = kickResult.status;
      finalKickReason = kickResult.reason;
      resolvedMember = kickResult.member || resolvedMember;

      if (kickStatus === "Başarılı") {
        context.entry.kickCount = (Number(context.entry.kickCount) || 0) + 1;
        context.entry.lastKick = {
          userId: offenderUser.id,
          sourceId: sourceMessage.id,
          protectedChannelId: context.protectedChannelId,
          sourceChannelId: context.sourceChannelId,
          kickedAt: Date.now(),
          cleanupStatus: deleteStatus,
          mediaLogMessageId: mediaSnapshot?.attachments?.length ? mediaSnapshot.messageId : null,
        };
        guildData.channels[context.protectedChannelId] = context.entry;
        writeHoneypotDB(db);

        await updatePanel(guild, context.protectedChannelId, context.entry, client);
      }
    }

    await sendLog({
      guild,
      logMessage: sourceMessage,
      offenderUser,
      member: resolvedMember,
      botMember,
      guildData,
      entry: context.entry,
      kickStatus,
      kickReason: finalKickReason,
      deleteStatus,
      deleteReason,
      mediaSnapshot,
      contextTitle,
      contextLines,
      client,
    });

    return true;
  } catch (error) {
    console.error(`🔴 [HONEYPOT] İşlem hatası ( ${guild.id}/${offenderUser.id} ):`, error);
    finalKickReason = error?.message || "*Kick işlemi sırasında hata oluştu.*";

    await sendLog({
      guild,
      logMessage: sourceMessage,
      offenderUser,
      member: resolvedMember,
      botMember,
      guildData,
      entry: context.entry,
      kickStatus,
      kickReason: finalKickReason,
      deleteStatus,
      deleteReason,
      mediaSnapshot,
      contextTitle,
      contextLines,
      client,
    });

    return false;
  } finally {
    if (!alreadyActive) setTimeout(() => activeKicks.delete(lockKey), 5000);
  }
}

async function handleHoneypotMessage(message, client) {
  if (!message.guild) return false;

  const db = readHoneypotDB();
  const guildData = db[message.guild.id];
  const context = resolveHoneypotContext(guildData, message.channel, message.channelId);
  if (!context) return false;

  const offenderUser = getMessageOffenderUser(message);
  if (!offenderUser || offenderUser.id === client.user.id) return false;

  const mediaSnapshot = createMediaSnapshot(message, offenderUser);
  const member = message.member?.id === offenderUser.id ? message.member : null;
  const channelLabel = context.isThread
    ? `thread <#${context.threadId}> / ana kanal <#${context.protectedChannelId}>`
    : `<#${context.protectedChannelId}>`;

  return handleHoneypotViolation({
    client,
    guild: message.guild,
    db,
    guildData,
    context,
    offenderUser,
    member,
    sourceMessage: message,
    mediaSnapshot,
    cleanup: (botMember) => deleteHoneypotMessage(message, botMember),
    kickReason: `Honeypot Koruma kanalında içerik gönderdi: ${channelLabel}`,
    contextTitle: "Honeypot Mesaj İhlali",
    contextLines: formatMessageContextLines(message, context, offenderUser),
  });
}

async function handleHoneypotThreadCreate(thread, newlyCreated, client) {
  if (!newlyCreated || !thread.guild) return false;

  const db = readHoneypotDB();
  const guildData = db[thread.guild.id];
  const context = resolveHoneypotContext(guildData, thread, thread.id);
  if (!context) return false;

  const ownerId = thread.ownerId;
  const member = ownerId ? await thread.guild.members.fetch(ownerId).catch(() => null) : null;
  const offenderUser = member?.user || (ownerId ? await client.users.fetch(ownerId).catch(() => null) : null);
  if (!offenderUser || offenderUser.id === client.user.id) return false;

  const parentChannel = thread.parent || await fetchGuildChannel(thread.guild, context.protectedChannelId);
  const sourceMessage = createVirtualMessage({
    id: thread.id,
    guild: thread.guild,
    channel: parentChannel,
    channelId: context.protectedChannelId,
    author: offenderUser,
    content: formatThreadContent(thread, context, newlyCreated),
    type: "ThreadCreate",
    createdTimestamp: thread.createdTimestamp || Date.now(),
  });

  return handleHoneypotViolation({
    client,
    guild: thread.guild,
    db,
    guildData,
    context,
    offenderUser,
    member,
    sourceMessage,
    mediaSnapshot: null,
    cleanup: (botMember) => deleteHoneypotThread(thread, botMember),
    kickReason: `Honeypot Koruma kanalında Thread oluşturdu: <#${context.protectedChannelId}>`,
    contextTitle: "Honeypot Thread İhlali",
    contextLines: formatThreadContextLines(thread, context, newlyCreated),
  });
}

async function handleHoneypotInteraction(interaction, client) {
  if (!interaction.guild || !interaction.user) return false;

  const db = readHoneypotDB();
  const guildData = db[interaction.guild.id];
  if (!guildData?.channels) return false;

  let channel = interaction.channel || null;
  let context = resolveHoneypotContext(guildData, channel, interaction.channelId);
  if (context) interaction[HONEYPOT_BLOCK_FLAG] = true;

  if (!context) {
    channel = await fetchGuildChannel(interaction.guild, interaction.channelId);
    context = resolveHoneypotContext(guildData, channel, interaction.channelId);
    if (!context) return false;
    interaction[HONEYPOT_BLOCK_FLAG] = true;
  }

  const offenderUser = interaction.user;
  if (offenderUser.id === client.user.id) return false;

  const member = interaction.member?.id === offenderUser.id ? interaction.member : null;
  const logChannel = channel || await fetchGuildChannel(interaction.guild, context.protectedChannelId);
  const sourceMessage = createVirtualMessage({
    id: interaction.id,
    guild: interaction.guild,
    channel: logChannel,
    channelId: interaction.channelId || context.protectedChannelId,
    author: offenderUser,
    content: formatInteractionContent(interaction, context),
    type: `Interaction:${interaction.type}`,
    createdTimestamp: interaction.createdTimestamp || Date.now(),
  });

  return handleHoneypotViolation({
    client,
    guild: interaction.guild,
    db,
    guildData,
    context,
    offenderUser,
    member,
    sourceMessage,
    mediaSnapshot: null,
    cleanup: (botMember) => deleteInteractionSource(interaction, botMember),
    kickReason: `Honeypot Koruma kanalında Discord interaction kullandı: <#${context.protectedChannelId}>`,
    contextTitle: "Honeypot Interaction İhlali",
    contextLines: formatInteractionContextLines(interaction, context),
  });
}

module.exports = {
  HONEYPOT_BLOCK_FLAG,
  handleHoneypotInteraction,
  handleHoneypotMessage,
  handleHoneypotThreadCreate,
};
