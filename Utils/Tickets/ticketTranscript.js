const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, FileBuilder, MediaGalleryBuilder, MessageFlags, SeparatorBuilder, TextDisplayBuilder } = require('discord.js');
const emojiler = require('../Emojis/emojiler.js');

const SUPPORT_CONTAINER_COLOR = 0x2b2d31;
const LOG_CONTAINER_COLOR = 0x5865f2;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripCodeBlock(value) {
  return String(value ?? '')
    .replace(/^```(?:\w+)?\n?/, '')
    .replace(/```$/, '')
    .trim();
}

function formatShortDate(timestamp) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp)).replace(',', '');
}

function formatDateDivider(timestamp) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(timestamp)).toLocaleUpperCase('tr-TR');
}

function formatProfileDate(timestamp) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(timestamp));
}

function normalizePriority(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('tr-TR');
  if (!normalized) {
    return { label: 'Belirtilmedi', emoji: '⚫', value: null };
  }
  if (normalized.includes('yüksek') || normalized.includes('yuksek') || normalized.includes('🔴')) {
    return { label: 'Yüksek', emoji: '🔴', value: 'yüksek' };
  }
  if (normalized.includes('orta') || normalized.includes('🟡')) {
    return { label: 'Orta', emoji: '🟡', value: 'orta' };
  }
  return { label: 'Düşük', emoji: '🟢', value: 'düşük' };
}

function priorityFromChannelName(channelName) {
  if (channelName?.includes('🔴')) return 'yüksek';
  if (channelName?.includes('🟡')) return 'orta';
  if (channelName?.includes('🟢')) return 'düşük';
  return null;
}

function sanitizeFilePart(value) {
  return String(value ?? 'talep')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'talep';
}

function mentionUser(id) {
  return id ? `<@${id}>` : '`Yok`';
}

function inlineCode(value) {
  return `\`${String(value ?? 'bilinmiyor').replace(/`/g, "'")}\``;
}

function displayMemberName(member, fallback = 'Bilinmiyor') {
  if (!member) return fallback;
  return member.displayName || member.user?.globalName || member.user?.username || fallback;
}

function displayUserName(user, fallback = 'Bilinmiyor') {
  if (!user) return fallback;
  return user.globalName || user.username || fallback;
}

async function fetchMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.fetch(userId).catch(() => null);
}

async function fetchUser(guild, userId) {
  if (!guild || !userId) return null;
  const member = await fetchMember(guild, userId);
  if (member?.user) return member.user;
  return guild.client.users.fetch(userId).catch(() => null);
}

async function getSupportPanelImage(guild, client) {
  const guildBanner = guild?.bannerURL?.({ size: 1024 });
  if (guildBanner) return guildBanner;

  const botUser = await client.users.fetch(client.user.id, { force: true }).catch(() => client.user);
  return botUser?.bannerURL?.({ size: 1024 }) || null;
}

async function createSupportPanelPayload(guild, client) {
  const imageUrl = await getSupportPanelImage(guild, client);
  const container = new ContainerBuilder()
    .setAccentColor(SUPPORT_CONTAINER_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${emojiler.elsallama} Destek Talebi Oluştur`,
        '> Destek talebi oluşturmadan önce aşağıdaki kuralları okuyun.'
      ].join('\n'))
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Genel Kurallar:**',
        '- Destek talebine uzun süre bakmazsanız talebiniz otomatik kapanır.',
        '- Yetkililerle DM üzerinden konuşmayın, tüm iletişim destek talebi üzerinden sağlanır.',
        '- Gereksiz mesajlar yazmayın, boş destek talebi açmayın.'
      ].join('\n'))
    );

  if (imageUrl) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({
          media: { url: imageUrl },
        })
      );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('destek_olustur')
        .setLabel('Destek Oluştur')
        .setStyle(ButtonStyle.Primary)
    )
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

function buildTranscriptLogPayload(info, fileName) {
  const claimedText = info.claimedStaffId ? mentionUser(info.claimedStaffId) : '`Yok`';
  const closerText = info.closerId ? mentionUser(info.closerId) : `\`${info.closerLabel || 'Otomatik Sistem'}\``;
  const container = new ContainerBuilder()
    .setAccentColor(LOG_CONTAINER_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${emojiler.log} Talep Kaydı`,
        `> ${inlineCode(info.channel.name)} kapatıldı, kayıt ekte.`
      ].join('\n'))
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `- ${emojiler.uye} **Talep Sahibi:** ${mentionUser(info.openerId)}`,
        `- ${emojiler.kategori} **Konu:** *${info.reason || 'Belirtilmedi'}*`,
        `- ${emojiler.kalkan} **İlgilenen Yetkili:** ${claimedText}`,
        `- ${info.priority.emoji} **Öncelik Durumu:** \`${info.priority.label}\``,
        `- ${emojiler.kapat} **Kapatan:** ${closerText}`,
        `- ${emojiler.speechbubble} **Mesaj Sayısı:** \`${info.messageCount}\``
      ].join('\n'))
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addFileComponents(new FileBuilder().setURL(`attachment://${fileName}`));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

function collectionToArray(messages) {
  if (!messages) return [];
  if (Array.isArray(messages)) return messages;
  if (typeof messages.values === 'function') return Array.from(messages.values());
  return [];
}

function componentToJSON(component) {
  if (!component) return {};
  if (typeof component.toJSON === 'function') return component.toJSON();
  if (component.data) return component.data;
  return component;
}

function getMessageCount(messages) {
  if (typeof messages?.size === 'number') return messages.size;
  return collectionToArray(messages).length;
}

function extractFieldFromEmbeds(messages, patterns) {
  for (const msg of collectionToArray(messages)) {
    for (const embed of msg.embeds || []) {
      const fields = embed.fields || embed.data?.fields || [];
      for (const field of fields) {
        const name = String(field.name || '').toLocaleLowerCase('tr-TR');
        if (patterns.some(pattern => name.includes(pattern))) {
          return field.value;
        }
      }
    }
  }
  return null;
}

function collectTextFromComponent(component, output = []) {
  const data = componentToJSON(component);
  if (data.type === ComponentType.TextDisplay && data.content) {
    output.push(data.content);
  }

  for (const child of data.components || []) {
    collectTextFromComponent(child, output);
  }

  return output;
}

function extractTextFromComponents(messages) {
  return collectionToArray(messages)
    .flatMap(msg => (msg.components || []).flatMap(component => collectTextFromComponent(component)))
    .join('\n');
}

function extractReason(messages) {
  const value = extractFieldFromEmbeds(messages, ['talep açılış nedeni', 'talep nedeni', 'kategori', 'konu']);
  if (value) return stripCodeBlock(value) || 'Belirtilmedi';

  const componentText = extractTextFromComponents(messages);
  const match = componentText.match(/Talep Açılış Nedeni:\*{0,2}\s*```\s*([\s\S]*?)\s*```/i)
    || componentText.match(/Kategori:\s*(?:\S+\s*)?(.+)/i);
  return stripCodeBlock(match?.[1]) || 'Belirtilmedi';
}

function extractClaimedStaffId(messages) {
  const value = extractFieldFromEmbeds(messages, ['üstlenen', 'ilgilenen']);
  const match = String(value || '').match(/<@!?(\d+)>/);
  if (match) return match[1];

  const componentText = extractTextFromComponents(messages);
  return componentText.match(/(?:Talebi Üstlenen Yetkili|İlgilenen Yetkili|Destek Durumu):?[\s\S]*?<@!?(\d+)>/i)?.[1] || null;
}

async function createTranscriptInfo({ guild, channel, messages, dbGuild = {}, openerId, closerId, closerLabel }) {
  const details = dbGuild.ticketDetails?.[channel.id] || {};
  const actualOpenerId = openerId || details.openerId || Object.entries(dbGuild.activeTickets || {}).find(([, chId]) => chId === channel.id)?.[0] || null;
  const actualCloserId = closerId || null;
  const claimedStaffId = details.claimedBy || extractClaimedStaffId(messages);
  const priority = normalizePriority(details.priority || priorityFromChannelName(channel.name));
  const reason = details.reason || extractReason(messages);
  const openedAt = details.openedAt || channel.createdTimestamp || Date.now();
  const messageCount = getMessageCount(messages);
  const openerMember = await fetchMember(guild, actualOpenerId);
  const openerUser = openerMember?.user || await fetchUser(guild, actualOpenerId);
  const closerMember = await fetchMember(guild, actualCloserId);
  const closerUser = closerMember?.user || await fetchUser(guild, actualCloserId);
  const claimedMember = await fetchMember(guild, claimedStaffId);
  const claimedUser = claimedMember?.user || await fetchUser(guild, claimedStaffId);

  return {
    channel,
    openerId: actualOpenerId,
    openerMember,
    openerUser,
    closerId: actualCloserId,
    closerMember,
    closerUser,
    closerLabel: closerLabel || (actualCloserId ? mentionUser(actualCloserId) : 'Otomatik Sistem'),
    claimedStaffId,
    claimedMember,
    claimedUser,
    reason,
    priority,
    openedAt,
    messageCount
  };
}

function renderInline(text, guild, participants) {
  let html = escapeHtml(text);

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`);
  html = html.replace(/&lt;(a?):([a-zA-Z0-9_]+):(\d+)&gt;/g, (_, animated, name, id) => {
    const extension = animated ? 'gif' : 'png';
    return `<img class="inline-emoji" src="https://cdn.discordapp.com/emojis/${id}.${extension}" alt="${escapeHtml(name)}">`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => {
    const name = participants.get(id)?.displayName || participants.get(id)?.username || id;
    return `<span class="mention">@${escapeHtml(name)}</span>`;
  });
  html = html.replace(/&lt;@(?:&amp;|&)(\d+)&gt;/g, (_, id) => {
    const role = guild.roles.cache.get(id);
    return `<span class="mention">@${escapeHtml(role?.name || id)}</span>`;
  });
  html = html.replace(/&lt;#(\d+)&gt;/g, (_, id) => {
    const channel = guild.channels.cache.get(id);
    return `<span class="mention"># ${escapeHtml(channel?.name || id)}</span>`;
  });
  html = html.replace(/\n/g, '<br>');
  return html;
}

function renderComponentEmoji(component) {
  const data = componentToJSON(component);
  const emoji = data.emoji;
  if (!emoji) return '';
  if (emoji.id) {
    const extension = emoji.animated ? 'gif' : 'png';
    return `<img class="component-emoji" src="https://cdn.discordapp.com/emojis/${emoji.id}.${extension}" alt="${escapeHtml(emoji.name || 'emoji')}">`;
  }
  if (emoji.name) return `${escapeHtml(emoji.name)} `;
  return `${escapeHtml(emoji)} `;
}

function componentLabel(component) {
  const data = componentToJSON(component);
  return data.label || data.placeholder || 'Bileşen';
}

function renderInteractiveComponent(component) {
  const data = componentToJSON(component);
  if (
    data.type === ComponentType.StringSelect ||
    data.type === ComponentType.UserSelect ||
    data.type === ComponentType.RoleSelect ||
    data.type === ComponentType.MentionableSelect ||
    data.type === ComponentType.ChannelSelect
  ) {
    return `<span class="select-control">${escapeHtml(componentLabel(data))}<span class="select-caret">⌄</span></span>`;
  }

  const style = data.style || 2;
  const classes = ['component-button'];
  if (style === 1) classes.push('primary');
  if (style === 3) classes.push('success');
  if (style === 4) classes.push('danger');
  if (data.disabled) classes.push('disabled');
  return `<span class="${classes.join(' ')}">${renderComponentEmoji(data)}${escapeHtml(componentLabel(data))}</span>`;
}

function renderComponentNode(component, guild, participants) {
  const data = componentToJSON(component);

  if (data.type === ComponentType.Container) {
    const color = typeof data.accent_color === 'number' ? `#${data.accent_color.toString(16).padStart(6, '0')}` : '#5865f2';
    const children = (data.components || []).map(child => renderComponentNode(child, guild, participants)).join('');
    return `<div class="embed component-container" style="border-left-color:${color}">${children}</div>`;
  }

  if (data.type === ComponentType.TextDisplay) {
    return `<div class="component-text">${renderInline(data.content || '', guild, participants)}</div>`;
  }

  if (data.type === ComponentType.Separator) {
    return data.divider === false ? '<div class="component-gap"></div>' : '<div class="component-separator"></div>';
  }

  if (data.type === ComponentType.MediaGallery) {
    const items = (data.items || []).map(item => {
      const url = item.media?.url;
      if (!url) return '';
      return `<img class="component-media" src="${escapeHtml(url)}" alt="${escapeHtml(item.description || '')}">`;
    }).join('');
    return `<div class="component-media-gallery">${items}</div>`;
  }

  if (data.type === ComponentType.File) {
    const url = data.file?.url || '';
    const fileName = url.replace(/^attachment:\/\//, '') || data.name || 'transcript.html';
    return [
      '<a class="attachment-card component-file" href="', escapeHtml(url), '">',
      '<span class="attachment-icon">&lt;/&gt;</span>',
      '<span><span class="attachment-name">', escapeHtml(fileName), '</span>',
      data.size ? '<span class="attachment-size">' + escapeHtml((data.size / 1024).toFixed(2)) + ' KB</span>' : '',
      '</span></a>'
    ].join('');
  }

  if (data.type === ComponentType.ActionRow) {
    const rendered = (data.components || []).map(renderInteractiveComponent).join('');
    return `<div class="component-row">${rendered}</div>`;
  }

  return '';
}

function renderComponents(message, guild, participants) {
  if (!message.components?.length) return '';

  const rendered = message.components.map(component => renderComponentNode(component, guild, participants)).join('');
  return `<div class="components">${rendered}</div>`;
}

function renderEmbed(embed, guild, participants) {
  const color = typeof embed.color === 'number' ? `#${embed.color.toString(16).padStart(6, '0')}` : '#5865f2';
  const title = embed.title || embed.data?.title;
  const description = embed.description || embed.data?.description;
  const fields = embed.fields || embed.data?.fields || [];
  const image = embed.image?.url || embed.data?.image?.url;
  const thumbnail = embed.thumbnail?.url || embed.data?.thumbnail?.url;
  const footer = embed.footer?.text || embed.data?.footer?.text;

  return [
    `<div class="embed" style="border-left-color:${color}">`,
    thumbnail ? `<img class="embed-thumb" src="${escapeHtml(thumbnail)}" alt="">` : '',
    title ? `<div class="embed-title">${renderInline(title, guild, participants)}</div>` : '',
    description ? `<div class="embed-description">${renderInline(description, guild, participants)}</div>` : '',
    fields.length ? `<div class="embed-fields">${fields.map(field => `<div class="embed-field${field.inline ? ' inline' : ''}"><div class="embed-field-name">${renderInline(field.name, guild, participants)}</div><div class="embed-field-value">${renderInline(field.value, guild, participants)}</div></div>`).join('')}</div>` : '',
    image ? `<img class="embed-image" src="${escapeHtml(image)}" alt="">` : '',
    footer ? `<div class="embed-footer">${renderInline(footer, guild, participants)}</div>` : '',
    '</div>'
  ].join('');
}

function renderAttachments(message) {
  if (!message.attachments?.size) return '';
  return Array.from(message.attachments.values()).map(attachment => {
    const url = attachment.url || attachment.proxyURL;
    const name = attachment.name || 'dosya';
    const contentType = attachment.contentType || '';
    if (contentType.startsWith('image/')) {
      return `<a class="attachment-image-wrap" href="${escapeHtml(url)}"><img class="attachment-image" src="${escapeHtml(url)}" alt="${escapeHtml(name)}"></a>`;
    }

    return [
      '<a class="attachment-card" href="', escapeHtml(url), '">',
      '<span class="attachment-icon">&lt;/&gt;</span>',
      '<span><span class="attachment-name">', escapeHtml(name), '</span>',
      attachment.size ? '<span class="attachment-size">' + escapeHtml((attachment.size / 1024).toFixed(2)) + ' KB</span>' : '',
      '</span></a>'
    ].join('');
  }).join('');
}

async function buildParticipants(guild, messages, requiredIds = []) {
  const counts = new Map();
  for (const msg of collectionToArray(messages)) {
    counts.set(msg.author.id, (counts.get(msg.author.id) || 0) + 1);
  }
  for (const id of requiredIds.filter(Boolean)) {
    if (!counts.has(id)) counts.set(id, 0);
  }

  const participants = new Map();
  for (const [id, count] of counts.entries()) {
    const member = await fetchMember(guild, id);
    const user = member?.user || await fetchUser(guild, id);
    if (!user) continue;
    const roles = member
      ? member.roles.cache
          .filter(role => role.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map(role => role.name)
          .slice(0, 6)
      : [];
    participants.set(id, {
      id,
      count,
      hidden: count <= 0,
      user,
      member,
      username: user.username,
      displayName: displayMemberName(member, displayUserName(user)),
      avatar: user.displayAvatarURL({ extension: 'png', size: 128 }),
      bot: Boolean(user.bot),
      roles,
      joinedAt: member?.joinedTimestamp || null,
      createdAt: user.createdTimestamp || null
    });
  }

  return participants;
}

function renderMessages(guild, messages, participants) {
  const ordered = collectionToArray(messages).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let lastAuthorId = null;
  let lastTimestamp = 0;

  return ordered.map(message => {
    const participant = participants.get(message.author.id);
    const compact = lastAuthorId === message.author.id && message.createdTimestamp - lastTimestamp < 7 * 60 * 1000;
    lastAuthorId = message.author.id;
    lastTimestamp = message.createdTimestamp;

    const embeds = (message.embeds || []).map(embed => renderEmbed(embed, guild, participants)).join('');
    const content = message.content ? `<div class="message-text">${renderInline(message.content, guild, participants)}</div>` : '';
    const attachments = renderAttachments(message);
    const components = renderComponents(message, guild, participants);

    return [
      `<div class="message${compact ? ' compact' : ''}">`,
      compact ? '<div class="avatar-spacer"></div>' : `<img class="avatar" src="${escapeHtml(participant?.avatar || message.author.displayAvatarURL({ extension: 'png', size: 128 }))}" alt="">`,
      '<div class="message-body">',
      compact ? '' : `<div class="message-header"><span class="author-name">${escapeHtml(participant?.displayName || displayUserName(message.author))}</span>${message.author.bot ? '<span class="bot-tag">BOT</span>' : ''}<span class="message-time">${formatShortDate(message.createdTimestamp)}</span></div>`,
      content,
      embeds,
      attachments,
      components,
      '</div></div>'
    ].join('');
  }).join('');
}

function renderParticipantList(participants) {
  return Array.from(participants.values())
    .filter(participant => !participant.hidden)
    .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, 'tr'))
    .map(participant => {
      const roles = participant.roles.length ? participant.roles : ['Rol yok'];
      return [
        '<div class="participant-card">',
        `<img class="participant-avatar" src="${escapeHtml(participant.avatar)}" alt="">`,
        '<div class="participant-main">',
        `<div class="participant-name">${escapeHtml(participant.displayName)}</div>`,
        `<div class="participant-roles">${escapeHtml(roles.slice(0, 2).join(', '))}</div>`,
        '</div>',
        `<span class="message-count">${participant.count}</span>`,
        '<div class="profile-popover">',
        '<div class="profile-banner"></div>',
        `<img class="profile-avatar" src="${escapeHtml(participant.avatar)}" alt="">`,
        `<div class="profile-kind">${participant.bot ? 'bot' : 'üye'}</div>`,
        `<div class="profile-name">${escapeHtml(participant.displayName)}</div>`,
        `<div class="profile-username">@${escapeHtml(participant.username)}</div>`,
        '<div class="profile-divider"></div>',
        '<div class="profile-label">ROLLER</div>',
        `<div class="profile-roles">${roles.map(role => `<span>${escapeHtml(role)}</span>`).join('')}</div>`,
        '<div class="profile-divider"></div>',
        '<div class="profile-row"><span>Sunucuya Katılım</span><strong>', participant.joinedAt ? formatProfileDate(participant.joinedAt) : 'Bilinmiyor', '</strong></div>',
        '<div class="profile-row"><span>Hesap Oluşturma</span><strong>', participant.createdAt ? formatProfileDate(participant.createdAt) : 'Bilinmiyor', '</strong></div>',
        '<div class="profile-row"><span>Talep Mesajı</span><strong>', String(participant.count), '</strong></div>',
        `<div class="profile-id">${escapeHtml(participant.id)}</div>`,
        '</div>',
        '</div>'
      ].join('');
    }).join('');
}

function getGuildSubtitle(guild) {
  if (guild.vanityURLCode) {
    return guild.vanityURLCode.includes('.') ? guild.vanityURLCode : `discord.gg/${guild.vanityURLCode}`;
  }
  return guild.name;
}

async function buildTicketTranscriptHtml({ guild, channel, messages, info }) {
  const participants = await buildParticipants(guild, messages, [info.openerId, info.closerId, info.claimedStaffId]);
  const subtitle = getGuildSubtitle(guild);
  const heading = subtitle && subtitle !== guild.name ? `${guild.name} - ${subtitle}` : guild.name;
  const openerDisplay = info.openerId || 'Bilinmiyor';
  const category = info.reason || 'Belirtilmedi';
  const claimed = info.claimedStaffId
    ? '@' + escapeHtml(displayMemberName(info.claimedMember, displayUserName(info.claimedUser)))
    : 'Yok';
  const closer = info.closerId
    ? '@' + escapeHtml(displayMemberName(info.closerMember, displayUserName(info.closerUser)))
    : escapeHtml(info.closerLabel || 'Otomatik Sistem');
  const firstMessage = collectionToArray(messages).sort((a, b) => a.createdTimestamp - b.createdTimestamp)[0];
  const dividerDate = formatDateDivider(firstMessage?.createdTimestamp || info.openedAt);
  const visibleParticipantCount = Array.from(participants.values()).filter(participant => !participant.hidden).length;

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(guild.name)} ● Talep Kaydı</title>
<style>
:root{color-scheme:dark;--bg:#0f1217;--panel:#171b24;--panel-2:#1d222d;--line:#29303d;--text:#e6e8ee;--muted:#98a1b2;--soft:#c8ceda;--brand:#5865f2;--pill:#2a3040}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 Arial,"Helvetica Neue",Helvetica,sans-serif;border-top:3px solid var(--brand)}
.page{padding:23px}
.summary{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px 26px;margin-bottom:22px}
.summary h1{margin:0 0 4px;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:0;color:#e9edf5}
.summary-sub{color:var(--muted);font-size:13px;margin-bottom:20px}
.stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.stat{background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:12px 13px;min-height:62px}
.stat-label{font-size:10px;letter-spacing:.08em;color:var(--muted);margin-bottom:7px}
.stat-value{font-weight:700;color:#e5e8ef;word-break:break-word}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px}
.transcript,.participants{background:var(--panel);border:1px solid var(--line);border-radius:14px}
.transcript{min-height:510px;padding:28px 20px 20px}
.date-divider{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:11px;margin:12px 0 12px;text-transform:uppercase}
.date-divider:before,.date-divider:after{content:"";height:1px;background:var(--line);flex:1}
.message{display:flex;gap:14px;margin:14px 0 10px 0;max-width:820px}
.message.compact{margin-top:10px}
.avatar,.participant-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#090b10}
.avatar-spacer{width:40px;flex:0 0 40px}
.message-body{min-width:0;max-width:720px}
.message-header{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.author-name{font-weight:800;color:#fff}
.bot-tag{font-size:10px;line-height:1;border-radius:4px;background:#5865f2;color:#fff;padding:3px 5px;font-weight:800}
.message-time{color:var(--muted);font-size:12px}
.message-text{color:#d7dbe5;margin-bottom:6px;white-space:normal}
.mention{background:#3c4270;color:#d7dbff;border-radius:3px;padding:0 4px;font-weight:600}
.inline-emoji{width:22px;height:22px;object-fit:contain;vertical-align:-5px;margin-right:2px}
code{background:#2d3342;border-radius:4px;padding:1px 4px;color:#dfe4f3}
pre{white-space:pre-wrap;margin:7px 0;padding:8px 10px;background:#11151d;border-radius:7px;color:#dfe4f3}
.embed{position:relative;background:#1c212b;border-left:4px solid var(--brand);border-radius:5px;padding:16px 14px;margin:4px 0 10px;max-width:620px;color:#d9dde7}
.embed-title{font-size:18px;font-weight:800;margin-bottom:6px;color:#f3f5fb}
.embed-description{font-size:15px;color:#d8dce6}
.embed-fields{display:grid;grid-template-columns:1fr;gap:9px;margin-top:10px}
.embed-field.inline{display:inline-block;width:48%;vertical-align:top;margin-right:2%}
.embed-field-name{font-weight:800;color:#f3f5fb;margin-bottom:2px}
.embed-field-value{color:#d8dce6}
.embed-thumb{position:absolute;right:14px;top:14px;width:72px;height:72px;border-radius:7px;object-fit:cover}
.embed-image{display:block;margin-top:12px;max-width:100%;border-radius:7px}
.embed-footer{border-top:1px solid var(--line);margin-top:10px;padding-top:8px;color:var(--muted);font-size:12px}
.components{border-top:1px solid var(--line);margin-top:10px;padding-top:10px}
.component-container{padding:14px 14px 10px}
.component-text{color:#d8dce6;margin:4px 0}
.component-text:first-child{margin-top:0}
.component-separator{height:1px;background:var(--line);margin:10px 0}
.component-gap{height:10px}
.component-media-gallery{margin:10px 0}
.component-media{display:block;max-width:100%;border-radius:7px}
.component-file{margin-top:10px}
.component-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.component-button,.select-control{display:inline-flex;align-items:center;gap:5px;min-height:32px;background:#2b3242;border:1px solid #3a4255;border-radius:7px;color:#e4e8f2;padding:6px 12px;font-weight:700;font-size:13px}
.component-emoji{width:18px;height:18px;object-fit:contain}
.component-button.primary{background:#334067;border-color:#46557f}
.component-button.success{background:#254b3b;border-color:#347056}
.component-button.danger{background:#d63b3b;border-color:#e14a4a;color:#fff}
.component-button.disabled{opacity:.55}
.select-control{min-width:220px;justify-content:space-between;color:#bfc6d4}
.select-caret{font-size:17px;line-height:1}
.attachment-card{display:flex;gap:12px;align-items:center;max-width:432px;margin:9px 0;padding:14px 16px;border:1px solid var(--line);border-radius:8px;background:#151922;color:#2296f3;text-decoration:none}
.attachment-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:4px;background:#d8d5ff;color:#5865f2;font-weight:800}
.attachment-name{display:block;font-size:16px;color:#2296f3}
.attachment-size{display:block;color:var(--muted);font-size:12px}
.attachment-image{display:block;max-width:420px;max-height:260px;border-radius:7px}
.participants{height:max-content;padding:18px}
.participants-title{font-size:11px;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;margin-bottom:15px}
.participant-card{position:relative;display:flex;align-items:center;gap:12px;border-radius:9px;padding:10px 0}
.participant-main{min-width:0;flex:1}
.participant-name{font-weight:800;color:#9facbf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.participant-roles{font-size:11px;color:#8790a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.message-count{background:#2a3040;color:#aeb7c8;border-radius:999px;min-width:22px;height:22px;display:grid;place-items:center;font-size:12px}
.profile-popover{display:none;position:absolute;right:calc(100% + 12px);top:-194px;width:300px;background:#1d222d;border:1px solid #313848;border-radius:9px;box-shadow:0 22px 60px rgba(0,0,0,.45);padding:0 16px 16px;z-index:5}
.participant-card:hover .profile-popover{display:block}
.profile-banner{height:56px;margin:0 -16px 30px;border-radius:8px 8px 0 0;background:#9bacc0}
.profile-avatar{position:absolute;top:27px;left:16px;width:64px;height:64px;border:5px solid #11151d;border-radius:50%;background:#07090d}
.profile-kind{position:absolute;right:16px;top:112px;color:#b8c1d0;font-weight:800}
.profile-name{font-size:18px;font-weight:800;color:#9facbf;max-width:210px;margin-top:42px}
.profile-username{color:#9ca6b7;margin-bottom:12px}
.profile-divider{height:1px;background:var(--line);margin:12px 0}
.profile-label{font-size:10px;letter-spacing:.08em;color:#9aa3b4;margin-bottom:7px}
.profile-roles{display:flex;flex-wrap:wrap;gap:6px}
.profile-roles span{background:#2a3040;border-radius:5px;color:#dfe4ed;padding:3px 8px;font-size:12px}
.profile-row{display:flex;justify-content:space-between;gap:14px;color:#9aa3b4;margin:6px 0;font-size:13px}
.profile-row strong{color:#e4e8f2;text-align:right}
.profile-id{color:#687386;font-size:11px;margin-top:14px}
@media (max-width:1100px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.layout{grid-template-columns:1fr}.profile-popover{right:auto;left:0;top:58px}}
@media (max-width:720px){.page{padding:12px}.summary{padding:18px}.stats{grid-template-columns:1fr}.transcript{padding:20px 12px}.message{gap:10px}.embed{max-width:100%}.layout{gap:12px}.participants{display:none}}
</style>
</head>
<body>
<main class="page">
  <section class="summary">
    <h1>${escapeHtml(heading)} ● Talep Kaydı</h1>
    <div class="summary-sub"># ${escapeHtml(channel.name)} ● ${formatShortDate(info.openedAt)} tarihinde oluşturuldu</div>
    <div class="stats">
      <div class="stat"><div class="stat-label">TALEP SAHİBİ</div><div class="stat-value">${escapeHtml(openerDisplay)}</div></div>
      <div class="stat"><div class="stat-label">KONU</div><div class="stat-value">${escapeHtml(category)}</div></div>
      <div class="stat"><div class="stat-label">İLGİLENEN YETKİLİ</div><div class="stat-value">${claimed}</div></div>
      <div class="stat"><div class="stat-label">AÇILIŞ</div><div class="stat-value">${formatShortDate(info.openedAt)}</div></div>
      <div class="stat"><div class="stat-label">KAPATAN</div><div class="stat-value">${closer}</div></div>
      <div class="stat"><div class="stat-label">MESAJ SAYISI</div><div class="stat-value">${escapeHtml(info.messageCount)}</div></div>
    </div>
  </section>
  <section class="layout">
    <div class="transcript">
      <div class="date-divider"><span>${escapeHtml(dividerDate)}</span></div>
      ${renderMessages(guild, messages, participants)}
    </div>
    <aside class="participants">
      <div class="participants-title">KATILIMCILAR - ${visibleParticipantCount}</div>
      ${renderParticipantList(participants)}
    </aside>
  </section>
</main>
</body>
</html>`;
}

function transcriptFileName(info) {
  const openerName = info.openerUser?.username || info.openerMember?.displayName || info.openerId || 'talep';
  return `talep-${sanitizeFilePart(openerName)}-${info.channel.id}.html`;
}

module.exports = {
  createSupportPanelPayload,
  createTranscriptInfo,
  buildTranscriptLogPayload,
  buildTicketTranscriptHtml,
  normalizePriority,
  transcriptFileName
};
