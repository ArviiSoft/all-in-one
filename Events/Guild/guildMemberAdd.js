const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const path = require("path");
const fs = require("../../Utils/Core/databaseFs");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { trackMemberInvite } = require("../../Utils/Membership/inviteTracker");
const { createDmWelcomeCard } = require("../../Utils/Media/dmWelcomeCard");
const { getProfileImages } = require("../../Utils/Account/accountData");
const { getBadges, getPrimaryGuild } = require("../../Utils/Account/accountBadges");
const { renderAccountCard } = require("../../Utils/Account/accountCardRenderer");

const girisDBPath = path.join(__dirname, "../../Database/Sunucu Yönetimi/girisCikis.json");
const pingDBPath = path.join(__dirname, "../../Database/Güvenlik ve Moderasyon/girisPing.json");

function safeLoadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`🔴 [GİRİŞ EVENT - DB HATASI] ${filePath} okunamadı:`, err.message);
    return {};
  }
}

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    try {
      await trackMemberInvite(member).catch(err => {
        console.warn(`⚠️ [DAVET] ${member.user.tag} için davet kaydı alınamadı:`, err.message);
      });
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//GİRİŞ MESAJI SİSTEMİ
const girisData = safeLoadJSON(girisDBPath);
const guildData = girisData[member.guild.id];

const girisCikisAktif = guildData?.aktif ?? Boolean(guildData?.giris?.kanal || guildData?.cikis?.kanal);

if (girisCikisAktif && guildData && guildData.giris && guildData.giris.kanal) {
  const giris = guildData.giris;
  const kanal = member.guild.channels.cache.get(giris.kanal);
  if (kanal) {
    const mesaj = giris.mesaj?.replace("{user}", `<@${member.id}>`) ||
      `Sunucuya **hoş geldin!**`;

    if (giris.otoRol) {
      const rol = member.guild.roles.cache.get(giris.otoRol);
      if (rol) {
        await member.roles.add(rol, "Oto-rol sistemi aktif").catch(err =>
          console.warn(`⚠️ [OTO ROL] ${member.user.tag}: ${err.message}`)
        );
      }
    }

    const buton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`selamver_${member.id}`)
        .setLabel("Selam Ver")
        .setStyle(ButtonStyle.Success)
        .setEmoji(emojiler.elsallama)
    );

    let hedefBilgi = "";
    if (giris.hedefUye && !isNaN(giris.hedefUye)) {
      const hedef = parseInt(giris.hedefUye, 10);
      const toplam = member.guild.memberCount;
      const kalan = hedef - toplam;
      hedefBilgi = ` \n-# Hedef: ${hedef} • Kalan: ${kalan > 0 ? kalan : 0}`;
    }

    const payload = {
      content: `${mesaj}${hedefBilgi}`,
      components: [buton]
    };

    if (giris.resimli === "evet") {
      try {
        const user = await member.user.fetch(true).catch(() => member.user);
        const images = getProfileImages(user);
        const image = await renderAccountCard({
          user,
          badges: getBadges(user),
          primaryGuild: getPrimaryGuild(user),
          avatarURL: images.cardAvatarURL,
          bannerURL: images.cardBannerURL,
          avatarDecorationURL: images.avatarDecorationURL
        });
        payload.files = [new AttachmentBuilder(image, { name: "hosgeldin.png" })];
        payload.content = `${mesaj} ${emojiler.girisok} ${member} **(** ${user.username} **)**${hedefBilgi}`;
      } catch (err) {
        console.error("🔴 [GİRİŞ KARTI HATASI]", err.message);
      }
    }

    await kanal.send(payload);
  }
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//DM MESAJI SİSTEMİ
const imageBuffer = await createDmWelcomeCard(member);
const attachment = new AttachmentBuilder(imageBuffer, { name: 'hosgeldin.png' });

try {
    await member.send({
        content: `${emojiler.pikachuselam} **Selam!** <@${member.user.id}> Aramıza hoş geldin! \n🌺 __${member.guild.name}__ ailesine katıldığın için çok mutluyuz 🌟 \n${emojiler.redheart} __Güzel zaman geçirmen dileğiyle! İyi günler diliyorum!__ 🙃`,
        files: [attachment]
    });
} catch (err) {
    console.warn(`⚠️ [DM MESAJ] DM gönderilemedi: ${member.user.tag}`);
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//GHOST PING SİSTEMİ
      const pingDB = safeLoadJSON(pingDBPath);
      const channels = pingDB[member.guild.id];
      const configuredTagDuration = Number(pingDB._ayarlar?.[member.guild.id]?.etiketSuresi);
      const tagDuration = Number.isFinite(configuredTagDuration)
        && configuredTagDuration >= 500
        && configuredTagDuration <= 60_000
        ? Math.round(configuredTagDuration)
        : 1_000;
      if (channels && Array.isArray(channels) && channels.length > 0) {
        for (const channelId of channels) {
          const channel = member.guild.channels.cache.get(channelId);
          if (!channel) continue;
          try {
            const msg = await channel.send(`<@${member.id}>`);
            setTimeout(() => msg.delete().catch(() => {}), tagDuration);
          } catch (err) {
            console.warn(`⚠️ [GHOST PING] ${channelId}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.error(`🔴 [GHOST PING] ${member.user.tag}:`, err);
    }
  }
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////