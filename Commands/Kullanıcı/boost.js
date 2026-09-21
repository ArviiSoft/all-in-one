const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildBoostPayload, buildMilestonePayload } = require('../../Utils/Boost/boostView');
const { ensureBoostEmojis } = require('../../Utils/Boost/boostEmojis');
const emojiler = require('../../Utils/Emojis/emojiler.js');

async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch (error) {
    if (error.code === 10007) return null;
    throw error;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boost')
    .setDescription('Boost rozetini, ilerlemesini ve sonraki rozete kalan süreyi gösterir.')
    .setDMPermission(false)
    .addUserOption(option => option.setName('kullanıcı').setDescription('Boost bilgisi gösterilecek üye.')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: `${emojiler.uyari} **Bu komut yalnızca sunucuda kullanılabilir.**`, flags: MessageFlags.Ephemeral });
    if (!interaction.appPermissions?.has([PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply({ content: `${emojiler.uyari} **Rozet kartı için bu kanalda Dosya Ekle ve Bağlantı Yerleştir izinlerine ihtiyacım var.**`, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    try {
      const user = interaction.options.getUser('kullanıcı') || interaction.user;
      const member = await fetchMember(interaction.guild, user.id);
      if (!member) return interaction.editReply({ content: `${emojiler.uyari} **Bu kullanıcı sunucuda bulunmuyor.**` });
      if (member.premiumSinceTimestamp) await ensureBoostEmojis(interaction.client);
      return await interaction.editReply(await buildBoostPayload(member, interaction.user.id));
    } catch (error) {
      console.error('🔴 [BOOST] Kart oluşturulamadı:', error);
      return interaction.editReply({ content: `${emojiler.uyari} **Boost bilgisi alınamadı, biraz sonra tekrar dene.**` });
    }
  },

  async handleMilestone(interaction) {
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('boost:milestones:')) return;
    const match = /^boost:milestones:(\d{17,20}):(\d{17,20})$/.exec(interaction.customId);
    if (!match || !interaction.inGuild()) return interaction.reply({ content: `${emojiler.glitchwarning} Bu menü artık kullanılamıyor. \`/boost\` komutunu tekrar kullan.`, flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== match[1]) return interaction.reply({ content: `${emojiler.glitchwarning} Kendi rozet menünü açmak için \`/boost\` komutunu kullan.`, flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const level = Number(interaction.values[0]);
      if (!Number.isInteger(level) || level < 1 || level > 9) return interaction.editReply({ content: 'Geçersiz rozet seviyesi.' });
      const member = await fetchMember(interaction.guild, match[2]);
      if (!member) return interaction.editReply({ content: 'Bu üye artık sunucuda bulunmuyor.' });
      return await interaction.editReply(await buildMilestonePayload(member, level));
    } catch (error) {
      console.error('🔴 [BOOST] Rozet detayı alınamadı:', error);
      return interaction.editReply({ content: `${emojiler.uyari} **Rozet bilgisi alınamadı, biraz sonra tekrar dene.**` });
    }
  },
};