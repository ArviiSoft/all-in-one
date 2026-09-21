'use strict';
const { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
async function publishAnonymousPanel(guild, target, previous = {}) {
  const payload = {
    components: [new ContainerBuilder().setAccentColor(0x5865f2).addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🕵️ Anonim Sohbet\nSohbete başlamak için kuyruğa katıl. Başka bir üye katıldığında bot sizi eşleştirir; mesajlar bot aracılığıyla DM üzerinden iletilir.\n\nKarşılıklı onayınızla anonimliği kaldırabilir veya sohbeti istediğiniz zaman bitirebilirsiniz.')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('anon_start').setLabel('Sohbete Başla').setStyle(ButtonStyle.Success))],
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
  };
  if (previous.channelId === target.id && previous.messageId) {
    const existing = await target.messages.fetch(previous.messageId).catch(error => { if (Number(error.code) !== 10008) throw error; return null; });
    if (existing && existing.author.id === guild.client.user.id) return existing.edit(payload);
  }
  return target.send(payload);
}
module.exports = { publishAnonymousPanel };