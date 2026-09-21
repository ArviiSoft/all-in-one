const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { executeRoleCommand } = require("../../Utils/Moderation/rolYonetimi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rol-al")
    .setDescription("Bir üyeden belirtilen rolü alır.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option
        .setName("kişi")
        .setDescription("Rolün alınacağı kişiyi seç.")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("rol")
        .setDescription("Alınacak rolü seç.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("sebep")
        .setDescription("Rol alma nedenini yaz.")
        .setMaxLength(512)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("log-kanalı")
        .setDescription("İsteğe bağlı log kanalını seç.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    return executeRoleCommand(interaction, "al");
  },
};
