const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ContainerBuilder,TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ChannelType, ChannelSelectMenuBuilder, LabelBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const emojiler = require('../../Utils/Emojis/emojiler.js');

const dbPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/aniDefteri.json');
const ayarPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/aniDefteriAyar.json');
const AYAR_MODAL_ID = 'aniDefteriAyarModal';
const AYAR_COMPONENT_IDS = {
  aniSifirla: 'aniDefteriAyar:ani_sifirla',
  logSifirla: 'aniDefteriAyar:log_sifirla',
  tumunuSifirla: 'aniDefteriAyar:tumunu_sifirla',
};

function loadDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '[]', 'utf8');
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function loadAyar() {
  if (!fs.existsSync(ayarPath)) {
    fs.writeFileSync(ayarPath, '{}', 'utf8');
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(ayarPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveAyar(data) {
  fs.writeFileSync(ayarPath, JSON.stringify(data, null, 2), 'utf8');
}

function randomAni(guildId) {
  const db = loadDB();
  const guild = db.filter(ani => ani.guildId === guildId);
  if (guild.length === 0) return null;
  return guild[Math.floor(Math.random() * guild.length)];
}

function isAdministrator(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

function buildAniContainer(ani, baslik) {
  return new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📖 ${baslik || 'Anı Defteri'}\n` +
        `-# <t:${Math.floor(ani.tarih / 1000)}:D> tarihinde yazıldı`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `*${ani.icerik}* \n\n` +
        `-# - ${ani.gizli ? '🕵️ Anonim' : `<@${ani.userId}>`}`
      )
    );
}

function buildAyarModal(guild, guildAyar = {}) {
  const aniKanalSecimi = new ChannelSelectMenuBuilder()
    .setCustomId('aniDefteriAniKanal')
    .setPlaceholder('Anı kanalını seçin...')
    .setChannelTypes(ChannelType.GuildText)
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1);

  const logKanalSecimi = new ChannelSelectMenuBuilder()
    .setCustomId('aniDefteriLogKanal')
    .setPlaceholder('Log kanalını seçin...')
    .setChannelTypes(ChannelType.GuildText)
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1);

  if (guildAyar.kanalId && guild.channels.cache.has(guildAyar.kanalId)) {
    aniKanalSecimi.setDefaultChannels(guildAyar.kanalId);
  }
  if (guildAyar.logKanalId && guild.channels.cache.has(guildAyar.logKanalId)) {
    logKanalSecimi.setDefaultChannels(guildAyar.logKanalId);
  }

  return new ModalBuilder()
    .setCustomId(AYAR_MODAL_ID)
    .setTitle('Anı Defteri Ayarları')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Anı Kanalı')
        .setDescription('Yeni anıların gönderileceği metin kanalını seçin.')
        .setChannelSelectMenuComponent(aniKanalSecimi),
      new LabelBuilder()
        .setLabel('Log Kanalı')
        .setDescription('Anı kayıtlarının gönderileceği metin kanalını seçin.')
        .setChannelSelectMenuComponent(logKanalSecimi)
    );
}

function buildAyarPanel(guildId, bildirim) {
  const ayar = loadAyar();
  const guildAyar = ayar[guildId] || {};
  const aniKanaliVar = Boolean(guildAyar.kanalId);
  const logKanaliVar = Boolean(guildAyar.logKanalId);

  const sifirlamaSatiri = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(AYAR_COMPONENT_IDS.aniSifirla)
      .setLabel('Anı Kanalını Sıfırla')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!aniKanaliVar),
    new ButtonBuilder()
      .setCustomId(AYAR_COMPONENT_IDS.logSifirla)
      .setLabel('Log Kanalını Sıfırla')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!logKanaliVar),
    new ButtonBuilder()
      .setCustomId(AYAR_COMPONENT_IDS.tumunuSifirla)
      .setLabel('Tümünü Sıfırla')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!aniKanaliVar && !logKanaliVar)
  );

  return {
    content: [
      bildirim,
      '## 📖 Anı Defteri Ayarları',
      `${emojiler.hashtag} **Anı kanalı:** ${aniKanaliVar ? `<#${guildAyar.kanalId}>` : 'Ayarlı değil'}`,
      `${emojiler.ayar} **Log kanalı:** ${logKanaliVar ? `<#${guildAyar.logKanalId}>` : 'Ayarlı değil'}`,
      '',
      `-# ${emojiler.info} Bir ayarı kaldırmak için aşağıdaki butonları kullanabilirsiniz.`,
    ].filter(Boolean).join('\n'),
    components: [sifirlamaSatiri],
  };
}

async function sendLogChannelConfiguredMessage(interaction, aniKanal, logKanal) {
  const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const tsRelative = `<t:${Math.floor(Date.now() / 1000)}:R>`;
  const testContainer = new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📖 Anı Defteri Kanalları Ayarlandı\n` +
        `-# ${tsRelative} • ${timestamp}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojiler.ayar} **Ayarlayan:** ${interaction.user.tag} \`(${interaction.user.id})\`\n` +
        `${emojiler.hashtag} **Anı kanalı:** <#${aniKanal.id}>\n` +
        `${emojiler.ayar} **Log kanalı:** <#${logKanal.id}>\n\n` +
        '**Kaydedilen Loglar:**\n' +
        '- 📖 Yeni bir anı yazıldığında,\n' +
        '- 🕵️ Anonim anılar da dahil olmak üzere tüm anılar,\n' +
        `- ${emojiler.kullanici} Yazan kişi, tarih ve içerik bilgisi.`
      )
    );

  return logKanal.send({
    components: [testContainer],
    flags: MessageFlags.IsComponentsV2,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anı-defteri')
    .setDescription('Sunucunun anı defteri.')
    .setDefaultMemberPermissions(null)
    .addSubcommand(sub =>
      sub.setName('ayarla')
        .setDescription('Anı defteri kanallarını ayarlar.')
    )
    .addSubcommand(sub =>
      sub.setName('yaz')
        .setDescription('Bir anı yaz.')
        .addStringOption(opt =>
          opt.setName('gizlilik')
            .setDescription('İsmin görünsün mü?')
            .addChoices(
              { name: 'İsmim görünsün', value: 'acik' },
              { name: 'Anonim kalsın', value: 'gizli' }
            )
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('oku')
        .setDescription('Rastgele bir anı getirir.')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'ayarla') {
      if (!isAdministrator(interaction)) {
        return interaction.reply({
          content: `${emojiler.uyari} **Bu komutu kullanmak için yönetici yetkin yok.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const ayar = loadAyar();
      return interaction.showModal(buildAyarModal(interaction.guild, ayar[interaction.guildId]));
    }

    if (sub === 'yaz') {
      const gizlilik = interaction.options.getString('gizlilik');
      const modal = new ModalBuilder()
        .setCustomId(`aniYazModal_${gizlilik}`)
        .setTitle('Anı Defteri');

      const icerikInput = new TextInputBuilder()
        .setCustomId('aniIcerik')
        .setLabel('Anını yaz')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Unutamadığın bir an... [ANONİM ANILAR KAYDEDİLMEZ]')
        .setMaxLength(500)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(icerikInput));
      return interaction.showModal(modal);
    }

    if (sub === 'oku') {
      const ani = randomAni(interaction.guildId);

      if (!ani) {
        return interaction.reply({
          content: `${emojiler.uyari} **Henüz hiç anı yazılmamış.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const container = buildAniContainer(ani, 'Rastgele Anı');
      return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },

  async handleModal(interaction) {
    if (interaction.customId === AYAR_MODAL_ID) {
      if (!isAdministrator(interaction)) {
        return interaction.reply({
          content: `${emojiler.uyari} **Bu ayarları değiştirmek için yönetici yetkin yok.**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const aniKanali = interaction.fields
        .getSelectedChannels('aniDefteriAniKanal', true, [ChannelType.GuildText])
        .first();
      const logKanali = interaction.fields
        .getSelectedChannels('aniDefteriLogKanal', true, [ChannelType.GuildText])
        .first();

      if (!aniKanali || !logKanali) {
        return interaction.editReply({
          content: `${emojiler.uyari} **Anı ve log kanallarını seçmelisiniz.**`,
        });
      }

      const ayar = loadAyar();
      ayar[interaction.guildId] = {
        ...(ayar[interaction.guildId] || {}),
        kanalId: aniKanali.id,
        logKanalId: logKanali.id,
      };
      saveAyar(ayar);

      const logMesajiGonderildi = await sendLogChannelConfiguredMessage(interaction, aniKanali, logKanali)
        .then(() => true)
        .catch(() => false);
      const bildirim = logMesajiGonderildi
        ? `${emojiler.tik} Anı ve log kanalları **ayarlandı.**`
        : `${emojiler.tik} Kanallar **ayarlandı.**\n${emojiler.uyari} Log kanalına test mesajı gönderilemedi; botun kanal izinlerini kontrol edin.`;

      return interaction.editReply(buildAyarPanel(interaction.guildId, bildirim));
    }

    if (!interaction.customId.startsWith('aniYazModal_')) return;

    const gizlilik = interaction.customId.split('_')[1];
    const icerik = interaction.fields.getTextInputValue('aniIcerik');
    const gizli = gizlilik === 'gizli';
    const ani = {
      id: `${Date.now()}_${interaction.user.id}`,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      icerik,
      gizli,
      tarih: Date.now(),
    };

    const db = loadDB();
    db.push(ani);
    saveDB(db);

    const onayContainer = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emojiler.tik} Anın Kaydedildi \n` +
          `-# ${gizli ? 'Anonim olarak eklendi.' : 'İsminle birlikte eklendi.'}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `*${icerik}* \n\n` +
          '-# Sunucunun anı defterine eklendi. `/anı-defteri oku` komutu ile rastgele anılar görüntüleyebilirsin.'
        )
      );

    await interaction.reply({
      components: [onayContainer],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    try {
      const ayar = loadAyar();
      const kanalId = ayar[interaction.guildId]?.kanalId;
      if (kanalId) {
        const kanal = await interaction.client.channels.fetch(kanalId).catch(() => null);
        if (kanal) {
          const kanalContainer = buildAniContainer(ani, 'Yeni Anı');
          await kanal.send({
            components: [kanalContainer],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }

      const logKanalId = ayar[interaction.guildId]?.logKanalId;
      if (logKanalId) {
        const logKanal = await interaction.client.channels.fetch(logKanalId).catch(() => null);
        if (logKanal) {
          const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;
          const tsRelative = `<t:${Math.floor(Date.now() / 1000)}:R>`;
          const logContainer = new ContainerBuilder()
            .setAccentColor(gizli ? 0x5865F2 : 0x57F287)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 📖 Anı Yazıldı\n` +
                `-# ${tsRelative} • ${timestamp}`
              )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `${emojiler.kullanici} **Yazan:** ${gizli ? `🕵️ Anonim` : `${interaction.user.tag} \`( ${interaction.user.id} )\``} \n` +
                `🔎 **Gizlilik:** ${gizli ? 'Anonim' : 'Açık'} \n\n` +
                `📖 **İçerik:**\n*${icerik}* \n\n` +
                `-# ID: \`${ani.id}\``  
              )
            );

          await logKanal.send({
            components: [logContainer],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }
    } catch {}
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

    const ayar = loadAyar();
    const guildAyar = ayar[interaction.guildId] || {};
    let bildirim;

    if (action === AYAR_COMPONENT_IDS.aniSifirla) {
      delete guildAyar.kanalId;
      bildirim = `${emojiler.tik} Anı kanalı ayarı **sıfırlandı.**`;
    } else if (action === AYAR_COMPONENT_IDS.logSifirla) {
      delete guildAyar.logKanalId;
      bildirim = `${emojiler.tik} Log kanalı ayarı **sıfırlandı.**`;
    } else {
      delete guildAyar.kanalId;
      delete guildAyar.logKanalId;
      bildirim = `${emojiler.tik} Tüm anı defteri kanal ayarları **sıfırlandı.**`;
    }

    if (Object.keys(guildAyar).length === 0) delete ayar[interaction.guildId];
    else ayar[interaction.guildId] = guildAyar;
    saveAyar(ayar);

    return interaction.update(buildAyarPanel(interaction.guildId, bildirim));
  },
};
