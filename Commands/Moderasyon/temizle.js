const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("temizle")
        .setDescription("Belirtilen sayı kadar mesaj temizler.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName("sayı")
                .setDescription("Silinecek mesaj sayısı (1-100)")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName("kişi")
                .setDescription("Sadece bu kişinin mesajlarını sil.")
                .setRequired(false)
        ),

    async execute(interaction) {
        const { channel, options } = interaction;

        const miktar = options.getInteger("sayı");
        const hedefKullanici = options.getUser("kişi");
        const embed = new EmbedBuilder().setColor(0x337fb2);

        const mesajlar = await channel.messages.fetch({ limit: miktar });

        if (hedefKullanici) {
            const filtrelenmisMesajlar = mesajlar
                .filter(msg => msg.author.id === hedefKullanici.id)
                .first(miktar);

            if (filtrelenmisMesajlar.length === 0) {
                return interaction.reply({
                    content: `${emojiler.uyari} **${hedefKullanici.username}** adlı kişinin son ${miktar} mesajı içinde silinebilir mesaj bulunamadı.`,
                    flags: 64
                });
            }

            await channel.bulkDelete(filtrelenmisMesajlar, true)
                .then(async silinen => {
                    embed.setDescription(`${emojiler.cop} **${hedefKullanici.username}** adlı kişiye ait **${silinen.size} mesaj** kanaldan temizlendi.`);
                    await interaction.reply({ embeds: [embed] });
                    const msg = await interaction.fetchReply();
                    setTimeout(() => msg.delete().catch(() => {}), 3000);
                })
                .catch(() => {
                    interaction.reply({
                        content: `${emojiler.uyari} **14 günden eski mesajlar silinemez.**`,
                        flags: 64
                    });
                });

        } else {
            await channel.bulkDelete(miktar, true)
                .then(async silinen => {
                    embed.setDescription(`${emojiler.cop} **${silinen.size} mesaj** kanaldan temizlendi.`);
                    await interaction.reply({ embeds: [embed] });
                    const msg = await interaction.fetchReply();
                    setTimeout(() => msg.delete().catch(() => {}), 3000);
                })
                .catch(() => {
                    interaction.reply({
                        content: `${emojiler.uyari} **14 günden eski mesajlar silinemez.**`,
                        flags: 64
                    });
                });
        }
    }
};