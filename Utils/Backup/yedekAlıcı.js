const fs = require("../Core/databaseFs");
const path = require("path");
const yaml = require("js-yaml");
const { ContainerBuilder, Events, FileBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, escapeMarkdown } = require("discord.js");
const ayarlar = require('../Core/generalSettings').settings;
const { startTrustedMinuteScheduler } = require("../Scheduling/trustedDailyScheduler");
const { DEFAULT_YEDEK_PLANI, YEDEK_KLASORU, formatYedekSaati, yedekKlasorunuHazirla, yedekPlaniniOku } = require("./yedekManager");
const emojiler = require("../Emojis/emojiler.js");
const { buildCleanupReport, findPreviousBackups, prunePreviousBackups } = require("./backupRetention");
const { isSafeGuildBackupId } = require("../Core/security");

const BACKUP_SCHEDULE = DEFAULT_YEDEK_PLANI;
const BACKUP_DIR = YEDEK_KLASORU;

function inlineCode(value, maxLength = 100) {
  const normalized = String(value ?? "Bilinmiyor").replace(/`/g, "'");
  const shortened = normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
  return `\`${shortened}\``;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Bilinmiyor";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function buildBackupReportPayload({ guild, backupId, backup, createdAt, fileSize, filePath, cleanup }, includeFile = true) {
  const schedule = yedekPlaniniOku(guild.id);
  const fileName = path.basename(filePath || `${backupId}.yaml`);
  const shouldIncludeFile = includeFile && typeof filePath === "string" && filePath.length > 0;
  const timestamp = Math.floor(createdAt / 1000);
  const iconURL = guild.iconURL?.({ extension: "png", size: 128 }) || null;
  const headerContent = [
    "## ☁️ Günlük Sunucu Yedeği",
    `**${escapeMarkdown(guild.name)}** için yapı yedeği başarıyla oluşturuldu.`,
  ].join("\n");
  const container = new ContainerBuilder().setAccentColor(0x57f287);

  if (iconURL) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL))
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerContent)
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 📦 Yedek Özeti",
          `**Sunucu:** ${escapeMarkdown(guild.name)} · ${inlineCode(guild.id)}`,
          `**Yedek ID:** ${inlineCode(backupId, 90)}`,
          `**Roller:** **${backup.roller.length}** · **Kanallar:** **${backup.kanallar.length}**`,
          `**Dosya boyutu:** ${inlineCode(formatBytes(fileSize))}`,
          `**Çalışma planı:** Her gün ${inlineCode(formatYedekSaati(schedule.hour, schedule.minute))} · ${inlineCode(schedule.timeZone)}`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        buildCleanupReport(cleanup)
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${emojiler.tik} Otomatik yedek tamamlandı · <t:${timestamp}:F> · <t:${timestamp}:R>`
      )
    );

  if (shouldIncludeFile) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addFileComponents(
        new FileBuilder().setURL(`attachment://${fileName}`)
      );
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };

  if (shouldIncludeFile) {
    payload.files = [{ attachment: filePath, name: fileName }];
  }

  return payload;
}

async function sendBackupReport(target, reportData, targetLabel) {
  try {
    await target.send(buildBackupReportPayload(reportData, true));
    return { sent: true, attached: true };
  } catch (attachmentError) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] ${targetLabel} yedek dosyasıyla gönderilemedi: ${attachmentError.message}`);

    try {
      await target.send(buildBackupReportPayload(reportData, false));
      return { sent: true, attached: false };
    } catch (reportError) {
      console.warn(`⚠️ [YEDEK SİSTEMİ] ${targetLabel} raporu gönderilemedi: ${reportError.message}`);
      return { sent: false, attached: false };
    }
  }
}

function getStatePath(botId, guildId) {
  return path.join(BACKUP_DIR, `.otomatik-yedek-${botId}-${guildId}-durum.json`);
}

function readRunState(botId, guildId) {
  const statePath = getStatePath(botId, guildId);
  if (!fs.existsSync(statePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    console.warn(`⚠️ [YEDEK SİSTEMİ] Son çalışma kaydı okunamadı: ${error.message}`);
    return null;
  }
}

function getScheduledRun(dateKey, schedule) {
  const time = formatYedekSaati(schedule.hour, schedule.minute);
  return {
    runKey: `${dateKey}-${time.replace(":", "-")}`,
    scheduledFor: `${dateKey} ${time} ${schedule.timeZone}`,
  };
}

function hasCompletedRun(botId, guildId, runKey, scheduledFor) {
  const state = readRunState(botId, guildId);
  if (!state) return false;

  return state.lastRunKey === runKey
    || (!state.lastRunKey && state.scheduledFor === scheduledFor);
}

function writeRunState(botId, guildId, state) {
  const statePath = getStatePath(botId, guildId);
  const tempPath = `${statePath}.${process.pid}.tmp`;

  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, statePath);
}

function acquireScheduledLock(botId, guildId, runKey) {
  const lockPath = path.join(BACKUP_DIR, `.otomatik-yedek-${botId}-${guildId}-${runKey}.lock`);

  try {
    const descriptor = fs.openSync(lockPath, "wx");
    fs.writeFileSync(descriptor, `${process.pid}\n`, "utf8");
    fs.closeSync(descriptor);
  } catch (error) {
    if (error.code === "EEXIST") return null;
    throw error;
  }

  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`⚠️ [YEDEK SİSTEMİ] Zamanlayıcı kilidi silinemedi: ${error.message}`);
      }
    }
  };
}

async function createGuildBackups(client, trustedEpochMs, guilds = client.guilds.cache.values()) {
  yedekKlasorunuHazirla();
  console.log("♻️ [YEDEK SİSTEMİ] Planlanan sunucu yapı yedekleri başlatılıyor...");

  const timestamp = Math.floor(trustedEpochMs);
  let activeGuildCount = 0;
  let successfulBackupCount = 0;
  let failedBackupCount = 0;
  const successfulGuildIds = [];
  const failedGuildIds = [];

  for (const guild of guilds) {
    const isActivePath = path.join(BACKUP_DIR, `${guild.id}_aktif.yaml`);
    if (!fs.existsSync(isActivePath)) continue;
    activeGuildCount += 1;

    const backup = {
      sunucu: {
        isim: guild.name,
        id: guild.id,
        icon: guild.iconURL(),
      },
      roller: guild.roles.cache
        .filter((role) => !role.managed && role.name !== "@everyone")
        .sort((first, second) => second.position - first.position)
        .map((role) => ({
          name: role.name,
          color: role.hexColor,
          permissions: role.permissions.bitfield.toString(),
          position: role.position,
          mentionable: role.mentionable,
          hoist: role.hoist,
        })),
      kanallar: guild.channels.cache
        .sort((first, second) => first.rawPosition - second.rawPosition)
        .map((channel) => ({
          name: channel.name,
          type: channel.type,
          id: channel.id,
          parent: channel.parentId,
          position: channel.rawPosition,
        })),
    };

    const fileName = `yedek_${guild.id}_${timestamp}.yaml`;
    const filePath = path.join(BACKUP_DIR, fileName);
    const stagingFile = `${filePath}.tmp-${process.pid}`;

    try {
      const previousBackups = findPreviousBackups(
        [BACKUP_DIR],
        file => file.endsWith(".yaml") && isSafeGuildBackupId(file.slice(0, -5), guild.id),
      );
      fs.writeFileSync(stagingFile, yaml.dump(backup), "utf8");
      fs.renameSync(stagingFile, filePath);
      const fileSize = fs.statSync(filePath).size;
      const cleanup = prunePreviousBackups(previousBackups, filePath);
      successfulBackupCount += 1;
      successfulGuildIds.push(guild.id);
      console.log(`♻️ [YEDEK SİSTEMİ] ( ${guild.name} ) Yedek alındı.`);
      const backupId = fileName.slice(0, -".yaml".length);
      const reportData = {
        guild,
        backupId,
        backup,
        createdAt: timestamp,
        fileSize,
        filePath,
        cleanup,
      };

      const botOwner = await client.users.fetch(ayarlar.sahipID).catch(() => null);
      if (botOwner) {
        await sendBackupReport(botOwner, reportData, `( ${guild.name} ) Yedek DM'i`);
      }

      let logChannel = null;
      try {
        const logPath = path.join(BACKUP_DIR, `${guild.id}_log.yaml`);
        if (fs.existsSync(logPath)) {
          const logData = yaml.load(fs.readFileSync(logPath, "utf8"));
          if (logData?.kanalId) {
            const channel = guild.channels.cache.get(logData.kanalId);
            if (channel?.isTextBased()) logChannel = channel;
          }
        }
      } catch (error) {
        console.log(`🔴 [YEDEK SİSTEMİ] ( ${guild.name} ) Yedek-log ayarı okunamadı:`, error);
      }

      if (logChannel) {
        await sendBackupReport(logChannel, reportData, `( ${guild.name} ) Log mesajı`);
      } else {
        console.log(`🔴 [YEDEK SİSTEMİ] ( ${guild.name} ) Yedek-log kanalı bulunamadı.`);
      }
    } catch (error) {
      failedBackupCount += 1;
      failedGuildIds.push(guild.id);
      console.log(`🔴 [YEDEK SİSTEMİ] ${guild.name} için yedek oluşturulamadı.`, error);
    } finally {
      try {
        fs.unlinkSync(stagingFile);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.warn(`⚠️ [YEDEK SİSTEMİ] Geçici dosya temizlenemedi: ${error.message}`);
        }
      }
    }
  }

  console.log(
    `✅ [YEDEK SİSTEMİ] Planlanan yedekleme tamamlandı: `
    + `${successfulBackupCount}/${activeGuildCount} başarılı, ${failedBackupCount} hatalı.`,
  );

  return {
    activeGuildCount,
    successfulBackupCount,
    failedBackupCount,
    successfulGuildIds,
    failedGuildIds,
  };
}

function getDueGuilds(client, { hour, minute }) {
  return [...client.guilds.cache.values()].filter(guild => {
    if (!fs.existsSync(path.join(BACKUP_DIR, `${guild.id}_aktif.yaml`))) return false;

    const schedule = yedekPlaniniOku(guild.id);
    return schedule.hour === hour && schedule.minute === minute;
  });
}

async function runScheduledBackup(client, { dateKey, epochMs, hour, minute }) {
  yedekKlasorunuHazirla();

  const botId = client.user.id;
  const dueGuilds = getDueGuilds(client, { hour, minute });
  if (dueGuilds.length === 0) return;

  const lockedGuilds = [];
  for (const guild of dueGuilds) {
    const schedule = yedekPlaniniOku(guild.id);
    const { runKey, scheduledFor } = getScheduledRun(dateKey, schedule);
    if (hasCompletedRun(botId, guild.id, runKey, scheduledFor)) continue;

    const releaseLock = acquireScheduledLock(botId, guild.id, runKey);
    if (!releaseLock) continue;

    if (hasCompletedRun(botId, guild.id, runKey, scheduledFor)) {
      releaseLock();
      continue;
    }

    lockedGuilds.push({ guild, releaseLock, runKey, scheduledFor });
  }

  if (lockedGuilds.length === 0) return;

  try {
    const result = await createGuildBackups(
      client,
      epochMs,
      lockedGuilds.map(entry => entry.guild),
    );

    for (const guildId of result.successfulGuildIds) {
      const completedRun = lockedGuilds.find(entry => entry.guild.id === guildId);
      writeRunState(botId, guildId, {
        lastRunKey: completedRun.runKey,
        lastRunDate: dateKey,
        scheduledFor: completedRun.scheduledFor,
        successfulBackupCount: 1,
        failedBackupCount: 0,
      });
    }
  } finally {
    lockedGuilds.forEach(entry => entry.releaseLock());
  }
}

function startBackupScheduler(client) {
  if (client.dailyStructureBackupScheduler) return;

  client.dailyStructureBackupScheduler = startTrustedMinuteScheduler({
    timeZone: BACKUP_SCHEDULE.timeZone,
    label: "Sunucu yapı yedeği planları",
    onTrigger: (scheduleInfo) => runScheduledBackup(client, scheduleInfo),
  });
}

/**
 * @param {import("discord.js").Client} client
 */
module.exports = (client) => {
  if (client.dailyStructureBackupScheduler || client.dailyStructureBackupSchedulerPending) return;

  if (client.isReady()) {
    startBackupScheduler(client);
    return;
  }

  client.dailyStructureBackupSchedulerPending = true;
  client.once(Events.ClientReady, () => {
    client.dailyStructureBackupSchedulerPending = false;
    startBackupScheduler(client);
  });
};

module.exports.BACKUP_SCHEDULE = BACKUP_SCHEDULE;
module.exports.buildBackupReportPayload = buildBackupReportPayload;
module.exports.createGuildBackups = createGuildBackups;
module.exports.getDueGuilds = getDueGuilds;
module.exports.runScheduledBackup = runScheduledBackup;
module.exports.sendBackupReport = sendBackupReport;
