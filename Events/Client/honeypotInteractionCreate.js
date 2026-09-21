const { Events } = require("discord.js");
const { handleHoneypotInteraction } = require("../../Utils/Moderation/honeypotGuard");

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    await handleHoneypotInteraction(interaction, client);
  },
};
