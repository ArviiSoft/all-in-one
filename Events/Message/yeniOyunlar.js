const { Events } = require("discord.js");
const { handleGameMessage } = require("../../Utils/Engagement/yeniOyunlar");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      await handleGameMessage(message);
    } catch (error) {
      console.error("🔴 [YENİ OYUNLAR - MESAJ]", error);
    }
  },
};