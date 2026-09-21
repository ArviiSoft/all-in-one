const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nickname-değiştir")
    .setDescription("Belirtilen kişinin sunucudaki ismini değiştirir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(option =>
      option
        .setName("kişi")
        .setDescription("Kişi seç.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("isim")
        .setDescription("İsim gir.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    const member = interaction.options.getMember("kişi");
    const yeniIsim = interaction.options.getString("isim");
    const eskiIsim = member.displayName;

    try {
      await member.setNickname(yeniIsim);

      const geriAlButtonId = `geriAl_${member.id}_${Date.now()}`;
      const yeniNickButtonId = `yeniNick_${member.id}_${Date.now()}`;
      const modalId = `nickModal_${member.id}_${Date.now()}`;
      const inputId = `nickInput_${member.id}_${Date.now()}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(geriAlButtonId)
          .setLabel("Geri Al")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(yeniNickButtonId)
          .setLabel("Yeni Nick")
          .setEmoji("🆕")
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "NICKNAME DEĞİŞTİRİLDİ",
          iconURL: guild.iconURL({ dynamic: true })
        })
        .setDescription(
          `${member} adlı kişinin nickname'i **değiştirildi.** \n\n${emojiler.sadesagok} **Eski İsim:** ${eskiIsim} \n${emojiler.sadesagok} **Yeni İsim:** ${yeniIsim}`
        )
        .setColor(0x57f287)
        .setThumbnail(member.displayAvatarURL({ dynamic: true, size: 2048 }));

      const message = await interaction.reply({
        embeds: [embed],
        components: [row]
      });

      const collector = message.createMessageComponentCollector({ time: 120000 });

      collector.on("collect", async i => {
        if (!i.isButton()) return;
        if (!i.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
          if (!i.deferred && !i.replied)
            await i.reply({
              content: `${emojiler.uyari} **Bu butonu kullanabilmek için yetkin yok.**`,
              flags: 64
            });
          return;
        }

        if (i.customId === geriAlButtonId) {
          const globalName = member.user.globalName || member.user.username;
          await member.setNickname(globalName).catch(() => {});

          const geriEmbed = new EmbedBuilder()
            .setColor("Red")
            .setDescription(`${member} adlı kişinin nickname'i geri alındı: \`${globalName}\``);

          if (!i.deferred && !i.replied)
            await i.deferUpdate().catch(() => {});
          await i.editReply({ embeds: [geriEmbed], components: [row] }).catch(() => {});
        }

        if (i.customId === yeniNickButtonId) {
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle("Yeni Nickname Belirle");

          const input = new TextInputBuilder()
            .setCustomId(inputId)
            .setLabel("Yeni Nickname")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Yeni ismi buraya yaz.")
            .setRequired(true);

          const actionRow = new ActionRowBuilder().addComponents(input);
          modal.addComponents(actionRow);

          await i.showModal(modal).catch(() => {});

          const modalFilter = m =>
            m.customId === modalId && m.user.id === i.user.id;

          i.awaitModalSubmit({ filter: modalFilter, time: 300000 })
            .then(async modalInteraction => {
              const yeniNick = modalInteraction.fields.getTextInputValue(inputId);
              await member.setNickname(yeniNick).catch(() => {});

              const yeniEmbed = new EmbedBuilder()
                .setColor("Green")
                .setDescription(`${member} adlı kişinin yeni ismi: \`${yeniNick}\``);

              await modalInteraction.reply({
                embeds: [yeniEmbed],
                flags: 64
              });
            })
            .catch(() => {});
        }
      });

      collector.on("end", async () => {
        const disabledRow = new ActionRowBuilder().addComponents(
          row.components.map(btn => btn.setDisabled(true))
        );
        await message.edit({ components: [disabledRow] }).catch(() => {});
      });
    } catch (error) {
      console.error("🔴 [NICKNAME] Nickname değiştirme hatası:", error);
      if (!interaction.replied)
        await interaction.reply({
          content: `${emojiler.uyari} **Nickname değiştirilemedi.**`,
          flags: 64
        });
    }
  }
};