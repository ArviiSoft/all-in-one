const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const sesVeriDosyasi = path.join(__dirname, "../../Database/Ses Sistemleri/sesVerileri.json");
const statDb = require("../../Utils/Core/jsonDB");
const tempVoiceManager = require("../Voice/tempVoiceManager");

function okuVeriYol(yol) {
  try {
    if (!fs.existsSync(yol)) return {};
    return JSON.parse(fs.readFileSync(yol, "utf8"));
  } catch (err) {
    console.error(`🔴 [VOICE STATE UPDATE] Veri okunamadı (${yol}):`, err);
    return {};
  }
}

function yazVeriYol(yol, data) {
  try {
    fs.writeFileSync(yol, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`🔴 [VOICE STATE UPDATE] Veri kaydedilemedi (${yol}):`, err);
  }
}

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    const userId = newState.id;
    const guildId = newState.guild.id;

    //SAY KOMUTU İÇİN
    {
      let data = okuVeriYol(sesVeriDosyasi);

      if (!oldState.channel && newState.channel) {
        if (!data[guildId]) data[guildId] = {};
        if (!data[guildId][userId]) data[guildId][userId] = {};
        data[guildId][userId].lastJoin = Date.now();
        yazVeriYol(sesVeriDosyasi, data);
      }

      if (oldState.channel && !newState.channel) {
        const userData = data[guildId]?.[userId];
        if (userData?.lastJoin) {
          const sessionDuration = Date.now() - userData.lastJoin;
          userData.totalTime = (userData.totalTime || 0) + sessionDuration;
          delete userData.lastJoin;
          yazVeriYol(sesVeriDosyasi, data);
        }
      }
    }

    //STAT KOMUTU İÇİN
    if (!newState.member || newState.member.user.bot) return;

    if (!oldState.channel && newState.channel) {
      statDb.set(`lastJoin_${userId}`, Date.now());
    } else if (oldState.channel && !newState.channel) {
      const channelId = oldState.channelId || newState.channelId;
      statDb.update((data) => {
        const joinedAt = data[`lastJoin_${userId}`];
        if (joinedAt) {
          const duration = Math.floor((Date.now() - joinedAt) / 1000);

          data[`voice_1d_${userId}`] = (data[`voice_1d_${userId}`] || 0) + duration;
          data[`voice_7d_${userId}`] = (data[`voice_7d_${userId}`] || 0) + duration;
          data[`voice_total_${userId}`] = (data[`voice_total_${userId}`] || 0) + duration;
          data[`channelVoiceTime_${channelId}_${userId}`] = (data[`channelVoiceTime_${channelId}_${userId}`] || 0) + duration;

          delete data[`lastJoin_${userId}`];
        }
      });
    }

    //TEMP VOICE SİSTEMİ
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (
      newChannel &&
      newChannel.id === tempVoiceManager.getTriggerChannelId()
    ) {
      const data = tempVoiceManager.getChannelIdForUser(newState.member.id);
      const actualChannel = data
        ? newState.guild.channels.cache.get(data.voiceChannelId)
        : null;

      if (!data || !actualChannel) {
        await tempVoiceManager.handleVoiceJoin(newState.member);
      }
    }

    if (
      oldChannel &&
      oldChannel.id !== tempVoiceManager.getTriggerChannelId() &&
      oldChannel.members.size === 0
    ) {
      const userId = [...tempVoiceManager.userChannels.entries()].find(
        ([, value]) => value.voiceChannelId === oldChannel.id
      )?.[0];

      if (userId) {
        const data = tempVoiceManager.getChannelIdForUser(userId);
        const textChannel = oldState.guild.channels.cache.get(data?.textChannelId);

        setTimeout(async () => {
          if (oldChannel.members.size === 0) {
            await oldChannel.delete().catch(() => null);
            if (textChannel) await textChannel.delete().catch(() => null);
            tempVoiceManager.removeChannelsForUser(userId);
          }
        }, 100);
      }
    }
  }
};

//SES KANAL ÇIKIŞ DM BİLDİRİM
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const dbPath = path.resolve(__dirname, "../../Database/Ses Sistemleri/sesDM.json");

function loadDB() {
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "{}");
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

client.on("voiceStateUpdate", async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const db = loadDB();

  if (!oldState.channelId && newState.channelId) {
    db[member.id] = db[member.id] || {};
    db[member.id].kanal = newState.channelId;
    db[member.id].giris = Math.floor(Date.now() / 1000);
    saveDB(db);
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    const kayit = db[member.id];
    if (!kayit || !kayit.giris) return;

    if (kayit.bildirimKapat) {
      delete kayit.giris;
      delete kayit.kanal;
      saveDB(db);
      return;
    }

    const girisZamani = kayit.giris;
    const cikisZamani = Math.floor(Date.now() / 1000);
    const fark = cikisZamani - girisZamani;
    const dakika = Math.floor(fark / 60);
    const saniye = fark % 60;

    const kanal = oldState.guild.channels.cache.get(kayit.kanal);
    delete kayit.giris;
    delete kayit.kanal;
    saveDB(db);

    const embed = new EmbedBuilder()
  .setColor("Blurple")
  .setAuthor({
    name: `${member.guild.name}`,
    iconURL: member.guild.iconURL({ dynamic: true }),
    url: "https://alkan.web.tr",
  })
  .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
  .setDescription(
    `${member} ([**${member.user.tag}**](https://discord.com/users/${member.id})) adlı kullanıcı ses kanalından ayrıldı.\n\n` +
    `${emojiler.buyutec} **__Ses Kanalı Bilgileri:__**\n` +
    `- ${emojiler.hashtag} Kanal: ${kanal ? kanal : "Bilinmeyen Kanal"}\n` +
    `- ⏱️ Süre: **${dakika} dakika ${saniye} saniye**\n\n` +
    `${emojiler.saat} **__Zaman Bilgileri:__**\n` +
    `- ${emojiler.girisok} Giriş: **<t:${girisZamani}:f>**\n` +
    `  - ${emojiler.cikisOk} Çıkış: **<t:${cikisZamani}:R>**\n\n` +
    `${emojiler.pin} **__Ek Bilgiler:__**`
  )
  .setFooter({
    text: `Sunucu: ${member.guild.name}`,
    iconURL: member.user.displayAvatarURL({ dynamic: true }),
  });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sesDMtoggle")
        .setLabel("🔴 Ses bildirimini kapatmak için tıkla.")
        .setStyle(ButtonStyle.Secondary)
    );

    try {
      await member.send({ embeds: [embed], components: [row] });
    } catch {
      console.log(`⚠️ [VOICE STATE UPDATE] ${member.user.tag} kişisine DM gönderilemedi.`);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "sesDMtoggle") return;

  const userId = interaction.user.id;
  const db = loadDB();
  const kayit = db[userId] || {};

  const currentlyDisabled = kayit.bildirimKapat === true;

  if (currentlyDisabled) {
    delete kayit.bildirimKapat;
    saveDB(db);
    await interaction.update({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sesDMtoggle")
            .setLabel("🔴 Ses bildirimini kapatmak için tıkla.")
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    });
    await interaction.followUp({
      content: `${emojiler.tik} Ses kanalından çıkış bildirimleri **açıldı.**`,
      flags: 64,
    });
  } else {
    kayit.bildirimKapat = true;
    db[userId] = kayit;
    saveDB(db);
    await interaction.update({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sesDMtoggle")
            .setLabel("🟢 Ses bildirimini açmak için tıkla.")
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    });
    await interaction.followUp({
      content: `${emojiler.carpi} Ses kanalından çıkış bildirimleri **kapatıldı.**`,
      flags: 64,
    });
  }
});
