const { ActivityType } = require('discord.js');
const { hasEnabled } = require('./modmailStore');
const states = new WeakMap();

function updatePresence(client, rotate = false) {
  if (!client?.user) return;
  const state = states.get(client) || { showSupport: false };
  state.showSupport = hasEnabled() && (rotate ? !state.showSupport : false);
  states.set(client, state);
  let members = 0;
  let online = 0;
  for (const guild of client.guilds.cache.values()) {
    members += guild.memberCount;
    for (const member of guild.members.cache.values()) {
      if (!member.user.bot && ['online', 'dnd', 'idle'].includes(member.presence?.status)) online++;
    }
  }
  client.user.setPresence({
    activities: [{ name: state.showSupport ? 'Destek İçin DM At!' : `${online} Çevrimiçi ・ ${members} Üye`, type: ActivityType.Custom }],
    status: require('../Core/generalSettings').settings.BotStatus || 'online',
  });
}
function startPresence(client) {
  clearInterval(states.get(client)?.timer);
  updatePresence(client);
  const state = states.get(client);
  state.timer = setInterval(() => updatePresence(client, true), 30_000);
  state.timer.unref?.();
}
module.exports = { startPresence, updatePresence };
