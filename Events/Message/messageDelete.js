const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const dbPath = path.resolve(__dirname, "../../Database/Güvenlik ve Moderasyon/etiketDM.json");
const dbPathsnipe = path.resolve(__dirname, "../../Database/Güvenlik ve Moderasyon/snipe.json");

function loadMentionSettings() {
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "{}");
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function saveMentionSettings(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

client.on("messageDelete", async (message) => {
  try {
    if (!message.guild || !message.author || message.author.bot) return;

    const mentionedUsers = message.mentions.users;
    if (mentionedUsers.size === 0) return;

    const author = message.author;
    const channel = message.channel;
    const messageContent = message.content || "[Medya veya boş mesaj]";
    const messageCreatedUnix = Math.floor(message.createdTimestamp / 1000);
    const messageDeletedUnix = Math.floor(Date.now() / 1000);

    const db = loadMentionSettings();

    for (const user of mentionedUsers.values()) {
      if (db[user.id]) continue;

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setAuthor({
          name: `${message.guild.name}`,
          iconURL: message.guild.iconURL({ dynamic: true }),
          url: "https://alkan.web.tr",
        })
        .setThumbnail(author.displayAvatarURL({ dynamic: true }))
        .setDescription(
          `${author} ([**${author.tag}**](https://discord.com/users/${author.id})) seni etiketledi ama mesaj silindi.\n\n` +
          `${emojiler.speechbubble} **__Silinen Mesajın İçeriği:__**\n` +
          `-▫️${messageContent}\n\n` +
          `${emojiler.buyutec} **__Mesaj Bilgileri:__**\n` +
          `- ${emojiler.Takvim} Mesaj Yazılış: **<t:${messageCreatedUnix}:f>**\n` +
          `  - ${emojiler.donensaat} Mesaj Silinme: **<t:${messageDeletedUnix}:R>**\n\n` +
          `${emojiler.pin} **__Mesajın Konumu:__**\n` +
          `- ${emojiler.hashtag} Mesajın Kanalı: ${channel}\n`
        )
        .setFooter({
          text: `Mesajı Silen: ${author.tag}`,
          iconURL: author.displayAvatarURL({ dynamic: true }),
        });

      const isDisabled = db[user.id] === true;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("etiketDMtoggle")
          .setLabel(isDisabled ? "🟢 Etiket mesajını açmak için tıkla." : "🔴 Etiket mesajını kapatmak için tıkla.")
          .setStyle(isDisabled ? ButtonStyle.Secondary : ButtonStyle.Secondary)
      );

      try {
        await user.send({ embeds: [embed], components: [row] });
      } catch {
        console.log(`⚠️ [ETİKET-BİLDİRİM HATA] ${user.tag} adlı kullanıcıya DM gönderilemedi.`);
      }
    }
  } catch (err) {
    console.error("⚠️ [MESSAGEDELETE HATA] Eventte hata:", err);
  }
});

function loadSnipeDB() {
  if (!fs.existsSync(dbPathsnipe)) fs.writeFileSync(dbPathsnipe, "{}");
  return JSON.parse(fs.readFileSync(dbPathsnipe, "utf8"));
}

function saveSnipeDB(data) {
  fs.writeFileSync(dbPathsnipe, JSON.stringify(data, null, 2));
}

client.on("messageDelete", async (message) => {
  try {
    if (!message.guild || !message.author || message.author.bot) return;

    const db = loadSnipeDB();

    db[message.channel.id] = {
      content: message.content || "[Medya veya boş mesaj]",
      authorId: message.author.id,
      authorTag: message.author.tag,
      time: Date.now(),
      attachments: message.attachments.map(a => a.url),
    };

    saveSnipeDB(db);
  } catch (err) {
    console.error("🔴 [SNIPE - EVENT] Mesaj silinirken hata:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction || !interaction.isButton()) return;
    if (interaction.customId !== "etiketDMtoggle") return;

    if (!interaction.user) return;

    const userId = interaction.user.id;
    const db = loadMentionSettings();
    const currentlyDisabled = db[userId] === true;

    if (currentlyDisabled) {
      delete db[userId];
      saveMentionSettings(db);
      await interaction.update({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("etiketDMtoggle")
              .setLabel("🔴 Etiket mesajını kapatmak için tıkla.")
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
      });
      await interaction.followUp({
        content: `${emojiler.tik} Etiket mesajı bildirimleri **açıldı.**`,
        flags: 64,
      });
    } else {
      db[userId] = true;
      saveMentionSettings(db);
      await interaction.update({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("etiketDMtoggle")
              .setLabel("🟢 Etiket mesajını açmak için tıkla.")
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
      });
      await interaction.followUp({
        content: `${emojiler.tik} Etiket mesajı bildirimleri **kapatıldı.**`,
        flags: 64,
      });
    }
  } catch (err) {
    console.error("⚠️ [ETIKETDM INTERACTION]:", err);
  }
});
