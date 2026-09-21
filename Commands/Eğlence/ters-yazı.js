const { SlashCommandBuilder } = require('discord.js');

function reverseText(text) {
  return text.split('').reverse().join('');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ters-yazı')
    .setDescription('Yazdığın metni ters çevirir.')
    .addStringOption(option =>
      option.setName('metin')
        .setDescription('Metin gir.')
        .setRequired(true)),

  async execute(interaction) {
    const input = interaction.options.getString('metin');
    const reversed = reverseText(input);
    await interaction.reply(`${reversed}`);
  }
};