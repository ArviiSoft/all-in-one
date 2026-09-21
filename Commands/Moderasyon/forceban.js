const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SlashCommandBuilder, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");

const emojiler = require("../../Utils/Emojis/emojiler");
const SUCCESS_COLOR = 0xed4245;
const ERROR_COLOR = 0xfee75c;
const CONFIRM_COLOR = 0x57f287;
const PRIVATE_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const V2_FLAGS = MessageFlags.IsComponentsV2;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const FORCEBAN_REASON_PREFIX = "Forceban •";
const FORCEBAN_BUTTON_PREFIX = "forceban:";

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildNotice(title, description, accentColor = ERROR_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ⚠️ ${title}\n${description}`)
    );
}

function buildForcebanActions(guildId, targetId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Hesabı Aç")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${targetId}`),
    new ButtonBuilder()
      .setCustomId(`${FORCEBAN_BUTTON_PREFIX}remove:${guildId}:${targetId}`)
      .setLabel("Bu Forceban'ı Kaldır")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${FORCEBAN_BUTTON_PREFIX}remove-all:${guildId}`)
      .setLabel("Tüm Forceban'ları Kaldır")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildSuccessPanel(interaction, targetId, targetUser) {
  const guild = interaction.guild;
  const displayName = targetUser
    ? escapeMarkdown(targetUser.globalName || targetUser.username)
    : "Kullanıcı";
  const username = targetUser ? `@${escapeMarkdown(targetUser.username)}` : "Hesap bilgisi alınamadı";
  const thumbnailURL = targetUser?.displayAvatarURL({ size: 512 })
    || guild.iconURL({ size: 512 })
    || interaction.client.user.displayAvatarURL({ size: 512 });

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${emojiler.ban} Forceban uygulandı`,
        `**${displayName}** adlı hesabın sunucuya erişimi engellendi.`,
        `-# ${username}`,
      ].join("\n"))
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL));

  const accountCreated = targetUser
    ? `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`
    : "Bilinmiyor";

  return new ContainerBuilder()
    .setAccentColor(SUCCESS_COLOR)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "### İşlem özeti",
        `🆔 \`${targetId}\``,
        `🎂 ${accountCreated}`,
        `${emojiler.kalkan} ${interaction.user}`,
      ].join("\n"))
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${escapeMarkdown(guild.name)} • İşlem <t:${Math.floor(Date.now() / 1000)}:R> tamamlandı`
      )
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(buildForcebanActions(guild.id, targetId));
}

function getErrorMessage(error) {
  if (error?.code === 10013) {
    return "Bu ID'ye ait bir Discord hesabı bulunamadı. ID'yi kontrol edip tekrar dene.";
  }

  if (error?.code === 50013) {
    return "Discord bu işlemi yetki yetersizliği nedeniyle reddetti. Bot rolünü ve **Üyeleri Yasakla** iznini kontrol et.";
  }

  if (error?.code === 30035) {
    return "Sunucunun yasaklı kullanıcı sınırına ulaşıldığı için işlem tamamlanamadı.";
  }

  return "Kullanıcı yasaklanırken beklenmeyen bir sorun oluştu. ID'yi ve bot yetkilerini kontrol et.";
}

async function replyNotice(interaction, title, description) {
  return interaction.reply({
    components: [buildNotice(title, description)],
    flags: PRIVATE_V2_FLAGS,
  });
}

async function followUpNotice(interaction, title, description, accentColor = ERROR_COLOR) {
  return interaction.followUp({
    components: [buildNotice(title, description, accentColor)],
    flags: PRIVATE_V2_FLAGS,
  });
}

function isForceban(ban) {
  return typeof ban?.reason === "string" && ban.reason.startsWith(FORCEBAN_REASON_PREFIX);
}

async function handleButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(FORCEBAN_BUTTON_PREFIX)) return;

  const [, action, guildId, targetId] = interaction.customId.split(":");

  if (!interaction.inGuild() || guildId !== interaction.guildId) {
    return replyNotice(interaction, "Geçersiz işlem", "Bu buton yalnızca oluşturulduğu sunucuda kullanılabilir.");
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    return replyNotice(interaction, "Yetkin yetersiz", "Forceban kaldırmak için **Üyeleri Yasakla** yetkisine sahip olmalısın.");
  }

  if (action === "remove-all" && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return replyNotice(interaction, "Yönetici yetkisi gerekli", "Tüm forcebanları kaldırmak için **Yönetici** yetkisine sahip olmalısın.");
  }

  const botMember = interaction.guild.members.me
    || await interaction.guild.members.fetchMe().catch(() => null);

  if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return replyNotice(interaction, "Bot yetkisi eksik", "Yasak kaldırabilmem için **Üyeleri Yasakla** yetkisine ihtiyacım var.");
  }

  await interaction.deferUpdate();

  try {
    if (action === "remove") {
      if (!SNOWFLAKE_PATTERN.test(targetId || "")) {
        return followUpNotice(interaction, "Geçersiz işlem", "Butondaki kullanıcı bilgisi geçerli değil.");
      }

      const ban = await interaction.guild.bans.fetch(targetId).catch(error => {
        if (error?.code === 10026) return null;
        throw error;
      });

      if (!ban) {
        return followUpNotice(interaction, "Forceban bulunamadı", "Bu kullanıcının yasağı daha önce kaldırılmış.");
      }

      if (!isForceban(ban)) {
        return followUpNotice(
          interaction,
          "Forceban artık aktif değil",
          "Kullanıcının mevcut yasağı `/forceban` ile oluşturulmadığı için kaldırılmadı."
        );
      }

      await interaction.guild.members.unban(
        targetId,
        `Forceban kaldırıldı • ${interaction.user.tag} (${interaction.user.id})`
      );

      return followUpNotice(
        interaction,
        "Forceban kaldırıldı",
        `\`${targetId}\` ID'li kullanıcının sunucu yasağı başarıyla kaldırıldı.`,
        CONFIRM_COLOR
      );
    }

    if (action === "remove-all") {
      const bans = await interaction.guild.bans.fetch();
      const forcebans = [...bans.values()].filter(isForceban);

      if (forcebans.length === 0) {
        return followUpNotice(interaction, "Forceban bulunamadı", "Sunucuda kaldırılabilecek aktif bir forceban yok.");
      }

      let removedCount = 0;
      let failedCount = 0;
      const reason = `Tüm forcebanlar kaldırıldı • ${interaction.user.tag} (${interaction.user.id})`;

      for (const ban of forcebans) {
        try {
          await interaction.guild.members.unban(ban.user.id, reason);
          removedCount++;
        } catch (error) {
          failedCount++;
          console.error(`🔴 [FORCEBAN] ${ban.user.id} yasağı kaldırılamadı:`, error);
        }
      }

      const failedText = failedCount > 0
        ? `\n**Başarısız işlem:** ${failedCount}`
        : "";

      return followUpNotice(
        interaction,
        "Forcebanlar kaldırıldı",
        `Toplam **${removedCount} forceban** başarıyla kaldırıldı.${failedText}`,
        removedCount > 0 ? CONFIRM_COLOR : ERROR_COLOR
      );
    }

    return followUpNotice(interaction, "Geçersiz işlem", "Bu buton işlemi artık desteklenmiyor.");
  } catch (error) {
    console.error("🔴 [FORCEBAN BUTON] İşlem tamamlanamadı:", error);
    return followUpNotice(
      interaction,
      "İşlem başarısız",
      "Forceban kaldırılırken bir sorun oluştu. Bot yetkilerini kontrol edip tekrar dene."
    );
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("forceban")
    .setDescription("Sunucuda bulunmayan bir hesabı ID ile yasaklar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("Yasaklanacak kullanıcının Discord ID'si.")
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyNotice(interaction, "Sunucu gerekli", "Bu komut yalnızca bir sunucuda kullanılabilir.");
    }

    const targetId = interaction.options.getString("id", true).trim();
    const { guild } = interaction;
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

    if (!SNOWFLAKE_PATTERN.test(targetId)) {
      return replyNotice(interaction, "Geçersiz kullanıcı ID'si", "ID yalnızca rakamlardan oluşmalı ve 17–20 karakter uzunluğunda olmalı.");
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      return replyNotice(interaction, "Yetkin yetersiz", "Bu komutu kullanmak için **Üyeleri Yasakla** yetkisine sahip olmalısın.");
    }

    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      return replyNotice(interaction, "Bot yetkisi eksik", "İşlemi uygulayabilmem için **Üyeleri Yasakla** yetkisine ihtiyacım var.");
    }

    if (targetId === interaction.user.id) {
      return replyNotice(interaction, "İşlem reddedildi", "Kendini forceban ile yasaklayamazsın.");
    }

    if (targetId === interaction.client.user.id) {
      return replyNotice(interaction, "İşlem reddedildi", "Bot kendi hesabını yasaklayamaz.");
    }

    if (targetId === guild.ownerId) {
      return replyNotice(interaction, "İşlem reddedildi", "Sunucu sahibi yasaklanamaz.");
    }

    const [targetUser, targetMember, existingBan] = await Promise.all([
      interaction.client.users.fetch(targetId, { force: true }).catch(() => null),
      guild.members.fetch(targetId).catch(() => null),
      guild.bans.fetch(targetId).catch(() => null),
    ]);

    if (existingBan) {
      const bannedName = escapeMarkdown(existingBan.user.globalName || existingBan.user.username);
      return replyNotice(
        interaction,
        "Kullanıcı zaten yasaklı",
        `**${bannedName}** (\`${targetId}\`) için sunucuda aktif bir yasak bulunuyor.`
      );
    }

    if (targetMember) {
      const moderatorMember = interaction.member;
      const moderatorCanBan = moderatorMember.id === guild.ownerId
        || targetMember.roles.highest.comparePositionTo(moderatorMember.roles.highest) < 0;

      if (!moderatorCanBan) {
        return replyNotice(
          interaction,
          "Rol hiyerarşisi engeli",
          "Bu kullanıcının en yüksek rolü senin rolüne eşit veya daha yukarıda."
        );
      }

      if (!targetMember.bannable) {
        return replyNotice(
          interaction,
          "Bot rolü yetersiz",
          "Bu kullanıcıyı yasaklayabilmem için bot rolünün hedef kullanıcının rollerinden yukarıda olması gerekir."
        );
      }
    }

    const auditReason = `${FORCEBAN_REASON_PREFIX} ${interaction.user.tag} (${interaction.user.id})`;

    try {
      await guild.members.ban(targetId, { reason: auditReason });

      return interaction.reply({
        components: [buildSuccessPanel(interaction, targetId, targetUser)],
        flags: V2_FLAGS,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(`🔴 [FORCEBAN] ${targetId} yasaklanamadı:`, error);
      return replyNotice(interaction, "Forceban başarısız", getErrorMessage(error));
    }
  },

  handleButton,
};
