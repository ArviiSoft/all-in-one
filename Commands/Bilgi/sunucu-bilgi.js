const { ButtonBuilder, ButtonStyle, ContainerBuilder, GuildMFALevel, GuildPremiumTier, GuildVerificationLevel, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");

const ACCENT_COLOR = 0x5865f2;
const ERROR_COLOR = 0xed4245;
const V2_FLAGS = MessageFlags.IsComponentsV2;

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function getAssetURL(guild, asset) {
  const hash = guild[asset];
  if (!hash) return null;

  const extension = hash.startsWith("a_") ? "gif" : "png";
  return guild[`${asset}URL`]({ extension, size: 4096 });
}

function formatVerificationLevel(level) {
  const name = typeof level === "number" ? GuildVerificationLevel[level] : level;
  const labels = {
    None: "Yok",
    Low: "Düşük",
    Medium: "Orta",
    High: "Yüksek",
    VeryHigh: "Çok Yüksek",
  };

  return labels[name] || "Bilinmiyor";
}

function formatMfaLevel(level) {
  const numericLevel = typeof level === "number" ? level : GuildMFALevel[level];
  return numericLevel === GuildMFALevel.Elevated ? "Yüksek (2FA gerekli)" : "Yok";
}

function formatBoostLevel(tier) {
  if (typeof tier === "number") return tier;

  const enumValue = GuildPremiumTier[tier];
  if (typeof enumValue === "number") return enumValue;

  const match = String(tier).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

const { getChannelCounts, getMemberCounts } = require("../../Utils/Core/botMetrics");

async function fetchCount(fetcher) {
  try {
    const result = await fetcher();
    return typeof result?.size === "number" ? result.size : null;
  } catch {
    return null;
  }
}

async function getVanityData(guild) {
  if (!guild.vanityURLCode) return null;

  try {
    const data = await guild.fetchVanityData();
    return {
      code: data.code || guild.vanityURLCode,
      uses: Number.isInteger(data.uses) ? data.uses : null,
    };
  } catch {
    return { code: guild.vanityURLCode, uses: null };
  }
}

function addTextOrButtonSection(container, content, button) {
  if (!button) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return;
  }

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setButtonAccessory(button)
  );
}

function buildServerPanel({ bannerURL, banCount, guild, iconURL, inviteCount, memberCounts, owner, vanity }) {
  const safeGuildName = escapeMarkdown(guild.name);
  const vanitySuffix = vanity ? ` | .gg/${escapeMarkdown(vanity.code)}` : "";
  const channelCounts = getChannelCounts(guild);
  const staticEmojis = guild.emojis.cache.filter(emoji => !emoji.animated).size;
  const animatedEmojis = guild.emojis.cache.filter(emoji => emoji.animated).size;
  const verification = formatVerificationLevel(guild.verificationLevel);
  const mfa = formatMfaLevel(guild.mfaLevel);
  const boostLevel = formatBoostLevel(guild.premiumTier);
  const ownerName = owner?.user?.username ? escapeMarkdown(owner.user.username) : "Bilinmiyor";
  const bans = banCount === null ? "Bilinmiyor" : banCount.toLocaleString("tr-TR");
  const invites = inviteCount === null ? "Bilinmiyor" : inviteCount.toLocaleString("tr-TR");

  const overviewLines = [
    `### ${emojiler.buyutec} • Genel Bakış`,
    `- **Sunucu Sahibi:** ${ownerName}`,
    `- **Oluşturulma:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
  ];

  if (vanity) {
    const vanityUses = vanity.uses === null ? "" : ` (${vanity.uses.toLocaleString("tr-TR")} kullanım)`;
    overviewLines.push(`- **Özel Davet:** \`discord.gg/${vanity.code}${vanityUses}\``);
  }

  const membersContent = [
    `### ${emojiler.uye} • Üyeler (${guild.memberCount.toLocaleString("tr-TR")})`,
    `- **İnsanlar:** ${memberCounts.humans.toLocaleString("tr-TR")} (Botlar: ${memberCounts.bots.toLocaleString("tr-TR")})`,
    `- ${emojiler.online} ${memberCounts.statuses.online} | ${emojiler.idle} ${memberCounts.statuses.idle} | ${emojiler.dnd} ${memberCounts.statuses.dnd} | ${emojiler.offline} ${memberCounts.statuses.offline}`,
  ].join("\n");

  const channelsContent = [
    `### ${emojiler.hashtag} • Kanallar ve Kaynaklar`,
    `- **Kanallar:** ${channelCounts.total.toLocaleString("tr-TR")} (${emojiler.speechbubble} ${channelCounts.text} | ${emojiler.colorized_volume_max} ${channelCounts.voice} | ${emojiler.tasi} ${channelCounts.categories})`,
    `- **Roller:** ${guild.roles.cache.size.toLocaleString("tr-TR")} | **Emojiler:** ${guild.emojis.cache.size.toLocaleString("tr-TR")} (${staticEmojis.toLocaleString("tr-TR")} statik, ${animatedEmojis.toLocaleString("tr-TR")} hareketli)`,
    `- **Çıkartmalar:** ${guild.stickers.cache.size.toLocaleString("tr-TR")}`,
  ].join("\n");

  const securityContent = [
    `### ${emojiler.kalkan} • Güvenlik ve Boostlar`,
    `- **Doğrulama:** ${verification}`,
    `- **MFA:** ${mfa} | **Yasaklamalar:** ${bans} | **Davetler:** ${invites}`,
    `- ${emojiler.nitroboost} **Boostlar:** ${(guild.premiumSubscriptionCount || 0).toLocaleString("tr-TR")} (Seviye ${boostLevel})`,
  ].join("\n");

  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  if (bannerURL) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerURL)
      )
    );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🏠 ${safeGuildName}${vanitySuffix}`)
    )
    .addSeparatorComponents(separator());

  if (guild.description?.trim()) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*${escapeMarkdown(guild.description.trim())}*`)
      )
      .addSeparatorComponents(separator());
  }

  if (iconURL) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(overviewLines.join("\n"))
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL))
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(overviewLines.join("\n"))
    );
  }

  container.addSeparatorComponents(separator());

  const iconButton = iconURL
    ? new ButtonBuilder()
      .setLabel("Icon")
      .setStyle(ButtonStyle.Link)
      .setURL(iconURL)
    : null;
  addTextOrButtonSection(container, membersContent, iconButton);

  container.addSeparatorComponents(separator());

  const bannerButton = bannerURL
    ? new ButtonBuilder()
      .setLabel("Banner")
      .setStyle(ButtonStyle.Link)
      .setURL(bannerURL)
    : null;
  addTextOrButtonSection(container, channelsContent, bannerButton);

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(securityContent))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Not: Üye ve durum istatistikleri önbellek verilerine dayanmaktadır (%${memberCounts.coverage} kapsama).`
      )
    );

  return container;
}

function buildErrorPanel() {
  return new ContainerBuilder()
    .setAccentColor(ERROR_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## ⚠️ Sunucu bilgileri alınamadı\nSunucu verileri getirilemedi. Lütfen tekrar dene.")
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sunucu-bilgi")
    .setDescription("Sunucu hakkında bilgi verir.")
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      if (!interaction.guild) {
        await interaction.editReply({ components: [buildErrorPanel()], flags: V2_FLAGS });
        return;
      }

      const guild = await interaction.guild.fetch().catch(() => interaction.guild);
      const [owner, vanity, banCount, inviteCount] = await Promise.all([
        guild.fetchOwner().catch(() => guild.members.cache.get(guild.ownerId) || null),
        getVanityData(guild),
        fetchCount(() => guild.bans.fetch()),
        fetchCount(() => guild.invites.fetch()),
      ]);
      const bannerURL = getAssetURL(guild, "banner");
      const iconURL = getAssetURL(guild, "icon");
      const memberCounts = getMemberCounts(guild);

      await interaction.editReply({
        components: [buildServerPanel({
          bannerURL,
          banCount,
          guild,
          iconURL,
          inviteCount,
          memberCounts,
          owner,
          vanity,
        })],
        flags: V2_FLAGS,
      });
    } catch (error) {
      console.error("🔴 [SUNUCU BİLGİ] Sunucu bilgileri gösterilemedi:", error);
      await interaction.editReply({ components: [buildErrorPanel()], flags: V2_FLAGS }).catch(() => {});
    }
  },
};
