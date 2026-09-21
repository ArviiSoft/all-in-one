const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Kanalı patlatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.channel;

    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu işlem için botta "Kanalları Yönet" izni olmalı.**`,
        flags: 64
      });
    }

    await interaction.reply({ content: `${emojiler.yukleniyor} Kanal sıfırlanıyor...`, flags: 64 });

    try {
      const cloned = await channel.clone({
        name: channel.name,
        type: channel.type,
        topic: channel.topic,
        nsfw: channel.nsfw,
        bitrate: channel.bitrate,
        userLimit: channel.userLimit,
        rateLimitPerUser: channel.rateLimitPerUser,
        permissionOverwrites: channel.permissionOverwrites.cache.map(perm => ({
          id: perm.id,
          allow: perm.allow.bitfield,
          deny: perm.deny.bitfield,
          type: perm.type,
        }))
      });

      await interaction.followUp({
        content: `${emojiler.tik} Kanal yeniden **oluşturuldu.** \n\n${emojiler.hashtag} <#${cloned.id}>`,
        flags: 64
      });

      await channel.delete();

      await cloned.send({
        content: `${emojiler.nuke} Kanal **sıfırlandı.**`,
      });

    } catch (error) {
      console.error('🔴 [NUKE] Nuke hatası:', error);
      try {
        await interaction.followUp({
          content: `${emojiler.uyari} **Kanal yeniden oluşturulurken hata oluştu.**`,
          flags: 64
        });
      } catch (err) {
        console.error('🔴 [NUKE] FollowUp başarısız:', err);
      }
    }
  }
};
