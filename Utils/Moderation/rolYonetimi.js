const fs = require("../Core/databaseFs");
const path = require("path");
const { ContainerBuilder, MessageFlags, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const emojiler = require("../Emojis/emojiler.js");
const { canBotManageRole, canMemberManageRole } = require("../Core/security");

const DATA_PATH = path.join(__dirname, "../../Database/Sunucu Yönetimi/süreliRoller.json");
const MIN_DURATION = 5_000;
const MAX_DURATION = 365 * 24 * 60 * 60 * 1_000;
const CHECK_INTERVAL = 15_000;
const RETRY_INTERVAL = 5 * 60_000;
const V2_FLAGS = MessageFlags.IsComponentsV2;

let schedulerStarted = false;
let checkInProgress = false;

const DURATION_UNITS = Object.freeze({
  ms: 1,
  milisaniye: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  sn: 1_000,
  saniye: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  dk: 60_000,
  dakika: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  sa: 3_600_000,
  saat: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  g: 86_400_000,
  gun: 86_400_000,
  gün: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  hf: 604_800_000,
  hafta: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  ay: 2_592_000_000,
  month: 2_592_000_000,
  months: 2_592_000_000,
  y: 31_536_000_000,
  yil: 31_536_000_000,
  yıl: 31_536_000_000,
  sene: 31_536_000_000,
  year: 31_536_000_000,
  years: 31_536_000_000,
});

function normalizeReason(value) {
  const reason = String(value || "").replace(/\s+/g, " ").trim().slice(0, 512);
  return reason || "Neden belirtilmedi.";
}

function normalizeTimedRole(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;

  const requiredIds = ["id", "guildId", "userId", "roleId"];
  if (requiredIds.some((key) => typeof record[key] !== "string" || !record[key])) return null;

  const expiresAt = Number(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;

  return {
    id: record.id,
    guildId: record.guildId,
    userId: record.userId,
    roleId: record.roleId,
    moderatorId: typeof record.moderatorId === "string" ? record.moderatorId : null,
    reason: normalizeReason(record.reason),
    durationMs: Number.isFinite(Number(record.durationMs)) ? Number(record.durationMs) : null,
    expiresAt: Math.round(expiresAt),
    logChannelId: typeof record.logChannelId === "string" ? record.logChannelId : null,
    retryAt: Number.isFinite(Number(record.retryAt)) ? Number(record.retryAt) : null,
  };
}

function readTimedRoles() {
  if (!fs.existsSync(DATA_PATH)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return Array.isArray(data) ? data.map(normalizeTimedRole).filter(Boolean) : [];
  } catch (error) {
    console.error("🔴 [SÜRELİ ROL] Veritabanı okunamadı:", error);
    return [];
  }
}

function writeTimedRoles(records) {
  const normalizedRecords = records.map(normalizeTimedRole).filter(Boolean);
  const temporaryPath = `${DATA_PATH}.tmp`;

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(temporaryPath, JSON.stringify(normalizedRecords, null, 2), "utf8");
  fs.renameSync(temporaryPath, DATA_PATH);
}

function parseDuration(value) {
  const input = String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/(\d),(\d)/g, "$1.$2");
  if (!input) return null;

  const units = Object.keys(DURATION_UNITS)
    .sort((a, b) => b.length - a.length)
    .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const tokenPattern = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${units})`, "giu");
  let total = 0;
  let lastIndex = 0;
  let matched = false;
  let match;

  while ((match = tokenPattern.exec(input)) !== null) {
    const between = input.slice(lastIndex, match.index);
    if (between.replace(/[\s,+]/g, "")) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLocaleLowerCase("tr-TR");
    if (!Number.isFinite(amount) || amount <= 0 || !DURATION_UNITS[unit]) return null;

    total += amount * DURATION_UNITS[unit];
    matched = true;
    lastIndex = tokenPattern.lastIndex;
  }

  if (!matched || input.slice(lastIndex).trim()) return null;
  const rounded = Math.round(total);
  return rounded >= MIN_DURATION && rounded <= MAX_DURATION ? rounded : null;
}

function formatDuration(durationMs) {
  if (!durationMs) return "Kalıcı";

  let remaining = Math.max(0, Math.round(Number(durationMs)));
  const units = [
    [31_536_000_000, "yıl"],
    [2_592_000_000, "ay"],
    [604_800_000, "hafta"],
    [86_400_000, "gün"],
    [3_600_000, "saat"],
    [60_000, "dakika"],
    [1_000, "saniye"],
  ];
  const parts = [];

  for (const [unitMs, label] of units) {
    const amount = Math.floor(remaining / unitMs);
    if (!amount) continue;
    parts.push(`${amount} ${label}`);
    remaining -= amount * unitMs;
    if (parts.length === 2) break;
  }

  return parts.join(" ") || `${durationMs} ms`;
}

function safeDisplayText(value) {
  return escapeMarkdown(String(value || "").replace(/@/g, "@\u200b"));
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildResultPanel({ action, moderator, target, role, reason, durationMs, expiresAt }) {
  const isGive = action === "ver";
  const details = [
    `${emojiler.uye} **Hedef:** <@${target.id}> (\`${target.id}\`)`,
    `${emojiler.ampul} **Rol:** <@&${role.id}>`,
    `❓ **Sebep:** ${safeDisplayText(reason)}`,
  ];

  if (isGive) {
    const duration = durationMs
      ? `${formatDuration(durationMs)} (<t:${Math.floor(expiresAt / 1_000)}:R>)`
      : "Kalıcı";
    details.push(`${emojiler.donensaat} **Süre:** ${duration}`);
  }

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${isGive ? "Rol Verme Tamamlandı" : "Rol Alma Tamamlandı"}`,
        `-# Uygulayan: ${safeDisplayText(moderator.username)}`,
      ].join("\n"))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(target.displayAvatarURL({ extension: "png", size: 512 }))
    );

  return new ContainerBuilder()
    .setAccentColor(isGive ? 0x57f287 : 0xed4245)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(details.join("\n"))
    )
}

function buildExpiredPanel({ target, role, record }) {
  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "## Süreli Rol Sona Erdi",
        "-# Uygulayan: Otomatik rol zamanlayıcısı",
      ].join("\n"))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(target.displayAvatarURL({ extension: "png", size: 512 }))
    );
  const details = [
    `${emojiler.uye} **Hedef:** <@${target.id}> (\`${target.id}\`)`,
    `${emojiler.ampul} **Rol:** <@&${role.id}>`,
    `❓ **Sebep:** ${safeDisplayText(record.reason)}`,
    `${emojiler.donensaat} **Süre:** ${formatDuration(record.durationMs)}`,
  ];

  return new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addSectionComponents(header)
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(details.join("\n"))
    )
}

function removeMatchingTimedRole(guildId, userId, roleId) {
  const records = readTimedRoles();
  const remaining = records.filter((record) => !(
    record.guildId === guildId
    && record.userId === userId
    && record.roleId === roleId
  ));

  if (remaining.length !== records.length) writeTimedRoles(remaining);
}

function saveTimedRole(record) {
  const records = readTimedRoles().filter((item) => !(
    item.guildId === record.guildId
    && item.userId === record.userId
    && item.roleId === record.roleId
  ));
  records.push(record);
  writeTimedRoles(records);
}

function canSendEmbed(channel, botMember) {
  if (!channel?.isTextBased?.() || !botMember) return false;
  const permissions = channel.permissionsFor(botMember);
  return Boolean(permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]));
}

async function replyWarning(interaction, message) {
  const payload = { content: `${emojiler.uyari} **${message}**` };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply({ ...payload, flags: 64 });
}

async function executeRoleCommand(interaction, action) {
  const { guild } = interaction;
  if (!guild) return replyWarning(interaction, "Bu komut yalnızca sunucularda kullanılabilir.");

  const moderator = interaction.member?.roles?.highest
    ? interaction.member
    : await guild.members.fetch(interaction.user.id).catch(() => null);
  const target = interaction.options.getMember("kişi");
  const role = interaction.options.getRole("rol");
  const reason = normalizeReason(interaction.options.getString("sebep"));
  const logChannel = interaction.options.getChannel("log-kanalı");
  const durationInput = action === "ver" ? interaction.options.getString("süre") : null;
  const durationMs = durationInput ? parseDuration(durationInput) : null;
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

  if (!target) return replyWarning(interaction, "Bu kişi sunucuda bulunamadı.");
  if (!moderator?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return replyWarning(interaction, "Bu komutu kullanmak için `Rolleri Yönet` yetkisine sahip olmalısın.");
  }
  if (!role || role.id === guild.id) return replyWarning(interaction, "@everyone rolü değiştirilemez.");
  if (role.managed) return replyWarning(interaction, "Entegrasyon veya bot tarafından yönetilen roller değiştirilemez.");
  if (durationInput && !durationMs) {
    return replyWarning(
      interaction,
      "Geçerli bir süre gir. Örnek: `2 gün`, `48sa`, `120dk` (en az 5 saniye, en fazla 1 yıl)."
    );
  }
  if (!canMemberManageRole(moderator, role, guild)) {
    return replyWarning(interaction, "Bu rol senin en yüksek rolüne eşit veya ondan daha yukarıda.");
  }
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || !canBotManageRole(guild, role)) {
    return replyWarning(interaction, "Bot bu rolü yönetemiyor. Bot rolünü ve `Rolleri Yönet` yetkisini kontrol et.");
  }
  if (logChannel && !canSendEmbed(logChannel, botMember)) {
    return replyWarning(interaction, "Botun seçilen log kanalında kanalı görme, mesaj gönderme ve bağlantı yerleştirme yetkileri olmalı.");
  }

  const hasRole = target.roles.cache.has(role.id);
  if (action === "ver" && hasRole) return replyWarning(interaction, `Bu kişide zaten ${role} rolü var.`);
  if (action === "al" && !hasRole) return replyWarning(interaction, `Bu kişide ${role} rolü bulunmuyor.`);

  await interaction.deferReply();
  const discordAuditReason = `Uygulayan: ${interaction.user.tag} (${interaction.user.id}) | ${reason}`.slice(0, 512);

  try {
    if (action === "ver") await target.roles.add(role, discordAuditReason);
    else await target.roles.remove(role, discordAuditReason);
  } catch (error) {
    console.error(`🔴 [ROL ${action === "ver" ? "VER" : "AL"}] Rol işlemi başarısız:`, error);
    return replyWarning(interaction, "Rol işlemi gerçekleştirilemedi. Rol sırasını ve bot yetkilerini kontrol et.");
  }

  try {
    removeMatchingTimedRole(guild.id, target.id, role.id);
  } catch (error) {
    console.error("🔴 [SÜRELİ ROL] Önceki süreli rol kaydı temizlenemedi:", error);
  }

  const expiresAt = durationMs ? Date.now() + durationMs : null;
  if (action === "ver" && durationMs) {
    try {
      saveTimedRole({
        id: `${guild.id}:${target.id}:${role.id}:${Date.now()}`,
        guildId: guild.id,
        userId: target.id,
        roleId: role.id,
        moderatorId: interaction.user.id,
        reason,
        durationMs,
        expiresAt,
        logChannelId: logChannel?.id || null,
        retryAt: null,
      });
    } catch (error) {
      console.error("🔴 [SÜRELİ ROL] Süreli rol kaydedilemedi:", error);
      await target.roles.remove(role, "Süreli rol kaydedilemediği için işlem geri alındı.").catch(() => null);
      return replyWarning(interaction, "Süreli rol kaydedilemediği için rol verme işlemi geri alındı.");
    }
  }

  const panel = buildResultPanel({
    action,
    guild,
    moderator: interaction.user,
    target,
    role,
    reason,
    durationMs,
    expiresAt,
  });

  await interaction.editReply({
    components: [panel],
    flags: V2_FLAGS,
    allowedMentions: { parse: [] },
  });

  if (logChannel && logChannel.id !== interaction.channelId) {
    await logChannel.send({
      components: [panel],
      flags: V2_FLAGS,
      allowedMentions: { parse: [] },
    }).catch(async (error) => {
      console.error("🔴 [ROL LOG] Log mesajı gönderilemedi:", error);
      await interaction.followUp({
        content: `${emojiler.uyari} **Rol işlemi tamamlandı ancak log mesajı gönderilemedi.**`,
        flags: 64,
      }).catch(() => null);
    });
  }
}

function recordSignature(record) {
  return `${record.id}:${record.expiresAt}`;
}

async function processExpiredRoles(client) {
  if (checkInProgress) return;
  checkInProgress = true;

  try {
    const records = readTimedRoles();
    const completedRecords = new Set();
    const retryRecords = new Map();
    const now = Date.now();

    for (const record of records) {
      if (record.expiresAt > now || (record.retryAt && record.retryAt > now)) continue;
      const signature = recordSignature(record);
      const guild = client.guilds.cache.get(record.guildId);

      if (!guild) {
        completedRecords.add(signature);
        continue;
      }

      const target = await guild.members.fetch(record.userId).catch(() => null);
      const role = guild.roles.cache.get(record.roleId)
        || await guild.roles.fetch(record.roleId).catch(() => null);
      if (!target || !role || !target.roles.cache.has(role.id)) {
        completedRecords.add(signature);
        continue;
      }

      const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || !canBotManageRole(guild, role)) {
        retryRecords.set(signature, now + RETRY_INTERVAL);
        continue;
      }

      const removed = await target.roles.remove(role, "Süreli rolün süresi doldu.")
        .then(() => true)
        .catch((error) => {
          console.error("🔴 [SÜRELİ ROL] Süresi dolan rol alınamadı:", error);
          return false;
        });
      if (!removed) {
        retryRecords.set(signature, now + RETRY_INTERVAL);
        continue;
      }

      completedRecords.add(signature);

      if (record.logChannelId) {
        const logChannel = guild.channels.cache.get(record.logChannelId)
          || await guild.channels.fetch(record.logChannelId).catch(() => null);
        if (canSendEmbed(logChannel, botMember)) {
          const panel = buildExpiredPanel({ guild, target, role, record });
          await logChannel.send({
            components: [panel],
            flags: V2_FLAGS,
            allowedMentions: { parse: [] },
          }).catch(() => null);
        }
      }
    }

    if (completedRecords.size || retryRecords.size) {
      const latestRecords = readTimedRoles();
      const updatedRecords = latestRecords
        .filter((record) => !completedRecords.has(recordSignature(record)))
        .map((record) => {
          const retryAt = retryRecords.get(recordSignature(record));
          return retryAt ? { ...record, retryAt } : record;
        });
      writeTimedRoles(updatedRecords);
    }
  } finally {
    checkInProgress = false;
  }
}

function loadTimedRoleScheduler(client) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  processExpiredRoles(client).catch((error) => {
    console.error("🔴 [SÜRELİ ROL] İlk kontrol başarısız:", error);
  });
  const timer = setInterval(() => {
    processExpiredRoles(client).catch((error) => {
      console.error("🔴 [SÜRELİ ROL] Kontrol başarısız:", error);
    });
  }, CHECK_INTERVAL);
  timer.unref?.();

  console.log("⏳ [SÜRELİ ROL] Kontrol sistemi başlatıldı.");
}

module.exports = {
  buildResultPanel,
  executeRoleCommand,
  formatDuration,
  loadTimedRoleScheduler,
  parseDuration,
  processExpiredRoles,
};
