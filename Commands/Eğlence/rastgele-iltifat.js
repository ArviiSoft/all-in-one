const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('../../Utils/Core/databaseFs');
const path = require('path');
const dataPath = path.join(__dirname, '../../Database/Eğlence ve Etkileşim/iltifatVeri.json');
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rastgele-iltifat')
        .setDescription('Rastgele iltifat sistemini ayarlar.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('aç').setDescription('Sistemi açar.'))
        .addSubcommand(sub => sub.setName('kapat').setDescription('Sistemi devredışı bırakır.'))
        .addSubcommand(sub => sub.setName('kanal-seç').setDescription('İltifat edilecek kanalı belirler.')
            .addChannelOption(opt => opt.setName('kanal').setDescription('Kanal seç.').addChannelTypes(ChannelType.GuildText).setRequired(true))),

    async execute(interaction) {
        if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify({}));
        const veri = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const guildId = interaction.guildId;

        if (!veri[guildId]) {
            veri[guildId] = { status: false, channelId: null, count: 0 };
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'aç') {
            if (!veri[guildId].channelId) return interaction.reply({ content: `${emojiler.uyari} **Önce bir kanal seçmelisin.**`, flags: 64 });
            veri[guildId].status = true;
            fs.writeFileSync(dataPath, JSON.stringify(veri, null, 4));
            return interaction.reply({ content: `${emojiler.tik} İltifat sistemi **aktif edildi.**`, flags: 64 });
        }

        if (sub === 'kapat') {
            veri[guildId].status = false;
            fs.writeFileSync(dataPath, JSON.stringify(veri, null, 4));
            return interaction.reply({ content: `${emojiler.tik} İltifat sistemi **kapatıldı.**`, flags: 64 });
        }

        if (sub === 'kanal-seç') {
            const kanal = interaction.options.getChannel('kanal');
            veri[guildId].channelId = kanal.id;
            fs.writeFileSync(dataPath, JSON.stringify(veri, null, 4));
            return interaction.reply({ content: `${emojiler.hashtag} İltifat kanalı <#${kanal.id}> olarak **ayarlandı.**`, flags: 64 });
        }
    }
};