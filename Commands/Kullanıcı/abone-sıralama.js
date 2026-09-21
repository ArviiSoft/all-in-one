const { SlashCommandBuilder } = require("discord.js");
const { executeLeaderboard } = require("../../Utils/Membership/aboneLeaderboard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("abone-sıralama")
    .setDescription("En çok abone rolü veren yetkilileri sıralar.")
    .setDMPermission(false),

  async execute(interaction) {
    return executeLeaderboard(interaction);
  },
};
