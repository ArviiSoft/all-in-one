const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emoji-bilgi')
    .setDescription('Emoji hakkında bilgi verir.')
    .addStringOption(opt =>
      opt.setName('emoji')
        .setDescription('Emoji gir. (Birden fazla emoji destekler)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const emojiStr = interaction.options.getString('emoji');
    const emojis = [...emojiStr.matchAll(/<(a)?:([\w_]+):(\d+)>/g)];

    if (!emojis.length) {
      return interaction.reply({ content: `${emojiler.uyari} **Geçerli emoji(ler) gir.**`, flags: 64 });
    }

    let page = 0;

    const getEmbed = (index) => {
      const [ , animated, name, id ] = emojis[index];
      const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=512`;
      return new EmbedBuilder()
        .setDescription(`\`${name}\`:\`${id}\``)
        .setImage(url)
        .setColor('Blurple');
    };

    const row = (current, total) => {
      const [ , animated, , id ] = emojis[current];
      const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=512`;

      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Success)
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId('sayfa')
          .setLabel(`${current + 1}/${total}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Success)
          .setDisabled(current === total - 1),
        new ButtonBuilder()
          .setLabel('Emojiyi İndir')
          .setStyle(ButtonStyle.Link)
          .setURL(url)
      );
    };

    await interaction.reply({
      embeds: [getEmbed(page)],
      components: [row(page, emojis.length)],
      flags: 64
    });

    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000
    });

    collector.on('collect', async i => {
      if (i.customId === 'prev') page--;
      if (i.customId === 'next') page++;

      await i.update({
        embeds: [getEmbed(page)],
        components: [row(page, emojis.length)]
      });
    });

    collector.on('end', async () => {
      const disabledRow = row(page, emojis.length).setComponents(
        row(page, emojis.length).components.map(btn => btn.setDisabled(true))
      );
      await reply.edit({
        embeds: [getEmbed(page)],
        components: [disabledRow]
      }).catch(() => {});
    });
  }
};