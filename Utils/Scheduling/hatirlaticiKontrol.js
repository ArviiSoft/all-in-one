const fs = require('../Core/databaseFs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const emojiler = require("../Emojis/emojiler.js");

const veriYolu = path.join(__dirname, '../../Database/Bildirimler ve Sosyal Medya/hatirlatici.json');

function veriOku() {
  if (!fs.existsSync(veriYolu)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(veriYolu, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function veriYaz(data) {
  fs.writeFileSync(veriYolu, JSON.stringify(data, null, 2));
}

module.exports = async function hatirlaticilariKontrolEt(client) {
  const veri = veriOku();
  const simdi = Date.now();
  const kalanVeri = [];

  for (const item of veri) {
    if (item.zaman <= simdi) {
      const kanal = await client.channels.fetch(item.channelId).catch(() => null);
      if (!kanal) continue;

      const simdi = Math.floor(Date.now() / 1000);
    
if (item.zaman <= simdi) {
  
  const hedefZaman = item.zaman;

      const butonlar = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Orijinal Mesaja Git')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${item.guildId}/${item.channelId}/${item.messageId}`),
        new ButtonBuilder()
          .setCustomId(`okundu_${item.userId}`)
          .setLabel('Tamamdır')
          .setStyle(ButtonStyle.Primary)
          .setEmoji("👁️")
      );

      await kanal.send({
        content: `${emojiler.bildirim} <@${item.userId}> | <t:${hedefZaman}:R> **:** ${item.text}`,
        components: [butonlar]
      }).catch(() => null);
    } else {
      kalanVeri.push(item);
    }
  }
  veriYaz(kalanVeri);
}};
