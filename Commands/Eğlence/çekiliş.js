const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { createGiveaway, endGiveawayById, rerollGiveawayById, resetGiveawayParticipants } = require("../../Utils/Engagement/çekilişKontrol.js");

function formatUsers(userIds) {
  return userIds?.length ? userIds.map((id) => `<@${id}>`).join(", ") : "**yok**";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("çekiliş")
    .setDescription("Gelişmiş çekiliş sistemi.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("başlat")
        .setDescription("Yeni bir çekiliş başlatır.")
        .addStringOption((opt) =>
          opt
            .setName("süre")
            .setDescription("Çekiliş süresi gir. (10s, 2m, 3 saat, 4 gün)")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("kazanan")
            .setDescription("Kazanan sayısı.")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("ödül")
            .setDescription("Çekiliş ödülü.")
            .setRequired(true)
        )
        .addUserOption((opt) =>
          opt
            .setName("bağışçı")
            .setDescription("Çekiliş bağışçısı.")
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("gerekli-roller")
            .setDescription("Kazanmak/katılmak için gerekli rol.")
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("yasaklı-roller")
            .setDescription("Bu çekilişi kazanamayacak rol.")
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("bypass-roller")
            .setDescription("Rol/mesaj şartlarını atlayabilen rol.")
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("bonus-rol")
            .setDescription("Bonus katılım hakkı verilecek rol.")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("bonus-miktar")
            .setDescription("Bonus rolünün vereceği ek katılım hakkı.")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("mesaj-şartı")
            .setDescription("Format: MesajSayısı Kanal Süre. Örn: 5 #genel 10m")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("bağışçı-kazanamaz")
            .setDescription("Açık olursa bağışçı bu çekilişi kazanamaz.")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("varsayılanları-yoksay")
            .setDescription("Açık olursa varsayılan rol şartlarını yok sayar.")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("ping")
            .setDescription("Açık olursa mesaj içindeki etiketlerin ping atmasına izin verir.")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("mesaj")
            .setDescription("Embed üstünde görünecek üst mesaj.")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("ekstra")
            .setDescription("Embed açıklamasına eklenecek ekstra metin.")
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("görsel")
            .setDescription("Çekiliş embedine eklenecek görsel.")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("bitir")
        .setDescription("Aktif bir çekilişi bitirir.")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Çekiliş ID").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("sıfırla")
        .setDescription("Çekiliş katılımcılarını sıfırlar.")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Çekiliş ID").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("yeniden-çek")
        .setDescription("Bitmiş bir çekiliş için kazananları yeniden seçer.")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Çekiliş ID").setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "başlat") {
      return createGiveaway(interaction, client);
    }

    const id = interaction.options.getString("id", true);

    if (sub === "bitir") {
      await interaction.deferReply({ flags: 64 });
      const result = await endGiveawayById(client, id);

      if (!result.ok) {
        const content =
          result.reason === "already_ended"
            ? `${emojiler.uyari} **Bu çekiliş zaten bitmiş.**`
            : `${emojiler.uyari} **Çekiliş veritabanında bulunamadı.**`;
        return interaction.editReply({ content });
      }

      return interaction.editReply({
        content: `${emojiler.tik} Çekiliş *mauel* **bitirildi.**`,
      });
    }

    if (sub === "sıfırla") {
      await interaction.deferReply({ flags: 64 });
      const result = await resetGiveawayParticipants(client, id);

      if (!result.ok) {
        return interaction.editReply({
          content: `${emojiler.uyari} **Çekiliş veritabanında bulunamadı.**`,
        });
      }

      return interaction.editReply({
        content: `${emojiler.tik} Katılımcılar **sıfırlandı.**`,
      });
    }

    if (sub === "yeniden-çek") {
      await interaction.deferReply({ flags: 64 });
      const result = await rerollGiveawayById(client, id);

      if (!result.ok) {
        const content =
          result.reason === "not_ended"
            ? `${emojiler.uyari} **Bu çekiliş henüz bitmemiş.**`
            : `${emojiler.uyari} **Çekiliş veritabanında bulunamadı.**`;
        return interaction.editReply({ content });
      }

      return interaction.editReply({
        content: `${emojiler.tik} Çekiliş **yeniden çekildi.** Yeni kazanan: ${formatUsers(result.winnerIds)}`,
      });
    }
  },
};
