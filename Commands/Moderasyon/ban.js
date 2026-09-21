const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban işlemleri.")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addSubcommand(subcommand =>
            subcommand
                .setName("at")
                .setDescription("Kişiyi sunucudan yasaklar.")
                .addUserOption(option =>
                    option.setName("kişi").setDescription("Kişi seç.").setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("sebep").setDescription("Sebep gir.").setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("mesajları-sil")
                        .setDescription("Banlanırken geçmiş mesajları sil.")
                        .addChoices(
                            { name: "1 Saat", value: "1h" },
                            { name: "6 Saat", value: "6h" },
                            { name: "12 Saat", value: "12h" },
                            { name: "24 Saat", value: "24h" },
                            { name: "3 Gün", value: "3d" },
                            { name: "1 Hafta", value: "7d" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("kaldır")
                .setDescription("Belirtilen ID'deki kişinin yasağını kaldırır.")
                .addStringOption(option =>
                    option.setName("kişi-id").setDescription("ID gir.").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("temizle")
                .setDescription("Sunucudaki tüm banları kaldırır.")
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (sub === "at") {
            const user = interaction.options.getUser("kişi");
            const reason = interaction.options.getString("sebep");
            const mesajSilSecimi = interaction.options.getString("mesajları-sil");

            const member = await guild.members.fetch(user.id).catch(() => null);

            if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Ban atmak için botta "Üyeleri Yasakla" izni olmalı.**`,
                    flags: 64
                });
            }

            if (user.id === guild.ownerId) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Sunucu sahibini banlayamazsın.**`,
                    flags: 64
                });
            }

            const bans = await guild.bans.fetch();
            if (bans.has(user.id)) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Bu kişi zaten banlı.**`,
                    flags: 64
                });
            }

            if (!member) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Bu kişiyi sunucuda bulamıyorum.**`,
                    flags: 64
                });
            }

            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                const errEmbed = new EmbedBuilder()
                    .setTitle("YETKİ HATASI")
                    .setDescription(`${emojiler.uyari} **(** **${user.username}** **)** **kişisinin rolü seninkine eşit veya daha yüksek.**`)
                    .setColor(0xff4c4c)
                    .setThumbnail(guild.iconURL({ dynamic: true }));

                return interaction.reply({ embeds: [errEmbed], flags: 64 });
            }

            if (!member.bannable) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Bu kişiyi banlamak için botun rolü yeterince yüksek değil.**`,
                    flags: 64
                });
            }

            const silmeSureleri = {
                "1h": 60 * 60,
                "6h": 6 * 60 * 60,
                "12h": 12 * 60 * 60,
                "24h": 24 * 60 * 60,
                "3d": 3 * 24 * 60 * 60,
                "7d": 7 * 24 * 60 * 60
            };

            const deleteMessageSeconds = mesajSilSecimi ? silmeSureleri[mesajSilSecimi] : 0;

            try {
                await member.ban({ reason, deleteMessageSeconds });

                const banEmbed = new EmbedBuilder()
                    .setAuthor({ name: `"${user.username}" adlı kişi yasaklandı.`, iconURL: guild.iconURL({ dynamic: true }) })
                    .setColor(0xff4c4c)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: `${emojiler.ban} Yasaklanan Kişi`, value: `${user}`, inline: true },
                        { name: `${emojiler.hashtag} Sebep`, value: reason, inline: true },
                        { name: `${emojiler.kalkan} Yasaklayan`, value: `${interaction.user}`, inline: false },
                        { name: `${emojiler.cop} Mesaj Silme Süresi`, value: mesajSilSecimi ? mesajSilSecimi.replace("h", " Saat").replace("d", " Gün") : "Seçim yapılmadı.", inline: false }
                    );

                const banKaldirButton = new ButtonBuilder()
                    .setCustomId(`banKaldir_${user.id}`)
                    .setLabel("Banı Kaldır")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(`${emojiler.tik}`);

                const banTemizleButton = new ButtonBuilder()
                    .setCustomId(`banTemizle`)
                    .setLabel("Tüm Banları Temizle")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(`${emojiler.cop}`);

                const row = new ActionRowBuilder().addComponents(banKaldirButton, banTemizleButton);

                await interaction.reply({ embeds: [banEmbed], components: [row] });
                await user.send(`${emojiler.ban} **(** ${guild.name} **)** sunucusundan **(** ${reason} **)** sebebiyle yasaklandın.`).catch(() => {});

                const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });
                collector.on("collect", async i => {
                    if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: `${emojiler.uyari} **Bu butonu kullanabilmek için yetkin yok.**`, flags: 64});

                    if (i.customId === `banKaldir_${user.id}`) {
                        await guild.members.unban(user.id).catch(() => {});
                        await i.reply({ content: `${emojiler.tik} ${user} adlı kişinin banı **kaldırıldı.**`, flags: 64});
                    }

                    if (i.customId === `banTemizle`) {
                        if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
                            return i.reply({ content: `${emojiler.uyari} **Tüm banları temizlemek için "Yönetici" izni gerekiyor.**`, flags: 64});
                        }

                        const banList = await guild.bans.fetch();
                        if (banList.size === 0) return i.reply({ content: `${emojiler.mutlupanda} Sunucuda banlı kimse yok.`, flags: 64});
                        let kaldırılan = 0;
                        for (const [userId] of banList) {
                            await guild.members.unban(userId, "Toplu ban kaldırma").catch(() => {});
                            kaldırılan++;
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        await i.reply({ content: `${emojiler.tik} **(** ${kaldırılan} kişinin **)** banı **kaldırıldı.**`, flags: 64});
                    }
                });

                collector.on("end", async () => {
                    if (interaction.channel) {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            banKaldirButton.setDisabled(true),
                            banTemizleButton.setDisabled(true)
                        );
                        await interaction.editReply({ components: [disabledRow] }).catch(() => {});
                    }
                });

            } catch (error) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Hata oluştu**`,
                    flags: 64
                });
            }

        } else if (sub === "kaldır") {
            const userId = interaction.options.getString("kişi-id");

            if (!/^\d{17,20}$/.test(userId)) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Geçerli bir ID gir.**`,
                    flags: 64
                });
            }

            try {
                const bans = await guild.bans.fetch();
                const bannedUser = bans.get(userId);
                if (!bannedUser) {
                    return interaction.reply({
                        content: `${emojiler.uyari} **Bu ID'ye ait bir yasak bulunamadı.**`,
                        flags: 64
                    });
                }

                await guild.members.unban(userId);

                const unbanEmbed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setThumbnail(guild.iconURL({ dynamic: true }))
                    .setAuthor({ name: 'YASAK KALDIRILDI', iconURL: guild.iconURL({ dynamic: true }) })
                    .setDescription(`<@${userId}> **(** ${userId} **)** adlı kişinin yasağı **kaldırıldı.**`);

                const tekrarBanlaButton = new ButtonBuilder()
                    .setCustomId(`tekrarBanla_${userId}`)
                    .setLabel("Tekrar Banla")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(`${emojiler.ban}`);

                const row = new ActionRowBuilder().addComponents(tekrarBanlaButton);

                await interaction.reply({ embeds: [unbanEmbed], components: [row] });

                const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });
                collector.on("collect", async i => {
                    if (!i.member.permissions.has(PermissionFlagsBits.BanMembers))
                        return i.reply({ content: `${emojiler.uyari} **Bu butonu kullanabilmek için yetkin yok.**`, flags: 64 });

                    if (i.customId === `tekrarBanla_${userId}`) {
                        try {
                            await guild.members.ban(userId, { reason: "Tekrar banlandı" });
                            await i.reply({ content: `${emojiler.tik} <@${userId}> tekrar **banlandı.**`, flags: 64 });
                        } catch (err) {
                            await i.reply({ content: `${emojiler.uyari} **Kişi banlanamadı.**`, flags: 64 });
                        }
                    }
                });

                collector.on("end", async () => {
                    const disabledRow = new ActionRowBuilder().addComponents(tekrarBanlaButton.setDisabled(true));
                    try {
                        await interaction.editReply({ components: [disabledRow] });
                    } catch (err) {
                       
                    }
                });

            } catch (err) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xff4c4c)
                    .setTitle(`${emojiler.uyari} HATA`)
                    .setDescription("Kişinin banı kaldırılırken sorun oluştu. ID'yi veya yetkileri kontrol et.");

                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
        } else if (sub === "temizle") {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: `${emojiler.uyari} **Tüm banları temizlemek için "Yönetici" izni gerekiyor.**`,
                    flags: 64,
                });
            }

            await interaction.reply({
                content: `${emojiler.yukleniyor} Ban listesi alınıyor...`,
                flags: 64,
            });

            try {
                const banList = await guild.bans.fetch();

                if (banList.size === 0) {
                    return interaction.editReply(`${emojiler.mutlupanda} Sunucuda banlı kimse yok.`);
                }

                let kaldırılan = 0;
                for (const [userId] of banList) {
                    try {
                        await guild.members.unban(userId, "Toplu ban kaldırma");
                        kaldırılan++;
                        await new Promise((r) => setTimeout(r, 1000));
                    } catch {}
                }

                await interaction.editReply(`${emojiler.tik} **(** ${kaldırılan} **)** kişinin banı **kaldırıldı.**`);

            } catch (err) {
                await interaction.editReply(`${emojiler.uyari} **Ban listesi alınırken hata oluştu.**`);
            }
        }
    }
};