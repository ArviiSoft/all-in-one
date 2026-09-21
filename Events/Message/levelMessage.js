const { Events } = require("discord.js");
const { handleMessage } = require("../../Utils/Level/levelService");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) { await handleMessage(message); },
};
