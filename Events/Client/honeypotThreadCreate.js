const { Events } = require("discord.js");
const { handleHoneypotThreadCreate } = require("../../Utils/Moderation/honeypotGuard");

module.exports = {
  name: Events.ThreadCreate,

  async execute(thread, newlyCreated, client) {
    await handleHoneypotThreadCreate(thread, newlyCreated, client);
  },
};
