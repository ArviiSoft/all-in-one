const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { canMemberManageRole, canBotManageRole } = require("../../Utils/Core/security");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("toplu-rol")
    .setDescription("Üyelere veya botlara toplu olarak rol verir veya alır.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand((sub) =>
      sub
        .setName("ver")
        .setDescription("Belirtilen rolü toplu olarak verir.")
        .addStringOption((opt) =>
          opt
            .setName("hedef")
            .setDescription("Rol kimlere verilecek?")
            .setRequired(true)
            .addChoices(
              { name: "Üyeler", value: "uye" },
              { name: "Botlar", value: "bot" }
            )
        )
        .addRoleOption((opt) =>
          opt.setName("rol").setDescription("Rol seç.").setRequired(true)
        )
    )

    .addSubcommand((sub) =>
      sub
        .setName("al")
        .setDescription("Belirtilen rolü toplu olarak alır.")
        .addStringOption((opt) =>
          opt
            .setName("hedef")
            .setDescription("Rol kimlerden alınacak?")
            .setRequired(true)
            .addChoices(
              { name: "Üyeler", value: "uye" },
              { name: "Botlar", value: "bot" }
            )
        )
        .addRoleOption((opt) =>
          opt.setName("rol").setDescription("Rol seç.").setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const hedef = interaction.options.getString("hedef");
    const rol = interaction.options.getRole("rol");
    const guild = interaction.guild;
    const executor = interaction.member;

    if (rol.managed) {
      return interaction.reply({
        content: `${emojiler.uyari} **Entegrasyon/bot tarafından yönetilen roller toplu işleme alınamaz.**`,
        flags: 64,
      });
    }

    if (!canMemberManageRole(executor, rol, guild)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu rol senin rolünün üstünde veya eşit.**`,
        flags: 64,
      });
    }

    if (!canBotManageRole(guild, rol)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu rol botun yetkisinden daha yüksek.**`,
        flags: 64,
      });
    }

    const members = await guild.members.fetch();
    let hedefler = members.filter((m) =>
      hedef === "bot" ? m.user.bot : !m.user.bot
    );

    if (sub === "ver") {
      const alreadyHas = hedefler.filter((m) => m.roles.cache.has(rol.id));
      hedefler = hedefler.filter((m) => !m.roles.cache.has(rol.id));

      if (hedefler.size === 0)
        return interaction.reply({
          content: `${emojiler.uyari} **Bu kişilerde zaten <@&${rol.id}> rolü var.**`,
          flags: 64,
        });

      if (alreadyHas.size > 0) {
        await interaction.reply({
          content: `${emojiler.uyari} **${alreadyHas.size} kişide zaten <@&${rol.id}> rolü bulunuyor**. İşlem bunlar hariç başlatılıyor.`,
          flags: 64,
        });
      }
    } else {
      const alreadyMissing = hedefler.filter((m) => !m.roles.cache.has(rol.id));
      hedefler = hedefler.filter((m) => m.roles.cache.has(rol.id));

      if (hedefler.size === 0) 
        return interaction.reply({
          content: `${emojiler.uyari} **Bu kişilerde zaten <@&${rol.id}> rolü yok.**`,
          flags: 64,
        });

      if (alreadyMissing.size > 0) {
        await interaction.reply({
          content: `${emojiler.uyari} **${alreadyMissing.size} kişide <@&${rol.id}> rolü bulunmadığı için işlem bunlar hariç başlatılıyor.**`,
          flags: 64,
        });
      }
    }

    const tahminiSaniye = Math.ceil(hedefler.size / 3);
    const tahminiDakika = Math.ceil(tahminiSaniye / 60);

    const baslaEmbed = new EmbedBuilder()
      .setColor("Yellow")
      .setTitle(`${emojiler.yukleniyor} Toplu Rol İşlemi Başlatıldı`)
      .setDescription(
          `${emojiler.uye} Hedef: **${hedef === "bot" ? "Botlar" : "Üyeler"}** \n` +
          `${emojiler.sadesagok} Rol: ${rol} \n` +
          `${emojiler.uye} Toplam hedef: **${hedefler.size} kişi**`
      )
      .setFooter({  text: `Tahmini Süre: ${tahminiDakika || "<1"} dakika` })

    const cancelButton = new ButtonBuilder()
      .setCustomId(`iptal-${interaction.id}`)
      .setLabel("İptal Et")
      .setStyle(ButtonStyle.Danger)
      .setEmoji(`${emojiler.kapat}`);

    const row = new ActionRowBuilder().addComponents(cancelButton);

    await interaction.channel.send({
      embeds: [baslaEmbed],
      components: [row],
    });

    const progressMsg = await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle(`${emojiler.yukleniyor} İşlem Devam Ediyor...`)
          .setDescription(
            `0/${hedefler.size} kişi işlendi. \n\n**İlerleme:** \`░░░░░░░░░░\` (%0)`
          ),
      ],
    });

    let completed = 0;
    const total = hedefler.size;
    const hedefListesi = Array.from(hedefler.values());
    const perTick = 3;
    const delay = 1000;
    let cancelled = false;

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) => i.customId === `iptal-${interaction.id}`,
      time: tahminiSaniye * 1000 + 30000,
    });

    collector.on("collect", async (btn) => {
      const btnMember = btn.member;

      const hasPermission =
        btnMember.id === executor.id ||
        btnMember.roles.highest.position > executor.roles.highest.position;

      if (!hasPermission) {
        return btn.reply({
          content: `${emojiler.uyari} **Bu butonu kullanamazsın.**`,
          flags: 64,
        });
      }

      cancelled = true;
      await btn.reply({
        content: `${emojiler.tik} İşlem **iptal edildi.**`,
        flags: 64,
      });

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle(`${emojiler.carpi} İşlem Durduruldu`)
        .setDescription(
          `${emojiler.buyutec} **${completed}**/${total} kişi işlendi. \n` +
            `Kalan işlem iptal edildi. ${emojiler.uyari}`
        );

      await progressMsg.edit({ embeds: [embed], components: [] });
      collector.stop("cancelled");
    });

    async function updateProgress() {
      const percent = Math.min(100, Math.round((completed / total) * 100));
      const filled = Math.round(percent / 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`${emojiler.yukleniyor} İşlem Devam Ediyor...`)
        .setDescription(
          `**${completed}**/${total} kişi işlendi. \n\n**İlerleme:** \`${bar}\` (%${percent})`
        );

      await progressMsg.edit({ embeds: [embed] });
    }

    async function processChunk() {
      if (cancelled) return;

      for (let i = 0; i < perTick; i++) {
        const member = hedefListesi.shift();
        if (!member) break;

        try {
          if (sub === "ver") {
            await member.roles.add(rol);
          } else {
            await member.roles.remove(rol);
          }
        } catch (err) {
          console.warn(
            `⚠️ [TOPLU ROL] Rol işlemi hatası: ${member.user.tag}: ${err.message}`
          );
        }

        completed++;
      }

      await updateProgress();

      if (hedefListesi.length > 0 && !cancelled) {
        setTimeout(processChunk, delay);
      } else if (!cancelled) {
        const embed = new EmbedBuilder()
          .setColor("Green")
          .setTitle(`${emojiler.tik} İşlem Tamamlandı`)
          .setFooter({ text: `Toplam ( ${completed} ) kişi işlendi.` })
          .setDescription(
            `${emojiler.sadesagok} Rol: ${rol}\n` +
              `${emojiler.buyutec} Hedef: **${
                hedef === "bot" ? "Botlar" : "Üyeler"
              }**`
          );

        await progressMsg.edit({ embeds: [embed], components: [] });
      }
    }

    processChunk();
  },
};
