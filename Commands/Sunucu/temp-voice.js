const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const tempVoiceStore = require("../../Utils/Voice/tempVoiceStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("temp-voice")
    .setDescription("Temp Voice sistemini kurar veya sıfırlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("kur")
        .setDescription("Temp Voice sistemini kurar.")
        .addChannelOption(option =>
          option
            .setName("sesli-kanal")
            .setDescription("Ses kanalı seç.")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildVoice)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("sıfırla")
        .setDescription("Temp Voice sistemini sıfırlar.")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "kur") {
      const voiceChannel = interaction.options.getChannel("sesli-kanal");

      const config = {
        enabled: true,
        guildId: interaction.guild.id,
        voiceChannelId: voiceChannel.id
      };

      tempVoiceStore.updateConfig(config);

      await interaction.reply({
        content: `${emojiler.tik} Temp Voice sistemi **kuruldu ve etkinleştirildi.**`,
        flags: 64
      });
    }

    else if (sub === "sıfırla") {
      try {
        tempVoiceStore.updateConfig({ enabled: false, guildId: null, voiceChannelId: null });

        await interaction.reply({
          content: `${emojiler.tik} Temp Voice verileri **temizlendi.**`,
          flags: 64
        });
      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: `${emojiler.uyari} **Hata oluştu, tekrar dene.**`,
          flags: 64
        });
      }
    }
  }
};