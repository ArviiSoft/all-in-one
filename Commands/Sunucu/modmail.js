const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ContainerBuilder, TextDisplayBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const store = require('../../Utils/ModMail/modmailStore');
const { saveConfig } = require('../../Utils/ModMail/modmailConfig');
const { describeConflicts, disableAnonymous } = require('../../Utils/ModMail/dmConflicts');
const service = require('../../Utils/ModMail/modmailService');
const { respond } = require('../../Utils/ModMail/modmailResponses');
const flags = MessageFlags.IsComponentsV2;
const text = content => new TextDisplayBuilder().setContent(content);

function panel(guild, ownerId, notice = '', page = 0) {
  const config = store.getConfig(guild.id);
  const sessions = store.listSessions(guild.id);
  const conflicts = describeConflicts(guild.client);
  const id = action => `mm:panel:${ownerId}:${page}:${action}`;
  const button = (action, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id(action)).setLabel(label).setStyle(style);
  const category = new ChannelSelectMenuBuilder().setCustomId(id('category')).setPlaceholder('Talep kanallarının kategorisi').setChannelTypes(ChannelType.GuildCategory);
  const log = new ChannelSelectMenuBuilder().setCustomId(id('log')).setPlaceholder('Transcript log kanalı').setChannelTypes(ChannelType.GuildText);
  const role = new RoleSelectMenuBuilder().setCustomId(id('role')).setPlaceholder('ModMail yetkili rolü');
  if (config.categoryId) category.setDefaultChannels(config.categoryId);
  if (config.logChannelId) log.setDefaultChannels(config.logChannelId);
  if (config.staffRoleId) role.setDefaultRoles(config.staffRoleId);
  const container = new ContainerBuilder().setAccentColor(config.enabled ? 0x57f287 : 0x5865f2)
    .addTextDisplayComponents(text([
      '## 📬 ModMail Yönetim Paneli',
      `**Durum:** ${config.enabled ? '🟢 Açık' : '⚫ Kapalı'} · **Açık talepler:** ${sessions.length}/${config.maxOpenTickets}`,
      `**Kategori:** ${config.categoryId ? `<#${config.categoryId}>` : 'Seçilmedi'}`,
      `**Log kanalı:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Seçilmedi'}`,
      `**Yetkili rolü:** ${config.staffRoleId ? `<@&${config.staffRoleId}>` : 'Seçilmedi'}`,
      'Ayarlar Dashboard ile ortaktır ve hemen kaydedilir. Sistemi kapatmak yeni talepleri durdurur, açık talepler tamamlanabilir.',
      conflicts.length ? `\n**Önce kapatılması gereken DM sistemleri:**\n${conflicts.slice(0, 8).map(value => `• ${value}`).join('\n').slice(0, 1000)}\nDiğer sunucuların çakışmalarını ilgili yöneticiler kapatmalıdır.` : '\n✅ DM çakışması yok.',
      notice ? `\n${notice}` : '',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(category), new ActionRowBuilder().addComponents(log), new ActionRowBuilder().addComponents(role))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button(config.enabled ? 'disable' : 'enable', config.enabled ? 'Sistemi Kapat' : 'Sistemi Kur / Aç', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      button('messages', 'Mesajlar ve Sınır'), button('anonymous', 'Anonim Sohbeti Kapat'), button('refresh', 'Yenile', ButtonStyle.Primary), button('reset', 'Ayarları Sıfırla', ButtonStyle.Danger),
    ));
  if (sessions.length) {
    const start = Math.min(page * 25, Math.floor((sessions.length - 1) / 25) * 25);
    const select = new StringSelectMenuBuilder().setCustomId(id('ticket')).setPlaceholder('Açık bir talebi yönet')
      .addOptions(sessions.slice(start, start + 25).map(session => ({
        label: `${session.userId} • ${session.status === 'open' ? 'Açık' : 'Kapanış bekliyor'}`, value: session.channelId,
        description: `Talep: ${session.channelId}`,
      })));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
    if (sessions.length > 25) container.addActionRowComponents(new ActionRowBuilder().addComponents(button('page', page ? 'İlk 25 talep' : 'Sonraki talepler')));
  }
  return { components: [container], flags, allowedMentions: { parse: [] } };
}
function textModal(ownerId, page, config) {
  const modal = new ModalBuilder().setCustomId(`mm:panel:${ownerId}:${page}:saveMessages`).setTitle('ModMail Mesajları ve Talep Sınırı');
  for (const [id, label, value, max, style] of [
    ['welcomeMessage', 'Karşılama mesajı', config.welcomeMessage, 1000, TextInputStyle.Paragraph],
    ['closeMessage', 'Kapanış mesajı', config.closeMessage, 1000, TextInputStyle.Paragraph],
    ['maxOpenTickets', 'Açık talep sınırı (1–50)', String(config.maxOpenTickets), 2, TextInputStyle.Short],
  ]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setValue(value).setMaxLength(max).setRequired(true).setStyle(style)));
  return modal;
}
async function handlePanel(interaction) {
  const [, , ownerId, pageRaw, action] = interaction.customId.split(':');
  const page = Number(pageRaw) === 1 ? 1 : 0;
  if (!interaction.guild || interaction.user.id !== ownerId || !interaction.memberPermissions?.has(P.Administrator)) {
    throw new TypeError('Bu paneli yalnızca açan yönetici kullanabilir. /modmail ile kendi panelinizi açın.');
  }
  const config = store.getConfig(interaction.guildId);
  if (action === 'messages') return respond(interaction, 'showModal', textModal(ownerId, page, config));
  if (action === 'anonymous' || action === 'reset') {
    const message = action === 'anonymous'
      ? 'Bu sunucunun Anonim Sohbet paneli, bekleme kuyruğu ve açık anonim sohbetleri kapatılacak. Ardından ModMail sistemini ayrıca açabilirsiniz.'
      : 'ModMail ayarları sıfırlanacak. Önce tüm açık talepleri kapatmalısınız.';
    return respond(interaction, 'update', { components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(text(message))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mm:panel:${ownerId}:${page}:${action}Confirm`).setLabel('Onayla').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`mm:panel:${ownerId}:${page}:refresh`).setLabel('Geri Dön').setStyle(ButtonStyle.Secondary),
      ))], flags });
  }
  if (action === 'ticket') {
    const session = store.getSession(interaction.values[0]);
    if (!session || session.guildId !== interaction.guildId) throw new TypeError('Talep artık açık değil. Paneli yenileyin.');
    return respond(interaction, 'reply', { ...service.sessionPayload(session), flags: flags | MessageFlags.Ephemeral });
  }
  if (!await respond(interaction, 'deferUpdate')) return;
  let notice = '';
  if (action === 'category') await saveConfig(interaction.guild, { categoryId: interaction.values[0] });
  if (action === 'log') await saveConfig(interaction.guild, { logChannelId: interaction.values[0] });
  if (action === 'role') await saveConfig(interaction.guild, { staffRoleId: interaction.values[0] });
  if (action === 'enable' || action === 'disable') {
    await saveConfig(interaction.guild, { enabled: action === 'enable' });
    notice = action === 'enable' ? '✅ ModMail açıldı. Üyeler bota DM göndererek talep açabilir.' : 'ModMail bu sunucuda kapatıldı; mevcut talepler tamamlanabilir. Başka sunucuda açık ModMail yoksa botun normal durumu geri yüklendi.';
  }
  if (action === 'saveMessages') await saveConfig(interaction.guild, {
    welcomeMessage: interaction.fields.getTextInputValue('welcomeMessage'), closeMessage: interaction.fields.getTextInputValue('closeMessage'),
    maxOpenTickets: Number(interaction.fields.getTextInputValue('maxOpenTickets')),
  });
  if (action === 'anonymousConfirm') {
    await disableAnonymous(interaction.guild);
    notice = 'Anonim Sohbet ve açık sohbetleri bu sunucuda kapatıldı. ModMail kurulumuna devam edebilirsiniz.';
  }
  if (action === 'resetConfirm') {
    if (store.listSessions(interaction.guildId).length) throw new TypeError('Önce açık ModMail taleplerini kapatın.');
    await saveConfig(interaction.guild, { ...store.DEFAULT_CONFIG });
    notice = 'ModMail ayarları sıfırlandı.';
  }
  return respond(interaction, 'editReply', panel(interaction.guild, ownerId, notice, action === 'page' ? 1 - page : page));
}
async function handleTicket(interaction) {
  const [, action, channelId] = interaction.customId.split(':');
  const session = store.getSession(channelId);
  if (!interaction.guild) throw new TypeError('Bu işlem sunucu içinde kullanılmalı.');
  if (action === 'close') {
    await service.requireStaff(interaction.guild, interaction.user.id, session);
    return respond(interaction, 'showModal', new ModalBuilder().setCustomId(`mm:finish:${channelId}`).setTitle('ModMail Talebini Kapat')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Kapatma nedeni').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true))));
  }
  if (!await respond(interaction, 'deferReply', { flags: MessageFlags.Ephemeral })) return;
  await service.requireStaff(interaction.guild, interaction.user.id, session);
  if (action === 'claim') {
    await service.claimSession(interaction.guild, channelId, interaction.user.id);
    return respond(interaction, 'editReply', 'Talebi üstlendiniz.');
  }
  if (action === 'finish') {
    await respond(interaction, 'editReply', 'Transcript hazırlanıyor ve log kanalına kaydediliyor. Kayıt tamamlanınca talep kanalı kapatılacak.');
    const result = await service.closeSession(interaction.guild, channelId, interaction.user.id, interaction.fields.getTextInputValue('reason'));
    if (interaction.channelId === channelId) return;
    return respond(interaction, 'editReply', `Talep kapatıldı ve transcript log kanalına kaydedildi.${result.dmDelivered ? '' : ' Üyeye DM gönderilemedi; log kaydı korundu.'}`);
  }
}
module.exports = {
  data: new SlashCommandBuilder().setName('modmail').setDescription('ModMail sistemini kurun ve yönetin.').setDefaultMemberPermissions(P.Administrator).setDMPermission(false),
  async execute(interaction) {
    if (!interaction.guild || !interaction.memberPermissions?.has(P.Administrator)) return respond(interaction, 'reply', { content: 'Bu komutu sunucuda bir yönetici kullanmalı.', flags: MessageFlags.Ephemeral });
    return respond(interaction, 'reply', { ...panel(interaction.guild, interaction.user.id), flags: flags | MessageFlags.Ephemeral });
  },
  panel, handlePanel, handleTicket,
};
