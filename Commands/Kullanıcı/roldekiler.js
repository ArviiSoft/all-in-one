const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roldekiler')
    .setDescription('Roldeki kişileri listeler.')
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Rol seç.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const role = interaction.options.getRole('rol');
    if (!role) return interaction.reply({ content: `${emojiler.uyari} **Geçerli bir rol seçmedin.**`, flags: 64 });

    const members = role.members.map(m => `<@${m.id}>`);
    const totalPages = Math.ceil(members.length / 10);

    if (members.length === 0) {
      return interaction.reply({
        content: `${emojiler.uyari} <@&${role.id}> **rolünde üye bulunmuyor.**`,
        flags: 64
      });
    }

    let currentPage = 0;

    const generateEmbed = (page) => {
      const start = page * 10;
      const end = start + 10;
      const list = members.slice(start, end).map((u, i) => `- \`${start + i + 1}.\` ${u}`).join('\n');

      return new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
        .setDescription(list)
        .setFooter({ text: `Toplam: ${members.length} üye` });
    };

    const getButtons = (page) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('previous')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Success)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId('page_info')
          .setLabel(`${page + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId('next')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success)
          .setDisabled(page === totalPages - 1)
      );
    };

    await interaction.reply({
      embeds: [generateEmbed(currentPage)],
      components: [getButtons(currentPage)],
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000
    });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: `${emojiler.uyari} **Bu butonu komutu kullanan kişi kullanabilir.**`,
          flags: 64
        });
      }

      if (i.customId === 'previous' && currentPage > 0) {
        currentPage--;
      } else if (i.customId === 'next' && currentPage < totalPages - 1) {
        currentPage++;
      }

      await i.update({
        embeds: [generateEmbed(currentPage)],
        components: [getButtons(currentPage)]
      });
    });

    collector.on('end', async () => {
      if (message.editable) {
        const disabledRow = new ActionRowBuilder().addComponents(
          ...getButtons(currentPage).components.map(btn => btn.setDisabled(true))
        );
        await message.edit({ components: [disabledRow] });
      }
    });
  }
};