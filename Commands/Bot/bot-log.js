const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const db2 = require('../../Utils/Core/jsonDB');
const emojiler = require("../../Utils/Emojis/emojiler.js");
const ayarlar = require('../../Utils/Core/generalSettings').settings;

const dosyaYolu = path.join(__dirname, '../../Database/Sistem/botLog.json');

function veriOku() {
  if (!fs.existsSync(dosyaYolu)) return {};
  try {
    return JSON.parse(fs.readFileSync(dosyaYolu, 'utf8'));
  } catch {
    return {};
  }
}

function veriYaz(data) {
  fs.writeFileSync(dosyaYolu, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot-log')
    .setDescription('Bot log sistemini ayarlar.')
    .addChannelOption(option =>
      option.setName('bot-log')
        .setDescription('Kanal seç.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('veri-reset-log')
        .setDescription('Kanal seç.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('webhook')
        .setDescription('Webhook URL\'si gir.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('isim')
        .setDescription('Webhook için isim gir.')
    )
    .addStringOption(option =>
      option.setName('avatar')
        .setDescription('Webhook için avatar URL\'si gir.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sahipID = ayarlar.sahipID;
    if (interaction.user.id !== sahipID) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu komutu sadece <@${sahipID}> kullanabilir.**`,
        flags: 64,
      });
    }

    const kanal = interaction.options.getChannel('bot-log');
    let webhook = interaction.options.getString('webhook');
    const username = interaction.options.getString('isim') || null;
    const avatarURL = interaction.options.getString('avatar') || null;
    const veriResetKanal = interaction.options.getChannel('veri-reset-log') || null;

    const webhookRegex = /^https:\/\/(canary\.|ptb\.)?discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    if (!webhookRegex.test(webhook)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Geçerli bir Webhook URL'si gir.**`,
        flags: 64,
      });
    }

    webhook = webhook.replace("https://canary.discord.com/api/webhooks/", "https://discord.com/api/webhooks/").replace("https://ptb.discord.com/api/webhooks/", "https://discord.com/api/webhooks/");

    const data = veriOku();

    for (const [guildId, config] of Object.entries(data)) {
      if (config.webhookURL === webhook) {
        delete data[guildId];
      }
    }

    data[interaction.guild.id] = {
      kanalId: kanal.id,
      webhookURL: webhook,
      username,
      avatarURL,
    };
    veriYaz(data);

    if (veriResetKanal) {
      db2.set("reset_log_channel", veriResetKanal.id);
    }

    let replyMsg = `${emojiler.tik} Konsol logları <#${kanal.id}> kanalına **gönderilecek.**`;
    if (veriResetKanal) {
      replyMsg += `\n\n ${emojiler.tik} Veri reset logları <#${veriResetKanal.id}> kanalına **gönderilecek.**`;
    }

    await interaction.reply({
      content: replyMsg,
      flags: 64,
    });
  },
};
