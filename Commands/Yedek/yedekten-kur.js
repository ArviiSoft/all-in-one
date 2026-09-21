const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const fs = require("fs");
const yaml = require("js-yaml");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { YEDEK_KLASORU } = require("../../Utils/Backup/yedekManager");
const { isSafeGuildBackupId, resolveInside } = require("../../Utils/Core/security");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("yedekten-kur")
    .setDescription("Yedek ID'sine göre sunucuyu sıfırdan kurar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName("yedek-id")
        .setDescription("ID gir. (yedek_123456789_171512341)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const yedekId = interaction.options.getString("yedek-id");
    const guild = interaction.guild;
    const botMember = guild.members.me;

    if (!isSafeGuildBackupId(yedekId, guild.id)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Sadece bu sunucuya ait geçerli bir yedek ID'si kullanabilirsin.**`,
        flags: 64,
      });
    }

    if (!botMember.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
      return interaction.reply({
        content: `${emojiler.uyari} **Yedek kurmak için botta "Kanalları Yönet" ve "Rolleri Yönet" izinleri olmalı.**`,
        flags: 64,
      });
    }

    const dosyaYolu = resolveInside(YEDEK_KLASORU, `${yedekId}.yaml`);

    if (!dosyaYolu || !fs.existsSync(dosyaYolu)) {
      return interaction.reply({
        content: `${emojiler.uyari} **Bu ID ile kayıtlı bir yedek bulunamadı.**`,
        flags: 64,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("yedek_onayla")
        .setLabel("Evet")
        .setEmoji(`${emojiler.tik}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("yedek_iptal")
        .setLabel("Vazgeç")
        .setEmoji(`${emojiler.carpi}`)
        .setStyle(ButtonStyle.Danger)
    );

    const onayMesaji = await interaction.reply({
      content:
        `${emojiler.info} **UYARI:** __Bu işlem sunucudaki tüm kanalları ve rolleri siler.__ \n\n` +
        "▶️ Devam etmek istiyor musun?",
      components: [row],
    });

    const collector = onayMesaji.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
    });

    collector.on("collect", async (button) => {
      if (button.user.id !== interaction.user.id) {
        return button.reply({
          content: `${emojiler.uyari} **Bu buton sana ait değil.**`,
          flags: 64,
        });
      }

      if (button.customId === "yedek_iptal") {
        collector.stop("iptal");
        return button.update({
          content: `${emojiler.carpi} İşlem **iptal edildi.**`,
          components: [],
        });
      }

      if (button.customId === "yedek_onayla") {
        collector.stop("onay");

        await button.update({
          content: `${emojiler.yukleniyor} Yedek kurulumu başlatılıyor...`,
          components: [],
        });

        const yedekVerisi = yaml.load(fs.readFileSync(dosyaYolu, "utf8"));

const silinecekRoller = guild.roles.cache.filter(
  r => r.id !== guild.id && !r.managed && r.editable
);

for (const role of silinecekRoller.values()) {
  try {
    await role.delete("Yedek kurulumu için eski rol silindi");
  } catch (e) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] Rol silinemedi: ${role.name} - ${e.message}`);
  }
}

        for (const channel of guild.channels.cache.values()) {
          try {
            await channel.delete("Yedek kurulumu için eski kanal silindi");
          } catch (e) {
            console.warn(`⚠️ [YEDEK SİSTEMİ] Kanal silinemedi: ${channel.name} - ${e.message}`);
          }
        }

        const roller = [...(yedekVerisi.roller || [])].sort((a, b) => b.position - a.position);
        for (const rol of roller) {
          try {
            await guild.roles.create({
              name: rol.name,
              color: rol.color,
              permissions: BigInt(rol.permissions || 0n),
              mentionable: rol.mentionable,
              hoist: rol.hoist,
              reason: "Yedekten rol kurulumu",
            });
          } catch (e) {
            console.warn(`⚠️ [YEDEK SİSTEMİ] Rol oluşturulamadı: ${rol.name} - ${e.message}`);
          }
        }

        const kategoriMap = new Map();
        const kategoriler = (yedekVerisi.kanallar || []).filter(k => k.type === ChannelType.GuildCategory);

        for (const kategori of kategoriler) {
          try {
            const yeniKategori = await guild.channels.create({
              name: kategori.name,
              type: ChannelType.GuildCategory,
              position: kategori.position,
              reason: "Yedekten kategori kurulumu",
            });
            kategoriMap.set(kategori.id, yeniKategori.id);
          } catch (e) {
            console.warn(`⚠️ [YEDEK SİSTEMİ] Kategori oluşturulamadı: ${kategori.name} - ${e.message}`);
          }
        }

        const digerKanallar = (yedekVerisi.kanallar || []).filter(k => k.type !== ChannelType.GuildCategory);

        for (const kanal of digerKanallar) {
          try {
            await guild.channels.create({
              name: kanal.name,
              type: kanal.type,
              position: kanal.position,
              parent: kategoriMap.get(kanal.parent) || undefined,
              reason: "Yedekten kanal kurulumu",
            });
          } catch (e) {
            console.warn(`⚠️ [YEDEK SİSTEMİ] Kanal oluşturulamadı: ${kanal.name} - ${e.message}`);
          }
        }

        try {
  await interaction.editReply({
    content: `${emojiler.tik} **${guild.name}** sunucusu sıfırlandı ve yedek **kuruldu.**`,
  }); 
} catch (err) {
  if (err.code === 10003 || err.code === 10008) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] Komut kanalı silinmiş, yanıt gönderilemedi. ( ${guild.name} )`);
  } else {
    console.error(`🔴 [YEDEK SİSTEMİ] Yedek kurulum yanıtı gönderilemedi:`, err);
  }
}
      }
    });

    collector.on("end", (_collected, reason) => {
      if (reason !== "onay" && reason !== "iptal") {
        interaction.editReply({
          content: `${emojiler.saat} İşlem zaman aşımına uğradı.`,
          components: [],
        });
      }
    });
  },
};
