const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)\s*(saniye|dakika|saat|gün)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "gün": return value * 24 * 60 * 60 * 1000;
    case "saat": return value * 60 * 60 * 1000;
    case "dakika": return value * 60 * 1000;
    case "saniye": return value * 1000;
    default: return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("oylama-başlat")
    .setDescription("Oylama başlatır.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => option.setName("soru").setDescription("Soru gir.").setRequired(true))
    .addStringOption(option => option.setName("süre").setDescription("Süre gir. (5 saniye, 10 dakika, 1 saat, 3 gün)").setRequired(true))
    .addStringOption(o => o.setName("seçenek-1").setDescription("Seçenek 1").setRequired(true))
    .addStringOption(o => o.setName("seçenek-2").setDescription("Seçenek 2").setRequired(true))
    .addStringOption(o => o.setName("seçenek-3").setDescription("Seçenek 3").setRequired(false))
    .addStringOption(o => o.setName("seçenek-4").setDescription("Seçenek 4").setRequired(false))
    .addStringOption(o => o.setName("seçenek-5").setDescription("Seçenek 5").setRequired(false))
    .addStringOption(o => o.setName("seçenek-6").setDescription("Seçenek 6").setRequired(false))
    .addStringOption(o => o.setName("seçenek-7").setDescription("Seçenek 7").setRequired(false))
    .addStringOption(o => o.setName("seçenek-8").setDescription("Seçenek 8").setRequired(false))
    .addStringOption(o => o.setName("seçenek-9").setDescription("Seçenek 9").setRequired(false))
    .addStringOption(o => o.setName("seçenek-10").setDescription("Seçenek 10").setRequired(false)),

  async execute(interaction) {
    try {
      require('../../Utils/Engagement/engagementSettings').requireEnabled(interaction.guildId, 'oylama-baslat');
      const durationMs = parseDuration(interaction.options.getString('süre'));
      if (!durationMs) throw new RangeError('Süreyi 5 saniye, 10 dakika, 1 saat veya 3 gün biçiminde girin.');
      const options = Array.from({ length: 10 }, (_, i) => interaction.options.getString('seçenek-' + (i + 1))).filter(Boolean);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const message = await require('../../Utils/Engagement/oylamaKontrol').startPoll(interaction.guild, interaction.channelId, interaction.user.id, {
        question: interaction.options.getString('soru'), durationMs, options,
      });
      await interaction.editReply({ content: 'Oylama <#' + message.channelId + '> kanalında başlatıldı.', allowedMentions: { parse: [] } });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      const payload = { content: error.message, flags: MessageFlags.Ephemeral };
      return interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
    }
  }
};
