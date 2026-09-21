const { Events } = require("discord.js");
const { removeMember } = require("../../Utils/Level/levelService");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) { await removeMember(member); },
};
