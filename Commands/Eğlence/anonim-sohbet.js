const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ModalBuilder, ChannelSelectMenuBuilder, LabelBuilder } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const dbPath     = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/anonimSohbet.json');
const queuePath  = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/anonimKuyruk.json');
const sessionPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/anonimSesyon.json');
const AYAR_MODAL_ID = 'anonimSohbetAyarModal';
const AYAR_COMPONENT_IDS = {
  sohbetSifirla: 'anonimSohbetAyar:sohbet_sifirla',
  logSifirla: 'anonimSohbetAyar:log_sifirla',
  tumunuSifirla: 'anonimSohbetAyar:tumunu_sifirla',
};

function loadDB(p) { if (!fs.existsSync(p)) fs.writeFileSync(p, '{}', 'utf8'); return JSON.parse(fs.readFileSync(p, 'utf8')); }
function saveDB(p, data)  { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); }

function isAdministrator(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

function maskName(username) {
  if (!username || username.length === 0) return '?***';
  return username[0].toUpperCase() + '***';
}

function findSession(userId) {
  const sessions = loadDB(sessionPath);
  if (sessions[userId]) return { key: userId, session: sessions[userId] };
  for (const [key, sess] of Object.entries(sessions)) {
    if (sess.partnerId === userId) return { key, session: sess };
  }
  return null;
}

function getPartnerIdOf(userId) {
  const sessions = loadDB(sessionPath);
  if (sessions[userId]) return sessions[userId].partnerId;
  for (const [key, sess] of Object.entries(sessions)) {
    if (sess.partnerId === userId) return key;
  }
  return null;
}

function isAnonymityLifted(userId) {
  const sessions = loadDB(sessionPath);
  if (sessions[userId]?.anonymityLifted) return true;
  for (const [, sess] of Object.entries(sessions)) {
    if (sess.partnerId === userId && sess.anonymityLifted) return true;
  }
  return false;
}

function clearSession(userA, userB) {
  const sessions = loadDB(sessionPath);
  delete sessions[userA];
  delete sessions[userB];
  saveDB(sessionPath, sessions);
}

function chatActionRow(senderUserId, receiverUserId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`anon_lift_${senderUserId}_${receiverUserId}`)
      .setLabel('Anonimliği Kaldır')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`anon_end_${senderUserId}_${receiverUserId}`)
      .setLabel('Sohbeti Bitir')
      .setEmoji(`${emojiler.carpi}`)
      .setStyle(ButtonStyle.Danger),
  );
}

function buildPanelContainer() {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2); 

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojiler.speechbubble} Anonim Sohbet Sistemi\n`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `🕵️ **Kimliğin Gizli Kalır** — Sadece adının baş harfi görünür.\n\n` +
      `♻️ **Otomatik Eşleştirme** — Başka bir kişinin de aynı butona bastığında eşleşirsiniz.\n\n` +
      `${emojiler.speechbubble} **DM Üzerinden İletişim** — Mesajlarınız bot aracılığıyla iletilir.\n\n` +
      `🔓 **Anonimliği Kaldırabilirsin** — Karşı taraf da onaylarsa isimler görünür hale gelir.`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Butona basarak kuyruğa katıl, başka biri de katılınca eşleşme başlar.`
    )
  );

  return container;
}

function buildStartButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('anon_start')
      .setLabel('Sohbete Başla')
      .setEmoji(`${emojiler.speechbubble}`)
      .setStyle(ButtonStyle.Success),
  );
}

function buildAyarModal(guild, guildAyar = {}) {
  const sohbetKanalSecimi = new ChannelSelectMenuBuilder()
    .setCustomId('anonimSohbetKanal')
    .setPlaceholder('Anonim sohbet kanalını seçin...')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1);

  const logKanalSecimi = new ChannelSelectMenuBuilder()
    .setCustomId('anonimSohbetLogKanal')
    .setPlaceholder('Log kanalını seçin...')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1);

  if (guildAyar.channelId && guild.channels.cache.has(guildAyar.channelId)) {
    sohbetKanalSecimi.setDefaultChannels(guildAyar.channelId);
  }
  if (guildAyar.logKanalId && guild.channels.cache.has(guildAyar.logKanalId)) {
    logKanalSecimi.setDefaultChannels(guildAyar.logKanalId);
  }

  return new ModalBuilder()
    .setCustomId(AYAR_MODAL_ID)
    .setTitle('Anonim Sohbet Ayarları')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Anonim Sohbet Kanalı')
        .setDescription('Anonim sohbet panelinin gönderileceği kanalı seçin.')
        .setChannelSelectMenuComponent(sohbetKanalSecimi),
      new LabelBuilder()
        .setLabel('Log Kanalı')
        .setDescription('Anonim sohbet kayıtlarının gönderileceği kanalı seçin.')
        .setChannelSelectMenuComponent(logKanalSecimi)
    );
}

function buildAyarPanel(guildId, bildirim) {
  const db = loadDB(dbPath);
  const guildAyar = db[guildId] || {};
  const sohbetKanaliVar = Boolean(guildAyar.channelId);
  const logKanaliVar = Boolean(guildAyar.logKanalId);

  const sifirlamaSatiri = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(AYAR_COMPONENT_IDS.sohbetSifirla)
      .setLabel('Sohbet Kanalını Sıfırla')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!sohbetKanaliVar),
    new ButtonBuilder()
      .setCustomId(AYAR_COMPONENT_IDS.logSifirla)
      .setLabel('Log Kanalını Sıfırla')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!logKanaliVar),
    new ButtonBuilder()
      .setCustomId(AYAR_COMPONENT_IDS.tumunuSifirla)
      .setLabel('Tümünü Sıfırla')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!sohbetKanaliVar && !logKanaliVar)
  );

  return {
    content: [
      bildirim,
      `## ${emojiler.speechbubble} Anonim Sohbet Ayarları`,
      `${emojiler.hashtag} **Sohbet kanalı:** ${sohbetKanaliVar ? `<#${guildAyar.channelId}>` : 'Ayarlı değil'}`,
      `${emojiler.ayar} **Log kanalı:** ${logKanaliVar ? `<#${guildAyar.logKanalId}>` : 'Ayarlı değil'}`,
      '',
      `-# ${emojiler.info} Bir ayarı kaldırmak için aşağıdaki butonları kullanabilirsiniz.`,
    ].filter(Boolean).join('\n'),
    components: [sifirlamaSatiri],
  };
}

async function fetchConfiguredPanel(guild, guildAyar = {}) {
  if (!guildAyar.channelId || !guildAyar.messageId) return null;

  const kanal = await guild.channels.fetch(guildAyar.channelId).catch(() => null);
  if (!kanal?.isTextBased()) return null;
  return kanal.messages.fetch(guildAyar.messageId).catch(() => null);
}

async function deleteConfiguredPanel(guild, guildAyar = {}) {
  const mesaj = await fetchConfiguredPanel(guild, guildAyar);
  if (!mesaj) return true;

  return mesaj.delete().then(() => true).catch(() => false);
}

async function createOrUpdatePanel(guild, kanal, eskiAyar = {}) {
  const components = [buildPanelContainer(), buildStartButton()];

  if (eskiAyar.channelId === kanal.id) {
    const eskiMesaj = await fetchConfiguredPanel(guild, eskiAyar);
    if (eskiMesaj) {
      await eskiMesaj.edit({ components });
      return eskiMesaj;
    }
  }

  const yeniMesaj = await kanal.send({
    components,
    flags: MessageFlags.IsComponentsV2,
  });

  await deleteConfiguredPanel(guild, eskiAyar);
  return yeniMesaj;
}

async function sendLogChannelConfiguredMessage(interaction, sohbetKanali, logKanali) {
  const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const tsRelative = `<t:${Math.floor(Date.now() / 1000)}:R>`;
  const testContainer = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojiler.speechbubble} Anonim Sohbet Kanalları Ayarlandı\n` +
        `-# ${tsRelative} · ${timestamp}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojiler.ayar} **Ayarlayan:** ${interaction.user.tag} \`(${interaction.user.id})\`\n` +
        `${emojiler.hashtag} **Sohbet kanalı:** <#${sohbetKanali.id}>\n` +
        `${emojiler.ayar} **Log kanalı:** <#${logKanali.id}>\n\n` +
        '**Kaydedilen Loglar:**\n' +
        `- ${emojiler.speechbubble} Yeni eşleşme başladığında,\n` +
        `- ${emojiler.quarantine} Sohbet sona erdiğinde,\n` +
        '- 🔓 Anonimlik kaldırıldığında,\n' +
        `- ${emojiler.carpi} Anonimlik talebi reddedildiğinde,\n` +
        `- ${emojiler.saat || '⏳'} Kuyruğa kullanıcı katıldığında,\n` +
        `- ${emojiler.glitchwarning} DM gönderilemeyip sohbet koptuğunda.`
      )
    );

  return logKanali.send({
    components: [testContainer],
    flags: MessageFlags.IsComponentsV2,
  });
}

async function sendLog(guildId, type, data) {
  const db         = loadDB(dbPath);
  const logKanalId = db[guildId]?.logKanalId;
  if (!logKanalId) return;

  const logKanal = await client.channels.fetch(logKanalId).catch(() => null);
  if (!logKanal) return;

  const timestamp  = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const tsRelative = `<t:${Math.floor(Date.now() / 1000)}:R>`;

  let container;

  if (type === 'match_start') {
    const { userA, userB } = data;
    container = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emojiler.speechbubble} Yeni Anonim Eşleşme\n` +
          `-# ${tsRelative} · ${timestamp}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.kullanici} **1. Kullanıcı:** ${userA.tag} \`(${userA.id})\`\n` +
          `${emojiler.kullanici} **2. Kullanıcı:** ${userB.tag} \`(${userB.id})\`\n\n` +
          `-# İki kullanıcı eşleştirildi.`
        )
      );
  }

  if (type === 'match_end') {
    const { ender, partner, duration } = data;
    container = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emojiler.quarantine} Anonim Sohbet Sona Erdi\n` +
          `-# ${tsRelative} · ${timestamp}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.kullanici} **Sohbeti Bitiren:** ${ender.tag} \`(${ender.id})\`\n` +
          `${emojiler.kullanici} **Karşı Taraf:** ${partner.tag} \`(${partner.id})\`\n` +
          `${emojiler.donensaat || '⏱️'} **Süre:** ${duration}\n\n` +
          `-# Sohbet kişi tarafından sonlandırıldı.`
        )
      );
  }

  if (type === 'anonymity_lifted') {
    const { requester, target } = data;
    container = new ContainerBuilder()
      .setAccentColor(0xFEE75C)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🔓 Anonimlik Kaldırıldı\n` +
          `-# ${tsRelative} · ${timestamp}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.kullanici} **Talep Eden:** ${requester.tag} \`(${requester.id})\`\n` +
          `${emojiler.kullanici} **Onaylayan:** ${target.tag} \`(${target.id})\`\n\n` +
          `-# İki taraf için gerçek isimler artık görünür.`
        )
      );
  }

  if (type === 'anonymity_rejected') {
    const { requester, target } = data;
    container = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emojiler.carpi} Anonimlik Talebi Reddedildi\n` +
          `-# ${tsRelative} · ${timestamp}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.kullanici} **Talep Eden:** ${requester.tag} \`( ${requester.id} )\`\n` +
          `${emojiler.kullanici} **Reddeden:** ${target.tag} \`( ${target.id} )\`\n\n` +
          `-# Karşı taraf anonimliğin kaldırılmasını onaylamadı.`
        )
      );
  }

  if (type === 'queue_join') {
    const { user } = data;
    container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emojiler.saat || '⏳'} Kuyruğa Katıldı\n` +
          `-# ${tsRelative} · ${timestamp}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.kullanici} **Kullanıcı:** ${user.tag} \`( ${user.id} )\`\n\n` +
          `-# Eşleşme bekleniyor.`
        )
      );
  }

  if (type === 'dm_failed') {
    const { user, partner } = data;
    container = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emojiler.glitchwarning} DM Gönderilemedi - Sohbet Koptu\n` +
          `-# ${tsRelative} · ${timestamp}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojiler.kullanici} **DM'i Kapalı Olan:** ${user.tag} \`( ${user.id} )\`\n` +
          `${emojiler.kullanici} **Karşı Taraf:** ${partner.tag} \`( ${partner.id} )\`\n\n` +
          `-# Kullanıcının DM'i kapalı olduğu için mesaj iletilemedi, sohbet otomatik sonlandırıldı.`
        )
      );
  }

  if (!container) return;

  await logKanal.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `**${s}** saniye`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `**${m}** dakika **${s % 60}** saniye`;
  const h = Math.floor(m / 60);
  return `**${h}** saat **${m % 60}** dakika`;
}

module.exports = {
  createOrUpdatePanel,
  data: new SlashCommandBuilder()
    .setName('anonim-sohbet')
    .setDescription('Anonim sohbet kanal ve log ayarlarını yönetir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdministrator(interaction)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu komutu kullanmak için yönetici yetkin yok.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const db = loadDB(dbPath);
    return interaction.showModal(buildAyarModal(interaction.guild, db[interaction.guildId]));
  },

  async handleModal(interaction) {
    if (interaction.customId !== AYAR_MODAL_ID) return;

    if (!isAdministrator(interaction)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu ayarları değiştirmek için yönetici yetkin yok.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sohbetKanali = interaction.fields
      .getSelectedChannels(
        'anonimSohbetKanal',
        true,
        [ChannelType.GuildText, ChannelType.GuildAnnouncement]
      )
      .first();
    const logKanali = interaction.fields
      .getSelectedChannels(
        'anonimSohbetLogKanal',
        true,
        [ChannelType.GuildText, ChannelType.GuildAnnouncement]
      )
      .first();

    if (!sohbetKanali || !logKanali) {
      return interaction.editReply({
        content: `${emojiler.uyari} **Anonim sohbet ve log kanallarını seçmelisiniz.**`,
      });
    }

    const db = loadDB(dbPath);
    const eskiAyar = { ...(db[interaction.guildId] || {}) };
    let panelMesaji;

    try {
      panelMesaji = await createOrUpdatePanel(interaction.guild, sohbetKanali, eskiAyar);
    } catch (error) {
      console.error('🕵️ [ANONİM SOHBET] Panel gönderilemedi:', error);
      return interaction.editReply({
        content: `${emojiler.uyari} **Anonim sohbet paneli gönderilemedi. Botun kanal izinlerini kontrol edin.**`,
      });
    }

    db[interaction.guildId] = {
      ...eskiAyar,
      channelId: sohbetKanali.id,
      messageId: panelMesaji.id,
      logKanalId: logKanali.id,
    };
    saveDB(dbPath, db);

    const logMesajiGonderildi = await sendLogChannelConfiguredMessage(
      interaction,
      sohbetKanali,
      logKanali
    ).then(() => true).catch(() => false);
    const bildirim = logMesajiGonderildi
      ? `${emojiler.tik} Anonim sohbet ve log kanalları **ayarlandı.**`
      : `${emojiler.tik} Kanallar **ayarlandı.**\n${emojiler.uyari} Log kanalına test mesajı gönderilemedi; botun kanal izinlerini kontrol edin.`;

    return interaction.editReply(buildAyarPanel(interaction.guildId, bildirim));
  },

  async handleButton(interaction) {
    const action = interaction.customId;
    if (!Object.values(AYAR_COMPONENT_IDS).includes(action)) return;

    if (!isAdministrator(interaction)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu ayarları sıfırlamak için yönetici yetkin yok.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    const db = loadDB(dbPath);
    const guildAyar = db[interaction.guildId] || {};
    let bildirim;

    if (action === AYAR_COMPONENT_IDS.sohbetSifirla) {
      const panelSilindi = await deleteConfiguredPanel(interaction.guild, guildAyar);
      delete guildAyar.channelId;
      delete guildAyar.messageId;
      bildirim = panelSilindi
        ? `${emojiler.tik} Sohbet kanalı ayarı ve paneli **sıfırlandı.**`
        : `${emojiler.tik} Sohbet kanalı ayarı **sıfırlandı.**\n${emojiler.uyari} Eski panel mesajı silinemedi.`;
    } else if (action === AYAR_COMPONENT_IDS.logSifirla) {
      delete guildAyar.logKanalId;
      bildirim = `${emojiler.tik} Log kanalı ayarı **sıfırlandı.**`;
    } else {
      const panelSilindi = await deleteConfiguredPanel(interaction.guild, guildAyar);
      delete guildAyar.channelId;
      delete guildAyar.messageId;
      delete guildAyar.logKanalId;
      bildirim = panelSilindi
        ? `${emojiler.tik} Tüm anonim sohbet kanal ayarları **sıfırlandı.**`
        : `${emojiler.tik} Tüm kanal ayarları **sıfırlandı.**\n${emojiler.uyari} Eski panel mesajı silinemedi.`;
    }

    if (Object.keys(guildAyar).length === 0) delete db[interaction.guildId];
    else db[interaction.guildId] = guildAyar;
    saveDB(dbPath, db);

    return interaction.editReply(buildAyarPanel(interaction.guildId, bildirim));
  },
};

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const id = interaction.customId;

  if (id === 'anon_start') {
    const configuration = loadDB(dbPath)[interaction.guildId];
    if (!configuration?.channelId || configuration.channelId !== interaction.channelId || configuration.messageId !== interaction.message.id) {
      return interaction.reply({ content: 'Bu sohbet paneli artık etkin değil.', flags: MessageFlags.Ephemeral });
    }
    const userId   = interaction.user.id;
    const sessions = loadDB(sessionPath);
    const queue    = loadDB(queuePath);

    if (findSession(userId)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Zaten aktif bir anonim sohbetin var, öncelikle onu bitirmen gerekiyor.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (queue[userId]) {
      return interaction.reply({
        content: `${emojiler.uyari} **Zaten kuyruktasın, başka birinin katılmasını bekle.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const waitingId = Object.keys(queue).find(uid => uid !== userId);

    if (waitingId) {
      delete queue[waitingId];
      saveDB(queuePath, queue);

      sessions[userId] = { partnerId: waitingId, anonymityLifted: false, startedAt: Date.now(), guildId: interaction.guild?.id };
      sessions[waitingId] = { partnerId: userId, anonymityLifted: false, startedAt: Date.now(), guildId: interaction.guild?.id };
      saveDB(sessionPath, sessions);

      const userA = await client.users.fetch(userId).catch(() => null);
      const userB = await client.users.fetch(waitingId).catch(() => null);

      if (!userA || !userB) {
        clearSession(userId, waitingId);
        return interaction.reply({
          content: `${emojiler.uyari} **Eşleşme sırasında hata oluştu.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const maskedA = maskName(userA.username);
      const maskedB = maskName(userB.username);

      const dmContainer = (partnerMasked) =>
  new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojiler.speechbubble} Anonim Sohbet Başladı\n` +
        `-# Yeni bir bağlantı kuruldu.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojiler.kullanici} **Eşleştiğin kişi:** ${partnerMasked}\n\n` +
        `- Artık bu sohbette yazdığın her mesaj karşı tarafa iletilecek.\n` +
        `- Sohbeti bitirmek ya da anonimliği kaldırmak için mesajların altındaki butonları kullan.`
      )
    );

      try {
        await userA.send({
  components: [dmContainer(maskedB), chatActionRow(userId, waitingId)],
  flags: MessageFlags.IsComponentsV2,
});
      } catch {
        clearSession(userId, waitingId);
        return interaction.reply({
          content: `${emojiler.uyari} **DM'lerin kapalı olduğu için sohbet başlatılamadı, DM'lerini aç.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
await userB.send({
  components: [dmContainer(maskedA), chatActionRow(waitingId, userId)],
  flags: MessageFlags.IsComponentsV2,
});
      } catch {
        clearSession(userId, waitingId);
        return interaction.reply({
          content: `${emojiler.uyari} **Karşı kişinin DM'leri kapalı, eşleşme iptal edildi.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await sendLog(interaction.guild?.id, 'match_start', { userA, userB });

      return interaction.reply({
        content: `${emojiler.konfeti} Eşleşme **bulundu!** DM'ini kontrol et.`,
        flags: MessageFlags.Ephemeral,
      });

    } else {
      queue[userId] = { joinedAt: Date.now(), guildId: interaction.guild?.id };
      saveDB(queuePath, queue);

      await sendLog(interaction.guild?.id, 'queue_join', { user: interaction.user });

      return interaction.reply({
        content: `${emojiler.saat || '⏳'} Kuyruğa eklendin. Başka birinin de butona basmasını bekliyorsun...`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

//customId: anon_lift_{requester}_{target} - ArviS
  if (id.startsWith('anon_lift_')) {
    const parts     = id.split('_');
//anon_lift_{requesterId}_{targetId} - ArviS
    const requesterId = parts[2];
    const targetId    = parts[3];

    if (interaction.user.id !== requesterId) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu buton sana ait değil.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const sessions = loadDB(sessionPath);
    if (!sessions[requesterId] && !findSession(requesterId)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Aktif bir sohbetin yok.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (isAnonymityLifted(requesterId)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Anonimlik zaten kaldırılmış.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      return interaction.reply({
        content: `${emojiler.uyari} **Karşı kişiye ulaşılamadı.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const requesterUser = interaction.user;
    const maskedName    = maskName(requesterUser.username);

    const confirmContainer = new ContainerBuilder()
      .setAccentColor(0xFEE75C)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🔓 Anonimlik Kaldırma Talebi\n` +
          `**${maskedName}** anonimliği kaldırmak istiyor.\n\n` +
          `- Onaylarsan ikiniz için de isimler görünür hale gelir.`
        )
      );

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`anon_liftyes_${requesterId}_${targetId}`)
        .setLabel('Evet')
        .setEmoji(`${emojiler.tik}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`anon_liftno_${requesterId}_${targetId}`)
        .setLabel('Hayır')
        .setEmoji(`${emojiler.carpi}`)
        .setStyle(ButtonStyle.Danger),
    );

    try {
      await targetUser.send({
        components: [confirmContainer, confirmRow],
        flags: MessageFlags.IsComponentsV2,
      });
      return interaction.reply({
        content: `${emojiler.tik} Anonimlik kaldırma talebi karşı tarafa **gönderildi.** Yanıtı bekleniyor...`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      return interaction.reply({
        content: `${emojiler.uyari} **Karşı tarafa DM gönderilemedi.**`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

//customId: anon_liftyes_{requesterId}_{targetId} - ArviS
  if (id.startsWith('anon_liftyes_')) {
    const parts       = id.split('_');
    const requesterId = parts[2];
    const targetId    = parts[3];

    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu buton sana ait değil.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const sessions = loadDB(sessionPath);

    if (sessions[requesterId]) sessions[requesterId].anonymityLifted = true;
    if (sessions[targetId])    sessions[targetId].anonymityLifted    = true;
    saveDB(sessionPath, sessions);

    const requesterUser = await client.users.fetch(requesterId).catch(() => null);
    const targetUser    = interaction.user;

    const liftedContainer = (otherName) =>
      new ContainerBuilder()
        .setAccentColor(0x57F287)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🔓 Anonimlik Kaldırıldı\n` +
            `Karşındaki kişi: **${otherName}**\n` +
            `-# ${emojiler.info} **__Bundan sonraki mesajlarda gerçek isimler gösterilecek.__**`
          )
        );

    try {
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${emojiler.tik} Onaylandı\nAnonimlik kaldırıldı. \n\n- Karşındaki kişi: **${requesterUser?.username ?? '?'}**`
              )
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}

    if (requesterUser) {
      try {
        await requesterUser.send({
          components: [liftedContainer(targetUser.username)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}
    }

    const guildId = sessions[requesterId]?.guildId || sessions[targetId]?.guildId;
    await sendLog(guildId, 'anonymity_lifted', {
      requester: requesterUser,
      target: targetUser,
    });

    return;
  }

//customId: anon_liftno_{requesterId}_{targetId} - ArviS
  if (id.startsWith('anon_liftno_')) {
    const parts       = id.split('_');
    const requesterId = parts[2];
    const targetId    = parts[3];

    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu buton sana ait değil.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const requesterUser = await client.users.fetch(requesterId).catch(() => null);

    try {
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${emojiler.carpi} Reddedildi\nAnonimlik kaldırma talebini reddettin.`)
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}

    if (requesterUser) {
      try {
        await requesterUser.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0xED4245)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `## ${emojiler.carpi} Talep Reddedildi\nKarşındaki kişi anonimliğin kaldırılmasını **reddetti.**`
                )
              )
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}
    }

    const sessions = loadDB(sessionPath);
    const guildId  = sessions[requesterId]?.guildId || sessions[targetId]?.guildId;
    await sendLog(guildId, 'anonymity_rejected', {
      requester: requesterUser,
      target:    interaction.user,
    });

    return;
  }

//customId: anon_end_{enderId}_{partnerId} - ArviSsSsSsS
  if (id.startsWith('anon_end_')) {
    const parts     = id.split('_');
    const enderId   = parts[2];
    const partnerId = parts[3];

    if (interaction.user.id !== enderId) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu buton sana ait değil.**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const sessions  = loadDB(sessionPath);
    const startedAt = sessions[enderId]?.startedAt || sessions[partnerId]?.startedAt || Date.now();
    const duration  = formatDuration(Date.now() - startedAt);
    const guildId   = sessions[enderId]?.guildId || sessions[partnerId]?.guildId;

    clearSession(enderId, partnerId);

    const queue = loadDB(queuePath);
    delete queue[enderId];
    delete queue[partnerId];
    saveDB(queuePath, queue);

    const partnerUser = await client.users.fetch(partnerId).catch(() => null);
    const enderMask   = maskName(interaction.user.username);

    const endedContainer = (isEnder) =>
      new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            isEnder
              ? `## ${emojiler.quarantine} Sohbet Bitirildi \nAnonim sohbeti **sen** sonlandırdın.`
              : `## ${emojiler.quarantine} Sohbet Bitirildi \n**${enderMask}** anonim sohbeti sonlandırdı.`
          )
        );

    try {
      await interaction.update({
        components: [endedContainer(true)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}

    if (partnerUser) {
      try {
        await partnerUser.send({
          components: [endedContainer(false)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}
    }

    await sendLog(guildId, 'match_end', {
      ender:   interaction.user,
      partner: partnerUser,
      duration,
    });

    return;
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;

  const userId    = message.author.id;
  const partnerId = getPartnerIdOf(userId);

  if (!partnerId) return; 

  const sessions     = loadDB(sessionPath);
  const anonymityOff = isAnonymityLifted(userId);

  const senderDisplay = anonymityOff
    ? message.author.username
    : maskName(message.author.username);

  const partnerUser = await client.users.fetch(partnerId).catch(() => null);
  if (!partnerUser) return;

  const msgContainer = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${senderDisplay}: ${message.content || '**(** İçerik yok. **)**'}`)
    );

  if (message.attachments.size > 0) {
    msgContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 📎 ${message.attachments.size} ek dosya **__(Dosyalar gizlilik nedeniyle iletilmez)__**`
      )
    );
  }

  try {
    await partnerUser.send({
      components: [msgContainer],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch {
    await message.reply({
      content: `${emojiler.uyari} **Mesajın karşı tarafa iletilemedi **(** DM kapalı olabilir **)**. Sohbet sonlandırıldı.**`,
    });

    const guildId = sessions[userId]?.guildId || sessions[partnerId]?.guildId;
    await sendLog(guildId, 'dm_failed', {
      user:    message.author,
      partner: partnerUser,
    });

    clearSession(userId, partnerId);
    const queue = loadDB(queuePath);
    delete queue[userId];
    delete queue[partnerId];
    saveDB(queuePath, queue);
  }
});
