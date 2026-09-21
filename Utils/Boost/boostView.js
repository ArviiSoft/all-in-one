const { ActionRowBuilder, AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder } = require('discord.js');
const { MILESTONES, getProgression, getMilestoneAt, formatDuration } = require('./boostTime');
const { renderBadge, renderProgression, renderPromotion } = require('./boostRenderer');
const { badgeText, getBadgeEmoji } = require('./boostEmojis');
const { DEFAULT_THANKS, applyBoostTemplate, normalizeThanksConfig } = require('./boostConfig');

const timestamp = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;
const monthsLabel = months => `${months} Ay`;
const code = value => `\`${String(value).replace(/[\r\n`]/g, ' ').slice(0, 80)}\``;
const text = content => new TextDisplayBuilder().setContent(content);
const separator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const gallery = name => new MediaGalleryBuilder().addItems(
  new MediaGalleryItemBuilder().setURL(`attachment://${name}`),
);
const section = (content, url) => new SectionBuilder()
  .addTextDisplayComponents(text(content))
  .setThumbnailAccessory(new ThumbnailBuilder().setURL(url));

async function buildBoostPayload(member, viewerId, now = Date.now()) {
  const state = getProgression(member.premiumSinceTimestamp, now);
  if (!state) return { content: `<@${member.id}> şu anda bu sunucuya boost basmıyor.`, allowedMentions: { parse: [] } };
  const client = member.client;
  const currentIcon = badgeText(client, state.level);
  const files = [
    new AttachmentBuilder(await renderBadge(state.level), { name: 'boost-current.png' }),
    new AttachmentBuilder(await renderProgression({ level: state.level, progress: state.progress }), { name: 'boost-progress.png' }),
  ];
  const container = new ContainerBuilder().setAccentColor(0xf47fff)
    .addSectionComponents(section([
      '**💠 @ Boost İlerlemesi**',
      `<@${member.id}> (${code(member.user.username)})`,
      `-# ⏳ Boost Başlangıcı: ${timestamp(state.startedAt)} - ${formatDuration(state.startedAt, now)} önce`,
    ].join('\n'), member.displayAvatarURL({ size: 256, extension: 'png' })))
    .addSeparatorComponents(separator())
    .addSectionComponents(section([
      `${currentIcon} **Seviye ${state.level}** ${currentIcon} (${monthsLabel(state.current.months)})`,
      '-# (Mevcut Seviye)',
      `🏆 Kazanıldı: ${timestamp(state.earnedAt)} - ${formatDuration(state.earnedAt, now)} önce`,
    ].join('\n'), 'attachment://boost-current.png'))
    .addSeparatorComponents(separator());

  if (state.next) {
    const nextIcon = badgeText(client, state.next.level);
    files.push(new AttachmentBuilder(await renderBadge(state.next.level), { name: 'boost-next.png' }));
    container.addSectionComponents(section([
      `${nextIcon} **Seviye ${state.next.level}** ${nextIcon} (${monthsLabel(state.next.months)})`,
      '-# (Sonraki Seviye)',
      `⏳ Kalan Süre: ${timestamp(state.nextAt)} - ${formatDuration(now, state.nextAt)} kaldı`,
    ].join('\n'), 'attachment://boost-next.png'));
  } else {
    container.addTextDisplayComponents(text('**✨ En Yüksek Seviyeye Ulaşıldı**\n9 boost rozetinin tamamı açıldı.'));
  }

  container.addMediaGalleryComponents(gallery('boost-progress.png'))
    .addTextDisplayComponents(text('-# Bu sunucudaki boost süresi esas alınır.'));

  const future = MILESTONES.filter(milestone => milestone.level > (state.next?.level || 9));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`boost:milestones:${viewerId}:${member.id}`)
    .setPlaceholder(future.length ? 'Sonraki Seviyeleri Gör' : 'Sonraki Seviye Yok')
    .setMinValues(1).setMaxValues(1).setDisabled(future.length === 0);
  menu.addOptions((future.length ? future : [state.current]).map(milestone => {
    const emoji = getBadgeEmoji(client, milestone.level);
    return {
      label: `Seviye ${milestone.level}`,
      description: monthsLabel(milestone.months),
      value: String(milestone.level),
      emoji: emoji ? { id: emoji.id, name: emoji.name } : { name: '💎' },
    };
  }));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container, new ActionRowBuilder().addComponents(menu)],
    files, allowedMentions: { parse: [] },
  };
}

async function buildMilestonePayload(member, level, now = Date.now()) {
  const state = getProgression(member.premiumSinceTimestamp, now);
  const milestone = MILESTONES.find(item => item.level === level);
  if (!state || !milestone) return { content: 'Boost bilgisi artık mevcut değil. `/boost` ile tekrar kontrol et.' };
  const reachedAt = getMilestoneAt(state.startedAt, level);
  const icon = badgeText(member.client, level);
  const reached = now >= reachedAt;
  const container = new ContainerBuilder().setAccentColor(0xf47fff)
    .addSectionComponents(section([
      `${icon} **Seviye ${level}** (${monthsLabel(milestone.months)})`,
      `<@${member.id}>`,
      reached
        ? `🏆 Kazanıldı: ${timestamp(reachedAt)} - ${formatDuration(reachedAt, now)} önce`
        : `⏳ Kalan Süre: ${timestamp(reachedAt)} - ${formatDuration(now, reachedAt)} kaldı`,
      `-# ${timestamp(reachedAt, 'F')}`,
    ].join('\n'), 'attachment://boost-milestone.png'))
    .addTextDisplayComponents(text('-# Bu sunucudaki boost süresi esas alınır.'));
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    files: [new AttachmentBuilder(await renderBadge(level), { name: 'boost-milestone.png' })],
    allowedMentions: { parse: [] },
  };
}

async function buildPromotionPayload(member, fromLevel, toLevel, now = Date.now()) {
  const state = getProgression(member.premiumSinceTimestamp, now);
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      text(`<@${member.id}> (${code(member.user.username)})`),
      gallery('boost-level-up.png'),
    ],
    files: [new AttachmentBuilder(await renderPromotion({ fromLevel, toLevel, progress: state?.progress || 0 }), { name: 'boost-level-up.png' })],
    allowedMentions: { parse: [], users: [member.id] },
  };
}

function avatarUrl(member) {
  return member.displayAvatarURL?.({ size: 256, extension: 'png' })
    || member.user?.displayAvatarURL?.({ size: 256, extension: 'png' })
    || member.guild?.iconURL?.({ size: 256, extension: 'png' })
    || member.client?.user?.displayAvatarURL?.({ size: 256, extension: 'png' })
    || null;
}

async function buildThankPayload(member, config = DEFAULT_THANKS, now = Date.now()) {
  const thankConfig = normalizeThanksConfig({ ...DEFAULT_THANKS, ...config });
  const content = [
    `## ${applyBoostTemplate(thankConfig.title, member)}`,
    applyBoostTemplate(thankConfig.message, member),
    `-# ${timestamp(now, 'f')}`,
  ].join('\n');
  const container = new ContainerBuilder().setAccentColor(0xf47fff);
  const thumbnail = avatarUrl(member);
  if (thumbnail) container.addSectionComponents(section(content, thumbnail));
  else container.addTextDisplayComponents(text(content));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [], users: [member.id] },
  };
}

module.exports = { buildBoostPayload, buildMilestonePayload, buildPromotionPayload, buildThankPayload };