const { MessageType, PermissionFlagsBits, escapeMarkdown } = require("discord.js");
const levelStore = require("./levelStore");
const { isBotOrWebhookMessage, createAutomationNonce } = require("../Core/messageOrigin");

function isHoneypotMessage(message) {
  if (message.__honeypotBlocked) return true;
  const { readHoneypotDB } = require("../Moderation/honeypot");
  const channels = readHoneypotDB()[message.guild.id]?.channels;
  return Boolean(channels?.[message.channelId]
    || (message.channel?.isThread?.() && channels?.[message.channel.parentId]));
}

function isHumanMessage(message) {
  return Boolean(message?.guild?.id && message.author?.id && message.id
    && !isBotOrWebhookMessage(message) && !message.system && !message.author.system
    && !message.interaction && !message.interactionMetadata
    && (message.type === MessageType.Default || message.type === MessageType.Reply));
}

function validateRewardRole(role, guild, botMember = guild?.members?.me) {
  if (!role || role.guild?.id !== guild?.id) return { valid: false, reason: "Rol bu sunucuda bulunamadı." };
  if (role.id === guild.id) return { valid: false, reason: "@everyone seviye ödülü olamaz." };
  if (role.managed) return { valid: false, reason: "Entegrasyon veya bot rolleri seviye ödülü olamaz." };
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { valid: false, reason: "Botun Rolleri Yönet yetkisi gerekli." };
  }
  if (!botMember.roles?.highest || role.comparePositionTo(botMember.roles.highest) >= 0 || role.editable === false) {
    return { valid: false, reason: "Ödül rolü botun en yüksek rolünün altında olmalı." };
  }
  return { valid: true, reason: null };
}

const safeName = (value, max = 100) => escapeMarkdown(String(value || "Bilinmiyor").slice(0, max)).replace(/@/g, "@\u200b");

function formatAnnouncement(template, { user, guild, member, oldLevel, rank, roleIds = [] }) {
  const replacements = {
    kullanici: `<@${user.id}>`, kullanici_adi: safeName(user.globalName || user.username),
    sunucu: safeName(guild.name), seviye: String(member.level), eski_seviye: String(oldLevel),
    xp: String(member.totalXp), sira: rank === null ? "—" : String(rank),
    roller: roleIds.length ? roleIds.map((id) => `<@&${id}>`).join(", ") : "Yok",
  };
  return template.replace(/\{([^{}]+)\}/g, (whole, key) => replacements[key] ?? whole).slice(0, 2000);
}

function createLevelService({ store = levelStore, isHoneypot = isHoneypotMessage, logger = console } = {}) {
  const memberQueues = new Map();

  function warn(message, error) {
    logger.warn?.(`⚠️ [SEVİYE] ${message}`, error?.message || error || "");
  }

  function serialized(key, operation) {
    const previous = memberQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    memberQueues.set(key, current);
    current.finally(() => {
      if (memberQueues.get(key) === current) memberQueues.delete(key);
    }).catch(() => {});
    return current;
  }

  async function reconcileRoles(member, level, config) {
    const result = { added: [], removed: [], errors: [] };
    if (!member || member.user?.bot || !member.guild || !config.enabled) return result;
    const guild = member.guild;
    const earned = config.rewards.filter((reward) => reward.level <= level)
      .sort((a, b) => b.level - a.level || a.roleId.localeCompare(b.roleId));
    if (!earned.length) return result;
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const obtained = new Set(earned.filter((reward) => member.roles.cache.has(reward.roleId)).map((reward) => reward.roleId));
    const roleObjects = new Map();
    const higherObtained = (reward) => earned.some((other) => other.level > reward.level && obtained.has(other.roleId));

    async function validRole(reward) {
      if (!roleObjects.has(reward.roleId)) {
        const role = guild.roles.cache.get(reward.roleId) || await guild.roles.fetch(reward.roleId).catch(() => null);
        roleObjects.set(reward.roleId, role);
      }
      const role = roleObjects.get(reward.roleId);
      const validation = validateRewardRole(role, guild, botMember);
      if (!validation.valid) {
        result.errors.push({ roleId: reward.roleId, reason: validation.reason });
        return null;
      }
      return role;
    }

    for (const reward of earned) {
      if (obtained.has(reward.roleId) || (reward.removeOnHigher && higherObtained(reward))) continue;
      const role = await validRole(reward);
      if (!role) continue;
      try {
        await member.roles.add(role, `Seviye ödülü: ${reward.level}. seviye`);
        obtained.add(reward.roleId);
        result.added.push(reward.roleId);
      } catch (error) {
        result.errors.push({ roleId: reward.roleId, reason: error.message });
        warn(`${guild.id}/${member.id} ödül rolü eklenemedi (${reward.roleId}).`, error);
      }
    }

    for (const reward of earned) {
      if (!reward.removeOnHigher || !obtained.has(reward.roleId) || !higherObtained(reward)) continue;
      const role = await validRole(reward);
      if (!role) continue;
      try {
        await member.roles.remove(role, "Daha yüksek seviye ödülü alındı.");
        obtained.delete(reward.roleId);
        result.removed.push(reward.roleId);
      } catch (error) {
        result.errors.push({ roleId: reward.roleId, reason: error.message });
        warn(`${guild.id}/${member.id} eski ödül rolü kaldırılamadı (${reward.roleId}).`, error);
      }
    }
    return result;
  }

  async function sendAnnouncement(message, award, config, roles) {
    if (!config.channelId) return false;
    const guild = message.guild;
    const channel = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel?.isTextBased?.() || typeof channel.send !== "function") return false;
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const needed = [PermissionFlagsBits.ViewChannel,
      channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages];
    if (!botMember || !channel.permissionsFor(botMember)?.has(needed)) return false;
    try {
      await channel.send({
        content: formatAnnouncement(config.message, {
          user: message.author, guild, member: award.member, oldLevel: award.oldLevel,
          rank: store.getRank(guild.id, message.author.id), roleIds: roles.added,
        }),
        allowedMentions: { parse: [], users: [message.author.id], roles: [], repliedUser: false },
        nonce: createAutomationNonce("level"), enforceNonce: true,
      });
      return true;
    } catch (error) {
      warn(`${guild.id}/${message.author.id} seviye mesajı gönderilemedi.`, error);
      return false;
    }
  }

  async function handleMessage(message) {
    if (!isHumanMessage(message)) return { awarded: false, reason: "non-human" };
    try {
      if (!store.getConfig(message.guild.id).enabled) return { awarded: false, reason: "disabled" };
      if (isHoneypot(message)) return { awarded: false, reason: "honeypot" };
      return await serialized(`${message.guild.id}:${message.author.id}`, async () => {
        if (isHoneypot(message)) return { awarded: false, reason: "honeypot" };
        const award = store.awardMessage(message.guild.id, message.author.id, message.id);
        if (!award.awarded) return award;
        const config = store.getConfig(message.guild.id);
        if (!config.enabled) return award;
        let roles = { added: [], removed: [], errors: [] };
        try {
          const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
          roles = await reconcileRoles(member, award.member.level, config);
        } catch (error) {
          warn(`${message.guild.id}/${message.author.id} ödül eşitlemesi başarısız.`, error);
        }
        let announced = false;
        if (award.levelChanged) {
          try { announced = await sendAnnouncement(message, award, config, roles); }
          catch (error) { warn(`${message.guild.id} seviye duyurusu hazırlanamadı.`, error); }
        }
        return { ...award, roles, announced };
      });
    } catch (error) {
      warn("Mesaj XP işlemi başarısız.", error);
      return { awarded: false, reason: "error" };
    }
  }

  async function reconcileMember(member) {
    if (!member?.guild || member.user?.bot) return null;
    return serialized(`${member.guild.id}:${member.id}`, async () => {
      try {
        store.setMemberActive(member.guild.id, member.id, true);
        const config = store.getConfig(member.guild.id);
        if (!config.enabled) return null;
        return await reconcileRoles(member, store.getMember(member.guild.id, member.id).level, config);
      } catch (error) {
        warn(`${member.guild.id}/${member.id} yeniden giriş ödülleri eşitlenemedi.`, error);
        return null;
      }
    });
  }

  async function removeMember(member) {
    if (!member?.guild || member.user?.bot) return false;
    return serialized(`${member.guild.id}:${member.id}`, () => {
      try { return store.setMemberActive(member.guild.id, member.id, false); }
      catch (error) { warn(`${member.guild.id}/${member.id} ayrılış kaydı güncellenemedi.`, error); return false; }
    });
  }

  return { handleMessage, reconcileMember, removeMember, reconcileRoles };
}

module.exports = {
  ...createLevelService(), createLevelService, isHumanMessage, isHoneypotMessage,
  validateRewardRole, formatAnnouncement,
};