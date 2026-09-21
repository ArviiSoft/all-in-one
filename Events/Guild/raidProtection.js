const { Events, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const emojiler = require("../../Utils/Emojis/emojiler.js");
const { getRaidConfig } = require("../../Utils/Moderation/raidProtectionManager.js");

const joinWindows = new Map();

function getWindow(guildId, windowMs) {
  const now = Date.now();
  const existing = joinWindows.get(guildId) || [];
  const fresh = existing.filter((timestamp) => now - timestamp <= windowMs);
  fresh.push(now);
  joinWindows.set(guildId, fresh);
  return fresh;
}

function getAccountAgeDays(member) {
  return Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
}

async function applyAction(member, action) {
  if (action === "kick") {
    if (member.kickable) {
      try {
        await member.kick("AutoMod Raid Koruması");
        return `${emojiler.tik} Üye sunucudan **atıldı.**`;
      } catch {
        return `${emojiler.carpi} Üye atılamadı, botun rolü veya izni yetersiz.`;
      }
    }
    return `${emojiler.carpi} Üye atılamadı, botun rolü veya izni yetersiz.`;
  }

  if (action === "ban") {
    if (member.bannable) {
      try {
        await member.ban({ reason: "AutoMod Raid Koruması", deleteMessageSeconds: 0 });
        return `${emojiler.tik} Üye **banlandı.**`;
      } catch {
        return `${emojiler.carpi} Üye banlanamadı, botun rolü veya izni yetersiz.`;
      }
    }
    return `${emojiler.carpi} Üye banlanamadı, botun rolü veya izni yetersiz.`;
  }

  return `${emojiler.bilgi} Sadece loglandı.`;
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const config = getRaidConfig(member.guild.id);
    if (!config?.enabled) return;

    const windowMs = Math.max(10, Number(config.windowSeconds) || 60) * 1000;
    const joins = getWindow(member.guild.id, windowMs);
    const accountAgeDays = getAccountAgeDays(member);
    const isYoungAccount = accountAgeDays <= (config.minimumAccountAgeDays ?? 7);
    const isRaidWindow = joins.length >= config.threshold;

    if (!isRaidWindow && !isYoungAccount) return;

    const channel = await member.guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const logPermissions = channel.permissionsFor(member.guild.members.me);
    if (!logPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) return;

    const canPunish =
      config.action === "log" ||
      (config.action === "kick" && member.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) ||
      (config.action === "ban" && member.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers));

    const result = isRaidWindow && canPunish
      ? await applyAction(member, config.action)
      : `${emojiler.bilgi} Sadece loglandı.`;

    const embed = new EmbedBuilder()
      .setColor(isRaidWindow ? 0xED4245 : 0xFEE75C)
      .setTitle(isRaidWindow ? "Raid Şüphesi" : "Yeni Hesap Uyarısı")
      .setDescription(`${emojiler.glitchwarning} ${member.user.tag} ( ${member.id} ) sunucuya katıldı.`)
      .addFields(
        { name: "Pencere", value: `${joins.length}/${config.threshold} Giriş`, inline: true },
        { name: "Hesap yaşı", value: `${accountAgeDays} gün`, inline: true },
        { name: "İşlem", value: result, inline: false }
      )
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
  },
};
