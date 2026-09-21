const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("../../Utils/Core/databaseFs");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const dbPath = path.resolve(__dirname, "../../Database/Güvenlik ve Moderasyon/snipe.json");

function loadDB() {
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "{}");
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Kanalda silinen son mesajı gösterir."),

  async execute(interaction) {
    const db = loadDB();
    const data = db[interaction.channel.id];
    if (!data)
      return interaction.reply({ content: `${emojiler.uyari} **Bu kanalda silinen bir mesaj bulunamadı.**`, flags: 64 });

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setAuthor({
        name: data.authorTag,
        iconURL: `https://cdn.discordapp.com/avatars/${data.authorId}/${interaction.client.users.cache.get(data.authorId)?.avatar || "0"}.png`,
        url: `https://discord.com/users/${data.authorId}`
      })
      .setDescription(`${emojiler.speechbubble} **Mesaj İçeriği** \n${data.content}`)
      .setThumbnail(`https://cdn.discordapp.com/avatars/${data.authorId}/${interaction.client.users.cache.get(data.authorId)?.avatar || "0"}.png`)
      .setFooter({ text: `Silinme Zamanı: ${new Date(data.time).toLocaleString()}` });

    if (data.attachments?.length)
      embed.addFields({ name: "Ekler", value: data.attachments.join("\n") });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Profili aç")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${data.authorId}`)
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  },
};