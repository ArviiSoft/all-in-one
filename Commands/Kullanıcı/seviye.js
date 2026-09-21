"use strict";

const { SlashCommandBuilder } = require('discord.js');
const { createLevelView } = require('../../Utils/Level/levelView');
let view;
const getView = () => view ||= createLevelView();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seviye')
    .setDescription('Seviye kartını gösterir.')
    .setDMPermission(false)
    .addSubcommand(command => command.setName('kart').setDescription('Bannerınla hazırlanan animasyonlu seviye kartını gösterir.')
      .addUserOption(option => option.setName('kullanıcı').setDescription('Kartı gösterilecek üye, boş bırakırsan kendin.')))
    .addSubcommand(command => command.setName('liderlik').setDescription('Sunucunun en aktif üyelerini ve kendi sıralamanı gösterir.')
      .addIntegerOption(option => option.setName('sayfa').setDescription('Görüntülenecek sayfa.').setMinValue(1).setMaxValue(1000000))),
  execute: interaction => getView().execute(interaction),
  handleComponent: interaction => getView().handleComponent(interaction),
};
