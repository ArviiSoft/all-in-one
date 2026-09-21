const { Events, MessageFlags } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { handleGameInteraction } = require("../../Utils/Engagement/yeniOyunlar");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith("mini-game:")) return;

    try {
      await handleGameInteraction(interaction);
    } catch (error) {
      console.error("🔴 [YENİ OYUNLAR - BUTON]", error);
      const payload = {
        content: `${emojiler.uyari || "⚠️"} Oyun işlemi tamamlanırken beklenmeyen bir hata oluştu.`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  },
};