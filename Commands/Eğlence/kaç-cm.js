const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const path = require("path");
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kaç-cm")
    .setDescription("Acaba kaç santim?"),

  async execute(interaction) {
    const cm = Math.floor(Math.random() * 100);

    let yorum;
    if (cm >= 70) yorum = `${emojiler.mutlupanda} Vay canına! \n\n${emojiler.kalpanda} Sektörün lideri geldi!`;
    else if (cm >= 40) yorum = `${emojiler.kertenkelehehe} Fena değil! \n\n${emojiler.kalpanda} Kızların gözdesi misin nesin!`;
    else yorum = `${emojiler.uzgunpanda} Eh işte... \n\n${emojiler.kalpanda} Merak etme ameliyatları var, haha!`;

    const mesaj = 
      `📏 **Kaç Santim?**\n` +
      `\`${cm} Santimetre\`  **${yorum}**`

    const gifPath = path.join(__dirname, "../../assets/Eğlence/kaccm.gif");
    const attachment = new AttachmentBuilder(gifPath);

    await interaction.reply({
      content: mesaj,
      files: [attachment]
    });
  }
};
