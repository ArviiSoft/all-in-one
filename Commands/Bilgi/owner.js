const { EmbedBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("owner")
    .setDescription("Sunucu sahibini gösterir."),

  async execute(interaction) {
    const { guild } = interaction;
    const owner = await guild.fetchOwner();
    const fullUser = await owner.user.fetch(true);

    const avatarURL = fullUser.displayAvatarURL({ dynamic: true, size: 2048 });
    const bannerURL = fullUser.bannerURL({ size: 2048, dynamic: true });
    const defaultBanner = "https://dummyimage.com/800x200/2b2d31/ffffff&text=Kurucunun+banner%C4%B1+yok.";

    const KurucuEmbed = new EmbedBuilder()
      .setAuthor({ name: `${guild.name}`, iconURL: guild.iconURL({ dynamic: true }) })
      .setDescription(`- ${owner} (**${fullUser.username}**) ${emojiler.crown}`)
      .setColor(0xffc403)
      .setThumbnail(fullUser.displayAvatarURL({ dynamic: true }))
      .setImage(bannerURL || defaultBanner)
      .setFooter({ text: `Sunucu ID: ${guild.id}` });

    const profileButton = new ButtonBuilder()
      .setLabel("Profile Git")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${fullUser.id}`);

    const avatarButton = new ButtonBuilder()
      .setLabel(avatarURL ? "Avatarı Göster" : "Avatarı Yok")
      .setStyle(avatarURL ? ButtonStyle.Primary : ButtonStyle.Danger)
      .setCustomId("show_avatar")
      .setDisabled(!avatarURL);

    const bannerButton = new ButtonBuilder()
      .setLabel(bannerURL ? "Bannerı Göster" : "Bannerı Yok")
      .setStyle(bannerURL ? ButtonStyle.Primary : ButtonStyle.Danger)
      .setCustomId("show_banner")
      .setDisabled(!bannerURL);

    const row = new ActionRowBuilder().addComponents(avatarButton, bannerButton, profileButton);

    await interaction.reply({
      embeds: [KurucuEmbed],
      components: [row],
      flags: 64
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: `${emojiler.uyari} **Bu menüyü sadece komutu kullanan kişi kullanabilir.**`,
          flags: 64
        });
      }

      if (i.customId === "show_avatar" && avatarURL) {
        const embed = new EmbedBuilder().setColor(0x2f3136).setImage(avatarURL);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Avatarı İndir")
            .setStyle(ButtonStyle.Link)
            .setURL(avatarURL)
        );
        await i.reply({ embeds: [embed], components: [row], flags: 64 });
      }

      if (i.customId === "show_banner" && bannerURL) {
        const embed = new EmbedBuilder().setColor(0x2f3136).setImage(bannerURL);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Bannerı İndir")
            .setStyle(ButtonStyle.Link)
            .setURL(bannerURL)
        );
        await i.reply({ embeds: [embed], components: [row], flags: 64 });
      }
    });

    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        avatarButton.setDisabled(true),
        bannerButton.setDisabled(true),
        profileButton.setDisabled(true)
      );
      await message.edit({ components: [disabledRow] }).catch(() => {});
    });
  },
};
