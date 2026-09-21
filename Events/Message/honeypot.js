const { Events } = require("discord.js");
const { handleHoneypotMessage } = require("../../Utils/Moderation/honeypotGuard");

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client) {
    await handleHoneypotMessage(message, client);
  },
};
