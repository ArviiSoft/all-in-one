const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder, escapeMarkdown } = require('discord.js');
const { getTracker } = require('../../Utils/Boost/boostTracker');
const { ensureBoostEmojis, getBadgeEmoji } = require('../../Utils/Boost/boostEmojis');
const { buildPromotionPayload } = require('../../Utils/Boost/boostView');
const { DEFAULT_THANKS, MAX_THANK_MESSAGE_LENGTH, MAX_THANK_TITLE_LENGTH, getSystemBoostSource } = require('../../Utils/Boost/boostConfig');
const { getProgression } = require('../../Utils/Boost/boostTime');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const PANEL_PREFIX = 'boostcfg';
const PANEL_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PUBLIC_FLAGS = MessageFlags.IsComponentsV2;
const ACCENT_COLOR = 0xf47fff;
const WARNING_COLOR = 0xfee75c;
const ERROR_COLOR = 0xed4245;
const THANK_REQUIRED_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
const LEVEL_REQUIRED_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];

function makeId(ownerId, action) {
  return `${PANEL_PREFIX}:${ownerId}:${action}`;
}

function parseId(customId) {
  const match = new RegExp(`^${PANEL_PREFIX}:(\\d{17,20}):(.+)$`).exec(customId || '');
  return match ? { ownerId: match[1], action: match[2] } : null;
}

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : '`Seçilmedi`';
}

function formatStatus(enabled, channelId) {
  if (enabled && channelId) return '🟢 **Açık**';
  if (channelId) return '🟠 **Hazır, kapalı**';
  return '🔴 **Ayarlanmadı**';
}

function formatSourceStatus(source) {
  if (source.active) return '🟢 **Ayarlı ve boost mesajları açık**';
  if (source.configured) return '🟠 **Kanal ayarlı, boost mesajları kapalı**';
  return '🔴 **Sunucu Sistem Mesajları Kanalı ayarlı değil**';
}

function formatThanksStatus(thanks, source) {
  if (!source.active) return '🔴 **Kullanılamaz**';
  return formatStatus(thanks.enabled, thanks.channelId);
}

function sourceHelp(source) {
  if (source.active) {
    return '-# Bot, bu kanala düşen Discord boost sistem mesajının türünü dinler ve takip eder.';
  }
  return '-# Sunucu Ayarları > Genel > Sistem Mesajları bölümünden kanal seçip boost mesajlarını açmalısın.';
}

function cleanInline(value, fallback = 'Yok') {
  const textValue = String(value || fallback).replace(/[\r\n`]/g, ' ').slice(0, 90);
  return `\`${textValue}\``;
}

function trimBlock(value, maxLength = 260) {
  const textValue = String(value || '').trim();
  return textValue.length > maxLength ? `${textValue.slice(0, maxLength - 3)}...` : textValue;
}

function buildNoticePayload(title, description, error = false) {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(error ? ERROR_COLOR : ACCENT_COLOR)
        .addTextDisplayComponents(text(`## ${title}\n${description}`)),
    ],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function buildThankModal(ownerId, thanks) {
  return new ModalBuilder()
    .setCustomId(makeId(ownerId, 'thanks-modal'))
    .setTitle('Boost Teşekkür Mesajı')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Başlık')
        .setDescription(`En fazla ${MAX_THANK_TITLE_LENGTH} karakter.`)
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('title')
            .setStyle(TextInputStyle.Short)
            .setValue(thanks.title || DEFAULT_THANKS.title)
            .setMaxLength(MAX_THANK_TITLE_LENGTH)
            .setRequired(true)
        ),
      new LabelBuilder()
        .setLabel('Mesaj')
        .setDescription('{user}, {username}, {server}, {boosts} değişkenlerini kullanabilirsin.')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('message')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(thanks.message || DEFAULT_THANKS.message)
            .setMaxLength(MAX_THANK_MESSAGE_LENGTH)
            .setRequired(true)
        )
    );
}

function buildPanelPayload({ guild, ownerId, settings, notice = null }) {
  const guildName = escapeMarkdown(guild.name, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
  const thumbnailUrl = guild.iconURL({ extension: 'png', size: 256 })
    || guild.client.user.displayAvatarURL({ extension: 'png', size: 256 });
  const thanks = settings.thanks;
  const level = settings.level;
  const source = getSystemBoostSource(guild);
  const thanksLocked = !source.active;
  const accent = ((source.active && thanks.enabled) || level.enabled) ? ACCENT_COLOR : WARNING_COLOR;
  const thanksChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(ownerId, 'thanks-channel'))
    .setPlaceholder('Teşekkür mesajının gönderileceği kanalı seç')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(thanksLocked);
  const levelChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeId(ownerId, 'level-channel'))
    .setPlaceholder('Seviye değişimi bildirim kanalını seç')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  if (thanks.channelId && guild.channels.cache.has(thanks.channelId)) {
    thanksChannelSelect.setDefaultChannels(thanks.channelId);
  }
  if (level.channelId && guild.channels.cache.has(level.channelId)) {
    levelChannelSelect.setDefaultChannels(level.channelId);
  }

  const container = new ContainerBuilder()
    .setAccentColor(accent)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text([
          '## 💎 Boost Bildirim',
          `**${guildName}** sunucusunun boost teşekkür mesajlarını ve rozet seviye bildirimlerini yönetir.`,
        ].join('\n')))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      '### Sistem Durumu',
      `**Discord boost kanalı:** ${source.channelId ? formatChannel(source.channelId) : '`Ayarlanmadı`'}`,
      `**Teşekkür mesajı:** ${formatThanksStatus(thanks, source)}`,
      `**Teşekkür kanalı:** ${formatChannel(thanks.channelId)}`,
      `**Seviye bildirimi:** ${formatStatus(level.enabled, level.channelId)}`,
      `**Seviye kanalı:** ${formatChannel(level.channelId)}`,
      `**Takipteki booster:** \`${settings.memberCount}\``,
    ].join('\n')));

  if (notice) {
    container.addTextDisplayComponents(text(`> ${notice}`));
  }

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      '### 1 · Discord Boost Mesaj Kanalı',
      `Durum: ${formatSourceStatus(source)}`,
      `Kanal: ${source.channelId ? formatChannel(source.channelId) : '`Seçilmedi`'}`,
      '-# Bu alan Discord sunucu ayarlarından gelir, bot bu kanalı değiştirmez.',
      sourceHelp(source),
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      '### 2 · Boost Teşekkür Mesajı',
      `Seçili kanal: ${formatChannel(thanks.channelId)}`,
      `Başlık: ${cleanInline(thanks.title)}`,
      '-# Bir üye boost bastığında bu mesaj gönderilir. Thumbnail otomatik olarak üyenin avatarıdır.',
      '```text',
      trimBlock(thanks.message),
      '```',
      '-# Değişkenler: `{user}`, `{username}`, `{server}`, `{boosts}`',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(thanksChannelSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'thanks-edit'))
        .setLabel('Mesajı Düzenle')
        .setEmoji('✍️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(thanksLocked),
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'thanks-toggle'))
        .setLabel(thanks.enabled ? 'Teşekkürü Kapat' : 'Teşekkürü Aç')
        .setEmoji(thanks.enabled ? '⏸️' : '▶️')
        .setStyle(thanks.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(thanksLocked || !thanks.channelId),
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'thanks-test'))
        .setLabel('Test Gönder')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(thanksLocked || !thanks.channelId)
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      '### 3 · Rozet Seviye Bildirimi',
      `Seçili kanal: ${formatChannel(level.channelId)}`,
      '-# Üyenin boost rozeti yeni seviyeye ulaştığında görselli ilerleme bildirimi gönderilir.',
      '-# Kanal seçildiğinde mevcut booster seviyeleri kaydedilir; sonraki seviye değişimlerinde bildirim gider.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(levelChannelSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'level-disable'))
        .setLabel('Seviye Bildirimini Kapat')
        .setEmoji('⏸️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!level.enabled),
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'level-test'))
        .setLabel('Test Gönder')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!level.channelId)
    ))
    .addSeparatorComponents(separator())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'refresh'))
        .setLabel('Yenile')
        .setEmoji(emojiler.yukleniyor || '🔄')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(makeId(ownerId, 'disable-all'))
        .setLabel('Sistemi Kapat')
        .setEmoji(emojiler.kapat_arviis || '⛔')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!thanks.enabled && !level.enabled)
    ))
    .addTextDisplayComponents(text('-# Panel yalnızca Sunucuyu Yönet yetkisi olan kullanıcılar tarafından kullanılabilir.'));

  return {
    components: [container],
    flags: PANEL_FLAGS,
    allowedMentions: { parse: [] },
  };
}

function assertSystemBoostSource(guild) {
  const source = getSystemBoostSource(guild);
  if (source.active) return source;
  if (!source.configured) {
    throw new Error('Teşekkür sistemi için önce Discord sunucu ayarlarından Sistem Mesajları Kanalı seçilmeli.');
  }
  throw new Error('Discord sunucu ayarlarında boost sistem mesajları kapalı görünüyor. Teşekkür sistemi için bu ayarı açmalısın.');
}

async function getTextChannel(interaction) {
  const channelId = interaction.values?.[0];
  const channel = interaction.channels?.get(channelId)
    || interaction.guild.channels.cache.get(channelId)
    || await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.guild?.id !== interaction.guildId || typeof channel.send !== 'function') {
    throw new Error('Bu sunucudaki bir metin kanalı seçmelisin.');
  }
  return channel;
}

async function assertChannelPermissions(guild, channel, permissions, label) {
  const me = guild.members.me || await guild.members.fetchMe();
  const channelPermissions = channel?.permissionsFor(me);
  if (!channelPermissions?.has(permissions)) {
    throw new Error(`${label} için seçilen kanalda gerekli bot izinleri eksik.`);
  }
  return channelPermissions;
}

async function editPanel(interaction, settings, notice = null) {
  return interaction.editReply(buildPanelPayload({
    guild: interaction.guild,
    ownerId: parseId(interaction.customId)?.ownerId || interaction.user.id,
    settings,
    notice,
  }));
}

async function sendLevelTest(interaction, channelId) {
  const channel = interaction.guild.channels.cache.get(channelId)
    || await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') throw new Error('Seviye bildirim kanalı bulunamadı.');
  await ensureBoostEmojis(interaction.client);
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => interaction.member);
  const state = getProgression(member?.premiumSinceTimestamp);
  const toLevel = state?.level || 1;
  const fromLevel = toLevel > 1 ? toLevel - 1 : 0;
  const payload = await buildPromotionPayload(member, fromLevel, toLevel);
  const sent = await channel.send({
    ...payload,
    flags: PUBLIC_FLAGS,
    allowedMentions: { parse: [], users: [member.id], repliedUser: false },
  });
  const emoji = getBadgeEmoji(interaction.client, toLevel);
  await sent.react(emoji?.id || '💎').catch(() => null);
  await sent.react('🎉').catch(() => null);
  return sent;
}

async function execute(interaction) {
  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Bu komut için Sunucuyu Yönet yetkisi gerekli.', flags: MessageFlags.Ephemeral });
  }
  const tracker = getTracker(interaction.client);
  return interaction.reply(buildPanelPayload({
    guild: interaction.guild,
    ownerId: interaction.user.id,
    settings: tracker.getSettings(interaction.guildId),
  }));
}

async function handleComponent(interaction) {
  const parsed = parseId(interaction.customId);
  if (!parsed || !interaction.inGuild()) return false;
  if (interaction.user.id !== parsed.ownerId) {
    return interaction.reply({ content: `${emojiler.uyari} **Bu yönetim paneli sana ait değil.**`, flags: MessageFlags.Ephemeral });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Bu panel için Sunucuyu Yönet yetkisi gerekli.', flags: MessageFlags.Ephemeral });
  }

  const tracker = getTracker(interaction.client);
  try {
    if (parsed.action === 'thanks-edit') {
      assertSystemBoostSource(interaction.guild);
      return interaction.showModal(buildThankModal(parsed.ownerId, tracker.getSettings(interaction.guildId).thanks));
    }

    if (parsed.action === 'thanks-modal') {
      if (typeof interaction.deferUpdate === 'function') await interaction.deferUpdate();
      else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      assertSystemBoostSource(interaction.guild);
      const title = interaction.fields.getTextInputValue('title');
      const message = interaction.fields.getTextInputValue('message');
      const settings = await tracker.setThanksMessage(interaction.guildId, { title, message });
      return editPanel(interaction, settings, `${emojiler.tik || '✅'} Teşekkür mesajı güncellendi.`);
    }

    if (parsed.action === 'thanks-channel') {
      await interaction.deferUpdate();
      assertSystemBoostSource(interaction.guild);
      const channel = await getTextChannel(interaction);
      await assertChannelPermissions(interaction.guild, channel, THANK_REQUIRED_PERMISSIONS, 'Teşekkür mesajı');
      const settings = await tracker.setThanksChannel(interaction.guild, channel);
      return editPanel(interaction, settings, `${emojiler.tik || '✅'} Teşekkür mesajı <#${channel.id}> kanalına ayarlandı ve açıldı.`);
    }

    if (parsed.action === 'level-channel') {
      await interaction.deferUpdate();
      const channel = await getTextChannel(interaction);
      const permissions = await assertChannelPermissions(interaction.guild, channel, LEVEL_REQUIRED_PERMISSIONS, 'Seviye bildirimi');
      await tracker.configure(interaction.guild, channel);
      await ensureBoostEmojis(interaction.client);
      const reactionNote = permissions.has([PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory])
        ? ''
        : ' Rozet ve kutlama tepkileri için Tepki Ekle ve Mesaj Geçmişini Oku izinlerini de açabilirsin.';
      return editPanel(
        interaction,
        tracker.getSettings(interaction.guildId),
        `${emojiler.tik || '✅'} Seviye bildirimi <#${channel.id}> kanalına ayarlandı.${reactionNote}`
      );
    }

    if (parsed.action === 'thanks-toggle') {
      await interaction.deferUpdate();
      assertSystemBoostSource(interaction.guild);
      const current = tracker.getSettings(interaction.guildId);
      if (!current.thanks.enabled && current.thanks.channelId) {
        const channel = interaction.guild.channels.cache.get(current.thanks.channelId)
          || await interaction.guild.channels.fetch(current.thanks.channelId).catch(() => null);
        await assertChannelPermissions(interaction.guild, channel, THANK_REQUIRED_PERMISSIONS, 'Teşekkür mesajı');
      }
      const settings = await tracker.setThanksEnabled(interaction.guildId, !current.thanks.enabled);
      return editPanel(interaction, settings, settings.thanks.enabled ? 'Teşekkür mesajı açıldı.' : 'Teşekkür mesajı kapatıldı.');
    }

    if (parsed.action === 'thanks-test') {
      await interaction.deferUpdate();
      assertSystemBoostSource(interaction.guild);
      const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => interaction.member);
      await tracker.sendBoostThanks(member, { force: true });
      return editPanel(interaction, tracker.getSettings(interaction.guildId), `${emojiler.tik || '✅'} Teşekkür test mesajı gönderildi.`);
    }

    if (parsed.action === 'level-test') {
      await interaction.deferUpdate();
      const settings = tracker.getSettings(interaction.guildId);
      await sendLevelTest(interaction, settings.level.channelId);
      return editPanel(interaction, tracker.getSettings(interaction.guildId), `${emojiler.tik || '✅'} Seviye bildirimi test mesajı gönderildi.`);
    }

    if (parsed.action === 'level-disable') {
      await interaction.deferUpdate();
      await tracker.disable(interaction.guildId);
      return editPanel(interaction, tracker.getSettings(interaction.guildId), 'Seviye bildirimi kapatıldı.');
    }

    if (parsed.action === 'refresh') {
      await interaction.deferUpdate();
      return editPanel(interaction, tracker.getSettings(interaction.guildId), 'Panel yenilendi.');
    }

    if (parsed.action === 'disable-all') {
      await interaction.deferUpdate();
      await tracker.disable(interaction.guildId);
      await tracker.setThanksEnabled(interaction.guildId, false);
      return editPanel(interaction, tracker.getSettings(interaction.guildId), 'Boost bildirim sistemi kapatıldı.');
    }

    return interaction.reply({ content: 'Bu panel işlemi artık kullanılamıyor. `/boost-bildirim` ile yeni panel aç.', flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('🔴 [BOOST] Yönetim paneli işlemi uygulanamadı:', error);
    const message = error.message || 'İşlem sırasında beklenmeyen bir hata oluştu.';
    if (interaction.deferred || interaction.replied) {
      return editPanel(interaction, tracker.getSettings(interaction.guildId), `⚠️ ${message}`).catch(() => null);
    }
    return interaction.reply(buildNoticePayload('İşlem Tamamlanamadı', message, true)).catch(() => null);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boost-bildirim')
    .setDescription('Boost teşekkür ve rozet seviye bildirim yönetim panelini açar.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  buildPanelPayload,
  buildThankModal,
  execute,
  handleComponent,
};