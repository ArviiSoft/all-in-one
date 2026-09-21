const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageType, StringSelectMenuBuilder, UserSelectMenuBuilder, LabelBuilder, OverwriteType, ComponentType, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MessageFlags } = require('discord.js');
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { createSupportPanelPayload, createTranscriptInfo, buildTranscriptLogPayload, buildTicketTranscriptHtml, transcriptFileName } = require('../../Utils/Tickets/ticketTranscript');
const { loadDB, saveDB } = require('../../Utils/Tickets/ticketStore');

const priorityEmojis = {
  'düşük': '🟢',
  dusuk: '🟢',
  orta: '🟡',
  yuksek: '🔴',
  'yüksek': '🔴'
};

function ticketChannelName(displayName, priority) {
  const prioritySuffix = priority ? `❯${priorityEmojis[priority] || '🟢'}` : '';
  const baseName = `👁️┃${displayName}`;
  return `${baseName.slice(0, 90 - prioritySuffix.length)}${prioritySuffix}`;
}

function updateTicketPriorityInName(channelName, priority) {
  const nameWithoutPriority = channelName.replace(/❯(?:🟢|🟡|🔴)$/u, '');
  const prioritySuffix = `❯${priorityEmojis[priority] || '🟢'}`;
  return `${nameWithoutPriority.slice(0, 90 - prioritySuffix.length)}${prioritySuffix}`;
}

function managedTicketMemberIds(channel, openerId) {
  return channel.permissionOverwrites.cache
    .filter(overwrite =>
      overwrite.type === OverwriteType.Member &&
      overwrite.id !== openerId &&
      overwrite.allow.has(PermissionFlagsBits.ViewChannel)
    )
    .map(overwrite => overwrite.id);
}

function serializeMessageComponents(message) {
  return message.components.map(component => component.toJSON());
}

function walkComponents(components, visitor) {
  for (const component of components || []) {
    visitor(component);
    if (Array.isArray(component.components)) walkComponents(component.components, visitor);
    if (component.component) walkComponents([component.component], visitor);
    if (component.accessory) walkComponents([component.accessory], visitor);
  }
}

function messageHasCustomId(message, customId) {
  let found = false;
  const components = serializeMessageComponents(message);
  walkComponents(components, component => {
    if (component.custom_id === customId) found = true;
  });
  return found;
}

async function disableMessageButton(message, customId) {
  if (!message) return;
  let changed = false;
  const components = serializeMessageComponents(message);
  walkComponents(components, component => {
    if (component.custom_id === customId && component.type === ComponentType.Button) {
      component.disabled = true;
      changed = true;
    }
  });

  if (changed) await message.edit({ components }).catch(() => {});
}

async function updateTicketExpiryMessage(interaction) {
  const channel = interaction.channel;
  const isTicketMessage = message => Boolean(
    message?.author?.id === interaction.client.user.id &&
    message.channelId === channel.id &&
    (messageHasCustomId(message, 'talep_islemleri') || messageHasCustomId(message, 'talebi_ustlen'))
  );

  let message = isTicketMessage(interaction.message)
    ? await channel.messages.fetch({ message: interaction.message.id, force: true }).catch(() => null)
    : null;
  if (!isTicketMessage(message)) {
    const pinned = await channel.messages.fetchPins({ limit: 50 }).catch(() => null);
    message = pinned?.items?.map(item => item.message).find(isTicketMessage);
  }
  if (!message) {
    const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    message = recent?.find(isTicketMessage);
  }
  if (!message) return false;

  const expiry = loadDB()[interaction.guild.id]?.ticketExpiry?.[channel.id];
  if (!Number.isSafeInteger(expiry)) return false;
  const updateText = text => String(text || '').split('\n').map(line =>
    line.includes('Bu talep') && line.includes('kapanacak')
      ? line.replace(/<t:\d+(:[tTdDfFR])?>/g, (_match, format = '') => `<t:${expiry}${format}>`)
      : line
  ).join('\n');

  const payload = { allowedMentions: { parse: [] } };
  const components = serializeMessageComponents(message);
  let componentsChanged = false;
  for (const component of components) {
    if (component.type !== ComponentType.TextDisplay) continue;
    const content = updateText(component.content);
    if (content !== component.content) {
      component.content = content;
      componentsChanged = true;
    }
  }
  if (componentsChanged) payload.components = components;

  const content = updateText(message.content);
  if (content !== (message.content || '')) payload.content = content;
  if (!componentsChanged && payload.content === undefined) return false;

  await message.edit(payload);
  return true;
}

async function createTicketFromPending(interaction, pending, priority = null) {
  const guildId = interaction.guild.id;
  const db = loadDB();
  const guildConfig = db[guildId] || {};
  db[guildId] = db[guildId] || { activeTickets: {}, voiceTickets: {}, pendingVoiceRequests: {}, ticketExpiry: {}, ticketDetails: {} };
  db[guildId].activeTickets = db[guildId].activeTickets || {};
  db[guildId].ticketExpiry = db[guildId].ticketExpiry || {};
  db[guildId].ticketDetails = db[guildId].ticketDetails || {};

  if (db[guildId].activeTickets[interaction.user.id]) {
    await interaction.editReply({ content: `${emojiler.uyari} **Zaten açık bir destek talebin var:** <#${db[guildId].activeTickets[interaction.user.id]}>` });
    return;
  }

  const categoryId = guildConfig.categoryId;
  if (guildConfig.enabled === false || !guildConfig.supportChannel || !guildConfig.supportRole || !guildConfig.logChannel || !categoryId) {
    await interaction.editReply({ content: `${emojiler.uyari} **Destek sistemi ayarlı değil.**` });
    return;
  }

  const displayName = interaction.member?.nickname || interaction.user.globalName || interaction.user.username;
  const channel = await interaction.guild.channels.create({
    name: ticketChannelName(displayName, priority),
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      { id: guildConfig.supportRole, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
    ]
  });

  db[guildId].activeTickets[interaction.user.id] = channel.id;
  const expiryTs = Math.floor((Date.now() + 3 * 24 * 60 * 60 * 1000) / 1000);
  db[guildId].ticketExpiry[channel.id] = expiryTs;
  db[guildId].ticketDetails[channel.id] = {
    openerId: interaction.user.id,
    reason: pending.konu,
    priority,
    openedAt: channel.createdTimestamp || Date.now(),
    claimedBy: null,
    notificationSent: false
  };
  saveDB(db);

  const members = interaction.guild.roles.cache.get(guildConfig.supportRole)?.members.map(member => member) || [];
  const statusEmoji = member => {
    const presence = member.presence?.status;
    if (presence === 'online') return `${emojiler.online}`;
    if (presence === 'idle') return `${emojiler.idle}`;
    if (presence === 'dnd') return `${emojiler.dnd}`;
    return `${emojiler.offline}`;
  };
  const statusOrder = { online: 0, dnd: 1, idle: 2, offline: 3, undefined: 3 };
  const supportList = members.length
    ? members
      .sort((a, b) => {
        const aStatus = a.presence?.status ?? 'offline';
        const bStatus = b.presence?.status ?? 'offline';
        return (statusOrder[aStatus] ?? 3) - (statusOrder[bStatus] ?? 3);
      })
      .map(member => `<@${member.user.id}> ${statusEmoji(member)}`)
      .join('\n')
    : 'Şu anda aktif yetkili yok.';

  const primaryActions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('talebi_ustlen').setLabel('Talebi Üstlen').setEmoji(`${emojiler.ara}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('sesli_destek').setLabel('Sesli Destek Aç').setEmoji(`${emojiler.colorized_volume_max}`).setStyle(ButtonStyle.Primary)
  );
  const ticketMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('talep_islemleri')
      .setPlaceholder('Talep İşlemleri')
      .addOptions([
        { label: 'Talebi Kategoriye Aktar', value: 'kategori_aktar', emoji: `${emojiler.tasi}` },
        { label: 'Talep Önceliğini Değiştir', value: 'oncelik_degistir', emoji: `${emojiler.uyari}` },
        { label: 'Talebin Süresini Uzat', value: 'sure_uzat', emoji: `${emojiler.donensaat}` }
      ])
  );
  const ticketControls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('talebi_kapat').setLabel('Talebi Kapat').setEmoji(emojiler.kapat || emojiler.carpi).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('yetkili_bildir').setLabel('Bildirim Gönder').setEmoji(emojiler.bildirim || '🔔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('uyeleri_yonet').setLabel('Üyeleri Yönet').setEmoji(emojiler.uye || '👥').setStyle(ButtonStyle.Secondary)
  );
  const openedTimestamp = Math.floor(Date.now() / 1000);
  const safeReason = pending.konu.replace(/```/g, "'''");
  const ticketHeader = new TextDisplayBuilder().setContent([
    `${emojiler.Takvim} Bu talep **<t:${expiryTs}:D>** - **<t:${expiryTs}:T>** (**<t:${expiryTs}:R>**) sonra **kapanacak.**`,
    `${emojiler.ampul} Talep Yetkilileri: <@&${guildConfig.supportRole}>`
  ].join('\n'));
  const ticketContainer = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            `## ${interaction.user.globalName || interaction.user.username} yeni bir destek talebi oluşturdu.`,
            `${emojiler.uye} **Talebi Açan:** <@${interaction.user.id}> (**${interaction.user.id}**)`,
            `${emojiler.Takvim} **Açılış Tarihi:** <t:${openedTimestamp}:R>`
          ].join('\n'))
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(interaction.user.displayAvatarURL())
        )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emojiler.kalkan} **Talep Yetkilileri**\n${supportList}`),
      new TextDisplayBuilder().setContent(`${emojiler.crown} **Talebi Üstlenen Yetkili**\n\`Henüz üstlenilmedi\``),
      new TextDisplayBuilder().setContent(`${emojiler.glowingquestion} **Talep Açılış Nedeni:**\n\`\`\`\n${safeReason}\n\`\`\``)
    )
    .addActionRowComponents(ticketControls);
  const sent = await channel.send({
    components: [ticketHeader, ticketContainer, primaryActions, ticketMenu],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [interaction.user.id], roles: [guildConfig.supportRole] }
  });
  await sent.pin();

  const fetched = await channel.messages.fetch({ limit: 10 });
  for (const message of fetched.values()) {
    if (message.type === MessageType.ChannelPinnedMessage) message.delete().catch(() => {});
  }


  const priorityText = priority ? `, önceliği **${priority}**` : '';
  await interaction.editReply({ content: `${emojiler.tik} Destek talebin${priorityText} olarak açıldı: ${channel}` });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('destek-sistemi')
    .setDescription('Destek sistemini ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('ayarla')
        .setDescription('Destek sistemini ayarlarsın.')
        .addChannelOption(opt =>
          opt.setName('destek-kanalı').setDescription('Destek kanalını seç.').setRequired(true)
        )
        .addRoleOption(opt =>
          opt.setName('yetkili-rolü').setDescription('Yetkili rolünü seç.').setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('transcript-log-kanalı').setDescription('Transcript log kanalını seç.').setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('destek-kategorisi').setDescription('Destek kategorisini seç.').addChannelTypes(ChannelType.GuildCategory).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('sıfırla')
        .setDescription('Destek sistemini sıfırlar.')
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const db = loadDB();
    if (!db[guildId]) db[guildId] = { activeTickets: {}, voiceTickets: {}, pendingVoiceRequests: {}, ticketExpiry: {}, ticketDetails: {} };
    db[guildId].ticketDetails = db[guildId].ticketDetails || {};
    if (sub === 'ayarla') {
      const kanal = interaction.options.getChannel('destek-kanalı');
      const role = interaction.options.getRole('yetkili-rolü');
      const logKanal = interaction.options.getChannel('transcript-log-kanalı');
      const kategori = interaction.options.getChannel('destek-kategorisi');
      if (kategori.type !== ChannelType.GuildCategory) {
        return await interaction.reply(`${emojiler.uyari} **Kategori kanalı seç.**`);
      }
      db[guildId].supportChannel = kanal.id;
      db[guildId].supportRole = role.id;
      db[guildId].logChannel = logKanal.id;
      db[guildId].categoryId = kategori.id;
      db[guildId].activeTickets = db[guildId].activeTickets || {};
      db[guildId].voiceTickets = db[guildId].voiceTickets || {};
      db[guildId].pendingVoiceRequests = db[guildId].pendingVoiceRequests || {};
      db[guildId].ticketExpiry = db[guildId].ticketExpiry || {};
      db[guildId].ticketDetails = db[guildId].ticketDetails || {};
      saveDB(db);
      const supportPanelPayload = await createSupportPanelPayload(interaction.guild, interaction.client);
      await kanal.send(supportPanelPayload);
      await interaction.reply({ content: `${emojiler.tik} Destek sistemi **ayarlandı.**`, flags: 64 });
    } else if (sub === 'sıfırla') {
      if (db[guildId]) {
        delete db[guildId];
        saveDB(db);
        await interaction.reply({ content: `${emojiler.tik} Destek sistemi **sıfırlandı.**`, flags: 64 });
      } else {
        await interaction.reply(`${emojiler.uyari} **Sunucuda ayarlı destek sistemi bulunamadı.**`);
      }
    }
  }
};

client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;
  const db = loadDB();
  const guildId = interaction.guild.id;
  const guildConfig = db[guildId] || {};

const openerEntry = Object.entries(db[guildId]?.activeTickets || {}).find(([, chId]) => chId === interaction.channel?.id);
const openerId = openerEntry ? openerEntry[0] : null;
if (openerId && interaction.channel && interaction.user.id !== openerId && !interaction.member.roles.cache.has(guildConfig.supportRole)) {
  return interaction.reply({ content: `${emojiler.uyari} **Bu talep sana ait değil.**`, flags: 64 });
}
  if (interaction.isButton() && interaction.customId === 'destek_olustur') {
    if (guildConfig.enabled === false) {
      return interaction.reply({ content: `${emojiler.uyari} **Yeni destek talepleri şu anda kapalı.**`, flags: 64 });
    }
    const existing = db[guildId]?.activeTickets?.[interaction.user.id];
    if (existing) {
      return interaction.reply({ content: `${emojiler.uyari} **Açık bir destek talebin mevcut:** <#${existing}>`, flags: 64 });
    }
    const modal = new ModalBuilder()
      .setCustomId('destek_modal')
      .setTitle('Destek Talebi Oluştur')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Destek Detayları')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('konu')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
          ),
        new LabelBuilder()
          .setLabel('Öncelik Durumu')
          .setDescription('İsteğe bağlı, boş bırakabilirsiniz.')
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId('talep_onceligi')
              .setPlaceholder('Öncelik durumunu seçin...')
              .setRequired(false)
              .setMinValues(0)
              .setMaxValues(1)
              .addOptions([
                { label: 'Düşük', value: 'düşük', emoji: '🟢' },
                { label: 'Orta', value: 'orta', emoji: '🟡' },
                { label: 'Yüksek', value: 'yüksek', emoji: '🔴' }
              ])
          )
      );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'destek_modal') {
    const konu = interaction.fields.getTextInputValue('konu').trim();
    if (!konu) {
      await interaction.reply({ content: `${emojiler.uyari} **Geçerli bir konu gir.**`, flags: 64 });
      return;
    }
    const selectedPriority = interaction.fields.fields.has('talep_onceligi')
      ? interaction.fields.getStringSelectValues('talep_onceligi')?.[0] || null
      : null;
    await interaction.deferReply({ flags: 64 });
    await createTicketFromPending(interaction, { konu }, selectedPriority);
    return;
  }

if (openerId && interaction.user.id !== openerId && !interaction.member.roles.cache.has(guildConfig.supportRole)) {
  return interaction.reply({ content: `${emojiler.uyari} **Bu talep sana ait değil.**`, flags: 64 });
}
  if (interaction.isStringSelectMenu()) {
if (interaction.user.id === openerId && !interaction.member.roles.cache.has(guildConfig.supportRole)) {
  await interaction.reply({ content: `${emojiler.uyari} **Bu menüyü kullanmak için yetkin yok.**`, flags: 64 });
  return;
}
    if (interaction.customId === 'talep_islemleri') {
      const value = interaction.values[0];
      const channel = interaction.channel;
      const openerEntry = Object.entries(db[guildId]?.activeTickets || {}).find(([, chId]) => chId === channel.id);
      const openerId = openerEntry ? openerEntry[0] : null;
      if (!openerId) {
        await interaction.reply({ content: `${emojiler.uyari} **Bu kanal bir destek talebi değil veya açan kişi bulunamadı.**`, flags: 64 });
        return;
      }
      if (value === 'kategori_aktar') {
        const categories = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(cat => ({ label: cat.name.slice(0, 100), value: cat.id }));
        if (!categories.length) {
          await interaction.reply({ content: `${emojiler.uyari} **Sunucuda kategori bulunamadı.**`, flags: 64 });
          return;
        }
        const categorySelect = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId(`kategori_sec_${channel.id}`).setPlaceholder('Hangi kategoriye taşıyacaksın?').addOptions(categories.slice(0, 25))
        );
        await interaction.reply({ content: `${emojiler.tasi} **Kanalı taşımak istediğin kategoriyi seç.**`, components: [categorySelect], flags: 64 });
        return;
      }

      if (value === 'oncelik_degistir') {
        const oncelikSelect = new ActionRowBuilder().addComponents(
	          new StringSelectMenuBuilder().setCustomId(`change_oncelik_${channel.id}`).setPlaceholder('Yeni öncelik durumunu seç').addOptions([
	            { label: 'Düşük', value: 'düşük', emoji: "🟢" },
	            { label: 'Orta', value: 'orta', emoji: "🟡" },
	            { label: 'Yüksek', value: 'yüksek', emoji: "🔴" }
	          ])
	        );
	        await interaction.reply({ content: `${emojiler.uyari} **Yeni önceliği seç.** \n-# ${emojiler.uyari} **Sıklıkla değişim yapılmaya çalışılırsa limitler yüzünden hata verebilir.**`, components: [oncelikSelect], flags: 64 });
        return;
      }

      if (value === 'sure_uzat') {
        const modal = new ModalBuilder().setCustomId(`sure_uzat_modal_${channel.id}`).setTitle('Talep Süresini Uzat');
        const sureInput = new TextInputBuilder().setCustomId('sure_gun').setLabel('Eklenecek gün sayısı').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Mevcut kapanış tarihine eklenecek gün sayısı.');
        const row = new ActionRowBuilder().addComponents(sureInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }

      await interaction.reply({ content: `${emojiler.uyari} **Geçersiz seçim.**`, flags: 64 });
      return;
    }

    if (interaction.customId.startsWith('kategori_sec_')) {
      const channelIdFromId = interaction.customId.split('kategori_sec_')[1];
      if (!channelIdFromId) {
        await interaction.reply({ content: `${emojiler.uyari} **Hata.**`, flags: 64 });
        return;
      }
      const targetCat = interaction.values[0];
      const channel = interaction.channel;
      await channel.setParent(targetCat).catch(() => {});
      const openerEntry = Object.entries(db[guildId]?.activeTickets || {}).find(([, chId]) => chId === channel.id);
      const openerId = openerEntry ? openerEntry[0] : null;
      if (openerId && db[guildId]?.voiceTickets?.[openerId]) {
        const vcId = db[guildId].voiceTickets[openerId];
        const vc = await interaction.guild.channels.fetch(vcId).catch(() => null);
        if (vc) await vc.setParent(targetCat).catch(() => {});
      }
      await interaction.reply({ content: `${emojiler.tik} Talep kategoriye **taşındı.**`, flags: 64 });
      return;
    }

if (interaction.customId.startsWith('change_oncelik_')) {
  const channelIdFromId = interaction.customId.split('change_oncelik_')[1];
  const choice = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(channelIdFromId) || interaction.channel;

  const newName = updateTicketPriorityInName(channel.name, choice);
  if (newName !== channel.name) await channel.setName(newName).catch(() => {});
  const priorityDb = loadDB();
  priorityDb[guildId] = priorityDb[guildId] || { activeTickets: {}, voiceTickets: {}, pendingVoiceRequests: {}, ticketExpiry: {}, ticketDetails: {} };
  priorityDb[guildId].ticketDetails = priorityDb[guildId].ticketDetails || {};
  priorityDb[guildId].ticketDetails[channel.id] = {
    ...(priorityDb[guildId].ticketDetails[channel.id] || {}),
    priority: choice
  };
  saveDB(priorityDb);

  await interaction.deferUpdate(); 
  await interaction.followUp({ content: `${emojiler.tik} Öncelik **${choice}** olarak değiştirildi.`, flags: 64 });
  return;
}
  }

if (openerId && interaction.user.id !== openerId && !interaction.member.roles.cache.has(guildConfig.supportRole)) {
  return interaction.reply({ content: `${emojiler.uyari} **Bu talep sana ait değil.**`, flags: 64 });
}
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'yetkili_bildir') {
      await interaction.deferUpdate();
      const notificationDb = loadDB();
      const supportRoleId = notificationDb[guildId]?.supportRole;
      const supportRole = supportRoleId
        ? await interaction.guild.roles.fetch(supportRoleId).catch(() => null)
        : null;

      if (!supportRole) {
        return interaction.followUp({ content: `${emojiler.uyari} **Yetkili rolü ayarlanmamış.**`, flags: 64 });
      }

      notificationDb[guildId].ticketDetails = notificationDb[guildId].ticketDetails || {};
      const details = notificationDb[guildId].ticketDetails[interaction.channel.id] || {};
      if (details.notificationSent) {
        await disableMessageButton(interaction.message, 'yetkili_bildir');
        await interaction.followUp({ content: `${emojiler.uyari} **Bu talep için daha önce bildirim gönderilmiş.**`, flags: 64 });
        return;
      }

      notificationDb[guildId].ticketDetails[interaction.channel.id] = {
        ...details,
        notificationSent: true,
        notificationSentBy: interaction.user.id,
        notificationSentAt: Date.now()
      };
      saveDB(notificationDb);

      const notificationSent = await interaction.followUp({
        content: `${emojiler.bildirim || '🔔'} <@&${supportRoleId}> <@${interaction.user.id}> sizleri bekliyor.`,
        allowedMentions: { users: [interaction.user.id], roles: [supportRoleId] }
      }).then(() => true).catch(() => false);

      if (!notificationSent) {
        const rollbackDb = loadDB();
        if (rollbackDb[guildId]?.ticketDetails?.[interaction.channel.id]) {
          rollbackDb[guildId].ticketDetails[interaction.channel.id].notificationSent = false;
          delete rollbackDb[guildId].ticketDetails[interaction.channel.id].notificationSentBy;
          delete rollbackDb[guildId].ticketDetails[interaction.channel.id].notificationSentAt;
          saveDB(rollbackDb);
        }
        await interaction.followUp({ content: `${emojiler.uyari} **Bildirim gönderilemedi; buton yeniden kullanılabilir.**`, flags: 64 }).catch(() => {});
        return;
      }

      await disableMessageButton(interaction.message, 'yetkili_bildir');
      return;
    }

    if (id === 'uyeleri_yonet') {
      const memberDb = loadDB();
      const supportRoleId = memberDb[guildId]?.supportRole;
      if (!supportRoleId || !interaction.member.roles.cache.has(supportRoleId)) {
        return interaction.reply({ content: `${emojiler.uyari} **Bu işlemi yapmak için yetkin yok.**`, flags: 64 });
      }

      const ticketEntry = Object.entries(memberDb[guildId]?.activeTickets || {}).find(([, channelId]) => channelId === interaction.channel.id);
      if (!ticketEntry) {
        return interaction.reply({ content: `${emojiler.uyari} **Bu kanal aktif bir destek talebi değil.**`, flags: 64 });
      }

      const ticketOpenerId = ticketEntry[0];
      const currentMemberIds = managedTicketMemberIds(interaction.channel, ticketOpenerId);
      const currentMembers = (await Promise.all(
        currentMemberIds.map(memberId => interaction.guild.members.fetch(memberId).catch(() => null))
      )).filter(member => member && !member.roles.cache.has(supportRoleId)).slice(0, 25);

      const modal = new ModalBuilder()
        .setCustomId(`uyeleri_yonet_modal_${interaction.channel.id}`)
        .setTitle('Üyeleri Yönet')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Talebe eklenecek üyeler')
            .setDescription('Boş bırakabilirsiniz.')
            .setUserSelectMenuComponent(
              new UserSelectMenuBuilder()
                .setCustomId('talep_uyeleri_ekle')
                .setPlaceholder('Üye seçin...')
                .setRequired(false)
                .setMinValues(0)
                .setMaxValues(25)
            )
        );

      if (currentMembers.length) {
        modal.addLabelComponents(
          new LabelBuilder()
            .setLabel('Talepten çıkarılacak üyeler')
            .setDescription('Yalnızca bu talebe eklenmiş üyeler listelenir.')
            .setStringSelectMenuComponent(
              new StringSelectMenuBuilder()
                .setCustomId('talep_uyeleri_cikar')
                .setPlaceholder('Üye seçin...')
                .setRequired(false)
                .setMinValues(0)
                .setMaxValues(currentMembers.length)
                .addOptions(currentMembers.map(member => ({
                  label: (member.displayName || member.user.username).slice(0, 100),
                  description: member.user.tag.slice(0, 100),
                  value: member.id
                })))
            )
        );
      }

      await interaction.showModal(modal);
      return;
    }

    if (id === 'talebi_kapat') {
      const db2 = loadDB();
      const guildId2 = interaction.guild.id;
      const logChannelId = db2[guildId2]?.logChannel;
      if (!logChannelId) return interaction.reply({ content: `${emojiler.uyari} **Log kanalı ayarlanmamış.**`, flags: 64 });
      await interaction.deferReply({ flags: 64 });
      const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const dbGuild = db2[guildId2] || db[guildId] || {};
      const openerEntry = Object.entries(dbGuild.activeTickets || {}).find(([, chId]) => chId === interaction.channel.id);
      const openerId = openerEntry ? openerEntry[0] : null;
      const transcriptInfo = await createTranscriptInfo({
        guild: interaction.guild,
        channel: interaction.channel,
        messages: sorted,
        dbGuild,
        openerId,
        closerId: interaction.user.id
      });
      const html = await buildTicketTranscriptHtml({ guild: interaction.guild, channel: interaction.channel, messages: sorted, info: transcriptInfo });
      const fileName = transcriptFileName(transcriptInfo);
      if (logChannel) {
        const transcriptPayload = buildTranscriptLogPayload(transcriptInfo, fileName);
        await logChannel.send({
          ...transcriptPayload,
          files: [{ attachment: Buffer.from(html, 'utf-8'), name: fileName }]
        }).catch(() => null);
      }
      const userEntry = Object.entries(db2[guildId2]?.activeTickets || {}).find(([, chId]) => chId === interaction.channel.id);
      if (userEntry) {
        const openerId2 = userEntry[0];
        if (db2[guildId2]?.voiceTickets?.[openerId2]) {
          const vcId = db2[guildId2].voiceTickets[openerId2];
          const vc = await interaction.guild.channels.fetch(vcId).catch(() => null);
          if (vc) await vc.delete().catch(() => {});
          delete db2[guildId2].voiceTickets[openerId2];
        }
        delete db2[guildId2].activeTickets[userEntry[0]];
        delete db2[guildId2].ticketExpiry[interaction.channel.id];
        delete db2[guildId2].ticketDetails?.[interaction.channel.id];
        saveDB(db2);
      }
      try {
        if (openerId) {
          const openerMember = await interaction.guild.members.fetch(openerId).catch(()=>null);
          if (openerMember) {
            const dmTranscriptPayload = buildTranscriptLogPayload(transcriptInfo, fileName);
            await openerMember.send({
              ...dmTranscriptPayload,
              files: [{ attachment: Buffer.from(html, 'utf-8'), name: fileName }]
            }).catch(()=>{});
          }
        }
      } catch {}
      await interaction.editReply({ content: `${emojiler.yukleniyor} Destek talebi **kapatılıyor...**` });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    if (id === 'talebi_ustlen') {
      const guildCfg = loadDB()[interaction.guild.id] || {};
		      const supportRoleId = guildCfg.supportRole;
		      if (!interaction.member.roles.cache.has(supportRoleId)) return interaction.reply({ content: `${emojiler.uyari} **Bu işlemi yapmak için yetkin yok.**`, flags: 64 });
		      const pinned = await interaction.channel.messages.fetchPins({ limit: 1 }).catch(() => null);
		      const msg = pinned?.items?.[0]?.message || null;
		      const isTicketMessage = message => Boolean(
		        message && (message.embeds?.length || messageHasCustomId(message, 'talebi_ustlen'))
		      );
		      const ticketMsg = isTicketMessage(msg)
		        ? msg
		        : (await interaction.channel.messages.fetch({ limit: 20 }))
		          .filter(message => message.author.id === interaction.client.user.id && isTicketMessage(message))
		          .first();
		      if (!ticketMsg) return interaction.reply({ content: `${emojiler.uyari} **Talep mesajı bulunamadı.**`, flags: 64 });
		      const claimDb = loadDB();
	      claimDb[guildId] = claimDb[guildId] || { activeTickets: {}, voiceTickets: {}, pendingVoiceRequests: {}, ticketExpiry: {}, ticketDetails: {} };
	      claimDb[guildId].ticketDetails = claimDb[guildId].ticketDetails || {};
	      claimDb[guildId].ticketDetails[interaction.channel.id] = {
	        ...(claimDb[guildId].ticketDetails[interaction.channel.id] || {}),
	        openerId,
		        claimedBy: interaction.user.id
		      };
		      saveDB(claimDb);
		      if (ticketMsg.embeds?.length) {
		        const embed = EmbedBuilder.from(ticketMsg.embeds[0]);
		        const fields = embed.data.fields || [];
		        const newFields = fields.filter(field => field.name !== `${emojiler.modernsagok} Talebi Üstlenen Yetkili`);
		        const claimField = { name: `${emojiler.modernsagok} Talebi Üstlenen Yetkili`, value: `<@${interaction.user.id}>`, inline: false };
		        const reasonIndex = newFields.findIndex(field => field.name === `${emojiler.glowingquestion} Talep Açılış Nedeni:`);
		        newFields.splice(reasonIndex === -1 ? newFields.length : reasonIndex, 0, claimField);
		        await ticketMsg.edit({ embeds: [EmbedBuilder.from(embed).setFields(newFields)] }).catch(() => {});
		        await disableMessageButton(ticketMsg, 'talebi_ustlen');
		      } else {
		        const components = serializeMessageComponents(ticketMsg);
		        walkComponents(components, component => {
		          if (component.type === ComponentType.Button && component.custom_id === 'talebi_ustlen') {
		            component.disabled = true;
		          }
		          if (
		            component.type === ComponentType.TextDisplay &&
		            String(component.content || '').includes('Talebi Üstlenen Yetkili')
		          ) {
		            component.content = `${emojiler.modernsagok} **Talebi Üstlenen Yetkili**\n<@${interaction.user.id}>`;
		          }
		        });
		        await ticketMsg.edit({ components }).catch(() => {});
		      }
	      const oldName = interaction.channel.name;
      const newName = oldName.replace('👁️', '📍');
      await interaction.channel.setName(newName).catch(() => {});
      await interaction.reply({ content: `${emojiler.tik} Talebi **üstlendin.**`, flags: 64 });
      return;
    }

    if (id === 'sesli_destek') {
      const guildCfg = loadDB()[interaction.guild.id] || {};
      const supportRoleId = guildCfg.supportRole;
      const openerEntry = Object.entries(db[guildId]?.activeTickets || {}).find(([, chId]) => chId === interaction.channel.id);
      const openerId = openerEntry ? openerEntry[0] : null;
      if (openerId && db[guildId]?.voiceTickets?.[openerId]) {
        return interaction.reply({ content: `${emojiler.uyari} **Bu destek talebi için zaten bir sesli kanal açık.**`, flags: 64 });
      }
      if (interaction.member.roles.cache.has(supportRoleId)) {
        const userIdToCheck = interaction.user.id;
        if (db[guildId]?.voiceTickets?.[userIdToCheck]) {
          return interaction.reply({ content: `${emojiler.uyari} **Zaten açık bir sesli destek talebin var.**`, flags: 64 });
        }
        const voiceName = `🔉 | ${interaction.user.globalName || interaction.user.username}`.slice(0, 90);
        const vc = await interaction.guild.channels.create({ name: voiceName, type: ChannelType.GuildVoice, parent: interaction.channel.parentId, permissionOverwrites: [
          { id: interaction.guild.id, deny: ['Connect', 'ViewChannel'] },
          { id: interaction.user.id, allow: ['Connect', 'ViewChannel', 'Speak'] },
          { id: supportRoleId, allow: ['Connect', 'ViewChannel', 'Speak'] }
        ]});
        db[guildId].voiceTickets = db[guildId].voiceTickets || {};
        db[guildId].voiceTickets[interaction.user.id] = vc.id;
        saveDB(db);
        await interaction.reply({ content: `${emojiler.tik} Sesli destek kanalı **oluşturuldu:** ${vc}`, flags: 64 });
        return;
      } else {
        if (db[guildId].pendingVoiceRequests?.[interaction.user.id]) {
          return interaction.reply({ content: `${emojiler.uyari} **Sesli destek isteğin zaten gönderildi.**`, flags: 64 });
        }
        db[guildId].pendingVoiceRequests = db[guildId].pendingVoiceRequests || {};
        db[guildId].pendingVoiceRequests[interaction.user.id] = interaction.channel.id;
        saveDB(db);
        const supportPing = `<@&${supportRoleId}>`;
        const approvalRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('sesli_onayla').setLabel('Onayla').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('sesli_reddet').setLabel('Reddet').setStyle(ButtonStyle.Danger)
        );
        await interaction.channel.send({ content: `${interaction.user} sesli destek istiyor. Onaylıyor musunuz? \n-# ${supportPing} `, components: [approvalRow] });
        await interaction.reply({ content: `${emojiler.yukleniyor} Yetkililere sesli destek isteği gönderildi.`, flags: 64 });
        return;
      }
    }

    if (id === 'sesli_onayla' || id === 'sesli_reddet') {
      const guildCfg = loadDB()[interaction.guild.id] || {};
      const supportRoleId = guildCfg.supportRole;
      if (!interaction.member.roles.cache.has(supportRoleId)) return interaction.reply({ content: `${emojiler.uyari} **Yetkili değilsin.**`, flags: 64 });
      const last = (await interaction.channel.messages.fetch({ limit: 20 })).filter(m => m.author.id === client.user.id && m.components.length && m.content.includes('sesli destek istiyor')).first();
      let opener = last ? last.mentions.users.first() : null;
      if (!opener) {
        const pending = Object.entries(db[guildId]?.pendingVoiceRequests || {}).find(([, chId]) => chId === interaction.channel.id);
        if (pending) opener = await interaction.guild.members.fetch(pending[0]).then(m=>m.user).catch(()=>null);
      }
      if (!opener) return interaction.reply({ content: `${emojiler.uyari} Sesli destek isteği sahibi bulunamadı.`, flags: 64 });
      if (id === 'sesli_onayla') {
        const openerId = opener.id;
        if (db[guildId]?.voiceTickets?.[openerId]) {
          return interaction.reply({ content: `${emojiler.uyari} Bu kişi için zaten açık bir sesli destek kanalı var.`, flags: 64 });
        }
        const openerMember = await interaction.guild.members.fetch(openerId).catch(() => null);
        const voiceName = `🔉 | ${openerMember ? (openerMember.displayName || opener.username) : (opener.username)}`.slice(0, 90);
        const vc = await interaction.guild.channels.create({ name: voiceName, type: ChannelType.GuildVoice, parent: interaction.channel.parentId, permissionOverwrites: [
          { id: interaction.guild.id, deny: ['Connect', 'ViewChannel'] },
          openerId ? { id: openerId, allow: ['Connect', 'ViewChannel', 'Speak'] } : null,
          { id: supportRoleId, allow: ['Connect', 'ViewChannel', 'Speak'] }
        ].filter(Boolean)});
        db[guildId].voiceTickets = db[guildId].voiceTickets || {};
        db[guildId].voiceTickets[openerId] = vc.id;
        delete db[guildId].pendingVoiceRequests?.[openerId];
        saveDB(db);
        if (openerMember) {
          openerMember.send(`${emojiler.tik} Yetkililer sesli destek talebini **onayladı.**`).catch(() => {
            interaction.channel.send(`${emojiler.tik} ${openerMember} Yetkililer sesli destek talebini **onayladı.**`).catch(() => {});
          });
        }
        await interaction.reply({ content: `${emojiler.tik} Sesli destek kanalı **oluşturuldu:** ${vc}`, flags: 64 });
        return;
      } else {
        const openerId = opener.id;
        delete db[guildId].pendingVoiceRequests?.[openerId];
        saveDB(db);
        const openerMember = await interaction.guild.members.fetch(openerId).catch(() => null);
        if (openerMember) {
          openerMember.send(`${emojiler.carpi} Yetkililer sesli destek talebini **reddetti.**`).catch(() => {
            interaction.channel.send(`${emojiler.carpi} ${openerMember} **Yetkililer sesli destek talebini reddetti.**`).catch(() => {});
          });
        }
        await interaction.reply({ content: `${emojiler.uyari} **Sesli destek talebi reddedildi.**`, flags: 64 });
        return;
      }
    }

  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('uyeleri_yonet_modal_')) {
    const channelId = interaction.customId.slice('uyeleri_yonet_modal_'.length);
    const memberDb = loadDB();
    const supportRoleId = memberDb[guildId]?.supportRole;
    if (!supportRoleId || !interaction.member.roles.cache.has(supportRoleId)) {
      return interaction.reply({ content: `${emojiler.uyari} **Bu işlemi yapmak için yetkin yok.**`, flags: 64 });
    }

    if (interaction.channel.id !== channelId) {
      return interaction.reply({ content: `${emojiler.uyari} **Destek kanalı doğrulanamadı.**`, flags: 64 });
    }

    const ticketEntry = Object.entries(memberDb[guildId]?.activeTickets || {}).find(([, activeChannelId]) => activeChannelId === channelId);
    if (!ticketEntry) {
      return interaction.reply({ content: `${emojiler.uyari} **Bu kanal aktif bir destek talebi değil.**`, flags: 64 });
    }

    const ticketOpenerId = ticketEntry[0];
    const managedIds = new Set(managedTicketMemberIds(interaction.channel, ticketOpenerId));
    const selectedUsers = interaction.fields.getSelectedUsers('talep_uyeleri_ekle');
    const addIds = selectedUsers ? [...selectedUsers.keys()] : [];
    const removeIds = interaction.fields.fields.has('talep_uyeleri_cikar')
      ? interaction.fields.getStringSelectValues('talep_uyeleri_cikar')
      : [];
    const removeSet = new Set(removeIds.filter(memberId => managedIds.has(memberId)));

    await interaction.deferReply({ flags: 64 });
    const voiceChannelId = memberDb[guildId]?.voiceTickets?.[ticketOpenerId];
    const voiceChannel = voiceChannelId
      ? await interaction.guild.channels.fetch(voiceChannelId).catch(() => null)
      : null;
    const added = [];
    const removed = [];
    const skipped = [];

    for (const memberId of addIds) {
      if (removeSet.has(memberId) || memberId === ticketOpenerId || memberId === interaction.client.user.id) {
        skipped.push(memberId);
        continue;
      }

      const member = await interaction.guild.members.fetch(memberId).catch(() => null);
      if (!member) {
        skipped.push(memberId);
        continue;
      }
      if (member.roles.cache.has(supportRoleId)) {
        skipped.push(memberId);
        continue;
      }

      const channelPermissionUpdated = await interaction.channel.permissionOverwrites.edit(member, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }).then(() => true).catch(() => false);
      if (!channelPermissionUpdated) {
        skipped.push(memberId);
        continue;
      }
      if (voiceChannel) {
        await voiceChannel.permissionOverwrites.edit(member, { ViewChannel: true, Connect: true, Speak: true }).catch(() => {});
      }
      managedIds.add(memberId);
      added.push(memberId);
    }

    for (const memberId of removeSet) {
      const channelPermissionRemoved = await interaction.channel.permissionOverwrites.delete(memberId).then(() => true).catch(() => false);
      if (!channelPermissionRemoved) {
        skipped.push(memberId);
        continue;
      }
      if (voiceChannel) await voiceChannel.permissionOverwrites.delete(memberId).catch(() => {});
      managedIds.delete(memberId);
      removed.push(memberId);
    }

    const result = [];
    if (added.length) result.push(`${emojiler.tik} Eklendi: ${added.map(memberId => `<@${memberId}>`).join(', ')}`);
    if (removed.length) result.push(`${emojiler.tik} Çıkarıldı: ${removed.map(memberId => `<@${memberId}>`).join(', ')}`);
    if (skipped.length) result.push(`${emojiler.uyari} Değiştirilemedi: ${skipped.map(memberId => `<@${memberId}>`).join(', ')}`);
    if (!result.length) result.push(`${emojiler.uyari} **Herhangi bir üye değişikliği seçilmedi.**`);
    await interaction.editReply({ content: result.join('\n'), allowedMentions: { parse: [] } });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId && interaction.customId.startsWith('sure_uzat_modal_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channelId = interaction.customId.split('sure_uzat_modal_')[1];
    const dbNow = loadDB();
    const supportRoleId = dbNow[guildId]?.supportRole;
    if (!supportRoleId || !interaction.member.roles.cache.has(supportRoleId)) {
      return interaction.editReply({ content: `${emojiler.uyari} **Bu işlemi yapmak için yetkin yok.**` });
    }
    if (interaction.channel.id !== channelId || !Object.values(dbNow[guildId]?.activeTickets || {}).includes(channelId)) {
      return interaction.editReply({ content: `${emojiler.uyari} **Bu kanal aktif bir destek talebi değil.**` });
    }

    const daysRaw = interaction.fields.getTextInputValue('sure_gun').trim();
    const days = Number(daysRaw);
    const now = Math.floor(Date.now() / 1000);
    const currentExpiry = Number(dbNow[guildId].ticketExpiry?.[channelId]);
    const expiry = Math.max(now, Number.isFinite(currentExpiry) ? currentExpiry : now) + days * 24 * 60 * 60;
    if (!/^\d+$/.test(daysRaw) || !Number.isSafeInteger(days) || days <= 0 || !Number.isSafeInteger(expiry) || !Number.isFinite(new Date(expiry * 1000).getTime())) {
      return interaction.editReply({ content: `${emojiler.uyari} **Geçerli, pozitif bir tam gün sayısı gir.**` });
    }
    dbNow[guildId].ticketExpiry = dbNow[guildId].ticketExpiry || {};
    dbNow[guildId].ticketExpiry[channelId] = expiry;
    saveDB(dbNow);
    const headerUpdated = await updateTicketExpiryMessage(interaction).catch(error => {
      console.error('🔴 [DESTEK] Talep mesajındaki kapanış tarihi güncellenemedi:', error);
      return false;
    });
    const headerWarning = headerUpdated ? '' : `\n${emojiler.uyari} Süre kaydedildi ancak ana talep mesajındaki tarih güncellenemedi.`;
    await interaction.editReply({ content: `${emojiler.tik} Süre **${days} gün uzatıldı.** Yeni kapanış tarihi: <t:${expiry}:F>.${headerWarning}` });
    try {
      await interaction.channel.send({ content: `> ${emojiler.Takvim} Bu talep **<t:${expiry}:F>** - **<t:${expiry}:T>** (**<t:${expiry}:R>**) tarihinde **kapanacak.**` });
    } catch {}
    return;
  }
});
