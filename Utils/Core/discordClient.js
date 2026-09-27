const { Client, GatewayIntentBits, Partials } = require('discord.js');

function createDiscordClient() {
  return new Client({
    intents: Object.values(GatewayIntentBits).filter(Number.isInteger),
    partials: Object.values(Partials).filter(Number.isInteger),
  });
}

module.exports = { createDiscordClient };
