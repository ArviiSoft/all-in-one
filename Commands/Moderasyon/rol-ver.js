const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { executeRoleCommand } = require("../../Utils/Moderation/rolYonetimi");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rol-ver")
    .setDescription("Bir üyeye kalıcı veya süreli rol verir.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option
        .setName("kişi")
        .setDescription("Rolün verileceği kişiyi seç.")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("rol")
        .setDescription("Verilecek rolü seç.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("süre")
        .setDescription("İsteğe bağlı: 2 gün, 48sa veya 120dk.")
        .setMaxLength(32)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("sebep")
        .setDescription("Rol verme nedenini yaz.")
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
    return executeRoleCommand(interaction, "ver");
  },
};
