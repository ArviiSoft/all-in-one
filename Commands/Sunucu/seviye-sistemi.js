const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  ContainerBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits,
  RoleSelectMenuBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown,
} = require('discord.js');

const PREFIX = 'levelcfg';
const FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PAGE_SIZE = 25;
const MAX_MESSAGE_LENGTH = 1500;
const VARIABLES = ['kullanici', 'kullanici_adi', 'sunucu', 'seviye', 'eski_seviye', 'xp', 'sira', 'roller'];
const SNOWFLAKE = /^\d{17,20}$/;

const id = (ownerId, action) => `${PREFIX}:${ownerId}:${action}`;
const display = content => new TextDisplayBuilder().setContent(content);
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const separator = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const button = (ownerId, action, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
  .setCustomId(id(ownerId, action)).setLabel(label).setStyle(style).setDisabled(disabled);
const payload = container => ({ components: [container], flags: FLAGS, allowedMentions: { parse: [] } });

function parseId(customId) {
  const match = /^levelcfg:(\d{17,20}):(.+)$/.exec(customId || '');
  return match ? { ownerId: match[1], action: match[2] } : null;
}

function integer(value, min, max, label) {
  const string = String(value ?? '').trim();
  const result = /^\d+$/.test(string) ? Number(string) : NaN;
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new Error(`${label}, ${min.toLocaleString('tr-TR')} ile ${max.toLocaleString('tr-TR')} arasında bir tam sayı olmalı.`);
  }
  return result;
}

function rewardPage(config, requestedPage = 0) {
  const rewards = [...(config.rewards || [])].sort((a, b) => a.level - b.level || a.roleId.localeCompare(b.roleId));
  const pages = Math.max(1, Math.ceil(rewards.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Number.isSafeInteger(requestedPage) ? requestedPage : 0));
  return { rewards, pages, page, items: rewards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) };
}

function buildPanelPayload({ guild, ownerId, config, notice = null }) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId(id(ownerId, 'channel')).setPlaceholder('Seviye atlama mesajının kanalını seç')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
  if (config.channelId && guild.channels.cache.has(config.channelId)) channel.setDefaultChannels(config.channelId);
  const sample = escapeMarkdown(String(config.message || '').replace(/\n/g, '\n> ').slice(0, 900));
  const container = new ContainerBuilder().setAccentColor(config.enabled ? 0x9d7bff : 0x64748b)
    .addTextDisplayComponents(display(`## ✦ Seviye Sistemi`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(display([
      `### ${config.enabled ? '🟢 XP kazanımı açık' : '⏸️ XP kazanımı kapalı'}`,
      `**Mesaj başına:** ${config.xpMin}-${config.xpMax} XP · **Bekleme:** ${config.cooldownSeconds} saniye`,
      `**Seviye ödülü:** ${(config.rewards || []).length} rol`,
      '-# Bot mesajları XP kazandırmaz. Bekleme süresi her üye için ayrı uygulanır.',
    ].join('\n')));
  if (notice) container.addTextDisplayComponents(display(`> ${notice}`));
  container
    .addActionRowComponents(row(
      button(ownerId, 'toggle', config.enabled ? 'XP Kazanımını Kapat' : 'XP Kazanımını Aç', config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
      button(ownerId, 'xp-edit', 'XP ve Bekleme', ButtonStyle.Primary),
      button(ownerId, 'rewards:0', 'Seviye Ödülleri', ButtonStyle.Primary),
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(display([
      '### ↗ Seviye Atlama Mesajı',
      `**Kanal:** ${config.channelId ? `<#${config.channelId}>` : 'Bildirimler kapalı'}`,
      '> ' + sample,
      `-# Değişkenler: ${VARIABLES.map(variable => `\`{${variable}}\``).join(', ')}`,
    ].join('\n')))
    .addActionRowComponents(row(channel))
    .addActionRowComponents(row(
      button(ownerId, 'message-edit', 'Mesajı Özelleştir', ButtonStyle.Primary),
      button(ownerId, 'preview', 'Özel Önizleme'),
      button(ownerId, 'channel-clear', 'Bildirimleri Kapat', ButtonStyle.Danger, !config.channelId),
      button(ownerId, 'refresh', 'Yenile', ButtonStyle.Primary),
    ))
    .addTextDisplayComponents(display('-# Kanal seçimi bildirimleri açar. XP kazanımı ayrıca açılmalıdır. Ayarlar yalnızca bu sunucuya uygulanır.'));
  return payload(container);
}

function buildRewardsPayload({ guild, ownerId, config, page: requestedPage = 0, selectedRoleId = null, notice = null }) {
  const { rewards, items, page, pages } = rewardPage(config, requestedPage);
  const selected = rewards.find(reward => reward.roleId === selectedRoleId);
  const container = new ContainerBuilder().setAccentColor(0x9d7bff)
    .addTextDisplayComponents(display([
      '## ✦ Seviye Ödülleri',
      '**Her role istediğin seviyeyi ata.** Aynı seviyeye birden fazla rol ekleyebilirsin.',
      '“Daha yüksek rol aldığında kaldır” açık olan bir ödül, üye daha yüksek seviyeli bir ödül rolünü gerçekten aldığında kaldırılır.',
      '-# Değişiklikler üyelerin bir sonraki XP kazanımında değerlendirilir.',
    ].join('\n')));
  if (notice) container.addTextDisplayComponents(display(`> ${notice}`));
  container.addSeparatorComponents(separator())
    .addTextDisplayComponents(display('### Yeni Ödül\nBir rol seç, ardından verileceği seviyeyi yaz.'))
    .addActionRowComponents(row(new RoleSelectMenuBuilder()
      .setCustomId(id(ownerId, `reward-add:${page}`)).setPlaceholder('Ödül olarak verilecek rolü seç').setMinValues(1).setMaxValues(1)))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(display([
      `### Kayıtlı Ödüller · ${rewards.length} rol · ${page + 1}/${pages}`,
      ...items.map(reward => `**Sv. ${reward.level.toLocaleString('tr-TR')}** · <@&${reward.roleId}> · ${reward.removeOnHigher ? '↑ Üst ödülde kaldır' : 'Kalıcı'}`),
      ...(!items.length ? ['Henüz ödül eklenmedi. İlk ödülünü yukarıdan seçebilirsin.'] : []),
    ].join('\n')));
  if (items.length) {
    container.addActionRowComponents(row(new StringSelectMenuBuilder()
      .setCustomId(id(ownerId, `reward-select:${page}`)).setPlaceholder('Düzenlenecek ödülü seç').setMinValues(1).setMaxValues(1)
      .addOptions(items.map(reward => ({
        label: (guild.roles.cache.get(reward.roleId)?.name || `Silinmiş rol · ${reward.roleId}`).slice(0, 100),
        description: `Seviye ${reward.level} · ${reward.removeOnHigher ? 'Üst ödülde kaldırılır' : 'Kalıcı rol'}`,
        value: reward.roleId,
        default: selectedRoleId === reward.roleId,
      })))));
  }
  if (selected) {
    container.addSeparatorComponents(separator())
      .addTextDisplayComponents(display([
        `### Seçili Ödül · <@&${selected.roleId}>`,
        `**Gerekli seviye:** ${selected.level.toLocaleString('tr-TR')}`,
        `**Daha yüksek rol aldığında bunu kaldır:** ${selected.removeOnHigher ? 'Açık' : 'Kapalı'}`,
      ].join('\n')))
      .addActionRowComponents(row(
        button(ownerId, `reward-edit:${selected.roleId}:${page}`, 'Seviyeyi Değiştir', ButtonStyle.Primary),
        button(ownerId, `reward-toggle:${selected.roleId}:${page}`, selected.removeOnHigher ? 'Üst Ödülde Kaldır: Açık' : 'Üst Ödülde Kaldır: Kapalı', selected.removeOnHigher ? ButtonStyle.Success : ButtonStyle.Secondary),
        button(ownerId, `reward-delete:${selected.roleId}:${page}`, 'Ödülü Sil', ButtonStyle.Danger),
      ));
  }
  container.addActionRowComponents(row(
    button(ownerId, `rewards-prev:${page}:${Math.max(0, page - 1)}`, '← Önceki', ButtonStyle.Secondary, page === 0),
    button(ownerId, `rewards-next:${page}:${Math.min(pages - 1, page + 1)}`, 'Sonraki →', ButtonStyle.Secondary, page >= pages - 1),
    button(ownerId, 'home', 'Ana Panele Dön', ButtonStyle.Primary),
  )).addTextDisplayComponents(display('-# Ödül değişiklikleri için Sunucuyu Yönet ve Rolleri Yönet izinleri gerekir. Botun rolü, ödül rollerinin üzerinde olmalıdır.'));
  return payload(container);
}

function input(label, customId, value, { description, maxLength = 10, paragraph = false } = {}) {
  const component = new LabelBuilder().setLabel(label).setTextInputComponent(new TextInputBuilder()
    .setCustomId(customId).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setValue(String(value)).setMaxLength(maxLength).setRequired(true));
  if (description) component.setDescription(description);
  return component;
}

function buildMessageModal(ownerId, config) {
  return new ModalBuilder().setCustomId(id(ownerId, 'message-save')).setTitle('Seviye Atlama Mesajı')
    .addLabelComponents(input('Mesaj', 'message', config.message, {
      paragraph: true, maxLength: MAX_MESSAGE_LENGTH,
      description: '{kullanici}, {seviye}, {eski_seviye}, {xp}, {sira}, {roller}, {kullanici_adi}, {sunucu}',
    }));
}

function buildXpModal(ownerId, config) {
  return new ModalBuilder().setCustomId(id(ownerId, 'xp-save')).setTitle('XP ve Bekleme Süresi')
    .addLabelComponents(
      input('En az XP', 'xpMin', config.xpMin, { description: 'Mesaj başına alt sınır: 1–1000 XP.' }),
      input('En fazla XP', 'xpMax', config.xpMax, { description: 'Üst sınır: 1–1000 XP. Alt sınırdan küçük olamaz.' }),
      input('XP kazanımı bekleme süresi (saniye)', 'cooldownSeconds', config.cooldownSeconds, { description: 'Her üye için 5–86400 saniye.' }),
    );
}

function buildRewardModal(ownerId, roleId, page, existing) {
  return new ModalBuilder().setCustomId(id(ownerId, `reward-save:${roleId}:${page}`)).setTitle('Rolün Seviye Ödülü')
    .addLabelComponents(input('Bu rol kaçıncı seviyede verilsin?', 'level', existing?.level || 1, {
      description: '1–100000. Üst ödülde kaldırma seçeneği sonraki ekranda değiştirilebilir.', maxLength: 6,
    }));
}

async function assertRoleAccess(interaction, roleId, { allowMissing = false } = {}) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Seviye ödüllerini değiştirmek için Rolleri Yönet yetkisi de gerekli.');
  }
  if (!SNOWFLAKE.test(roleId || '')) throw new Error('Geçerli bir sunucu rolü seçmelisin.');
  const guild = interaction.guild;
  const [actor, me, role] = await Promise.all([
    guild.members.fetch({ user: interaction.user.id, force: true }),
    guild.members.fetchMe({ force: true }),
    guild.roles.fetch(roleId).catch(error => {
      if (allowMissing && error.code === 10011) return null;
      throw error;
    }),
  ]);
  if (!actor.permissions.has(PermissionFlagsBits.ManageGuild) || !actor.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Bu işlem için güncel Sunucuyu Yönet ve Rolleri Yönet izinlerin gerekli.');
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Botun Rolleri Yönet izni yok.');
  if (!role) {
    if (allowMissing) return null;
    throw new Error('Rol bulunamadı. Sunucuda hâlâ bulunan bir rol seçmelisin.');
  }
  if (role.guild.id !== interaction.guildId || role.id === guild.id || role.managed) {
    throw new Error('@everyone, entegrasyon ve bot rolleri seviye ödülü olarak kullanılamaz.');
  }
  if (guild.ownerId !== actor.id && actor.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error('Yalnızca en yüksek rolünün altındaki rolleri ödül olarak yönetebilirsin.');
  }
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error('Bu rolü verebilmem için botun en yüksek rolünü ödül rolünün üzerine taşımalısın.');
  }
  return role;
}

async function selectedChannel(interaction) {
  const channelId = interaction.values?.[0];
  if (!SNOWFLAKE.test(channelId || '')) throw new Error('Bir bildirim kanalı seçmelisin.');
  const channel = await interaction.guild.channels.fetch(channelId);
  if (!channel || channel.guild.id !== interaction.guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    throw new Error('Bu sunucudan bir metin veya duyuru kanalı seçmelisin.');
  }
  const me = await interaction.guild.members.fetchMe({ force: true });
  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    throw new Error('Seçilen kanalda botun Kanalı Görüntüle ve Mesaj Gönder izinleri olmalı.');
  }
  return channel;
}

function renderPreview(template, interaction) {
  const variables = {
    kullanici: `<@${interaction.user.id}>`,
    kullanici_adi: escapeMarkdown(interaction.user.globalName || interaction.user.username),
    sunucu: escapeMarkdown(interaction.guild.name),
    seviye: '3', eski_seviye: '2', xp: '1000', sira: '7', roller: 'Örnek seviye rolü',
  };
  return String(template).replace(/\{(kullanici_adi|kullanici|sunucu|seviye|eski_seviye|xp|sira|roller)\}/g, (_, key) => variables[key]).slice(0, 2000);
}

function createPanelController(store) {
  async function execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Bu komut sunucuda ve Sunucuyu Yönet yetkisiyle kullanılabilir.', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply(buildPanelPayload({ guild: interaction.guild, ownerId: interaction.user.id, config: await store.getConfig(interaction.guildId) }));
  }

  async function handleComponent(interaction) {
    const parsed = parseId(interaction.customId);
    if (!parsed) return false;
    const fail = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    if (!interaction.inGuild()) return fail('Bu yönetim paneli yalnızca sunucuda kullanılabilir.');
    if (interaction.user.id !== parsed.ownerId) return fail('Bu panel sana ait değil. `/seviye-sistemi` ile kendi panelini açabilirsin.');
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return fail('Bu panel için Sunucuyu Yönet yetkisi gerekli.');

    let screen = 'main';
    let page = 0;
    let selectedRoleId = null;
    const refresh = async notice => {
      const config = await store.getConfig(interaction.guildId);
      return interaction.editReply((screen === 'rewards' ? buildRewardsPayload : buildPanelPayload)({
        guild: interaction.guild, ownerId: parsed.ownerId, config, page, selectedRoleId, notice,
      }));
    };
    const defer = async () => {
      if (interaction.isModalSubmit?.() && !interaction.isFromMessage?.()) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      else await interaction.deferUpdate();
    };
    try {
      const config = await store.getConfig(interaction.guildId);
      const [action, first, second] = parsed.action.split(':');
      if (action === 'message-edit') return interaction.showModal(buildMessageModal(parsed.ownerId, config));
      if (action === 'xp-edit') return interaction.showModal(buildXpModal(parsed.ownerId, config));
      if (action === 'preview') {
        return interaction.reply({
          content: renderPreview(config.message, interaction), flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }
      if (action.startsWith('reward-') || action.startsWith('rewards-') || action === 'rewards') {
        screen = 'rewards';
        page = integer(action === 'rewards-prev' || action === 'rewards-next' ? second : (second ?? first ?? 0), 0, 100000, 'Sayfa');
      }
      if (action === 'reward-add' || action === 'reward-edit') {
        const roleId = action === 'reward-add' ? interaction.values?.[0] : first;
        await assertRoleAccess(interaction, roleId);
        return interaction.showModal(buildRewardModal(parsed.ownerId, roleId, page, config.rewards.find(reward => reward.roleId === roleId)));
      }
      await defer();
      if (action === 'toggle') {
        await store.updateConfig(interaction.guildId, { enabled: !config.enabled });
        return refresh(config.enabled ? '⏸️ XP kazanımı kapatıldı; üyelerin ilerlemesi korundu.' : '✅ XP kazanımı açıldı.');
      }
      if (action === 'channel') {
        const channel = await selectedChannel(interaction);
        await store.updateConfig(interaction.guildId, { channelId: channel.id });
        return refresh(`✅ Seviye atlama mesajları <#${channel.id}> kanalına gönderilecek.`);
      }
      if (action === 'channel-clear') {
        await store.updateConfig(interaction.guildId, { channelId: null });
        return refresh('✅ Seviye atlama bildirimleri kapatıldı.');
      }
      if (action === 'message-save') {
        const message = interaction.fields.getTextInputValue('message').trim();
        if (!message || message.length > MAX_MESSAGE_LENGTH) throw new Error(`Mesaj 1–${MAX_MESSAGE_LENGTH} karakter olmalı.`);
        await store.updateConfig(interaction.guildId, { message });
        return refresh('✅ Seviye atlama mesajı kaydedildi. Özel Önizleme ile kontrol edebilirsin.');
      }
      if (action === 'xp-save') {
        const xpMin = integer(interaction.fields.getTextInputValue('xpMin'), 1, 1000, 'En az XP');
        const xpMax = integer(interaction.fields.getTextInputValue('xpMax'), 1, 1000, 'En fazla XP');
        const cooldownSeconds = integer(interaction.fields.getTextInputValue('cooldownSeconds'), 5, 86400, 'Bekleme süresi');
        if (xpMin > xpMax) throw new Error('En az XP, en fazla XP değerinden büyük olamaz.');
        await store.updateConfig(interaction.guildId, { xpMin, xpMax, cooldownSeconds });
        return refresh('✅ XP aralığı ve bekleme süresi kaydedildi.');
      }
      if (action === 'reward-select') {
        selectedRoleId = interaction.values?.[0];
        if (!config.rewards.some(reward => reward.roleId === selectedRoleId)) throw new Error('Bu ödül artık bulunamıyor. Listeyi yenileyip tekrar seç.');
        return refresh();
      }
      if (['reward-save', 'reward-toggle', 'reward-delete'].includes(action)) {
        selectedRoleId = first;
        await assertRoleAccess(interaction, selectedRoleId, { allowMissing: action === 'reward-delete' });
        const current = (await store.getConfig(interaction.guildId)).rewards.find(reward => reward.roleId === selectedRoleId);
        if (action !== 'reward-save' && !current) throw new Error('Bu ödül artık bulunamıyor.');
        if (action === 'reward-delete') {
          await store.removeReward(interaction.guildId, selectedRoleId);
          selectedRoleId = null;
          return refresh('✅ Ödül ayarı silindi. Üyelerdeki mevcut roller değiştirilmedi.');
        }
        const level = action === 'reward-save'
          ? integer(interaction.fields.getTextInputValue('level'), 1, 100000, 'Ödül seviyesi')
          : current.level;
        await store.upsertReward(interaction.guildId, {
          roleId: selectedRoleId, level,
          removeOnHigher: action === 'reward-toggle' ? !current.removeOnHigher : Boolean(current?.removeOnHigher),
        });
        const updated = await store.getConfig(interaction.guildId);
        page = Math.floor(rewardPage(updated).rewards.findIndex(reward => reward.roleId === selectedRoleId) / PAGE_SIZE);
        return refresh(action === 'reward-save' ? '✅ Rolün seviye ödülü kaydedildi.' : '✅ Daha yüksek ödülde kaldırma tercihi güncellendi.');
      }
      if (['home', 'refresh', 'rewards', 'rewards-prev', 'rewards-next'].includes(action)) return refresh();
      throw new Error('Bu panel işlemi artık kullanılamıyor. `/seviye-sistemi` ile paneli yeniden aç.');
    } catch (error) {
      console.error('[LEVEL] Yönetim paneli işlemi uygulanamadı:', error.message);
      const message = error.message || 'İşlem tamamlanamadı. Biraz sonra tekrar dene.';
      if (interaction.deferred || interaction.replied) return refresh(`⚠️ ${message}`);
      return fail(`⚠️ ${message}`);
    }
  }
  return { execute, handleComponent };
}

let controller;
const defaultController = () => controller || (controller = createPanelController(require('../../Utils/Level/levelStore')));

module.exports = {
  data: new SlashCommandBuilder().setName('seviye-sistemi')
    .setDescription('XP, seviye bildirimleri ve rol ödülleri yönetim panelini açar.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: interaction => defaultController().execute(interaction),
  handleComponent: interaction => defaultController().handleComponent(interaction),
  buildPanelPayload, buildRewardsPayload, buildMessageModal, buildXpModal, buildRewardModal,
  createPanelController,
};
