const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags  } = require('discord.js');
const { useMainPlayer } = require('discord-player');

const fs = require('../../Utils/Core/databaseFs');
const path = require("path");

const tweetHandler = require("../../Handlers/Social/tweetHandler");
const tweetCommentHandler = require("../../Handlers/Social/tweetCommentHandler");
const instagramHandler = require("../../Handlers/Social/instagramHandler");
const instagramCommentHandler = require("../../Handlers/Social/instagramCommentHandler");
const davetBilgiCommand = require("../../Commands/Bilgi/davet-bilgi");
const aktiflikSuresiCommand = require("../../Commands/Bilgi/aktiflik-süresi");
const pingCommand = require("../../Commands/Bilgi/ping");
const statCommand = require("../../Commands/Kullanıcı/stat");
const tumDovizlerCommand = require("../../Commands/Kullanıcı/tüm-dövizler");
const sayCommand = require("../../Commands/Bilgi/say");
const forcebanCommand = require("../../Commands/Moderasyon/forceban");
const timeoutCommand = require("../../Commands/Moderasyon/timeout");
const dogumGunuCommand = require("../../Commands/Kullanıcı/doğum-günü");
const hatirlaticiCommand = require("../../Commands/Kullanıcı/hatırlatıcı");
const emojiEkleCommand = require("../../Commands/Sunucu/emoji-ekle");
const boostCommand = require("../../Commands/Kullanıcı/boost");
const boostBildirimCommand = require("../../Commands/Sunucu/boost-bildirim");
const seviyeCommand = require("../../Commands/Kullanıcı/seviye");
const seviyeSistemiCommand = require("../../Commands/Sunucu/seviye-sistemi");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { HONEYPOT_BLOCK_FLAG } = require("../../Utils/Moderation/honeypotGuard");
const { getGuildConfig: getYetkiliBasvuruConfig } = require("../../Utils/Moderation/yetkiliBasvuruStore.js");
const { buildOyVerenlerPanel, buildUyari } = require("../../Utils/Engagement/oylamaGorunum.js");

function isHoneypotBlocked(interaction) {
  return Boolean(interaction?.[HONEYPOT_BLOCK_FLAG]);
}

client.on("interactionCreate", async (interaction) => {
  if (isHoneypotBlocked(interaction)) return;

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return interaction.reply({ content: "Geçersiz komut." });
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`🔴 [KOMUT HATASI] /${interaction.commandName}:`, error);
      const payload = { content: `${emojiler.uyari} **Komut çalıştırılırken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.customId?.startsWith("levelcfg:") || interaction.customId?.startsWith("levelview:")) {
    try {
      const command = interaction.customId.startsWith("levelcfg:") ? seviyeSistemiCommand : seviyeCommand;
      await command.handleComponent(interaction);
    } catch (error) {
      console.error("🔴 [SEVİYE] Panel yanıtlanamadı:", error);
      const payload = { content: "Seviye paneli yanıtlanamadı. Komutu yeniden açıp tekrar dene.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("boost:milestones:")) {
    try {
      await boostCommand.handleMilestone(interaction);
    } catch (error) {
      console.error("🔴 [BOOST] Rozet menüsü yanıtlanamadı:", error);
      const payload = { content: "Rozet menüsü yanıtlanamadı. `/boost` ile tekrar dene.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.customId?.startsWith("boostcfg:")) {
    try {
      await boostBildirimCommand.handleComponent(interaction);
    } catch (error) {
      console.error("🔴 [BOOST] Yönetim paneli yanıtlanamadı:", error);
      const payload = { content: "Boost bildirim paneli yanıtlanamadı. `/boost-bildirim` ile yeni panel aç.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("emoji_ekle:")) {
    try {
      await emojiEkleCommand.handleButton(interaction);
    } catch (error) {
      console.error("🔴 [EMOJİ EKLE BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Emoji işlemi uygulanırken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("emoji_ekle:rename_modal:")) {
    try {
      await emojiEkleCommand.handleModal(interaction);
    } catch (error) {
      console.error("🔴 [EMOJİ EKLE MODAL HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Emoji ismi değiştirilirken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("davetbilgi_refresh:")) {
    try {
      await davetBilgiCommand.handleRefresh(interaction);
    } catch (error) {
      console.error("🔴 [DAVET-BİLGİ BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Davet bilgileri güncellenirken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("aktifliksuresi_refresh:")) {
    try {
      await aktiflikSuresiCommand.handleRefresh(interaction);
    } catch (error) {
      console.error("🔴 [AKTİFLİK SÜRESİ BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Aktiflik verileri güncellenirken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ping_refresh:")) {
    try {
      await pingCommand.handleRefresh(interaction);
    } catch (error) {
      console.error("🔴 [PING YENİLEME BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Ping verileri güncellenirken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ping_graph:")) {
    try {
      await pingCommand.handleGraph(interaction);
    } catch (error) {
      console.error("🔴 [PING GRAFİK BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Ping grafiği oluşturulurken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("stat_chart:")) {
    try {
      await statCommand.handleChart(interaction);
    } catch (error) {
      console.error("🔴 [STAT - GRAFİK BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Aktivite analizi oluşturulurken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("doviz_refresh:")) {
    try {
      await tumDovizlerCommand.handleRefresh(interaction);
    } catch (error) {
      if (Number(error.code) === 10062) {
        console.warn("⚠️ [DÖVİZ YENİLEME] Etkileşim artık geçerli değil, butona yeniden basılabilir.", {
          interactionId: interaction.id,
          messageId: interaction.message?.id,
          ageMs: Number.isFinite(interaction.createdTimestamp)
            ? Math.max(0, Date.now() - interaction.createdTimestamp) : null,
        });
        return;
      }
      console.error("🔴 [DÖVİZ YENİLEME BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Döviz verileri güncellenirken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("say_")) {
    try {
      await sayCommand.handleComponent(interaction);
    } catch (error) {
      console.error("🔴 [SAY PANEL BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Sunucu verileri işlenirken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("forceban:")) {
    try {
      await forcebanCommand.handleButton(interaction);
    } catch (error) {
      console.error("🔴 [FORCEBAN BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Forceban işlemi tamamlanırken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("timeout_remove:")) {
    try {
      await timeoutCommand.handleButton(interaction);
    } catch (error) {
      console.error("🔴 [TIMEOUT KALDIR BUTON HATASI]:", error);
      const payload = { content: `${emojiler.uyari} **Timeout kaldırılırken hata oluştu.**`, flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("dogumgunu_yaklasanlar:")) {
    try {
      await dogumGunuCommand.handleButton(interaction);
    } catch (error) {
      console.error("🔴 [DOĞUM GÜNÜ SAYFALAMA HATASI]:", error);
      const payload = {
        content: `${emojiler.uyari} **Doğum günü sayfası güncellenirken hata oluştu.**`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
    return;
  }

	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//TWITER INTR
  if (interaction.isModalSubmit() && interaction.customId.startsWith("comment_modal_")) {
    return tweetCommentHandler(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("like_") || interaction.customId.startsWith("retweet_") || interaction.customId.startsWith("comment_") || interaction.customId.startsWith("showcomments_")) {
      return tweetHandler(interaction);
    }
  }

  module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (isHoneypotBlocked(interaction)) return;

    if (interaction.isModalSubmit() && interaction.customId.startsWith("comment_modal_")) {
      return tweetCommentHandler(interaction);
    }

    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith("like_") ||
        interaction.customId.startsWith("retweet_") ||
        interaction.customId.startsWith("comment_") ||
        interaction.customId.startsWith("showcomments_")
      ) {
        return tweetHandler(interaction);
      }
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Bir hata oluştu.', flags: 64 });
      }
    }
  },
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ZAMAN KAPSÜLÜ MODAL
if (interaction.isModalSubmit()) {
  if (interaction.customId === 'zamanKapsuluModal') {
    const zamanKapsulu = client.commands.get('zaman-kapsülü');
    await zamanKapsulu.handleModal(interaction);
  }
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ANI DEFTERİ MODAL
  if (interaction.customId.startsWith('aniYazModal_')) {
    const aniDefteri = client.commands.get('anı-defteri');
    return aniDefteri.handleModal(interaction);
  }

  if (interaction.customId === 'aniDefteriAyarModal') {
    const aniDefteri = client.commands.get('anı-defteri');
    return aniDefteri.handleModal(interaction);
  }

  if (interaction.customId === 'anonimSohbetAyarModal') {
    const anonimSohbet = client.commands.get('anonim-sohbet');
    return anonimSohbet.handleModal(interaction);
  }
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ANI DEFTERİ AYAR BUTONLARI
if (interaction.isButton() && interaction.customId.startsWith('aniDefteriAyar:')) {
  const aniDefteri = client.commands.get('anı-defteri');
  return aniDefteri.handleButton(interaction);
}

if (interaction.isButton() && interaction.customId.startsWith('anonimSohbetAyar:')) {
  const anonimSohbet = client.commands.get('anonim-sohbet');
  return anonimSohbet.handleButton(interaction);
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//OY YARIŞMASI MODAL
if (interaction.isButton()) {
  if (interaction.customId.startsWith('oy_')) {
    const oyYarismasi = client.commands.get('oy-yarışması');
    await oyYarismasi.handleButton(interaction);
  }
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//INSTAGRAM INTR
  if (interaction.isModalSubmit() && interaction.customId.startsWith("instagramcomment_modal_")) {
    return instagramCommentHandler(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("instagramlike_")  || interaction.customId.startsWith("instagramcomment_") || interaction.customId.startsWith("instagramshowcomments_")) {
      return instagramHandler(interaction);
    }
  }

  module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (isHoneypotBlocked(interaction)) return;

    try {
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith("instagramcomment_modal_")) {
          return instagramCommentHandler(interaction);
        }
      }

      if (interaction.isButton()) {
        const customId = interaction.customId;

        if (
          customId.startsWith("instagramlike_") ||
          customId.startsWith("instagramcomment_") ||
          customId.startsWith("instagramshowcomments_")
        ) {
          return instagramHandler(interaction);
        }
      }

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        await command.execute(interaction, client);
      }
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'Hata oluştu.',
          flags: 64,
        });
      } else {
        await interaction.reply({
          content: 'Hata oluştu.',
          flags: 64,
        });
      }
    }
  },
};
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//YETKİLİ BAŞVURU SİSTEMİ
client.on('interactionCreate', async (interaction) => {
  if (isHoneypotBlocked(interaction)) return;

  if (!interaction.isButton() || !interaction.customId.startsWith('yetkili_')) return;

  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: `${emojiler.uyari} **Bu butonu kullanmak için yetkin yok.**`, flags: 64 });  
  }

  const [, action, userId] = interaction.customId.split('_');
  const settings = getYetkiliBasvuruConfig(interaction.guild.id);

  if (!settings.basvuruKanal && !settings.logKanal && settings.yetkiliRoller.length === 0 && !settings.yetkiliKanal) {
    return interaction.reply({
      content: `${emojiler.uyari} **Yetkili başvuru sistemi artık ayarlı değil.**`,
      flags: 64,
    });
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return interaction.reply({ content: `${emojiler.uyari} **Kişi bulunamadı.**`, flags: 64 });
  }

  if (action === 'onayla') {
    const roles = settings.yetkiliRoller
      .map(roleId => interaction.guild.roles.cache.get(roleId))
      .filter(Boolean);
    if (roles.length === 0) {
      return interaction.reply({ content: `${emojiler.uyari} **Yetkili rolleri ayarlanmamış veya artık mevcut değil.**`, flags: 64 });
    }

    const rolesAdded = await member.roles.add(roles).then(() => true).catch(error => {
      console.error('🔴 [YETKİLİ BAŞVURU] Roller verilemedi:', error);
      return false;
    });
    if (!rolesAdded) {
      return interaction.reply({ content: `${emojiler.uyari} **Seçili yetkili rolleri üyeye verilemedi. Bot rol sırasını ve izinlerini kontrol et.**`, flags: 64 });
    }

    const dmMessage = `${emojiler.moderatoraccept} Tebrikler! Yetkili başvurun **onaylandı.**`;
    const channelMessage = `${emojiler.moderatoraccept} Tebrikler! <@${member.id}> Yetkili başvurun **onaylandı.**`;

    const sentDM = await member.send(dmMessage).catch(() => null);
    if (!sentDM && settings.yetkiliKanal) {
      const yetkiliKanal = interaction.guild.channels.cache.get(settings.yetkiliKanal);
      if (yetkiliKanal && yetkiliKanal.isTextBased()) {
        yetkiliKanal.send(channelMessage).catch(err => console.error('🔴 [YETKİLİ BAŞVURU] Mesaj gönderme hatası:', err));
      }
    }

    await interaction.update({ content: `${emojiler.tik} Başvuru **onaylandı.**`, components: [], embeds: interaction.message.embeds });
  }

  if (action === 'reddet') {
    const dmMessage = `${emojiler.sadpickle} Üzgünüm, yetkili başvurun **reddedildi.**`;

    await member.send(dmMessage).catch(() => null);

    await interaction.update({ content: `${emojiler.carpi} Başvuru **reddedildi.**`, components: [], embeds: interaction.message.embeds });
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//MÜZİK SİSTEMİ BUTONLARI
const { buildMusicContainer, buildNoticeContainer } = require('../../Commands/Eğlence/şarkı.js');

function musicButtonNotice(title, description, color = 0xfee75c) {
  return {
    components: [buildNoticeContainer(title, description, color)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

async function waitForNextMusicTrack(queue, previousTrackId) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!queue.currentTrack || queue.currentTrack.id !== previousTrackId) return queue.currentTrack;
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return queue.currentTrack;
}

client.on('interactionCreate', async (interaction) => {
    if (isHoneypotBlocked(interaction)) return;

    if (!interaction.isButton() || !interaction.customId.startsWith('safir_mzk_')) return;

    const player = useMainPlayer();
    const queue = player.nodes.get(interaction.guildId);

    if (!queue?.currentTrack) {
      return interaction.reply(musicButtonNotice(
        '🎵 Oynatma Bulunamadı',
        'Şu anda kontrol edilebilecek bir şarkı yok.'
      ));
    }

    const requestedBy = queue.metadata?.requestedBy;
    if (requestedBy?.id && interaction.user.id !== requestedBy.id) {
      return interaction.reply(musicButtonNotice(
        '🔒 Kontrol Yetkisi Yok',
        `Bu oynatma panelini yalnızca sırayı başlatan <@${requestedBy.id}> kullanabilir.`
      ));
    }

    try {
      switch (interaction.customId) {
        case 'safir_mzk_durdur':
            if (queue.node.isPaused()) {
              return interaction.reply(musicButtonNotice(
                '⏸️ Zaten Duraklatıldı',
                'Şarkı zaten duraklatılmış durumda.'
              ));
            }
            queue.node.pause();
            return interaction.update({
                components: [buildMusicContainer(queue.currentTrack, 'duraklatildi', queue)],
            });
        case 'safir_mzk_devam':
            if (!queue.node.isPaused()) {
              return interaction.reply(musicButtonNotice(
                '▶️ Oynatma Zaten Aktif',
                'Şarkı şu anda çalmaya devam ediyor.'
              ));
            }
            queue.node.resume();
            return interaction.update({
                components: [buildMusicContainer(queue.currentTrack, 'caliyor', queue)],
            });
        case 'safir_mzk_gec': {
            const previousTrack = queue.currentTrack;
            await interaction.deferUpdate();
            const skipped = queue.node.skip();

            if (!skipped) {
              return interaction.followUp(musicButtonNotice(
                '⏭️ Sırada Şarkı Yok',
                'Geçilebilecek başka bir şarkı bulunmuyor.'
              ));
            }

            const nextTrack = await waitForNextMusicTrack(queue, previousTrack.id);
            return interaction.editReply({
              components: [nextTrack
                ? buildMusicContainer(nextTrack, 'caliyor', queue)
                : buildMusicContainer(previousTrack, 'bitti', null)],
            });
        }
        case 'safir_mzk_bitir': {
            const currentTrack = queue.currentTrack;
            await interaction.update({
              components: [buildMusicContainer(currentTrack, 'bitti', null)],
            });
            queue.delete();
            return;
        }
      }
    } catch (error) {
      console.error('🔴 [MÜZİK] Oynatma butonu hatası:', error);
      const payload = musicButtonNotice(
        '⚠️ Kontrol Uygulanamadı',
        'Müzik kontrolü uygulanırken beklenmeyen bir hata oluştu.',
        0xed4245
      );
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => null);
      return interaction.reply(payload).catch(() => null);
    }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//SELAM VER BUTON
client.on('interactionCreate', async (interaction) => {
  if (isHoneypotBlocked(interaction)) return;

  if (!interaction.isButton()) return;

  const [command, hedefID] = interaction.customId.split('_');
  if (command !== 'selamver') return;

  const hedef = await interaction.guild.members.fetch(hedefID).catch(() => null);
  if (!hedef) {
    return interaction.reply({
      content: `${emojiler.uyari} **Kişi bulunamadı**.`,
      flags: 64
    });
  }

  const disabledButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`selamver_${hedefID}`)
      .setLabel('Selam Verildi')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
      .setEmoji(`${emojiler.parlayanyildiz}`)
  );

  await interaction.update({
    components: [disabledButton]
  });

  const mentionIDs = [...new Set([interaction.user.id, hedef.id])];

  await interaction.followUp({
    content: `<@${interaction.user.id}> sana selam verdi ${emojiler.pikachuselam}`,
    allowedMentions: { users: mentionIDs }
  });
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//HATIRLATICI SİSTEMİ SİL BUTONU
client.on('interactionCreate', async (interaction) => {
  if (isHoneypotBlocked(interaction)) return;

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('hatirlatici:')) {
    try {
      return await hatirlaticiCommand.handleButton(interaction);
    } catch (error) {
      console.error('🔴 [HATIRLATICI - PANEL BUTON HATASI]:', error);
      const payload = {
        content: `${emojiler.uyari} **Hatırlatıcı paneli güncellenirken hata oluştu.**`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload).catch(() => null);
      }
      return interaction.reply(payload).catch(() => null);
    }
  }

  const fs = require('../../Utils/Core/databaseFs');
  const path = require('path');
  const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/hatirlatici.json');
  const emojiler = require('../../Utils/Emojis/emojiler.js');

  if (!fs.existsSync(veriYolu)) return;

  if (interaction.customId.startsWith('hatirlat_sil_')) {
    const data = JSON.parse(fs.readFileSync(veriYolu, 'utf8'));
    const id = interaction.customId.replace('hatirlat_sil_', '');
    const hedef = data.find(v => v.id === id);

    if (!hedef)
      return interaction.reply({ content: `${emojiler.uyari} **Bu hatırlatıcı zaten silinmiş.**`, flags: 64 });
    if (hedef.userId !== interaction.user.id)
      return interaction.reply({ content: `${emojiler.uyari} **Bu hatırlatıcı sana ait değil.**`, flags: 64 });

    const yeniVeri = data.filter(v => v.id !== id);
    fs.writeFileSync(veriYolu, JSON.stringify(yeniVeri, null, 2));

    return interaction.reply({
      content: `${emojiler.tik} **"${hedef.text}"** adlı hatırlatıcı **silindi.**`,
      flags: 64
    });
  }

  if (interaction.customId.startsWith('okundu_')) {
  const parts = interaction.customId.split('_');
  const userId = parts[1];

  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: `${emojiler.uyari} **Bu hatırlatıcı sana ait değil.**`,
      flags: 64
    });
  }

  return interaction.reply({
    content: `${emojiler.tik} Hatırlatıcı **okundu** olarak **işaretlendi.**`,
    flags: 64
  });
}
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//OYLAMA SİSTEMİ
client.on("interactionCreate", async (interaction) => {
  if (isHoneypotBlocked(interaction)) return;

  if (!interaction.isButton()) return;

  const [command, pollId, panelOwnerId, requestedPage = "0"] = interaction.customId.split("_");
  if (command !== "oyverenler") return;

  const isPageInteraction = Boolean(panelOwnerId);
  if (isPageInteraction && panelOwnerId !== interaction.user.id) {
    return interaction.reply({
      components: [buildUyari({
        baslik: `${emojiler.uyari} Bu Panel Sana Ait Değil`,
        aciklama: "Kendi katılımcı panelini açmak için **Oy Verenler** butonuna bas.",
      })],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const oylamaDosyaYolu = path.join(__dirname, "../../Database/Eğlence ve Etkileşim/oylama.json");

  function veriOku() {
    if (!fs.existsSync(oylamaDosyaYolu)) return {};
    try { return JSON.parse(fs.readFileSync(oylamaDosyaYolu, "utf8")); }
    catch { return {}; }
  }

  function veriYaz(data) {
    fs.writeFileSync(oylamaDosyaYolu, JSON.stringify(data, null, 2));
  }

  const veriler = veriOku();
  const oylama = veriler[pollId];

  if (!oylama) {
    return interaction.reply({
      components: [buildUyari({
        baslik: `${emojiler.uyari} Oylama Bulunamadı`,
        aciklama: "Bu oylamanın katılımcı bilgileri artık veritabanında bulunmuyor.",
      })],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (isPageInteraction) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let voters = [];

  if (oylama.ended && Array.isArray(oylama.voters)) {
    voters = oylama.voters;
  } else {
    try {
      const channel = await client.channels.fetch(oylama.channelId);
      const message = await channel.messages.fetch(oylama.messageId);
      const reactions = message.reactions.cache;
      const alfabe = ["🇦","🇧","🇨","🇩","🇪","🇫","🇬","🇭","🇮","🇯"];
      const set = new Set();

      for (const emoji of alfabe) {
        const reaction = reactions.get(emoji);
        if (!reaction) continue;
        const users = await reaction.users.fetch();
        users.forEach(u => { if (!u.bot) set.add(u.id); });
      }

      voters = Array.from(set);
      if (veriler[pollId]) {
        veriler[pollId].voters = voters;
        veriYaz(veriler);
      }
    } catch (err) {
      console.error("🔴 [OYLAMA] Oy verenler fetch hata:", err);
    }
  }

  const panel = buildOyVerenlerPanel({
    ownerId: panelOwnerId || interaction.user.id,
    page: Number.parseInt(requestedPage, 10) || 0,
    pollId,
    soru: oylama.question,
    voters,
  });

  await interaction.editReply({
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//TEMP VOICE SİSTEMİ
const tempVoiceManager = require("../Voice/tempVoiceManager");

module.exports = (client) => {
  client.on("interactionCreate", async (interaction) => {
    if (isHoneypotBlocked(interaction)) return;

    if (interaction.isButton() && interaction.customId.startsWith("tempvc_")) {
      const [, prefix, userId] = interaction.customId.split("_");

      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: `${emojiler.uyari} **Bu kanalın sahibi sen değilsin.**`,
          flags: 64
        });
      }

      const data = tempVoiceManager.getChannelIdForUser(userId);
if (!data || !data.voiceChannelId) {
  return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
}

const channel = interaction.guild.channels.cache.get(data.voiceChannelId);
if (!channel) {
  return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
}

      const member = await interaction.guild.members.fetch(userId);
      const voiceChannel = member.voice.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: `${emojiler.uyari} **Ses kanalında değilsin.**`,
          flags: 64
        });
      }

      if (prefix === "kilitle") {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          Connect: false
        });
        return interaction.reply({ content: `${emojiler.colorized_voice_locked} Kanal **kilitlendi.**`, flags: 64 });
      }

      if (prefix === "kilitaç") {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          Connect: true
        });
        return interaction.reply({ content: `${emojiler.colorized_screenshare_max} Kanalın kilidi **açıldı.**`, flags: 64 });
      }

      if (prefix === "kanalsil") {
        if (!channel) {
          return interaction.reply({
            content: `${emojiler.uyari} **Kanal zaten silinmiş veya bulunamadı.**`,
            flags: 64
          });
        }

        await channel.delete().catch(() => null);
        return interaction.reply({ content: `${emojiler.delete_guild} Kanal **silindi.**`, flags: 64 });
      }

      if (prefix === "kanallimit") {
        const modal = new ModalBuilder()
          .setCustomId(`tempvc_kanallimitmodal_${userId}`)
          .setTitle("Kanal Limitini Belirle");

        const limitInput = new TextInputBuilder()
          .setCustomId("tempvc_kanal_limit")
          .setLabel("Yeni Kanal Limiti (1-99)")
          .setPlaceholder("Örnek: 5")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
        return interaction.showModal(modal);
      }

      if (prefix === "kullaniciekle") {
        const modal = new ModalBuilder()
          .setCustomId(`tempvc_kullanicieklemodal_${userId}`)
          .setTitle("Kanalına Kişi Ekle");

        const userInput = new TextInputBuilder()
          .setCustomId("tempvc_kullanici_id")
          .setLabel("Kişi ID")
          .setPlaceholder("Örnek: 216222397349625857")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(userInput));
        return interaction.showModal(modal);
      }

      if (prefix === "kanalad") {
        const modal = new ModalBuilder()
          .setCustomId(`tempvc_kanaladmodal_${userId}`)
          .setTitle("Kanal Adını Değiştir");

        const input = new TextInputBuilder()
          .setCustomId("tempvc_kanal_ad")
          .setLabel("Yeni Kanal Adı")
          .setPlaceholder("Örnek: ArviS's Room")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (prefix === "kullanicisat") {
        const modal = new ModalBuilder()
          .setCustomId(`tempvc_kullanicisatmodal_${userId}`)
          .setTitle("Kanalından Kişi At");

        const input = new TextInputBuilder()
          .setCustomId("tempvc_kullanici_id")
          .setLabel("Kişi ID")
          .setPlaceholder("Örnek: 216222397349625857")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (prefix === "kullanicisil") {
        const modal = new ModalBuilder()
          .setCustomId(`tempvc_kullanicisilmodal_${userId}`)
          .setTitle("Kanalına Erişimi Kaldır");

        const input = new TextInputBuilder()
          .setCustomId("tempvc_kullanici_id")
          .setLabel("Kişi ID")
          .setPlaceholder("Örnek: 216222397349625857")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (prefix === "bitrate") {
        const modal = new ModalBuilder()
          .setCustomId(`tempvc_bitrate_modal_${userId}`)
          .setTitle("Bitrate Ayarla");

        const input = new TextInputBuilder()
          .setCustomId("tempvc_bitrate")
          .setLabel("Bitrate (8000 - 96000)")
          .setPlaceholder("Örnek: 64000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (prefix === "region") {
        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`tempvc_regionselect_${userId}`)
            .setPlaceholder("Bölge Seç")
            .addOptions(
              { label: "🇧🇷 Brezilya", value: "brazil" },
              { label: "🇭🇰 Hong Kong", value: "hongkong" },
              { label: "🇮🇳 Hindistan", value: "india" },
              { label: "🇯🇵 Japonya", value: "japan" },
              { label: "🇳🇱 Rotterdam", value: "rotterdam" },
              { label: "🇸🇬 Singapur", value: "singapore" },
              { label: "🇰🇷 Güney Kore", value: "south-korea" },
              { label: "🇿🇦 Güney Afrika", value: "southafrica" },
              { label: "🇦🇺 Sidney", value: "sydney" },
              { label: "🇺🇸 Amerika", value: "us-central" },
              { label: "🇺🇸 Doğu Amerika", value: "us-east" },
              { label: "🇦🇷 Güney Amerika", value: "us-south" },
              { label: "🇺🇸 Batı Amerika", value: "us-west" },       
            )
        );

        return interaction.reply({
          components: [selectMenu],
          flags: 64
        });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tempvc_kullanicieklemodal_")) {
      const userId = interaction.customId.split("_")[2];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const input = interaction.fields.getTextInputValue("tempvc_kullanici_id");
      const targetUserId = input.replace(/[<@!>]/g, "");
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (!member) {
        return interaction.reply({ content: `${emojiler.uyari} **Geçerli bir kişi belirtilmedi.**`, flags: 64 });
      }

      await kanal.permissionOverwrites.edit(member.id, {
        Connect: true,
        ViewChannel: true
      });

      return interaction.reply({ content: `${emojiler.kullanici} ${member} artık kanala **katılabilir.**`, flags: 64 });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tempvc_kanallimitmodal_")) {
      const userId = interaction.customId.split("_")[2];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const limitStr = interaction.fields.getTextInputValue("tempvc_kanal_limit");
      const limit = parseInt(limitStr);

      if (isNaN(limit) || limit < 1 || limit > 99) {
        return interaction.reply({ content: `${emojiler.uyari} **1 ile 99 arasında bir sayı gir.**`, flags: 64 });
      }

      await kanal.setUserLimit(limit);
      return interaction.reply({ content: `${emojiler.colorized_security_filter} Kanal limiti **${limit}** olarak **ayarlandı.**`, flags: 64 });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tempvc_kanaladmodal_")) {
      const userId = interaction.customId.split("_")[2];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const newName = interaction.fields.getTextInputValue("tempvc_kanal_ad");
      await kanal.setName(newName);
      return interaction.reply({ content: `${emojiler.discord_channel_from_VEGA} Kanal adı **${newName}** olarak **güncellendi.**`, flags: 64 });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tempvc_kullanicisatmodal_")) {
      const userId = interaction.customId.split("_")[2];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const input = interaction.fields.getTextInputValue("tempvc_kullanici_id");
      const targetUserId = input.replace(/[<@!>]/g, "");
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (!member || member.voice.channelId !== kanal.id) {
        return interaction.reply({ content: `${emojiler.uyari} **Kişi bu kanalda değil.**`, flags: 64 });
      }

      await member.voice.disconnect().catch(() => {});
      return interaction.reply({ content: `${emojiler.quarantine} ${member} kanaldan **atıldı.**`, flags: 64 });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tempvc_kullanicisilmodal_")) {
      const userId = interaction.customId.split("_")[2];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const input = interaction.fields.getTextInputValue("tempvc_kullanici_id");
      const targetUserId = input.replace(/[<@!>]/g, "");
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (!member) {
        return interaction.reply({ content: `${emojiler.uyari} **Geçerli bir kişi değil.**`, flags: 64 });
      }

      await kanal.permissionOverwrites.edit(member.id, {
        Connect: false,
        ViewChannel: false,
      });

      return interaction.reply({ content: `${emojiler.suspected_spam_activ} ${member} kanal erişiminden **çıkarıldı.**`, flags: 64 });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tempvc_bitrate_modal_")) {
      const userId = interaction.customId.split("_")[3];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const bitrate = parseInt(interaction.fields.getTextInputValue("tempvc_bitrate"));
      if (isNaN(bitrate) || bitrate < 8000 || bitrate > 96000) {
        return interaction.reply({ content: `${emojiler.uyari} **8000 ile 96000 arasında bir sayı gir.**`, flags: 64 });
      }

      await kanal.setBitrate(bitrate);
      return interaction.reply({ content: `${emojiler.colorized_ping_connection} Bitrate **${bitrate}** olarak **ayarlandı.**`, flags: 64 });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("tempvc_regionselect_")) {
      const userId = interaction.customId.split("_")[2];
      const data = tempVoiceManager.getChannelIdForUser(userId);

      if (!data || !data.voiceChannelId) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

  const kanal = interaction.guild.channels.cache.get(data.voiceChannelId);

     if (!kanal) {
    return interaction.reply({ content: `${emojiler.uyari} **Kanal bulunamadı.**`, flags: 64 });
  }

      const region = interaction.values[0];
      await kanal.setRTCRegion(region);

      return interaction.update({
        content: `${emojiler.online_web} Bölge **${region}** olarak **ayarlandı.**`,
        components: []
      });
    }
  });
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//ÇEKİLİŞ SİSTEMİ
const { handleGiveawayInteraction } = require("../../Utils/Engagement/çekilişKontrol.js");

client.on("interactionCreate", async (interaction) => {
  if (isHoneypotBlocked(interaction)) return;
  await handleGiveawayInteraction(interaction, client);
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
