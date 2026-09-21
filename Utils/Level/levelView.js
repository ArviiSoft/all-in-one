"use strict";

const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getPrimaryGuild } = require('../Account/accountBadges');
const { fetchGuildMember } = require('../Account/accountData');
const emojiler = require('../Emojis/emojiler.js');

const PREFIX = 'levelview';
const PAGE_SIZE = 10;
const number = value => new Intl.NumberFormat('tr-TR').format(value || 0);
const id = (ownerId, action, value) => `${PREFIX}:${ownerId}:${action}:${value}`;

function parseComponentId(customId) {
  const match = /^levelview:(\d{17,20}):(card|board):(\d{1,20})$/.exec(customId || '');
  if (!match) return null;
  if (match[2] === 'card' && !/^\d{17,20}$/.test(match[3])) return null;
  if (match[2] === 'board' && (!Number.isSafeInteger(Number(match[3])) || Number(match[3]) < 1)) return null;
  return { ownerId: match[1], action: match[2], value: match[3] };
}

function button(ownerId, action, value, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id(ownerId, action, value)).setLabel(label).setStyle(style).setDisabled(disabled);
}

function cardControls(ownerId, userId) {
  return [new ActionRowBuilder().addComponents(
    button(ownerId, 'card', userId, 'Kartı yenile'),
    button(ownerId, 'board', 1, 'Liderlik tablosu', ButtonStyle.Primary),
  )];
}

function boardControls(ownerId, page, pages) {
  return [new ActionRowBuilder().addComponents(
    button(ownerId, 'board', Math.max(0, page - 1), 'Önceki', ButtonStyle.Secondary, page <= 1),
    button(ownerId, 'board', page, `${page} / ${pages} · Yenile`),
    button(ownerId, 'board', page + 1, 'Sonraki', ButtonStyle.Secondary, page >= pages),
    button(ownerId, 'card', ownerId, 'Seviye kartım', ButtonStyle.Primary),
  )];
}

function profileModel(user, member, stats, rank) {
  return {
    ...stats,
    userId: user.id,
    displayName: member?.displayName || user.globalName || user.username,
    username: user.username,
    avatarURL: user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: true }),
    bannerURL: user.bannerURL?.({ size: 1024, extension: user.banner?.startsWith('a_') ? 'gif' : 'png', forceStatic: false }) || null,
    decorationURL: member?.displayAvatarDecorationURL?.() || user.avatarDecorationURL?.() || null,
    primaryGuild: getPrimaryGuild(user),
    status: member?.presence?.status || 'offline',
    rank,
  };
}

function createLevelView(options = {}) {
  const store = options.store || require('./levelStore');
  const renderer = options.renderer || require('./levelRenderer');
  const fetchMember = options.fetchMember || fetchGuildMember;
  const fetchUser = options.fetchUser || ((interaction, userId) => interaction.client.users.fetch(userId, { force: true }));
  const now = options.now || Date.now;
  const requests = new Map();

  function reserve(interaction) {
    const timestamp = now();
    for (const [key, until] of requests) if (until <= timestamp) requests.delete(key);
    const key = `${interaction.guildId}:${interaction.user.id}`;
    if ((requests.get(key) || 0) > timestamp) return false;
    if (requests.size >= 2000) requests.delete(requests.keys().next().value);
    requests.set(key, timestamp + 5000);
    return true;
  }

  async function buildCardPayload(interaction, userId) {
    const [user, member] = await Promise.all([fetchUser(interaction, userId), fetchMember(interaction.guild, userId)]);
    if (!member) return { content: 'Bu kullanıcı artık sunucuda bulunmuyor.', files: [], attachments: [], components: [] };
    if (user.bot) return { content: 'Botlar seviye sistemine dahil değildir.', files: [], attachments: [], components: [] };
    const stats = store.getMember(interaction.guildId, userId);
    const rank = store.getRank(interaction.guildId, userId);
    const card = await renderer.renderLevelCard(profileModel(user, member, stats, rank));
    const notes = [];
    if (!store.getConfig(interaction.guildId).enabled) notes.push('Seviye sistemi şu anda kapalı; XP kazanımı duraklatıldı.');
    if (!card.animated) notes.push('Animasyon oluşturulamadığı için kartın sabit sürümü gösteriliyor.');
    return {
      content: notes.join('\n') || null,
      files: [new AttachmentBuilder(card.buffer, { name: card.name, description: `${member.displayName || user.username} · Seviye ${stats.level} · Sıra ${rank ? '#' + rank : '—'} · ${number(stats.currentXp)} / ${number(stats.requiredXp)} XP` })],
      attachments: [],
      components: cardControls(interaction.user.id, userId),
      allowedMentions: { parse: [] },
    };
  }

  async function buildLeaderboardPayload(interaction, page = 1) {
    const board = store.getLeaderboard(interaction.guildId, { page, pageSize: PAGE_SIZE });
    const entries = await Promise.all(board.entries.map(async entry => {
      const member = await fetchMember(interaction.guild, entry.userId).catch(() => null);
      const user = member?.user || interaction.client.users.cache.get(entry.userId);
      return {
        ...entry,
        displayName: member?.displayName || user?.globalName || user?.username || `Üye · ${entry.userId.slice(-6)}`,
        avatarURL: member?.displayAvatarURL?.({ size: 128, extension: 'png', forceStatic: true })
          || user?.displayAvatarURL?.({ size: 128, extension: 'png', forceStatic: true }) || null,
      };
    }));
    const result = await renderer.renderLeaderboard({
      ...board, entries, guildName: interaction.guild.name,
      guildIconURL: interaction.guild.iconURL?.({ size: 128, extension: 'png', forceStatic: true }) || null,
      viewerId: interaction.user.id,
    });
    const ownRank = store.getRank(interaction.guildId, interaction.user.id);
    const ownStats = store.getMember(interaction.guildId, interaction.user.id);
    const activeNote = store.getConfig(interaction.guildId).enabled ? '' : '\nXP kazanımı şu anda duraklatıldı.';
    return {
      content: `**Senin sıran:** ${ownRank ? '#' + number(ownRank) : 'Henüz sıralamada değilsin'} · **Seviye ${ownStats.level}** · ${number(ownStats.totalXp)} XP${activeNote}`,
      files: [new AttachmentBuilder(result.buffer, { name: result.name, description: `${interaction.guild.name} seviye liderliği · Sayfa ${board.page}/${board.pages} · ${board.total} katılımcı` })],
      attachments: [],
      components: boardControls(interaction.user.id, board.page, board.pages),
      allowedMentions: { parse: [] },
    };
  }

  async function guard(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: `${emojiler.uyari} ""Seviye kartları yalnızca sunucuda kullanılabilir.""`, flags: MessageFlags.Ephemeral });
      return false;
    }
    if (!interaction.appPermissions?.has(PermissionFlagsBits.AttachFiles)) {
      await interaction.reply({ content: `${emojiler.uyari} ""Kartları gösterebilmem için bu kanalda Dosya Ekle izni gerekli.""`, flags: MessageFlags.Ephemeral });
      return false;
    }
    if (!reserve(interaction)) {
      await interaction.reply({ content: `${emojiler.uyari} **Yeni bir kart oluşturmadan önce 5 saniye bekle.**`, flags: MessageFlags.Ephemeral });
      return false;
    }
    return true;
  }

  async function deliver(interaction, action, value, isComponent) {
    try {
      const payload = action === 'board'
        ? await buildLeaderboardPayload(interaction, Number(value))
        : await buildCardPayload(interaction, value);
      return await interaction.editReply(payload);
    } catch (error) {
      console.error('🔴 [SEVİYE] Kart oluşturulamadı:', error?.message || error);
      const content = 'Kart şu anda oluşturulamadı. Biraz sonra tekrar dene.';
      if (isComponent) return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      return interaction.editReply({ content, files: [], attachments: [], components: [] });
    }
  }

  async function execute(interaction) {
    if (!await guard(interaction)) return;
    await interaction.deferReply();
    const board = interaction.options.getSubcommand() === 'liderlik';
    return deliver(interaction, board ? 'board' : 'card', board
      ? interaction.options.getInteger('sayfa') || 1
      : (interaction.options.getUser('kullanıcı') || interaction.user).id, false);
  }

  async function handleComponent(interaction) {
    const parsed = parseComponentId(interaction.customId);
    if (!parsed || !interaction.isButton()) return interaction.reply({ content: 'Bu kontrol geçersiz. `/seviye kart` ile yeni kart aç.', flags: MessageFlags.Ephemeral });
    if (parsed.ownerId !== interaction.user.id) return interaction.reply({ content: 'Bu kartın kontrolleri komutu kullanan kişiye ait. `/seviye kart` ile kendi kartını açabilirsin.', flags: MessageFlags.Ephemeral });
    if (!await guard(interaction)) return;
    await interaction.deferUpdate();
    return deliver(interaction, parsed.action, parsed.value, true);
  }

  return { execute, handleComponent, buildCardPayload, buildLeaderboardPayload };
}

module.exports = { createLevelView, parseComponentId, profileModel, cardControls, boardControls };