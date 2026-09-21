const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const { fetchGuildMember, resolvePresence, getProfileImages, getLastSeenAt } = require("../../Utils/Account/accountData");
const { getMembershipDetails } = require("../../Utils/Account/accountMembership");
const { getBadges, getPrimaryGuild } = require("../../Utils/Account/accountBadges");
const { prepareAccountEmojis } = require("../../Utils/Account/accountEmojis");
const { renderAccountCard } = require("../../Utils/Account/accountCardRenderer");
const { buildAccountPayload, buildNoticePayload } = require("../../Utils/Account/accountView");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hesap-bilgi")
    .setDescription("Bir kişinin Discord hesabını, sunucu profilini ve erişilebilir durum bilgisini gösterir.")
    .addUserOption(option => option.setName("kişi")
      .setDescription("Kişi seç, kimlik numarası gir veya kendi hesabın için boş bırak.").setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      if (!interaction.guild) {
        await interaction.editReply(buildNoticePayload("⚠️ Sunucu gerekli", "Bu komut yalnızca bir sunucuda kullanılabilir."));
        return;
      }
      const selectedUser = interaction.options.getUser("kişi") || interaction.user;
      const [user, member] = await Promise.all([
        interaction.client.users.fetch(selectedUser.id, { force: true }).catch(() => selectedUser),
        fetchGuildMember(interaction.guild, selectedUser.id),
      ]);
      const images = getProfileImages(user, member);
      const [presence, membership, { badges, primaryGuild }, lastSeenAt] = await Promise.all([
        resolvePresence(interaction.client, interaction.guild, user.id, member),
        member ? getMembershipDetails(interaction.guild, member) : null,
        prepareAccountEmojis(interaction.client, getBadges(user), getPrimaryGuild(user)),
        getLastSeenAt(user.id),
      ]);
      let cardAttachment = null;
      const cardName = `durum-${user.id}.png`;
      if (presence) {
        try {
          const card = await renderAccountCard({ user, member, presence, badges, primaryGuild,
            avatarURL: images.cardAvatarURL, bannerURL: images.cardBannerURL,
            avatarDecorationURL: images.avatarDecorationURL });
          cardAttachment = new AttachmentBuilder(card, { name: cardName });
        } catch (error) {
          console.warn("[HESAP BİLGİ] Durum kartı oluşturulamadı:", error?.message || error);
        }
      }
      await interaction.editReply(buildAccountPayload({
        user, member, membership, badges, primaryGuild, presence, lastSeenAt, images, cardName, cardAttachment,
      }));
    } catch (error) {
      console.error("🔴 [HESAP BİLGİ] Komut çalıştırılamadı:", error?.message || error);
      await interaction.editReply(buildNoticePayload("⚠️ Hesap bilgisi alınamadı",
        "Discord hesap veya sunucu üyeliği bilgilerini doğrulayamadı. Biraz sonra tekrar dene.")).catch(() => {});
    }
  },
};
