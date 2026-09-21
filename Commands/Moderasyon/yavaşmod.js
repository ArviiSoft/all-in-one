const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const zamanKatsayilari = {
  saniye: 1,
  dakika: 60,
  saat: 3600,
  gün: 86400
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yavaşmod")
    .setDescription("Yavaş modu ayarlar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(option =>
      option.setName("kanal")
        .setDescription("Kanal seç.")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .addIntegerOption(option =>
      option.setName("sayı-gir")
        .setDescription("SADECE sayı gir.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("zaman-birimi-seç")
        .setDescription("Seç.")
        .setRequired(true)
        .addChoices(
          { name: "Saniye", value: "saniye" },
          { name: "Dakika", value: "dakika" },
          { name: "Saat", value: "saat" },
          { name: "Gün", value: "gün" }
        )
    ),

  async execute(interaction) {
    const kanal = interaction.options.getChannel('kanal');
    const miktar = interaction.options.getInteger('sayı-gir');
    const birim = interaction.options.getString('zaman-birimi-seç');
    const ikon = interaction.guild.iconURL({ dynamic: true, size: 2048 });

    const saniye = miktar * zamanKatsayilari[birim];

    if (miktar < 0 || isNaN(saniye)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Geçerli bir pozitif sayı gir.**`,
        flags: 64
      });
    }

    if (saniye > 21600) {
      return interaction.reply({
        content: `${emojiler.uyari} **Yavaş mod süresi maksimum __6 saat (21600 saniye)__ olabilir.**`,
        flags: 64
      });
    }

    try {
      await kanal.setRateLimitPerUser(saniye);

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'YAVAŞMOD AYARLANDI', iconURL: ikon })
        .setDescription(`**(** ${kanal} **)** kanalı için yavaşmod **${miktar} ${birim}** olarak ayarlandı.`)
        .setColor(0x57F287)
        .setThumbnail(ikon);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`yavasmod_reset_${kanal.id}`)
          .setLabel("Sıfırla")
          .setEmoji(`${emojiler.cop}`)
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000
      });

      collector.on("collect", async (i) => {
        try {
          if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels))
            return i.reply({ content: `${emojiler.uyari} **Bu butonu kullanmak için yetkin yok.**`, flags: 64 });

          if (i.customId === `yavasmod_reset_${kanal.id}`) {
            await kanal.setRateLimitPerUser(0);
            await i.reply({ content: `${emojiler.cop} **${kanal} kanalının yavaş modu sıfırlandı.**`, flags: 64 });
          }
        } catch (err) {
          console.error("🔴 [YAVAŞMOD]:", err);
        }
      });

    } catch (error) {
      console.error(error);
      return interaction.reply({
        content: `${emojiler.uyari} **Botun yeterli izni olmayabilir.**`,
        flags: 64
      });
    }
  }
};