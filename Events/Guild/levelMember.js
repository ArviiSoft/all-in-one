const { Events } = require("discord.js");
const { reconcileMember } = require("../../Utils/Level/levelService");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) { await reconcileMember(member); },
};
