const { randomUUID } = require('node:crypto');
const { ChannelType, PermissionFlagsBits: P, ContainerBuilder, TextDisplayBuilder, FileBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const store = require('./modmailStore');
const { serialize, validateResources } = require('./modmailConfig');
const { assertNoConflicts } = require('./dmConflicts');
const { buildTranscript } = require('./modmailTranscript');
const { respond, errorDetails } = require('./modmailResponses');
const pending = new Map();
const MAX_MESSAGES = 2000;
const safeSend = (target, content) => target.send({ content, allowedMentions: { parse: [] } });

function sessionPayload(session) {
  const container = new ContainerBuilder().setAccentColor(0x5865f2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## 📬 ModMail • Açık Talep', `**Üye:** <@${session.userId}> · \`${session.userId}\``,
      `**Talep kanalı:** <#${session.channelId}>`,
      `**Açılış:** <t:${Math.floor(session.openedAt / 1000)}:f>`,
      `**Üstlenen:** ${session.claimedBy ? `<@${session.claimedBy}>` : 'Henüz üstlenilmedi'}`,
      '-# **__Bu kanala yazdığınız mesajlar ve dosyalar üyeye DM olarak iletilir.__** \n  ',

      '**NOT :** `//` ile başlayan mesajlar üyeye gönderilmez ve transcript içine alınmaz.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mm:claim:${session.channelId}`).setLabel('Talebi Üstlen').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mm:close:${session.channelId}`).setLabel('Talebi Kapat').setStyle(ButtonStyle.Danger),
    ));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
function isStaff(member, config) {
  return Boolean(member && (member.permissions.has(P.Administrator) || member.roles.cache.has(config.staffRoleId)));
}
async function requireStaff(guild, userId, session) {
  if (!session || session.guildId !== guild.id) throw new TypeError('Talep bu sunucuda bulunamadı.');
  const member = await guild.members.fetch({ user: userId, force: true });
  if (!isStaff(member, store.getConfig(guild.id))) throw new TypeError('Bu işlem için ModMail yetkilisi veya yönetici olmalısınız.');
  return member;
}
function collectMessage(message, direction) {
  return {
    id: message.id, createdAt: message.createdTimestamp, direction, content: message.content || '',
    authorId: message.author.id, authorName: message.author.username,
    authorDisplayName: message.member?.displayName || message.author.globalName || message.author.username,
    source: direction === 'member' ? 'dm' : message.source === 'dashboard' ? 'dashboard' : 'channel',
    avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
    attachments: [...message.attachments.values()].map(file => ({
      url: file.url, name: file.name || 'dosya', size: file.size, contentType: file.contentType,
    })), delivered: false, deliveredParts: 0,
  };
}
function validateMessage(record) {
  if (!record.content && !record.attachments.length) throw new TypeError('Metin veya dosya gönderin. Çıkartma ve sesli mesajlar desteklenmiyor.');
  if (record.content.length > 4000 || record.attachments.length > 10) throw new TypeError('Bir mesaj en fazla 4000 karakter ve 10 dosya içerebilir.');
  if (record.attachments.some(file => file.size > 8 * 1024 * 1024)) throw new TypeError('Dosyalar en fazla 8 MB olabilir. Mesaj iletilmedi; dosyayı küçültüp yeniden gönderin.');
}
async function relay(guild, session, target, record) {
  if (session.status !== 'open') throw new TypeError('Bu talep kapatılıyor. Kapanış tamamlandıktan sonra tekrar yazın.');
  const previous = session.messages.find(item => item.id === record.id);
  if (previous?.delivered) return;
  if (!previous && session.messages.length >= MAX_MESSAGES) throw new TypeError('Bu talebin 2000 mesajlık kayıt sınırına ulaşıldı. Yetkililer talebi kapattıktan sonra yeni talep açılabilir.');
  validateMessage(record);
  if (!previous) store.updateSession(guild.id, session.channelId, draft => { draft.messages.push(record); });
  const chunks = record.content.match(/[\s\S]{1,3000}/g) || ['Dosya gönderildi.'];
  for (let index = previous?.deliveredParts || 0; index < chunks.length; index++) {
    const heading = record.direction === 'member' ? `Üye · ${record.authorId}` : `${guild.name} • Destek Ekibi`;
    const container = new ContainerBuilder().setAccentColor(record.direction === 'member' ? 0x5865f2 : 0x57f287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}\n${chunks[index]}`));
    const files = index === chunks.length - 1 ? record.attachments.map((file, i) => ({
      attachment: file.url, name: `${i + 1}-${file.name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-100)}`,
    })) : [];
    for (const file of files) container.addFileComponents(new FileBuilder().setURL(`attachment://${file.name}`));
    const sent = await target.send({ components: [container], flags: MessageFlags.IsComponentsV2, files, allowedMentions: { parse: [] } });
    store.updateSession(guild.id, session.channelId, draft => {
      const saved = draft.messages.find(item => item.id === record.id);
      saved.deliveredParts = index + 1;
      saved.delivered = index === chunks.length - 1;
      if (files.length && sent.attachments?.size) saved.attachments = [...sent.attachments.values()].map(file => ({
        url: file.url, name: file.name, size: file.size, contentType: file.contentType,
      }));
    });
  }
}
function channelNameFor(user) {
  const name = String(user.username || 'kullanici').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 92) || 'kullanici';
  return `modmail-${name}`;
}
function welcomePayload(guild, session) {
  const config = store.getConfig(guild.id);
  return { content: `## ${guild.name} • ModMail\n> ${config.welcomeMessage}`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mm:userClose:${session.channelId}`).setLabel("ModMail'i Kapat").setStyle(ButtonStyle.Danger),
    )], allowedMentions: { parse: [] } };
}
async function ensureMemberControls(guild, user, session) {
  if (session.welcomeMessageId || session.status !== 'open') return;
  const sent = await user.send(welcomePayload(guild, session)).catch(() => null);
  if (sent) store.updateSession(guild.id, session.channelId, draft => { draft.welcomeMessageId = sent.id; });
}
async function pinSessionHeader(guild, channel, session, header) {
  if (!session.headerId) return;
  try {
    header ||= await channel.messages.fetch({ message: session.headerId, force: true });
    if (!header) return;
    if (!header.pinned) await header.pin('ModMail talep yönetim mesajı');
    store.updateSession(guild.id, session.channelId, draft => { draft.headerPinned = true; });
  } catch (error) {
    if (![10003, 10008].includes(Number(error.code))) console.warn('[MODMAIL] Talep yönetim mesajı sabitlenemedi:', errorDetails(error));
  }
}
async function refreshOpenSessions(client) {
  const failures = [];
  for (const { ID } of store.allGuilds()) {
    const guild = client.guilds.cache.get(ID);
    if (!guild) continue;
    for (const initial of store.listSessions(ID)) {
      try {
        await serialize(`user:${initial.userId}`, async () => {
          const session = store.getSession(initial.channelId);
          if (!session || session.status !== 'open') return;
          const user = await client.users.fetch(session.userId);
          if (!user) return;
          const channel = await guild.channels.fetch(session.channelId);
          if (!channel) return;
          await pinSessionHeader(guild, channel, session);
          if (channel.name === `modmail-${session.userId}`) {
            await channel.setName(channelNameFor(user), 'ModMail kanalında kullanıcı adı gösteriliyor.');
            store.updateSession(guild.id, channel.id, draft => { draft.channelName = channel.name; });
          }
          await ensureMemberControls(guild, user, store.getSession(session.channelId));
        });
      } catch (error) { failures.push({ channelId: initial.channelId, ...errorDetails(error) }); }
    }
  }
  return failures;
}
async function handleUserClose(interaction) {
  requireDirectInteraction(interaction);
  const channelId = interaction.customId.split(':')[2];
  const session = store.getSession(channelId);
  if (session && session.userId !== interaction.user.id) throw new TypeError('Yalnızca kendi ModMail talebini kapatabilirsin.');
  if (!await respond(interaction, 'deferUpdate')) return;
  if (!session) return respond(interaction, 'editReply', { content: 'Bu ModMail talebi zaten kapatılmış.', components: [] });
  const guild = interaction.client.guilds.cache.get(session.guildId);
  if (!guild) throw new TypeError('Destek sunucusuna şu anda erişilemiyor. Daha sonra tekrar deneyebilirsin.');
  try { await closeSession(guild, channelId, interaction.user.id, 'Talep sahibi tarafından kapatıldı.'); }
  catch (error) { if (store.getSession(channelId)) throw error; }
  await respond(interaction, 'editReply', { content: `## ${guild.name} • ModMail\n> Talebin kapatıldı ve görüşme kaydedildi. Yeni bir talep için tekrar mesaj gönderebilirsin.`, components: [] });
}

async function openSession(guild, user) {
  return serialize(`guild:${guild.id}`, async () => {
    const existing = store.sessionForUser(user.id);
    if (existing) return existing;
    const config = store.getConfig(guild.id);
    if (!config.enabled) throw new TypeError('Bu sunucunun ModMail sistemi kapalı.');
    assertNoConflicts();
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new TypeError('ModMail kullanmak için sunucunun üyesi olmalısınız.');
    if (store.listSessions(guild.id).length >= config.maxOpenTickets) throw new TypeError('Sunucunun açık destek talebi sınırına ulaşıldı. Daha sonra tekrar deneyin.');
    await validateResources(guild, config);
    const channel = await guild.channels.create({
      name: channelNameFor(user), type: ChannelType.GuildText, parent: config.categoryId,
      topic: `ModMail | Üye: ${user.id}`,
      permissionOverwrites: [
        { id: guild.id, deny: [P.ViewChannel] },
        { id: config.staffRoleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
        { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.ManageChannels, P.ManageRoles, P.PinMessages] },
      ], reason: 'ModMail destek talebi',
    });
    const session = { guildId: guild.id, userId: user.id, channelId: channel.id, channelName: channel.name,
      openedAt: Date.now(), status: 'open', claimedBy: null, messages: [] };
    try { store.saveSession(session); }
    catch (error) { await channel.delete('ModMail kaydı oluşturulamadı.').catch(() => null); throw error; }
    const header = await channel.send(sessionPayload(session)).catch(() => null);
    if (header) {
      store.updateSession(guild.id, channel.id, draft => { draft.headerId = header.id; });
      await pinSessionHeader(guild, channel, store.getSession(channel.id), header);
    }
    await ensureMemberControls(guild, user, store.getSession(channel.id));
    return store.getSession(channel.id);
  });
}
async function deliverUserMessage(client, user, record, guildId) {
  let session = store.sessionForUser(user.id);
  const guild = client.guilds.cache.get(session?.guildId || guildId);
  if (!guild) throw new TypeError('Destek sunucusu artık erişilebilir değil.');
  if (!session) session = await openSession(guild, user);
  const channel = await guild.channels.fetch(session.channelId).catch(() => null);
  if (!channel) throw new TypeError('Talep kanalı bulunamadı. Kayıtlar korundu; bir yönetici /modmail panelinden talebi kapatmalı.');
  await relay(guild, session, channel, record);
  await ensureMemberControls(guild, user, store.getSession(session.channelId));
}
async function eligibleGuilds(client, userId) {
  const guilds = [];
  for (const { ID, data } of store.allGuilds()) {
    const guild = client.guilds.cache.get(ID);
    if (guild && data.config?.enabled && await guild.members.fetch(userId).catch(() => null)) guilds.push(guild);
  }
  return guilds;
}
function confirmationPayload(userId, token) {
  return { content: '**Yetkili ekibine ulaşmak istiyor musun?**\nEvet dersen destek talebin açılacak ve ilk mesajın yetkililere iletilecek. Hayır dersen işlem iptal edilecek.\n-# **__Bu onay 5 dakika geçerli.__**',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mm:consent:${userId}:${token}:yes`).setLabel('Evet').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mm:consent:${userId}:${token}:no`).setLabel('Hayır').setStyle(ButtonStyle.Danger),
    )], allowedMentions: { parse: [] } };
}
function routePayload(entry, guilds) {
  if (guilds.length > 125) throw new TypeError('Çok fazla ortak destek sunucusu var. Sunucu yetkilisiyle iletişime geçin.');
  const rows = [];
  for (let i = 0; i < guilds.length; i += 25) rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`mm:route:${entry.token}:${i}`).setPlaceholder('Destek almak istediğin sunucuyu seç')
      .addOptions(guilds.slice(i, i + 25).map(guild => ({ label: guild.name.slice(0, 100), value: guild.id }))),
  ));
  return { content: 'Hangi sunucunun yetkililerine ulaşmak istiyorsun? İlk mesajın seçiminden sonra paylaşılacak. Seçim 5 dakika geçerli.', components: rows, allowedMentions: { parse: [] } };
}
function requireDirectInteraction(interaction) {
  if (interaction.guildId || interaction.guild) throw new TypeError('Bu butonu yalnızca botun özel mesajında kullanabilirsin.');
}
async function pendingEntry(interaction, token) {
  const entry = pending.get(interaction.user.id);
  if (entry?.token === token && entry.expiresAt > Date.now()) return entry;
  if (entry?.token === token) pending.delete(interaction.user.id);
  await respond(interaction, 'editReply', { content: 'Bu işlemin süresi doldu veya işlem zaten tamamlandı. Devam etmek için bota yeniden mesaj gönderebilirsin.', components: [] });
  return null;
}
async function finishOpening(interaction, entry, guildId) {
  const existing = store.sessionForUser(interaction.user.id);
  if (existing && existing.guildId !== guildId) throw new TypeError('Başka bir sunucuda açık talebin var. Önce o talebi kapatmalısın.');
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild || !store.getConfig(guildId).enabled) throw new TypeError('Bu sunucunun ModMail sistemi artık açık değil. Yeni bir seçim için tekrar DM gönder.');
  if (!await guild.members.fetch(interaction.user.id).catch(() => null)) throw new TypeError('ModMail kullanmak için sunucunun üyesi olmalısın.');
  assertNoConflicts();
  await deliverUserMessage(interaction.client, interaction.user, entry.record, guildId);
  pending.delete(interaction.user.id);
  await respond(interaction, 'editReply', { content: 'Talebin açıldı ve ilk mesajın yetkililere iletildi.', components: [] });
}
async function handleDirectMessage(message) {
  return serialize(`user:${message.author.id}`, async () => {
    const record = collectMessage(message, 'member');
    validateMessage(record);
    const existing = store.sessionForUser(message.author.id);
    if (existing) return deliverUserMessage(message.client, message.author, record, existing.guildId);
    const now = Date.now();
    for (const [id, entry] of pending) if (entry.expiresAt <= now) pending.delete(id);
    const previous = pending.get(message.author.id);
    if (previous) {
      if (previous.record.id === record.id) return;
      return safeSend(message.channel, previous.stage === 'confirm'
        ? 'Önce yukarıdaki Evet veya Hayır butonuyla kararını ver. Bu ek mesaj iletilmedi; talep açıldıktan sonra yeniden gönderebilirsin.'
        : 'Önce yukarıdaki sunucuyu seç. Bu ek mesaj iletilmedi; seçimden sonra yeniden gönderebilirsin.');
    }
    const guilds = await eligibleGuilds(message.client, message.author.id);
    if (!guilds.length) return safeSend(message.channel, 'Üyesi olduğun sunucularda etkin bir ModMail sistemi bulunamadı.');
    if (pending.size >= 1000) throw new TypeError('Destek onay kuyruğu dolu. Biraz sonra tekrar deneyin.');
    const token = randomUUID();
    pending.set(message.author.id, { record, guildIds: guilds.map(guild => guild.id), token, stage: 'confirm', expiresAt: now + 5 * 60_000 });
    try { await message.channel.send(confirmationPayload(message.author.id, token)); }
    catch (error) { pending.delete(message.author.id); throw error; }
  });
}
async function handleConfirmation(interaction) {
  requireDirectInteraction(interaction);
  const [, , ownerId, token, answer] = interaction.customId.split(':');
  if (ownerId !== interaction.user.id || !['yes', 'no'].includes(answer)) throw new TypeError('Bu onay yalnızca mesajı gönderen kullanıcıya aittir.');
  if (!await respond(interaction, 'deferUpdate')) return;
  return serialize(`user:${interaction.user.id}`, async () => {
    const entry = await pendingEntry(interaction, token);
    if (!entry) return;
    if (answer === 'no') {
      pending.delete(interaction.user.id);
      const content = store.sessionForUser(interaction.user.id)
        ? "Talebin zaten açıldı. Kapatmak için karşılama mesajındaki ModMail'i Kapat butonunu kullanabilirsin."
        : 'İşlem iptal edildi. Talep açılmadı ve mesajın yetkililere iletilmedi.';
      return respond(interaction, 'editReply', { content, components: [] });
    }
    if (entry.stage !== 'confirm') return;
    const guilds = (await eligibleGuilds(interaction.client, interaction.user.id)).filter(guild => entry.guildIds.includes(guild.id));
    if (!guilds.length) {
      pending.delete(interaction.user.id);
      return respond(interaction, 'editReply', { content: 'Şu anda ulaşabileceğin etkin bir ModMail ekibi bulunmuyor. Talep açılmadı.', components: [] });
    }
    if (guilds.length === 1) return finishOpening(interaction, entry, guilds[0].id);
    const payload = routePayload(entry, guilds);
    if (await respond(interaction, 'editReply', payload)) {
      entry.stage = 'route';
      entry.guildIds = guilds.map(guild => guild.id);
      entry.expiresAt = Date.now() + 5 * 60_000;
    }
  });
}
async function handleRoute(interaction) {
  requireDirectInteraction(interaction);
  if (!await respond(interaction, 'deferUpdate')) return;
  return serialize(`user:${interaction.user.id}`, async () => {
    const entry = await pendingEntry(interaction, interaction.customId.split(':')[2]);
    if (!entry) return;
    if (entry.stage !== 'route') throw new TypeError('Önce Evet butonuyla yetkili ekibine ulaşmayı onaylamalısın.');
    const guildId = interaction.values[0];
    if (!entry.guildIds.includes(guildId)) throw new TypeError('Geçersiz sunucu seçimi.');
    await finishOpening(interaction, entry, guildId);
  });
}

async function handleStaffMessage(message) {
  const initial = store.getSession(message.channelId);
  if (!initial || message.content.startsWith('//')) return;
  return serialize(`user:${initial.userId}`, async () => {
    const session = store.getSession(message.channelId);
    if (!session) return;
    await requireStaff(message.guild, message.author.id, session);
    const user = await message.client.users.fetch(session.userId);
    await relay(message.guild, session, user, collectMessage(message, 'staff'));
    await message.react('✅').catch(() => null);
  });
}
async function claimSession(guild, channelId, userId) {
  const initial = store.getSession(channelId);
  await requireStaff(guild, userId, initial);
  return serialize(`user:${initial.userId}`, async () => {
    const session = store.getSession(channelId);
    if (!session || session.status !== 'open') throw new TypeError('Talep açık değil.');
    if (session.claimedBy && session.claimedBy !== userId) throw new TypeError('Bu talebi başka bir yetkili üstlendi.');
    store.updateSession(guild.id, channelId, draft => { draft.claimedBy = userId; });
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    const header = session.headerId && channel ? await channel.messages.fetch(session.headerId).catch(() => null) : null;
    if (header) await header.edit(sessionPayload(store.getSession(channelId))).catch(error => {
      if (![10003, 10008].includes(Number(error.code))) throw error;
    });
  });
}
async function replyFromDashboard(guild, channelId, userId, content) {
  const initial = store.getSession(channelId);
  await requireStaff(guild, userId, initial);
  return serialize(`user:${initial.userId}`, async () => {
    const session = store.getSession(channelId);
    if (!session) throw new TypeError('Talep artık açık değil.');
    const author = await guild.client.users.fetch(userId);
    const user = await guild.client.users.fetch(session.userId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new TypeError('Talep kanalı bulunamadı. Önce mevcut talebi kapatın.');
    const record = collectMessage({ id: `dashboard-${randomUUID()}`, createdTimestamp: Date.now(), author, content, source: 'dashboard', attachments: new Map() }, 'staff');
    await relay(guild, session, user, record);
    await safeSend(channel, `**Dashboard yanıtı · ${author.username}**\n${content}`).catch(() => null);
  });
}
async function closeSession(guild, channelId, closerId, reason) {
  const initial = store.getSession(channelId);
  if (!initial || initial.guildId !== guild.id) throw new TypeError('Talep bu sunucuda bulunamadı.');
  return serialize(`user:${initial.userId}`, async () => {
    let session = store.getSession(channelId);
    if (!session) throw new TypeError('Talep zaten kapatıldı.');
    const config = store.getConfig(guild.id);
    const log = config.logChannelId ? await guild.channels.fetch(config.logChannelId).catch(() => null) : null;
    if (!log || log.id === channelId) throw new TypeError('Log kanalı bulunamadı. Talep korundu; /modmail veya Dashboard üzerinden log kanalını düzeltin.');
    store.updateSession(guild.id, channelId, draft => {
      draft.status = 'closing'; draft.closedAt ||= Date.now(); draft.closerId ||= closerId;
      draft.closeReason ||= String(reason || 'Yetkili tarafından kapatıldı.').slice(0, 500);
    });
    session = store.getSession(channelId);
    let payload;
    let loggedMessage;
    if (session.logMessageId) {
      const loggedChannel = await guild.channels.fetch(session.loggedChannelId).catch(error => { if (Number(error.code) !== 10003) throw error; return null; });
      loggedMessage = await loggedChannel?.messages.fetch(session.logMessageId).catch(error => { if (Number(error.code) !== 10008) throw error; return null; });
    }
    if (!loggedMessage) {
      payload = await buildTranscript(guild, session);
      const receipt = await log.send(payload);
      store.updateSession(guild.id, channelId, draft => { draft.logMessageId = receipt.id; draft.loggedChannelId = log.id; });
    }
    session = store.getSession(channelId);
    let dmDelivered = Boolean(session.dmDelivered);
    if (!session.dmAttempted) {
      const user = await guild.client.users.fetch(session.userId).catch(() => null);
      if (user) {
        payload ||= await buildTranscript(guild, session);
        await safeSend(user, `## ${guild.name} • ModMail\n> ${config.closeMessage}`).catch(() => null);
        dmDelivered = await user.send(payload).then(() => true).catch(() => false);
      }
      store.updateSession(guild.id, channelId, draft => { draft.dmAttempted = true; draft.dmDelivered = dmDelivered; });
    }
    const channel = await guild.channels.fetch(channelId).catch(error => { if (Number(error.code) !== 10003) throw error; return null; });
    if (channel) await channel.delete('ModMail transcript kaydedildi; talep kapatıldı.').catch(error => {
      if (Number(error.code) !== 10003) throw error;
    });
    store.removeSession(session);
    pending.delete(session.userId);
    return { dmDelivered };
  });
}

module.exports = { sessionPayload, isStaff, requireStaff, collectMessage, validateMessage, relay, openSession,
  handleDirectMessage, handleConfirmation, handleRoute, handleUserClose, handleStaffMessage, claimSession, replyFromDashboard, closeSession,
  channelNameFor, welcomePayload, refreshOpenSessions };
